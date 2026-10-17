/**
 * ============================================================
 *  资源加载
 * ============================================================
 * 我们一共要加载 6 样东西:
 *   data/map-meta.json     投影参数(小, 最先要)
 *   data/satellite.jpg     卫星影像大图   (2 MB)
 *   data/mask.png          国界掩膜        (40 KB)
 *   data/cliff.jpg         侧壁地层纹理    (1 KB)
 *   data/heightmap.png     高程场 (16 位打包进 R/G 通道, 约 270 KB)
 *   data/china_union.json  国界矢量(由省级数据并集而来, 给底板挤出厚度用)
 *
 * ⚠️ 为什么高程用 PNG 而不是 heightmap.bin?
 *   很多静态文件服务器(尤其是各种"内嵌/预览浏览器"环境)只给认识的
 *   MIME 后缀发文件, 请求 .bin 会直接 404, 页面就报"找不到 heightmap.bin"。
 *   PNG 一定在白名单里, 所以我们把高程塞进图片像素里 —— 见
 *   tools/build-assets.py 第 5 节。附带好处: 文件小了 7 倍, 还能用
 *   任何看图软件打开肉眼检查。
 */
import * as THREE from 'three';

/** 单个资源的超时时间(毫秒)。宁可明确报错, 也不要无限期转圈 */
const FETCH_TIMEOUT_MS = 15000;

/**
 * 带超时的 fetch。
 *
 * ⚠️ 为什么一定要有超时?
 *   如果服务器对这个文件"既不返回成功也不返回失败"(卡住不响应),
 *   原生的 fetch 会永远 pending。于是 Promise.all 永远不 settle,
 *   try/catch 永远不触发, 加载遮罩就永远转下去 —— 界面上什么都不说。
 *   这种"静默卡死"是最难排查的, 所以每个请求都必须能超时。
 */
async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
    return res;
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`请求超过 ${timeoutMs / 1000} 秒没有响应`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** 取 JSON(带超时) */
async function fetchJson(url) {
  const res = await fetchWithTimeout(url);
  return res.json();
}

/**
 * 把 heightmap.png 解码回 Float32 高程场(单位: 米)
 *
 * 编码规则(必须和 tools/build-assets.py 严格一致):
 *   高程 --归一化--> 0~65535 的整数 q
 *   R = q >> 8 (高字节)   G = q & 255 (低字节)   B = 0 (留空)
 *   还原: elev = (R * 256 + G) / 65535 * maxElev
 *
 * 16 位 = 65536 级, 9000m 量程下分辨率约 0.14m, 对 3D 地形绰绰有余。
 *
 * 两个容易踩的坑:
 *  1) createImageBitmap 要显式传 colorSpaceConversion:'none'。
 *     不传的话浏览器可能对图片做色彩管理, 把像素值"修"过一点点,
 *     地形高度就整体走样 —— 而且不报错, 只是悄悄变矮/变高。
 *  2) canvas 必须 1:1 原尺寸绘制, 一旦缩放就会引入插值污染。
 *
 * @param {string} url
 * @param {{width:number,height:number,maxElev:number,stats?:object}} hm meta.heightmap
 * @returns {Promise<Float32Array>}
 */
async function decodeHeightmapPng(url, hm) {
  const res = await fetchWithTimeout(url);

  const bitmap = await createImageBitmap(await res.blob(), {
    colorSpaceConversion: 'none',   // 关键: 禁止色彩管理
    premultiplyAlpha: 'none',
  });

  const w = bitmap.width;
  const h = bitmap.height;
  if (w !== hm.width || h !== hm.height) {
    throw new Error(
      `heightmap.png 尺寸 ${w}x${h} 与 map-meta.json 记录的 ${hm.width}x${hm.height} 不一致。\n` +
      '请重新运行 tools/build-assets.py 让两者同步。'
    );
  }

  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);          // 尺寸相同 -> 1:1, 无重采样
  const px = ctx.getImageData(0, 0, w, h).data;
  if (typeof bitmap.close === 'function') bitmap.close();

  const k = hm.maxElev / 65535;
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (px[p] * 256 + px[p + 1]) * k;
  }

  /* ---- 自检: 和 Python 烘焙时记录的统计值对一遍 ---- */
  const s = hm.stats;
  if (s && s.max > 0) {
    let mn = Infinity;
    let mx = -Infinity;
    let sum = 0;
    for (let i = 0; i < out.length; i++) {
      const v = out[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      sum += v;
    }
    const mean = sum / out.length;
    const tol = hm.maxElev / 65535 * 2 + 0.01;   // 量化误差的 2 倍
    const off = Math.abs(mn - s.min) > tol
      || Math.abs(mx - s.max) > tol
      || Math.abs(mean - s.mean) > tol;
    if (off) {
      console.warn(
        '[heightmap] 解码值与烘焙记录不符, 像素可能被色彩管理改过:\n'
        + `  期望 min/max/mean = ${s.min} / ${s.max} / ${s.mean}\n`
        + `  实际 min/max/mean = ${mn.toFixed(3)} / ${mx.toFixed(3)} / ${mean.toFixed(3)}`
      );
    } else {
      console.log(`[heightmap] 解码 OK ${w}x${h}, 高程 ${mn.toFixed(0)}~${mx.toFixed(0)} m`);
    }
  }

  return out;
}

