/**
 * ============================================================
 *  地理投影 —— 把"经纬度"翻译成"3D 世界坐标"
 * ============================================================
 *
 * 这是整个项目最容易出错、也最关键的一环。
 *
 * 地图瓦片用的是 Web Mercator( web 墨卡托 )投影, 它的特点是:
 *   - 经度方向是线性的
 *   - 纬度方向被"拉伸"了(越靠近两极拉伸越厉害)
 *
 * 我们的地形纹理、掩膜、高程场都是按这个投影烘焙出来的。
 * 所以: 只要前端的换算公式和 Python 烘焙脚本里的一模一样,
 *       节点、路线就一定能严丝合缝地对齐地形。
 *
 * ⚠️ 改动这里的公式 = 必须同步改 tools/build-assets.py, 否则必然错位。
 */
import { MAP_WIDTH, MAP_HEIGHT } from './config.js';

/**
 * 根据 map-meta.json 创建投影器
 * @param {object} meta data/map-meta.json 的内容
 */
export function createProjector(meta) {
  const zoom = meta.zoom;
  const n = 256 * Math.pow(2, zoom);              // 该层级下全球的像素宽度
  const originX = meta.tiles.xMin * 256;          // 画布左上角在全球像素坐标系中的位置
  const originY = meta.tiles.yMin * 256;
  const imgW = meta.image.width;
  const imgH = meta.image.height;

  /** 经纬度 -> 画布像素坐标(浮点) */
  function lonLatToPixel(lon, lat) {
    const px = ((lon + 180) / 360) * n - originX;
    const r = (lat * Math.PI) / 180;
    const py = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n - originY;
    return { x: px, y: py };
  }

  return {
    meta,

    /**
     * 经纬度 -> 世界坐标
     * 返回 { x, z }, y(高度) 需要另外用地形采样器求出来。
     */
    lonLatToWorld(lon, lat) {
      const p = lonLatToPixel(lon, lat);
      return {
        x: (p.x / imgW - 0.5) * MAP_WIDTH,
        z: (p.y / imgH - 0.5) * MAP_HEIGHT,
      };
    },

    /** 画布像素 -> 归一化纹理坐标 UV (0~1), 用于给几何体贴图 */
    pixelToUv(px, py) {
      return { u: px / imgW, v: 1 - py / imgH };
    },

    /** 世界坐标 -> UV */
    worldToUv(x, z) {
      return {
        u: x / MAP_WIDTH + 0.5,
        v: 0.5 - z / MAP_HEIGHT,
      };
    },
  };
}

/**
 * 地形高度采样器: 从烘焙好的高程场里读任意一点的高度。
 * 用双线性插值, 保证相邻顶点之间是平滑过渡而不是台阶。
 *
 * @param {Float32Array} heightmap  data/heightmap.png 解码出来的数据
 * @param {{width:number,height:number}} size
 * @returns {(u:number, v:number) => number} 高程(米)
 */
export function createHeightSampler(heightmap, size) {
  const w = size.width;
  const h = size.height;
  const maxX = w - 1;
  const maxY = h - 1;

  return function sampleHeight(u, v) {
    // UV -> 高程图的浮点像素坐标
    // 注意: 图像第 0 行是最北边, 而 UV 的 v=1 才是北, 所以要翻过来
    const fx = Math.min(Math.max(u, 0), 1) * maxX;
    const fy = (1 - Math.min(Math.max(v, 0), 1)) * maxY;

    const x0 = fx | 0;
    const y0 = fy | 0;
    const x1 = x0 < maxX ? x0 + 1 : maxX;
    const y1 = y0 < maxY ? y0 + 1 : maxY;
    const tx = fx - x0;
    const ty = fy - y0;

    const row0 = y0 * w;
    const row1 = y1 * w;

    const h00 = heightmap[row0 + x0];
    const h10 = heightmap[row0 + x1];
    const h01 = heightmap[row1 + x0];
    const h11 = heightmap[row1 + x1];

    const top = h00 + (h10 - h00) * tx;
    const bot = h01 + (h11 - h01) * tx;
    return top + (bot - top) * ty;
  };
}
