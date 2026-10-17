/**
 * ============================================================
 *  主装配 —— 三国 · 全国五十城
 * ============================================================
 *  画面上只有两样东西:
 *     ① 一块可旋转/缩放的 3D 立体中国地图(卫星影像 + 真实起伏 + 岩层厚度)
 *     ② 50 座三国城池(分 S/A/B/C 四级, 散落在九州之上)
 *
 *  ⚠ 已完全移除: 行军路线、事件节点、底部时间轴、事件卡。
 *     本文件不再 import route.js / ui.js / inset.js。
 * ============================================================
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/CSS2DRenderer.js';

import { CAMERA } from './config.js';
import { loadAssets } from './assets.js';
import { createProjector, createHeightSampler } from './geo.js';
import { buildSlab, buildTerrain, setupScene } from './world.js';
import {
  CITIES, ROADS, FACTIONS, GRADE_STATS, GRADE_ORDER, neighborsOf,
} from './cities.js';
import { buildCityLayer, buildPickers, buildRoads } from './citylayer.js';
import { createLabelLayout } from './labelayout.js';
import { createMinimap } from './minimap.js';
import * as G from './game.js';
import { initGameUI, renderCityPanel, cityTooltipHTML } from './gameui.js';

/* ============================================================
 * 0. 防止直接双击 HTML 打开(file:// 读不到模块与数据)
 * ========================================================== */
if (location.protocol === 'file:') {
  const box = document.getElementById('errbox');
  box.hidden = false;
  box.textContent =
    '⚠️ 请勿直接双击打开 index.html\n\n'
    + '浏览器的安全策略禁止网页以 file:// 协议读取本地数据文件与模块。\n'
    + '请在本项目目录下双击 start.bat 启动本地服务,\n'
    + '然后访问 http://127.0.0.1:8123/';
  throw new Error('file:// protocol is not supported');
}

const canvas = document.getElementById('scene');
const loadingEl = document.getElementById('loading');
const loadingTextEl = document.getElementById('loadingText');
const errboxEl = document.getElementById('errbox');

/* ============================================================
 * 1. 渲染器(必须能优雅失败 —— 见模板踩坑 11)
 * ========================================================== */
function fatal(title, lines) {
  window.__bootGuard?.finish?.();
  errboxEl.hidden = false;
  errboxEl.textContent = title + '\n\n' + lines;
  loadingEl.classList.add('is-done');
  loadingEl.style.display = 'none';
  console.error('[main] ' + title + '\n' + lines);
}

function webglSupport() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch (e) {
    return false;
  }
}

const NO_WEBGL_HELP = [
  '3D 地图必须有 WebGL(浏览器的 3D 绘图能力), 当前环境没有提供它。',
  '',
  '常见原因:',
  '  · 在聊天窗口 / 预览面板里打开 —— 预览内核通常关闭了 GPU 加速',
  '  · 远程桌面、虚拟机里没有可用的显卡驱动',
  '  · 浏览器关掉了"硬件加速", 或被企业策略禁用了 WebGL',
  '',
  '【怎么解决】',
  '  1) 在本项目目录下双击 start.bat 启动本地服务',
  '  2) 用 Chrome 或 Edge 打开: http://127.0.0.1:8123/',
  '  3) 如果浏览器里也失败: 设置 → 系统 → 打开"使用硬件加速", 重启浏览器',
].join('\n');

function showFallbackImage() {
  const box = document.getElementById('fallback');
  const img = document.getElementById('fallbackImg');
  if (!box || !img) return;
  if (!img.getAttribute('src')) img.src = './data/fallback.jpg';
  box.hidden = false;
}

let renderer = null;
if (!webglSupport()) {
  showFallbackImage();
  fatal('⚠️ 无法启动 3D 渲染: 当前环境拿不到 WebGL 上下文', NO_WEBGL_HELP);
  throw new Error('WEBGL_UNAVAILABLE');
}
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
} catch (e) {
  showFallbackImage();
  fatal('⚠️ 创建 WebGL 渲染器失败', NO_WEBGL_HELP + '\n\n底层报错: ' + (e?.message || e));
  throw e;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });
labelRenderer.setSize(window.innerWidth, window.innerHeight);

/* ============================================================
 * 2. 场景与相机
 * ========================================================== */