/**
 * @param {(text:string, ratio:number)=>void} onProgress
 */
export async function loadAssets(onProgress = () => {}) {
  const report = (text, ratio) => onProgress(text, ratio);

  /* ---- 1. 先拿元信息 ---- */
  report('读取投影参数…', 0.02);
  let meta;
  try {
    meta = await fetchJson('./data/map-meta.json');
  } catch (e) {
    throw new Error(
      '读不到 data/map-meta.json\n  ' + (e?.message || e) +
      '\n请先在本项目目录下运行:  python tools/build-assets.py'
    );
  }

  /**
   * 加载一张贴图。
   *
   * 这里故意绕了一圈: 先用带超时的 fetch 把图片下成 Blob, 再交给
   * TextureLoader 解码。直接 texLoader.load(url) 的问题是, 如果请求
   * 卡住不返回, 它既不 success 也不 error —— Promise 永远等下去。
   * 先 fetch 一遍, 超时/404/网络错误就都能被 caught 到。
   *
   * (不用 createImageBitmap 直接建纹理, 因为 ImageBitmap 在多数浏览器里
   *  会忽略 UNPACK_FLIP_Y_WEBGL, 贴图上下会翻 —— 地图会倒过来。)
   */
  const texLoader = new THREE.TextureLoader();
  const loadTex = async (url, label, ratio) => {
    report(label, ratio);
    let blob;
    try {
      const res = await fetchWithTimeout(url);
      blob = await res.blob();
    } catch (e) {
      throw new Error(`贴图取不到: ${url}\n  ${e?.message || e}`);
    }
    const objUrl = URL.createObjectURL(blob);
    try {
      return await texLoader.loadAsync(objUrl);
    } catch (e) {
      throw new Error(`贴图解码失败: ${url}\n  ${e?.message || e}`);
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  };

  /* ---- 2. 并行加载所有资源 ---- */
  const [satellite, mask, cliff, heightmap, geojson] = await Promise.all([
    loadTex('./data/satellite.jpg', '加载卫星影像…', 0.10),
    loadTex('./data/mask.png', '加载国界掩膜…', 0.30),
    loadTex('./data/cliff.jpg', '加载地层纹理…', 0.40),
    (async () => {
      report('加载高程数据…', 0.45);
      return decodeHeightmapPng('./data/heightmap.png', meta.heightmap);
    })(),
    (async () => {
      report('加载国界矢量…', 0.70);
      try {
        return await fetchJson('./data/china_union.json');
      } catch (e) {
        throw new Error(`取不到 data/china_union.json\n  ${e?.message || e}`);
      }
    })(),
  ]);

  report('处理数据…', 0.85);

  /* ---- 3. 纹理参数: 这一步直接影响画质, 别省 ---- */
  satellite.colorSpace = THREE.SRGBColorSpace;   // 彩色贴图要标成 sRGB, 否则颜色会发灰
  satellite.wrapS = THREE.ClampToEdgeWrapping;
  satellite.wrapT = THREE.ClampToEdgeWrapping;
  satellite.minFilter = THREE.LinearMipmapLinearFilter;
  satellite.generateMipmaps = true;

  mask.colorSpace = THREE.NoColorSpace;          // 掩膜是"数据"不是"颜色", 不能走 sRGB
  mask.wrapS = THREE.ClampToEdgeWrapping;
  mask.wrapT = THREE.ClampToEdgeWrapping;

  cliff.colorSpace = THREE.SRGBColorSpace;
  cliff.wrapS = THREE.RepeatWrapping;            // 侧壁 UV 的 u 是真实长度值, 必须允许重复
  cliff.wrapT = THREE.ClampToEdgeWrapping;

  report('准备就绪', 1);
  return { meta, satellite, mask, cliff, heightmap, geojson };
}
