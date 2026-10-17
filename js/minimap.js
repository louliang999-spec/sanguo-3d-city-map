/**
 * ============================================================
 *  minimap.js —— 右上角小地图(鸟瞰图 + 视野框 + 缩放)
 * ============================================================
 *
 *  小地图和 3D 地图共用同一套归一化坐标(u,v):
 *      u = x / MAP_WIDTH  + 0.5        (西 0 → 东 1)
 *      v = 0.5 - z / MAP_HEIGHT        (南 0 → 北 1)
 *  所以"陆地轮廓 / 城池 / 道路"在小地图上的位置和 3D 里严丝合缝。
 *
 *  分层绘制:
 *    静态层(只画一次): 陆地轮廓 + 官道网   → 离屏 canvas, 每帧 drawImage
 *    动态层(每帧)    : 城池圆点 + 视野框   → 主 canvas
 *
 *  交互: 点击飞行 / 滚轮缩放 / +− 按钮缩放
 * ============================================================
 */
import * as THREE from 'three';
import { MAP_WIDTH, MAP_HEIGHT } from './config.js';
import { FACTIONS } from './cities.js';

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function createMinimap({
  canvas, geojson, cities, projector, camera, controls, onFly, onZoom,
}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.scale(dpr, dpr);

  /* ---------- 经纬度 → 小地图像素 ---------- */
  const px = (lon, lat) => {
    const w = projector.lonLatToWorld(lon, lat);
    const { u, v } = projector.worldToUv(w.x, w.z);
    return { x: u * W, y: (1 - v) * H };
  };

  /* ============================================================
   * 静态层: 陆地 + 官道 (只渲染一次)
   * ========================================================== */
  const stat = document.createElement('canvas');
  stat.width = canvas.width;
  stat.height = canvas.height;
  const s = stat.getContext('2d');
  s.scale(dpr, dpr);

  // 底: 深海
  s.fillStyle = 'rgba(8, 15, 24, 0.94)';
  s.fillRect(0, 0, W, H);

  // 陆地轮廓
  const rings = [];
  for (const f of geojson.features || []) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    for (const poly of polys) if (poly[0]) rings.push(poly[0]);
  }
  s.beginPath();
  let lastX = NaN, lastY = NaN;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      const p = px(lon, lat);
      if (Math.abs(p.x - lastX) < 0.6 && Math.abs(p.y - lastY) < 0.6) continue;
      if (Number.isNaN(lastX)) s.moveTo(p.x, p.y);
      else s.lineTo(p.x, p.y);
      lastX = p.x; lastY = p.y;
    }
    s.closePath();
    lastX = NaN; lastY = NaN;
  }
  s.fillStyle = 'rgba(38, 52, 66, 0.95)';
  s.fill('evenodd');
  s.strokeStyle = 'rgba(150, 180, 205, 0.5)';
  s.lineWidth = 0.7;
  s.stroke();

  /* ============================================================
   * 城池 / 道路的准备数据
   * ========================================================== */
  const RADIUS = { S: 4.2, A: 3.0, B: 2.4, C: 2.0 };
  const pins = cities.map((c) => ({
    ...px(c.lon, c.lat),
    grade: c.grade,
    color: (FACTIONS[c.faction] || FACTIONS.none).color,
    name: c.name,
  }));
  const dotR = (g) => (RADIUS[g] ?? 2.2);

  /** 画官道(由外部传入 pairs, 画在静态层上) */
  function drawRoads(pairs) {
    s.strokeStyle = 'rgba(214, 180, 136, 0.5)';
    s.lineWidth = 0.8;
    s.beginPath();
    pairs.forEach(([a, b]) => {
      const pa = pins[a], pb = pins[b];
      if (!pa || !pb) return;
      s.moveTo(pa.x, pa.y);
      s.lineTo(pb.x, pb.y);
    });
    s.stroke();
  }

  /* ============================================================
   * 动态层
   * ========================================================== */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let selected = -1;

  /** 屏幕 NDC → 地面 → 小地图坐标(超出画幅就夹到边界) */
  function ndcToMap(x, y) {
    ndc.set(x, y);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(GROUND, hit)) return null;
    const u = THREE.MathUtils.clamp(hit.x / MAP_WIDTH + 0.5, 0, 1);
    const v = THREE.MathUtils.clamp(0.5 - hit.z / MAP_HEIGHT, 0, 1);
    return { x: u * W, y: (1 - v) * H };
  }

  function update() {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(stat, 0, 0, W, H);

    /* --- 视野框: 采样屏幕中央区域(广角斜视时完整视锥会罩住全图) --- */
    const samples = [
      [-0.35, -0.35], [0.35, -0.35], [0.35, 0.35], [-0.35, 0.35], [0, 0],
    ].map(([x, y]) => ndcToMap(x, y)).filter(Boolean);
    if (samples.length >= 2) {
      const xs = samples.map((p) => p.x), ys = samples.map((p) => p.y);
      const bx = Math.min(...xs), by = Math.min(...ys);
      const bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
      if (bw > 1 && bh > 1) {
        ctx.strokeStyle = 'rgba(255, 209, 102, 0.95)';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
        ctx.fillStyle = 'rgba(255, 209, 102, 0.10)';
        ctx.fillRect(bx, by, bw, bh);
      }
    }

    /* --- 城池圆点 --- */
    for (let i = 0; i < pins.length; i++) {
      const p = pins[i];
      const r = dotR(p.grade);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      if (p.grade === 'S') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      if (i === selected) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }
  }

  /* ============================================================
   * 交互: 点击飞行 / 滚轮缩放
   * ========================================================== */
  const toWorld = (cx, cy) => {
    const u = THREE.MathUtils.clamp(cx / W, 0, 1);
    const v = 1 - THREE.MathUtils.clamp(cy / H, 0, 1);
    return new THREE.Vector3((u - 0.5) * MAP_WIDTH, 0, (0.5 - v) * MAP_HEIGHT);
  };

  let dragged = false;
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => {
    dragged = false;
    downAt = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!downAt) return;
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) dragged = true;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || dragged) { downAt = null; return; }
    downAt = null;
    const rect = canvas.getBoundingClientRect();
    onFly?.(toWorld(e.clientX - rect.left, e.clientY - rect.top));
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    onZoom?.(e.deltaY < 0 ? 'in' : 'out');
  }, { passive: false });

  update();

  return {
    update,
    setSelected(i) { selected = i; },
    drawRoads,
    /** 城池易主时同步小地图圆点的颜色 */
    setPinColor(i, factionId) {
      if (pins[i]) pins[i].color = (FACTIONS[factionId] || FACTIONS.none).color;
    },
  };
}