const scene = new THREE.Scene();
const camera = setupScene(scene);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = CAMERA.orbit.minDistance;
controls.maxDistance = CAMERA.orbit.maxDistance;
controls.minPolarAngle = CAMERA.orbit.minPolarAngle;
controls.maxPolarAngle = CAMERA.orbit.maxPolarAngle;
controls.target.set(CAMERA.target.x, CAMERA.target.y, CAMERA.target.z);
controls.autoRotateSpeed = 0.55;
controls.update();

/* ============================================================
 * 3. 相机飞行动画(用绝对时间, 不要累加 dt —— 见模板踩坑 5)
 * ========================================================== */
const flight = {
  active: false, startAt: 0, dur: 1.1,
  fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(),
  fromTgt: new THREE.Vector3(), toTgt: new THREE.Vector3(),
};
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function startFlight(toPos, toTgt, duration) {
  flight.fromPos.copy(camera.position);
  flight.fromTgt.copy(controls.target);
  flight.toPos.copy(toPos);
  flight.toTgt.copy(toTgt);
  flight.startAt = performance.now();
  flight.dur = duration;
  flight.active = true;
}

function flyTo(targetPos, options = {}) {
  const { distance, duration = 1.1 } = options;
  const dir = camera.position.clone().sub(controls.target);
  const curDist = dir.length();
  dir.normalize();
  const wantDist = distance ?? THREE.MathUtils.clamp(curDist * 0.8, 30, 130);
  const endPos = targetPos.clone().add(dir.multiplyScalar(wantDist));
  startFlight(endPos, targetPos, duration);
}

function updateFlight() {
  if (!flight.active) return;
  const k = easeInOut(Math.min(1, (performance.now() - flight.startAt) / 1000 / flight.dur));
  camera.position.lerpVectors(flight.fromPos, flight.toPos, k);
  controls.target.lerpVectors(flight.fromTgt, flight.toTgt, k);
  if (k >= 1) flight.active = false;
}

['pointerdown', 'wheel'].forEach((ev) =>
  renderer.domElement.addEventListener(ev, () => { flight.active = false; }, { passive: true })
);

/* ============================================================
 * 4. 选中城池(情报卡由 gameui.js 渲染)
 * ========================================================== */
let selected = -1;
let cityLayer = null;

function selectCity(i, fly) {
  if (!cityLayer) return;
  const r = cityLayer.records[i];
  if (!r) return;

  if (selected >= 0 && cityLayer.records[selected]) {
    cityLayer.records[selected].el.classList.remove('is-active');
  }
  selected = i;
  r.el.classList.add('is-active');
  minimap?.setSelected(i);
  renderCityPanel(i);
  if (fly) flyTo(r.position.clone(), { distance: 26, duration: 1.05 });
}

/** 把游戏里的城池归属同步到 3D 标签 / 圆台 / 小地图 */
function syncOwners() {
  if (!cityLayer || !G.state()) return;
  G.state().cities.forEach((c, i) => {
    cityLayer.setOwner(i, c.owner);
    minimap?.setPinColor(i, c.owner);
  });
}

/* ============================================================
 * 5. 启动
 * ========================================================== */
let clock = null;
let labelLayout = null;
let minimap = null;

/** 统一的缩放动作(右侧按钮 / 小地图 ± 按钮 / 小地图滚轮 共用) */
function zoomBy(dir) {
  const d = camera.position.distanceTo(controls.target);
  const next = dir === 'in'
    ? Math.max(CAMERA.orbit.minDistance, d * 0.78)
    : Math.min(CAMERA.orbit.maxDistance, d * 1.28);
  flyTo(controls.target.clone(), { distance: next, duration: 0.5 });
}

