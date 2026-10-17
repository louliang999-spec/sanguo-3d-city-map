/**
 * ============================================================
 *  citybuild.js —— 程序化生成"有三国时代感"的城池
 * ============================================================
 *
 *  四级城型(与地图数据一一对应):
 *    capital 都城   内外两重城 · 角楼 · 正殿 · 民居 · 旌旗
 *    big     大城   单重城墙 · 角楼 · 门楼 · 民居 · 旌旗
 *    small   小城   矮墙 · 小门楼 · 两三户人家
 *    pass    关隘   两山夹一谷 · 关门 · 桥楼 · 猎猎旌旗
 *
 *  三种风格(配色驱动, 几何结构完全相同):
 *    rammed  A · 夯土写实   土黄夯土墙 + 深灰布瓦 + 红旗(默认)
 *    brick   B · 青砖旌旗   青灰砖墙 + 黑瓦 + 红旗(游戏辨识度)
 *    stone   C · 石岭雄关   石灰岩墙 + 金旗(边关气质)
 *
 *  全部用 Three.js 基本体拼装 —— 零外部资源, 改配色只动调色板。
 *  尺寸基准: scale=1 时"大城"约 5.2 世界单位宽(地图上 100 宽)。
 *
 *  通用部件:
 *    box/cyl/roof        基本体快捷方式
 *    flagPole            燕尾旗(ShapeGeometry, 双面)
 *    wallRect            带垛口/角楼/城门楼的方城墙
 *    gateTower           门楼(立柱 + 平坐 + 四坡顶)
 *    hall / hut          正殿 / 民居
 * ============================================================
 */
import * as THREE from 'three';

export const CITY_TYPES = [
  { id: 'capital', name: '都城', desc: '内外两重城 · 角楼 · 正殿 · 旌旗' },
  { id: 'big', name: '大城', desc: '单重城墙 · 角楼 · 门楼 · 民居' },
  { id: 'small', name: '小城', desc: '矮墙小楼 · 朴素夯土' },
  { id: 'pass', name: '关隘', desc: '两山夹一门 · 桥楼 · 旌旗' },
];

export const CITY_STYLES = [
  { id: 'rammed', name: 'A · 夯土写实' },
  { id: 'brick', name: 'B · 青砖旌旗' },
  { id: 'stone', name: 'C · 石岭雄关' },
];

const PALETTES = {
  rammed: {
    wall: 0xb28a5e, wallDark: 0x8f6d45, top: 0xc9a878,
    battlement: 0x6d5738, roof: 0x6e645a, wood: 0x7a5230,
    flag: 0xc0392b, door: 0x54341f, ground: 0x9c8563, hill: 0x8a7b63,
  },
  brick: {
    wall: 0x7e8a94, wallDark: 0x5f6b77, top: 0x97a4ae,
    battlement: 0x46515c, roof: 0x3f4a54, wood: 0x6b4a2c,
    flag: 0xd64541, door: 0x3a2c1e, ground: 0x74818e, hill: 0x6f7a84,
  },
  stone: {
    wall: 0x8d8d86, wallDark: 0x6c6c66, top: 0xa6a69e,
    battlement: 0x54544e, roof: 0x55554e, wood: 0x5f4630,
    flag: 0xe0b03a, door: 0x322f29, ground: 0x87877d, hill: 0x7a7a70,
  },
};

/* ============================================================
 * 基本体快捷方式
 * ========================================================== */
function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cyl(rt, rb, h, seg, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** 四坡顶(四棱锥旋转 45°) */
function roof(w, d, h, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.74, h, 4), mat);
  m.rotation.y = Math.PI / 4;
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** 燕尾旗: 杆 + 一面双面旗 */
function flagPole(h, color, x, z, parent) {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.9 });
  cyl(0.045, 0.055, h, 6, poleMat, 0, h / 2, 0, g);
  const flagMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.85, side: THREE.DoubleSide,
    emissive: color, emissiveIntensity: 0.12,
  });
  // 燕尾轮廓: 旗面宽 0.62 高 0.5, 尾部两个尖角
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.62, 0.06);
  s.lineTo(0.46, 0.28);
  s.lineTo(0.62, 0.5);
  s.lineTo(0, 0.44);
  s.closePath();
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(s), flagMat);
  flag.rotation.y = 0.6;                 // 斜插, 有点风的感觉
  flag.position.set(0.04, h - 0.18, 0.02);
  g.add(flag);
  g.position.set(x, 0, z);
  parent.add(g);
  return g;
}

