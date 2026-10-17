/* ============================================================
 *  启动守卫 boot-guard.js
 * ============================================================
 *  ⚠️ 这是一个"普通脚本"，故意放在 js/main.js 之前加载。
 *     为什么不用 module？因为如果 ES module 本身加载失败
 *     （服务器给的 MIME 类型不对、某个 import 404、跨域被拦……），
 *     module 里的**任何**代码都不会执行——包括错误提示代码。
 *     结果就是页面永远停在"正在加载地形数据…"，一句话都不说。
 *     这就是最难查的"静默卡死"。
 *
 *  这个守卫做三件事：
 *    1. 捕获脚本/样式/图片加载失败、运行时异常、未处理的 Promise 失败
 *    2. 看门狗：18 秒还没启动完 → 自动给所有关键文件做一次"体检"
 *    3. 把体检结果打成表格显示在屏幕上：哪个文件坏了、是 404、
 *       还是 MIME 类型不对、还是"服务器根本不返回"
 * ========================================================== */
(function () {
  'use strict';

  var WATCHDOG_MS = 18000;      // 多久没起来就体检
  var FETCH_TIMEOUT_MS = 6000;  // 单个文件的体检超时

  /* 页面跑起来所必需的每一个文件 */
  var FILES = [
    './js/main.js',
    './js/config.js',
    './js/assets.js',
    './js/geo.js',
    './js/world.js',
    './js/cities.js',
    './js/citybuild.js',
    './js/citylayer.js',
    './js/labelayout.js',
    './js/minimap.js',
    './js/gamedata.js',
    './js/game.js',
    './js/gameui.js',
    './vendor/three/three.module.js',
    './vendor/three/OrbitControls.js',
    './vendor/three/CSS2DRenderer.js',
    './data/map-meta.json',
    './data/satellite.jpg',
    './data/mask.png',
    './data/cliff.jpg',
    './data/heightmap.png',
    './data/china_union.json',
    './css/style.css',
  ];

  var boot = { stage: '还没开始', done: false };
  window.__boot = boot;

  var elLoading, elText, elErr;

  function ui() {
    elLoading = elLoading || document.getElementById('loading');
    elText = elText || document.getElementById('loadingText');
    elErr = elErr || document.getElementById('errbox');
  }

  /* ---------- 显示错误(错误框 z-index 比遮罩高, 会盖在上面) ---------- */
  function show(title, body) {
    ui();
    if (!elErr) return;
    elErr.hidden = false;
    elErr.textContent = title + '\n\n' + body;
    console.error('[boot-guard] ' + title + '\n' + body);
  }

  function finish() {
    boot.done = true;
    clearTimeout(watchdog);
  }

  /* ============================================================
   *  体检: 逐个请求关键文件, 记录 状态码 / MIME / 体积 / 是否超时
   * ========================================================== */
  async function probe() {
    var rows = [];
    for (var i = 0; i < FILES.length; i++) {
      var url = FILES[i];
      var row = { url: url, ok: false };
      var ctl = new AbortController();
      var timer = setTimeout(function () { ctl.abort(); }, FETCH_TIMEOUT_MS);
      try {
        var res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
        var buf = await res.arrayBuffer();
        row.status = String(res.status);
        row.type = res.headers.get('content-type') || '(未声明)';
        row.bytes = buf.byteLength;
        row.ok = res.ok;
      } catch (e) {
        row.status = (e && e.name === 'AbortError')
          ? '超时/无响应'
          : '网络错误';
        row.type = '-';
        row.bytes = 0;
        row.detail = String(e && e.message ? e.message : e);
      } finally {
        clearTimeout(timer);
      }
      rows.push(row);
    }
    return rows;
  }

  /* 静态服务器可能对 .js 返回错误的 MIME —— 浏览器会拒绝执行 module */
  function isBadJsMime(r) {
    if (!/\.js$/.test(r.url) || !r.ok) return false;
    var t = (r.type || '').toLowerCase();
    return !(t.indexOf('javascript') >= 0 || t.indexOf('ecmascript') >= 0);
  }

  function format(rows) {
    var bad = rows.filter(function (r) { return !r.ok; });
    var badMime = rows.filter(isBadJsMime);
    var out = [];

    out.push('【关键文件体检】  地址: ' + location.href);
    rows.forEach(function (r) {
      var mark = r.ok ? (isBadJsMime(r) ? '⚠️' : '✅') : '❌';
      var size = r.bytes >= 1048576
        ? (r.bytes / 1048576).toFixed(1) + ' MB'
        : Math.round(r.bytes / 1024) + ' KB';
      out.push(
        mark + ' ' + pad(r.url, 34) + ' ' + pad(r.status, 11) + ' ' +
        pad(r.type, 26) + ' ' + size
      );
    });

    out.push('');
    if (bad.length === 0 && badMime.length === 0) {
      out.push('所有文件都能正常取到 → 问题不在文件本身，');
      out.push('更可能是浏览器不支持 WebGL，或某个脚本执行时报错（见上方控制台）。');
    } else {
      out.push('【结论】');
      bad.forEach(function (r) {
        if (r.status === '超时/无响应') {
          out.push('• ' + r.url + '：文件在磁盘上但服务器一直不返回（被服务器拉黑/卡住）');
        } else if (r.status === '404') {
          out.push('• ' + r.url + '：404 找不到 —— 文件没在服务器发布的目录里，'
            + '或服务器不认这个后缀');
        } else {
          out.push('• ' + r.url + '：' + r.status + ' ' + (r.detail || ''));
        }
      });
      badMime.forEach(function (r) {
        out.push('• ' + r.url + '：Content-Type 是 "' + r.type + '"，'
          + '浏览器会拒绝执行 ES module（必须是 text/javascript）');
      });
    }
    return out.join('\n');
  }

  function pad(s, n) {
    s = String(s);
    while (s.length < n) s += ' ';
    return s;
  }

  /* ============================================================
   *  1. 捕获各种失败
   * ========================================================== */

  /* 1a. 资源(script/link/img)加载失败 —— 必须用捕获阶段才能听到 */
  window.addEventListener('error', function (e) {
    if (boot.done) return;
    var t = e && e.target;
    if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK' || t.tagName === 'IMG')) {
      var where = t.src || t.href || '(未知地址)';
      show('资源加载失败',
        where + '\n\n' +
        '浏览器没能取到这个文件。请按 F12 打开控制台看具体状态码，\n' +
        '或刷新页面：18 秒后会自动做一次全量体检。');
    }
  }, true);

  /* 1b. 普通运行时异常 */
  window.addEventListener('error', function (e) {
    if (boot.done || !e.message) return;
    show('脚本执行出错（阶段：' + boot.stage + '）',
      e.message + '\n' + (e.filename || '') + ' 第 ' + (e.lineno || '?') + ' 行');
  });

  /* 1c. 未处理的 Promise 失败 */
  window.addEventListener('unhandledrejection', function (e) {
    if (boot.done) return;
    var r = e.reason;
    show('启动过程中出现未处理的错误（阶段：' + boot.stage + '）',
      String(r && r.message ? r.message : r));
  });

  /* ============================================================
   *  2. file:// 直接双击打开 —— 这个必须提前拦住
   *     (module 会被浏览器的跨域策略直接拦掉, main.js 根本没机会执行)
   * ========================================================== */
  if (location.protocol === 'file:') {
    boot.done = true;
    document.addEventListener('DOMContentLoaded', function () {
      show('⚠️ 请勿直接双击打开 index.html',
        '浏览器禁止网页以 file:// 协议读取本地数据文件和 ES module，\n' +
        '所以这样打开必然是白屏／一直转圈。\n\n' +
        '正确做法：在本项目目录下启动一个本地服务器，例如\n\n' +
        '    python -m http.server 8123\n\n' +
        '然后浏览器访问  http://127.0.0.1:8123/\n\n' +
        '（或者直接双击项目里的 start.bat）');
    });
    return;
  }

  /* ============================================================
   *  3. 看门狗
   * ========================================================== */
  var watchdog = setTimeout(async function () {
    if (boot.done) return;
    ui();
    if (elText) elText.textContent = '启动超时，正在自动体检…';
    var rows;
    try {
      rows = await probe();
    } catch (e) {
      rows = [];
    }
    show('启动超时（卡在：' + boot.stage + '）',
      format(rows) + '\n\n' +
      '提示：如果体检结果全是 ✅，那说明文件都没问题，\n' +
      '只是慢或渲染卡住 —— 这种情况把上面这份报告发给我即可。');
  }, WATCHDOG_MS);

  /* 供调试用：控制台里执行 await __bootGuard.probe() */
  window.__bootGuard = {
    finish: finish,
    probe: probe,
    format: format,
    report: async function () { return format(await probe()); },
    get stage() { return boot.stage; },
  };
})();