async function boot() {
  const setStage = (t) => {
    loadingTextEl.textContent = t;
    if (window.__boot) window.__boot.stage = t;
  };

  try {
    /* ---- 5.1 资源 ---- */
    const assets = await loadAssets(setStage);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    assets.satellite.anisotropy = maxAniso;
    assets.mask.anisotropy = maxAniso;
    assets.satellite.needsUpdate = true;
    assets.mask.needsUpdate = true;

    /* ---- 5.2 投影器 + 高程采样器 ---- */
    const projector = createProjector(assets.meta);
    const sampler = createHeightSampler(assets.heightmap, assets.meta.heightmap);

    /* ---- 5.2b 3D 场景背景 = 绢本舆图底图（加载成功后替换默认渐变） ---- */
    new THREE.TextureLoader().load('img/bg-map.png', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      scene.background = tex;
    });

    /* ---- 5.3 岩层底板 ---- */
    setStage('构建岩层底板…');
    const slab = buildSlab(assets.geojson, projector);
    slab.material[1].map = assets.cliff;
    slab.material[1].needsUpdate = true;
    scene.add(slab);

    /* ---- 5.4 地形表面 ---- */
    setStage('抬升地形…');
    const terrain = buildTerrain(assets, sampler);
    scene.add(terrain);

    /* ---- 5.5 五十座城池 ---- */
    setStage('建造 50 座城池…');
    cityLayer = buildCityLayer(CITIES, projector, sampler);
    scene.add(cityLayer.group);

    /* ---- 5.6 官道(先建城: 道路端点要按城的占地缩进) ---- */
    setStage('修筑官道…');
    scene.add(buildRoads(ROADS, cityLayer.records, projector, sampler));

    /* ---- 5.7 名称避让(S>A>B>C 优先级, 防止大字号互相压住) ---- */
    labelLayout = createLabelLayout(cityLayer.records.map((r) => ({
      el: r.el,
      pos: r.label.position,
      index: r.index,
      priority: GRADE_ORDER.indexOf(r.config.grade),
    })));

    /* ---- 5.8 拾取球(不可见) ---- */
    scene.add(buildPickers(cityLayer.records));

    /* ---- 5.9 标签点击 + hover 情报 ---- */
    const tooltipEl = document.getElementById('tooltip');
    const moveTooltip = (e) => {
      const pad = 14;
      let x = e.clientX + pad;
      let y = e.clientY + pad;
      const rect = tooltipEl.getBoundingClientRect();
      if (x + rect.width > window.innerWidth - 8) x = e.clientX - rect.width - pad;
      if (y + rect.height > window.innerHeight - 8) y = e.clientY - rect.height - pad;
      tooltipEl.style.transform = `translate(${x}px, ${y}px)`;
    };
    cityLayer.records.forEach((r) => {
      r.el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectCity(r.index, true);
      });
      r.el.addEventListener('mouseenter', (e) => {
        const html = cityTooltipHTML(r.index);
        if (!html || !tooltipEl) return;
        tooltipEl.innerHTML = html;
        tooltipEl.hidden = false;
        moveTooltip(e);
      });
      r.el.addEventListener('mousemove', (e) => {
        if (!tooltipEl.hidden) moveTooltip(e);
      });
      r.el.addEventListener('mouseleave', () => {
        tooltipEl.hidden = true;
      });
    });

    /* ---- 5.10 右上角小地图 ---- */
    minimap = createMinimap({
      canvas: document.getElementById('minimap'),
      geojson: assets.geojson,
      cities: CITIES,
      projector,
      camera,
      controls,
      onFly: (p) => flyTo(p, { duration: 0.95 }),
      onZoom: zoomBy,
    });
    minimap.drawRoads(ROADS);
    minimap.update();

    /* ---- 5.11 游戏层: 势力配色 + 界面 ---- */
    initGameUI({
      neighborsOf,
      focusCity: (i) => selectCity(i, true),
    });
    G.subscribe(syncOwners);
    syncOwners();
    // 没有存档时才写「怎么玩」引导 —— 有存档时主公面板由 renderLordPanel 填充
    if (!G.state()) {
      document.getElementById('citypanel').innerHTML = `
        <p class="cp__kicker">怎么玩</p>
        <h2 class="cp__title">三国·学习志</h2>
        <p class="cp__note">学习 = 内政　打卡 = 资源　攻城 = 阶段目标　统一全国 = 小升初通关</p>
        <ol class="cp__steps">
          <li>点城池看情报，或在右侧打卡面板领今日奖励</li>
          <li>打卡解锁：屯田 / 募兵 / 寻访 / 加固</li>
          <li>点「出征」打相邻城池，扩张势力</li>
          <li>每天 = 1 回合，点「结束回合」推进</li>
        </ol>
        <p class="cp__note">目标：占领全部 50 城。</p>`;
    }

    /* ---- 5.12 收工 ---- */
    clock = new THREE.Clock();
    loadingEl.classList.add('is-done');
    setTimeout(() => { loadingEl.style.display = 'none'; }, 700);
    errboxEl.hidden = true;
    window.__bootGuard?.finish();
    animate();

  } catch (err) {
    console.error(err);
    window.__bootGuard?.finish();
    errboxEl.hidden = false;
    errboxEl.textContent = '启动失败:\n\n' + (err?.message || err)
      + '\n\n（卡在：' + (window.__boot?.stage || '未知') + '）';
    loadingEl.classList.add('is-done');
    loadingEl.style.display = 'none';
  }
}