/* ============================================================
 * 门楼: 四根立柱 + 平坐栏杆 + 四坡大顶
 * ========================================================== */
function gateTower(w, h, M, x, z, parent, rotY = 0) {
  const g = new THREE.Group();
  // 平坐(楼板)
  box(w + 0.5, 0.16, 1.5, M.wood, 0, h, 0, g);
  // 四柱
  const cw = Math.max(0.13, w * 0.075);
  [[-w / 2 + 0.18, 0.55], [w / 2 - 0.18, 0.55], [-w / 2 + 0.18, -0.55], [w / 2 - 0.18, -0.55]]
    .forEach(([px, pz]) => box(cw, 1.05, cw, M.wood, px, h + 0.16 + 0.52, pz, g));
  // 楼身楣窗
  box(w + 0.2, 0.5, 0.9, M.wallDark, 0, h + 0.16 + 1.0, 0, g);
  // 大屋顶
  roof(w + 1.1, 2.0, 0.62, M.roof, 0, h + 0.16 + 1.25, 0, g);
  // 正脊
  box(w + 1.0, 0.09, 0.14, M.battlement, 0, h + 0.16 + 1.25 + 0.33, 0, g);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  parent.add(g);
  return g;
}

/* ============================================================
 * 方城墙: 墙身 + 顶部垛口 + 四角角楼 + 正面城门(门道+门楼)
 * ========================================================== */
function wallRect(opts, M, parent) {
  const {
    w, d, t, h, corner = true, gateW = 1.2, gateSide = 'front',
    tower = true, crenel = true, top = M.top,
  } = opts;
  const g = new THREE.Group();

  const halfW = w / 2, halfD = d / 2;
  // 四面墙: 正面(朝 +z)给城门留缺口
  // 北墙(z = -d/2)
  box(w, h, t, M.wall, 0, h / 2, -halfD, g);
  // 左右墙
  box(t, h, d - t, M.wall, -halfW, h / 2, 0, g);
  box(t, h, d - t, M.wall, halfW, h / 2, 0, g);
  // 正墙(分两段, 中间是门)
  if (gateSide === 'front') {
    const segW = (w - gateW) / 2;
    box(segW, h, t, M.wall, -(gateW / 2 + segW / 2), h / 2, halfD, g);
    box(segW, h, t, M.wall, gateW / 2 + segW / 2, h / 2, halfD, g);
    // 门道: 两根门柱 + 门楣 + 深色门洞背板
    box(0.34, h + 0.34, t * 1.3, M.wood, -gateW / 2 - 0.1, (h + 0.34) / 2, halfD, g);
    box(0.34, h + 0.34, t * 1.3, M.wood, gateW / 2 + 0.1, (h + 0.34) / 2, halfD, g);
    box(gateW + 0.6, 0.34, t * 1.3, M.wood, 0, h + 0.17, halfD, g);
    box(gateW, h * 0.92, 0.06, M.door, 0, h * 0.46, halfD - t * 0.7, g);
  } else {
    box(w, h, t, M.wall, 0, h / 2, halfD, g);
  }

  // 顶部垛口: 沿四面墙顶等距放小方块
  if (crenel) {
    const step = 0.34;
    const merlon = (len, cx, cz, ry) => {
      const n = Math.max(2, Math.floor(len / step));
      for (let i = 0; i < n; i++) {
        const p = (i + 0.5) / n * len - len / 2;
        const px = ry ? cx : cx + p;
        const pz = ry ? cz + p : cz;
        box(0.2, 0.3, t * 0.95, M.battlement, px, h + 0.15, pz, g);
      }
    };
    merlon(w, 0, -halfD, false);
    merlon(d, -halfW, 0, true);
    merlon(d, halfW, 0, true);
    if (gateSide === 'front') {
      merlon((w - gateW) / 2, -(gateW / 2 + (w - gateW) / 4), halfD, false);
      merlon((w - gateW) / 2, gateW / 2 + (w - gateW) / 4, halfD, false);
    } else {
      merlon(w, 0, halfD, false);
    }
  }

  // 角楼: 四角小亭
  if (corner) {
    [[-halfW, -halfD], [halfW, -halfD], [-halfW, halfD], [halfW, halfD]].forEach(([cx, cz]) => {
      box(0.5, 0.7, 0.5, M.wallDark, cx, h + 0.35, cz, g);
      roof(0.9, 0.9, 0.34, M.roof, cx, h + 0.7, cz, g);
    });
  }

  // 门楼
  if (tower && gateSide === 'front') {
    gateTower(gateW + 0.9, h, M, 0, halfD + 0.1, g);
  }

  parent.add(g);
  return g;
}

