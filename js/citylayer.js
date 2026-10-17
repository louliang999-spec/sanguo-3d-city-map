/**
 * ============================================================
 *  城池层 —— 把 50 座城放到 3D 全国地图上
 * ============================================================
 *
 *  · 模型: 复用 js/citybuild.js 的程序化三国城池
 *          (方城墙 + 垛口 + 角楼 + 门楼 + 正殿 + 燕尾旗)
 *  · 尺寸: 按"城池等级" S / A / B / C 取缩放, 整体统一偏小
 *  · 定位: 经纬度 → Web Mercator 世界坐标, 再贴合地形高度
 *  · 标签: CSS2D 大字 = 势力色, 右上角小角标 = 等级色
 *  · 圆台: 脚下一圈很淡的等级色薄圆片, 帮眼睛在山河里找到小城
 *
 *  ⚠ 本文件不含任何时间线 / 事件 / 路线逻辑。
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/CSS2DRenderer.js';
import { TERRAIN, CITY_STYLE, ROAD_STYLE, THEME } from './config.js';
import { FACTIONS } from './cities.js';
import { buildCity } from './citybuild.js';

/* 黄金角(≈137.5°): 给每个标签分配唯一散开方向, 防止挤成一团 */
const GOLDEN_ANGLE = 2.399963229728653;

/** 某等级对应的模型缩放 */
function scaleOf(city) {
  if (city.type === 'pass') return CITY_STYLE.scale.pass;
  return CITY_STYLE.scale[city.grade] ?? CITY_STYLE.scale.C;
}

/** 采样地形世界高度 */
function groundY(x, z, projector, sampler) {
  const { u, v } = projector.worldToUv(x, z);
  return sampler(u, v) * TERRAIN.heightScale;
}

/* ============================================================
 * 城池层
 * ========================================================== */
export function buildCityLayer(cities, projector, sampler) {
  const group = new THREE.Group();
  group.name = 'cities';
  const padGroup = new THREE.Group();
  padGroup.name = 'cityPads';
  group.add(padGroup);

  const records = [];

  cities.forEach((c, i) => {
    const w = projector.lonLatToWorld(c.lon, c.lat);
    const gy = groundY(w.x, w.z, projector, sampler);
    const base = new THREE.Vector3(w.x, gy + CITY_STYLE.baseLift, w.z);

    /* --- 写实城池模型 --- */
    const city = buildCity({
      type: c.type,
      style: THEME.cityStyle,
      scale: scaleOf(c),
    });
    city.group.position.copy(base);
    city.group.rotation.y = i * 0.9;          // 每座朝向略不同, 避免复制感
    group.add(city.group);

    /* --- 脚下圆台: 颜色 = 当前归属势力(换旗只改这里) --- */
    let padMat = null;
    if (CITY_STYLE.pad.show) {
      const r = Math.max(city.width, city.depth) * 0.5 * CITY_STYLE.pad.scale + 0.12;
      padMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color((FACTIONS[c.faction] || FACTIONS.none).color),
        transparent: true,
        opacity: CITY_STYLE.pad.opacity,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      const pad = new THREE.Mesh(new THREE.CircleGeometry(r, 24), padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(base.x, gy + CITY_STYLE.pad.lift, base.z);
      pad.renderOrder = 1;
      padGroup.add(pad);
    }

    /* --- 旗帜: 有主 = 势力旗, 空城 = 灰色废墟旗 --- */
    const flagH = Math.max(0.9, city.height * 1.1);
    const poleMat = new THREE.MeshBasicMaterial({ color: 0x3a2c1c });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, flagH, 6), poleMat);
    const fx = base.x + Math.max(city.width, city.depth) * 0.42;
    const fz = base.z + Math.max(city.width, city.depth) * 0.28;
    pole.position.set(fx, base.y + flagH / 2, fz);
    group.add(pole);

    const bannerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color((FACTIONS[c.faction] || FACTIONS.none).color),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), bannerMat);
    banner.position.set(fx + 0.23, base.y + flagH - 0.14, fz);
    group.add(banner);

    /* 空城: 旗面画成破损状(两道豁口贴片), 视觉上像废墟 */
    const ruinTint = new THREE.MeshBasicMaterial({
      color: 0x777f88, side: THREE.DoubleSide, toneMapped: false,
    });
    const ruinA = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.26), ruinTint);
    ruinA.position.set(fx + 0.13, base.y + flagH - 0.14, fz + 0.001);
    const ruinB = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.26), ruinTint);
    ruinB.position.set(fx + 0.34, base.y + flagH - 0.14, fz + 0.001);
    group.add(ruinA, ruinB);

    /* --- 标签: 大字城名(势力色) + 等级角标 --- */
    const el = document.createElement('button');
    el.className = 'citylabel';
    el.dataset.index = String(i);
    if (c.grade === 'S') el.classList.add('citylabel--S');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'citylabel__name';
    nameSpan.textContent = c.name;
    nameSpan.style.color = (FACTIONS[c.faction] || FACTIONS.none).color;

    const badge = document.createElement('i');
    badge.className = 'citylabel__grade';
    badge.textContent = c.grade;
    badge.style.background = THEME.grade[c.grade] || THEME.grade.C;

    el.appendChild(nameSpan);
    el.appendChild(badge);

    const label = new CSS2DObject(el);
    const ang = i * GOLDEN_ANGLE;
    // 标签放大后要散得更开: 1.6 / 2.5 / 3.4 世界单位三档,
    // 黄金角保证方向唯一, 让名字互相错开而不叠在一起
    const r = 1.6 + (i % 3) * 0.9;
    const dx = Math.cos(ang) * r;
    const dz = Math.sin(ang) * r * 0.75;
    // 标签贴建筑顶上方(城被缩小后不能写死浮空高度, 否则小城标签会飘在半空)
    const dy = city.height + 0.75 + (i % 3) * 0.45;
    label.position.set(base.x + dx, base.y + dy, base.z + dz);
    group.add(label);

    records.push({
      index: i,
      config: c,
      position: base,
      groundY: gy,
      group: city.group,
      height: city.height,
      width: city.width,
      depth: city.depth,
      label,
      el,
      nameEl: nameSpan,
      padMat,
      bannerMat,
      ruinA, ruinB,
    });
  });

  /**
   * 城池易主: 改标签大字颜色 + 脚下圆台颜色 + 旗面颜色
   * (游戏里城池归属会变, 但模型本身不用重建)
   * 空城: 旗面变灰 + 豁口贴片可见(废墟感)
   */
  const layer = {
    group,
    records,
    setOwner(i, factionId) {
      const r = records[i];
      if (!r) return;
      const none = factionId === 'none';
      const color = (FACTIONS[factionId] || FACTIONS.none).color;
      r.nameEl.style.color = color;
      if (r.padMat) r.padMat.color.set(color);
      if (r.bannerMat) r.bannerMat.color.set(none ? 0x9aa5b1 : color);
      if (r.ruinA) { r.ruinA.visible = none; r.ruinB.visible = none; }
    },
  };
  return layer;
}