/* ============================================================
 * 6. 点击拾取城池(与拖动区分开)
 * ========================================================== */
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let downPos = null;

renderer.domElement.addEventListener('pointerdown', (e) => {
  downPos = { x: e.clientX, y: e.clientY };
}, { passive: true });

renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downPos || !cityLayer) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 6) return;                       // 是在拖动地图, 不是点击

  pointerNDC.set(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(pointerNDC, camera);
  const picks = scene.getObjectByName('picks');
  if (!picks) return;
  const hit = raycaster.intersectObjects(picks.children, false)[0];
  if (hit) selectCity(hit.object.userData.ci, true);
});

/* ============================================================
 * 7. 小地图: − / ＋ 缩放按钮 + 按住拖动位置
 * ========================================================== */
const minimapBox = document.getElementById('minimapBox');
minimapBox.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mm]');
  if (btn) zoomBy(btn.dataset.mm);
});

/* ---- 按住小地图任意位置拖动（± 按钮除外） ---- */
let mmDrag = null;
minimapBox.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;          // 缩放按钮不拖动
  mmDrag = {
    id: e.pointerId,
    dx: e.clientX - minimapBox.getBoundingClientRect().left,
    dy: e.clientY - minimapBox.getBoundingClientRect().top,
    sx: e.clientX, sy: e.clientY,
    moved: false,
  };
});
minimapBox.addEventListener('pointermove', (e) => {
  if (!mmDrag || e.pointerId !== mmDrag.id) return;
  if (!mmDrag.moved) {
    // 移动超过 5px 才算拖动 —— 轻点 canvas 仍然触发"点击飞行"
    if (Math.hypot(e.clientX - mmDrag.sx, e.clientY - mmDrag.sy) < 5) return;
    mmDrag.moved = true;
    try { minimapBox.setPointerCapture(e.pointerId); } catch (err) { /* 指针已失效时忽略 */ }
    minimapBox.style.right = 'auto';
    minimapBox.style.bottom = 'auto';
  }
  const w = minimapBox.offsetWidth, h = minimapBox.offsetHeight;
  const x = THREE.MathUtils.clamp(e.clientX - mmDrag.dx, 4, window.innerWidth - w - 4);
  const y = THREE.MathUtils.clamp(e.clientY - mmDrag.dy, 4, window.innerHeight - h - 4);
  minimapBox.style.left = `${x}px`;
  minimapBox.style.top = `${y}px`;
});
const mmDragEnd = (e) => { if (mmDrag && e.pointerId === mmDrag.id) mmDrag = null; };
minimapBox.addEventListener('pointerup', mmDragEnd);
minimapBox.addEventListener('pointercancel', mmDragEnd);

/* ============================================================
 * 8. 动画循环
 * ========================================================== */
function animate() {
  requestAnimationFrame(animate);
  if (!clock) return;
  clock.getDelta();
  updateFlight();
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  // 必须放在 labelRenderer 之后: CSS2DRenderer 每帧都会重写标签 transform
  if (labelLayout) labelLayout.update(camera, window.innerWidth, window.innerHeight);
  minimap?.update();
}

/* ============================================================
 * 9. 窗口尺寸变化
 * ========================================================== */
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 260));

/* ============================================================
 * 10. 调试出口(只在 ?dev=1 时挂 window)
 * ========================================================== */
if (new URLSearchParams(location.search).has('dev')) {
  window.__map = {
    THREE, scene, camera, controls, renderer,
    get cities() { return cityLayer; },
    selectCity,
    count: CITIES.length,
  };
}

if (window.__boot) window.__boot.stage = '加载资源…';
boot();