/* ============================================================
 * 正殿 / 民居
 * ========================================================== */
function hall(w, M, parent) {
  const g = new THREE.Group();
  const pw = w * 0.62, pd = w * 0.46;
  box(pw + 0.3, 0.42, pd + 0.3, M.wallDark, 0, 0.21, 0, g);          // 台基
  box(pw, 0.95, pd, M.wood, 0, 0.42 + 0.48, 0, g);                    // 殿身
  box(pw + 0.12, 0.3, pd + 0.12, M.wallDark, 0, 0.42 + 0.95, 0, g);   // 楣额
  roof(pw + 0.9, pd + 0.9, 0.72, M.roof, 0, 0.42 + 1.1, 0, g);        // 大屋顶
  box(pw + 0.8, 0.1, 0.16, M.battlement, 0, 0.42 + 1.1 + 0.38, 0, g); // 正脊
  g.position.y = 0;
  parent.add(g);
  return g;
}

function hut(w, h, M, parent) {
  const g = new THREE.Group();
  box(w, h, w * 0.8, M.wall, 0, h / 2, 0, g);
  roof(w + 0.5, w * 1.3, h * 0.55, M.roof, 0, h + h * 0.24, 0, g);
  parent.add(g);
  return g;
}

/* ============================================================
 * 四种城型
 * ========================================================== */
function buildCapital(M, parent) {
  const outerW = 6.6, outerD = 6.2, outerH = 2.0, outerT = 0.42;
  // 外城
  wallRect({ w: outerW, d: outerD, t: outerT, h: outerH, gateW: 1.7, corner: true }, M, parent);
  // 内城(偏北, 略高)
  const innerW = 3.6, innerD = 3.2, innerH = 2.6, innerT = 0.36;
  const inner = wallRect({
    w: innerW, d: innerD, t: innerT, h: innerH, gateW: 1.1, corner: true, tower: false,
  }, M, parent);
  inner.position.set(0, 0, -outerD / 2 + innerD / 2 + 0.55);

  // 正殿 + 两侧配殿
  hall(2.6, M, parent).position.set(0, outerH * 0 + inner.position.y + innerH, inner.position.z + 0.35);
  box(2.6, 0.2, 3.0, M.top, 0, inner.position.y + innerH + 0.1, inner.position.z + 0.35, parent); // 殿前月台
  hut(0.7, 0.55, M, parent).position.set(1.15, outerH, outerD / 2 - 0.85);
  hut(0.7, 0.55, M, parent).position.set(-1.15, outerH, outerD / 2 - 0.85);
  hut(0.6, 0.5, M, parent).position.set(1.5, outerH, outerD / 2 - 1.8);
  hut(0.6, 0.5, M, parent).position.set(-1.5, outerH, outerD / 2 - 1.8);

  // 旌旗: 外城四角 + 内城正门两侧
  const fx = outerW / 2 - 0.35, fz = outerD / 2 - 0.35;
  flagPole(2.6, M.flag, -fx, -fz, parent).position.y = outerH;
  flagPole(2.6, M.flag, fx, -fz, parent).position.y = outerH;
  flagPole(3.0, M.flag, -1.0, outerD / 2 - 0.2, parent).position.y = outerH;
  flagPole(3.0, M.flag, 1.0, outerD / 2 - 0.2, parent).position.y = outerH;

  return { w: outerW, d: outerD, h: outerH + innerH + 1.9 };
}

function buildBig(M, parent) {
  const w = 5.2, d = 4.8, h = 2.5, t = 0.4;
  wallRect({ w, d, t, h, gateW: 1.5, corner: true }, M, parent);
  // 城内: 一座小殿 + 四栋民居
  hall(1.7, M, parent).position.set(0, h, -0.5);
  box(2.0, 0.16, 1.8, M.top, 0, h + 0.08, -0.5, parent);
  hut(0.65, 0.55, M, parent).position.set(1.45, h, 1.15);
  hut(0.65, 0.55, M, parent).position.set(-1.45, h, 1.15);
  hut(0.55, 0.5, M, parent).position.set(1.55, h, -0.6);
  hut(0.55, 0.5, M, parent).position.set(-1.55, h, -0.6);
  // 旌旗两根
  flagPole(2.4, M.flag, -1.1, d / 2 - 0.15, parent).position.y = h;
  flagPole(2.4, M.flag, 1.1, d / 2 - 0.15, parent).position.y = h;
  return { w, d, h: h + 2.2 };
}