/* ============================================================
 * 官道: 贴着地形起伏的 TubeGeometry
 *
 * 两个关键处理:
 *  1) 端点缩进 —— 路不穿城、也不压城脚
 *  2) 滑动平均 —— 逐点死贴地形会在翻山时被反复遮断成虚线,
 *     取 max(平滑高度, 真实高度) 才能既顺滑又不穿模
 * ========================================================== */
export function buildRoads(pairs, cities, projector, sampler) {
  const group = new THREE.Group();
  group.name = 'roads';

  const coreMat = new THREE.MeshBasicMaterial({
    color: ROAD_STYLE.roadColor,
    transparent: true,
    opacity: 0.9,
    toneMapped: false,
    depthWrite: false,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: ROAD_STYLE.glowColor,
    transparent: true,
    opacity: ROAD_STYLE.glowOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  const sizeOf = (c) => Math.max(c.width, c.depth) * 0.5;

  pairs.forEach(([ai, bi]) => {
    const ra = cities[ai], rb = cities[bi];
    if (!ra || !rb) return;
    const a = projector.lonLatToWorld(ra.config.lon, ra.config.lat);
    const b = projector.lonLatToWorld(rb.config.lon, rb.config.lat);

    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    const ux = dx / len, uz = dz / len;

    // 端点缩进到城墙外, 单端最多缩 22%, 两端之间再留 0.3 间隔
    const cap = len * 0.22;
    const insetA = Math.min(sizeOf(ra) + 0.22, cap);
    const insetB = Math.min(sizeOf(rb) + 0.22, cap, Math.max(0, len - insetA - 0.3));
    const ax = a.x + ux * insetA, az = a.z + uz * insetA;
    const bx = b.x - ux * insetB, bz = b.z - uz * insetB;
    const run = Math.hypot(bx - ax, bz - az);
    if (run < 0.5) return;

    const n = Math.max(6, Math.round(run / ROAD_STYLE.stepLength));
    const flat = [];
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      flat.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t });
    }
    const terrH = flat.map((p) => groundY(p.x, p.z, projector, sampler));

    const WIN = ROAD_STYLE.smoothWin;
    const smoothH = terrH.map((_, i) => {
      let sum = 0, cnt = 0;
      for (let k = -WIN; k <= WIN; k++) {
        const j = i + k;
        if (j < 0 || j >= terrH.length) continue;
        sum += terrH[j]; cnt++;
      }
      return sum / cnt;
    });

    const pts = flat.map((p, i) =>
      new THREE.Vector3(p.x, Math.max(smoothH[i], terrH[i]) + ROAD_STYLE.lift, p.z)
    );
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    const seg = Math.min(ROAD_STYLE.curveSegments, Math.max(24, n * 2));

    const core = new THREE.Mesh(
      new THREE.TubeGeometry(curve, seg, ROAD_STYLE.tubeRadius, 6, false), coreMat
    );
    core.renderOrder = 2;
    group.add(core);

    const glow = new THREE.Mesh(
      new THREE.TubeGeometry(curve, seg, ROAD_STYLE.tubeRadius * ROAD_STYLE.glowScale, 6, false),
      glowMat
    );
    glow.renderOrder = 1;
    group.add(glow);
  });

  return group;
}

/* ============================================================
 * 拾取球: 不可见, 只用来接住鼠标点击
 * 半径按城的实际占地放大, 太小的城也能点得到
 * ========================================================== */
export function buildPickers(records) {
  const group = new THREE.Group();
  group.name = 'picks';

  records.forEach((r) => {
    const radius = Math.max(0.55, Math.max(r.width, r.depth) * 0.6);
    const pick = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pick.position.set(
      r.position.x,
      r.position.y + Math.min(r.height * 0.5, 1.6),
      r.position.z
    );
    pick.userData.ci = r.index;
    group.add(pick);
  });

  return group;
}
