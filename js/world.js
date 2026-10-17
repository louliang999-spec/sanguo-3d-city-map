/**
 * ============================================================
 *  3D 世界构建 —— 立体地图是怎么"长"出来的
 * ============================================================
 *
 *  整个立体地图由 3 个部分叠成:
 *
 *     ① 岩层底板 (Slab)     —— 用国界轮廓挤出厚度, 提供侧壁和"切块感"
 *     ② 地形表面 (Terrain)   —— 一张细分网格, 按高程场抬升顶点, 贴上卫星影像
 *     ③ 氛围 (Lights/Fog)   —— 光照决定立体感, 雾决定空间纵深
 *
 *      卫星纹理 + 国界掩膜  →  裁出精确的中国轮廓
 *      高程场               →  让轮廓内部真正"鼓"起来
 */
import * as THREE from 'three';
import {
  MAP_WIDTH, MAP_HEIGHT, TERRAIN, SLAB, THEME, CAMERA,
} from './config.js';
import { createHeightSampler } from './geo.js';

/* ============================================================
 * 背景: 一张径向渐变的画布纹理, 比纯色更有空间感
 * ========================================================== */
function makeBackgroundTexture() {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');

  const g = ctx.createRadialGradient(size * 0.5, size * 0.42, 0, size * 0.5, size * 0.5, size * 0.72);
  g.addColorStop(0, '#' + THEME.bgInner.toString(16).padStart(6, '0'));
  g.addColorStop(1, '#' + THEME.bgOuter.toString(16).padStart(6, '0'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ============================================================
 * ① 岩层底板
 * ========================================================== */

/** 鞋带公式算多边形面积(世界单位²), 用来过滤碎岛 */
function polygonArea(pts) {
  let sum = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * 把国界 GeoJSON 变成一块有厚度的立体板块。
 *
 * 关键点: ExtrudeGeometry 是沿 +Z 方向挤出的, 而我们要的是沿 Y 轴(上下),
 *        所以挤出之后要把整个几何体绕 X 轴转 -90°, 让"厚度"立起来。
 *
 * @param {object} geojson   data/china_union.json
 * @param {object} projector 投影器
 */
export function buildSlab(geojson, projector) {
  const shapes = [];
  let dropped = 0;

  for (const feat of geojson.features) {
    const g = feat.geometry;
    if (!g) continue;
    const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];

    for (const poly of polys) {
      // --- 外环 ---
      const outer = [];
      let lastX = Infinity;
      let lastY = Infinity;
      for (const [lon, lat] of poly[0]) {
        const w = projector.lonLatToWorld(lon, lat);
        const sy = -w.z;   // shape 的 y 轴对应世界 -z (北在 +y)
        if (Math.abs(w.x - lastX) < SLAB.simplifyTol && Math.abs(sy - lastY) < SLAB.simplifyTol) continue;
        lastX = w.x; lastY = sy;
        outer.push(new THREE.Vector2(w.x, sy));
      }
      if (outer.length < 3) continue;

      // --- 碎岛过滤 ---
      if (polygonArea(outer) < SLAB.minPolygonArea) { dropped++; continue; }

      const shape = new THREE.Shape(outer);

      // --- 内环(湖泊、飞地) ---
      for (let i = 1; i < poly.length; i++) {
        const hole = poly[i].map(([lon, lat]) => {
          const w = projector.lonLatToWorld(lon, lat);
          return new THREE.Vector2(w.x, -w.z);
        });
        if (hole.length >= 3) shape.holes.push(new THREE.Path(hole));
      }
      shapes.push(shape);
    }
  }

  console.info(`[底板] 保留 ${shapes.length} 个轮廓, 丢弃 ${dropped} 个碎岛`);

  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: SLAB.thickness,
    bevelEnabled: false,
    curveSegments: 1,
  });

  // 让厚度方向从 +Z 立到 +Y, 然后把整块板压到 y <= topOffset
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -SLAB.thickness + SLAB.topOffset, 0);
  geo.computeVertexNormals();

  // ExtrudeGeometry 自带两组材质索引:  0 = 上下面, 1 = 侧壁
  const capMat = new THREE.MeshStandardMaterial({
    color: THEME.slabCap,
    roughness: 1.0,
    metalness: 0.0,
  });
  const sideMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: null,          // 由调用方注入地层纹理
    roughness: 0.96,
    metalness: 0.02,
  });

  const mesh = new THREE.Mesh(geo, [capMat, sideMat]);
  mesh.name = 'slab';
  mesh.receiveShadow = false;
  return mesh;
}

/* ============================================================
 * ② 地形表面
 * ========================================================== */
/**
 * 构建地表网格。
 *
 * 原理: 从一张"很平"的细分平面出发(PlaneGeometry),
 *      逐个顶点去高程场里查高度, 然后把顶点沿 Y 轴抬起来。
 *      抬完之后重新计算法线, 光照才会正确地打出明暗 → 立体感就出来了。
 */
export function buildTerrain(assets, sampler, segments) {
  const segX = segments?.segmentsX ?? TERRAIN.segmentsX;
  const segY = segments?.segmentsY ?? TERRAIN.segmentsY;

  const geo = new THREE.PlaneGeometry(MAP_WIDTH, MAP_HEIGHT, segX, segY);
  geo.rotateX(-Math.PI / 2);   // 让平面从"竖着"变成"躺着"

  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const count = pos.count;

  for (let i = 0; i < count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    const elevation = sampler(u, v);                     // 米
    pos.setY(i, elevation * TERRAIN.heightScale);        // 抬升
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();                            // 重算法线 —— 立体感的来源
  geo.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({
    map: assets.satellite,
    alphaMap: assets.mask,
    /**
     * alphaTest: 掩膜里灰度 < 0.5 的像素直接不画。
     * 这就是"把国境线以外的地形裁掉"的办法 ——
     * 比在几何体层面切割简单得多, 而且边界是像素级精确的。
     */
    alphaTest: 0.5,
    transparent: false,
    roughness: 0.92,
    metalness: 0.0,
    envMapIntensity: 0.6,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}

/* ============================================================
 * ③ 光照与氛围
 * ========================================================== */
export function buildLights(scene) {
  // 天光: 上方冷色、下方暖色, 模拟天空与地面反射(压得低一些, 让明暗对比更强)
  const hemi = new THREE.HemisphereLight(0xbdd6ff, 0x3a2a1e, 0.55);
  scene.add(hemi);

  // 主光(太阳): 从东南偏上打下来, 让山脉的南坡受光、北坡留阴影
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.7);
  sun.position.set(55, 110, 72);
  scene.add(sun);

  // 补光: 从西北打一点冷光, 避免背光面死黑
  const fill = new THREE.DirectionalLight(0x7fa8ff, 0.5);
  fill.position.set(-75, 45, -55);
  scene.add(fill);

  // 极弱的环境光, 保证最暗处仍能看清轮廓
  scene.add(new THREE.AmbientLight(0xffffff, 0.10));

  return { hemi, sun, fill };
}

export function setupScene(scene) {
  scene.background = makeBackgroundTexture();
  scene.fog = new THREE.Fog(THEME.fogColor, THEME.fogNear, THEME.fogFar);

  // 相机
  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    window.innerWidth / window.innerHeight,
    CAMERA.near,
    CAMERA.far
  );
  camera.position.set(CAMERA.start.x, CAMERA.start.y, CAMERA.start.z);
  camera.lookAt(CAMERA.target.x, CAMERA.target.y, CAMERA.target.z);

  buildLights(scene);
  return camera;
}
