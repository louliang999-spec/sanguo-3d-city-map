/**
 * ============================================================
 *  labelayout.js —— 城池名称的屏幕空间避让
 * ============================================================
 *
 *  标签放大后, 中原密集区难免互相压住。这里在每帧渲染完
 *  CSS2DRenderer 之后, 把所有标签重新按"屏幕坐标"排一遍:
 *
 *    1. 把每个标签的 3D 锚点投到屏幕上, 得到一块矩形
 *    2. 按 S > A > B > C 的优先级依次放置(重要的城永远贴在城上)
 *    3. 放不下就往上/下/左/右挪, 挪不动就把透明度降到 0.18
 *
 *  ⚠ 必须在 labelRenderer.render() 之后调用, 因为 CSS2DRenderer
 *    每帧都会重写 element 的 transform, 我们要写在其后才能生效。
 */
import * as THREE from 'three';

export function createLabelLayout(labels) {
  const items = labels.map((l) => ({
    el: l.el,
    pos: l.pos,           // THREE.Vector3 (世界坐标)
    priority: l.priority, // 0 最优先
    index: l.index,
    w: 0, h: 0,
  }));

  const v = new THREE.Vector3();
  let frame = 0;
  let lastW = 0;
  let lastH = 0;

  function measure() {
    for (const it of items) {
      it.w = it.el.offsetWidth || 60;
      it.h = it.el.offsetHeight || 24;
    }
  }

  function update(camera, width, height) {
    // 尺寸偶尔量一次即可(读取 offsetWidth 会强制重排, 别每帧做)
    if (++frame % 30 === 1 || width !== lastW || height !== lastH) measure();
    lastW = width; lastH = height;

    const order = [...items].sort((a, b) => a.priority - b.priority || a.index - b.index);
    const rects = [];

    for (const it of order) {
      v.copy(it.pos).project(camera);
      if (v.z > 1 || v.x < -1.15 || v.x > 1.15 || v.y < -1.15 || v.y > 1.15) {
        it.el.style.opacity = '0';
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * width;
      const y = (-v.y * 0.5 + 0.5) * height;
      const hw = it.w / 2;
      const hh = it.h / 2;

      // 候选偏移: 原地 → 上下 → 左右 → 更远, 单位为像素
      const cand = [[0, 0]];
      for (let s = 1; s <= 5; s++) {
        cand.push(
          [0, -s * hh * 1.25], [0, s * hh * 1.25],
          [-s * hw * 1.1, 0], [s * hw * 1.1, 0],
          [-s * hw * 0.8, -s * hh * 1.25], [s * hw * 0.8, -s * hh * 1.25],
          [-s * hw * 0.8, s * hh * 1.25], [s * hw * 0.8, s * hh * 1.25],
        );
      }

      let ox = 0, oy = 0, ok = false;
      for (const [dx, dy] of cand) {
        const l = x + dx - hw;
        const t = y + dy - hh;
        if (l < 0 || t < 0 || l + it.w > width || t + it.h > height) continue;
        let hit = false;
        for (const r of rects) {
          if (l < r.x + r.w && l + it.w > r.x && t < r.y + r.h && t + it.h > r.y) { hit = true; break; }
        }
        if (!hit) { ox = dx; oy = dy; ok = true; break; }
      }

      if (ok) {
        rects.push({ x: x + ox - hw, y: y + oy - hh, w: it.w, h: it.h });
        it.el.style.opacity = '';
      } else {
        it.el.style.opacity = '0.18';
      }
      it.el.style.transform =
        'translate(-50%,-50%)translate(' + (x + ox).toFixed(1) + 'px,' + (y + oy).toFixed(1) + 'px)';
    }
  }

  return { update };
}