function buildSmall(M, parent) {
  const w = 3.1, d = 2.9, h = 1.55, t = 0.34;
  wallRect({
    w, d, t, h, gateW: 0.85, corner: false, tower: true,
  }, M, parent);
  // 两三户人家
  hut(0.55, 0.5, M, parent).position.set(0.55, h, -0.35);
  hut(0.5, 0.45, M, parent).position.set(-0.6, h, -0.3);
  hut(0.45, 0.42, M, parent).position.set(0.15, h, -0.85);
  // 一根小旗
  flagPole(1.7, M.flag, 0.85, d / 2 - 0.3, parent).position.y = h;
  return { w, d, h: h + 1.4 };
}

function buildPass(M, parent) {
  // 两山夹一谷
  const hillMat = new THREE.MeshStandardMaterial({ color: M.hill, roughness: 1 });
  const rockMat = new THREE.MeshStandardMaterial({ color: M.wallDark, roughness: 1 });
  const leftHill = cyl(0.1, 3.4, 4.6, 5, hillMat, -3.1, 2.3, -0.4, parent);
  leftHill.rotation.y = 0.5;
  const rightHill = cyl(0.1, 3.0, 4.0, 5, hillMat, 3.1, 2.0, -0.4, parent);
  rightHill.rotation.y = -0.4;
  box(7.6, 0.5, 3.6, rockMat, 0, 0.25, -0.2, parent);                // 谷地岩台

  // 关门: 横跨山谷的厚墙
  const gw = 5.6, gh = 3.2, gt = 0.85;
  box(gw / 2 - 0.55, gh, gt, M.wall, -0.95, gh / 2, 0.1, parent);
  box(gw / 2 - 0.55, gh, gt, M.wall, 0.95, gh / 2, 0.1, parent);
  box(1.1, gh + 0.3, gt * 1.25, M.wallDark, 0, (gh + 0.3) / 2, 0.1, parent);
  // 门洞背板 + 门楣匾额
  box(1.05, gh * 0.9, 0.08, M.door, 0, gh * 0.45, -0.35, parent);
  box(1.0, 0.42, 0.2, M.wood, 0, gh + 0.42, 0.1, parent);
  box(0.72, 0.24, 0.06, M.battlement, 0, gh + 0.42, -0.2, parent);   // 匾额
  // 关门垛口
  for (let i = 0; i < 5; i++) {
    box(0.2, 0.26, gt * 0.9, M.battlement, -1.6 + i * 0.8, gh + 0.13, 0.1, parent);
  }
  // 桥楼(关门上的大敌楼)
  gateTower(1.9, gh, M, 0, -0.35, parent);
  // 山道: 两级石阶伸向门内
  box(1.6, 0.18, 1.2, M.top, 0, 0.09, -1.4, parent);
  box(1.3, 0.14, 1.0, M.top, 0, 0.07, -2.2, parent);
  // 旌旗三面, 猎猎之感
  flagPole(3.6, M.flag, -2.5, 0.4, parent).position.y = 4.2;
  flagPole(3.6, M.flag, 2.5, 0.4, parent).position.y = 3.6;
  flagPole(3.0, M.flag, 0, -1.1, parent).position.y = gh + 0.9;
  return { w: gw + 2, d: 4.2, h: gh + 2.2 };
}

const BUILDERS = { capital: buildCapital, big: buildBig, small: buildSmall, pass: buildPass };

/* ============================================================
 * 对外: 构建一座城
 * ========================================================== */
export function buildCity({ type = 'big', style = 'rammed', scale = 1 } = {}) {
  const P = PALETTES[style] || PALETTES.rammed;
  const g = new THREE.Group();

  const mat = (color, rough = 0.92) => new THREE.MeshStandardMaterial({ color, roughness: rough });
  const M = {
    wall: mat(P.wall), wallDark: mat(P.wallDark, 0.85),
    top: mat(P.top, 0.9), battlement: mat(P.battlement, 0.95),
    roof: mat(P.roof, 0.85), wood: mat(P.wood, 0.88), door: mat(P.door, 0.95),
    hill: mat(P.hill, 1.0),
    flag: P.flag,
  };

  const builder = BUILDERS[type] || buildBig;
  const { w, d, h } = builder(M, g);
  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  return { group: g, width: w * scale, depth: d * scale, height: h * scale };
}

/** 取一张风格调色板(给外部 UI/光环用) */
export function paletteOf(style) {
  return PALETTES[style] || PALETTES.rammed;
}
