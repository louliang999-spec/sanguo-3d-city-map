/**
 * ============================================================
 *  gameui.js —— 游戏界面层（三级页面结构）
 * ============================================================
 *  一级：天下大地图（3D，左右双面板 + hover 情报）
 *  二级：内政打卡 / 武将管理 / 出征战斗(含俘虏) / 宝物背包 / 设置存档
 *  三级：城池详情 / 武将详情 / 战斗结果 / 事件告示（群英传2 白底黑字弹窗）
 *
 *  全局公共元素：
 *    顶部资源栏（粮·兵·金·声望·将星 + 连续打卡 + 第X周）
 *    左侧主公信息面板 / 右侧今日打卡面板
 *    底部功能菜单（内政·武将·出征·宝物·存档 + 结束回合）
 *    所有二级页面左上角都有「返回大地图」
 * ============================================================
 */
import { CITIES, GRADE_STATS, FACTIONS, FACTION_IDS, neighborsOf } from './cities.js';
import {
  FACTION_SETUP, TASKS, RULES, EVENTS, MISS_PLAN, ITEMS, ITEM_MAP, SKILLS,
  MILESTONES, LEGEND_COST,
} from './gamedata.js';
import * as G from './game.js';

let host = null;          // { flyTo, focusCity }
const $ = (id) => document.getElementById(id);

/* 主公半身像（AI 生成，img/ 目录） */
export const LORD_IMG = {
  wei: 'img/lord-caocao.png',
  shu: 'img/lord-liubei.png',
  wu: 'img/lord-sunquan.png',
  yuan: 'img/lord-yuanshao.png',
  lvbu: 'img/lord-lvbu.png',
  liubiao: 'img/lord-liubiao.png',
};

/* ============================================================
 * 通用弹窗（三级）—— opts.classic = 群英传2 白底黑字风
 * ========================================================== */
function openModal(title, html, onMount, opts = {}) {
  const box = $('modal');
  box.hidden = false;
  box.innerHTML = `
    <div class="modal__mask"></div>
    <div class="modal__panel${opts.classic ? ' modal__panel--classic' : ''}">
      <div class="modal__head">
        <h3 class="modal__title"></h3>
        <button class="modal__x" type="button">✕</button>
      </div>
      <div class="modal__body">${html}</div>
    </div>`;
  box.querySelector('.modal__title').textContent = title;
  box.querySelector('.modal__x').onclick = closeModal;
  box.querySelector('.modal__mask').onclick = closeModal;
  onMount?.(box.querySelector('.modal__body'));
}
export function closeModal() {
  const box = $('modal');
  box.hidden = true;
  box.innerHTML = '';
}

function toast(msg, kind = 'info') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast is-show' + (kind === 'bad' ? ' toast--bad' : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 2600);
}

/* ============================================================
 * 二级页面（全屏覆盖，带「返回大地图」）
 * ========================================================== */
let pageOpen = false;
function openPage(id, opts = {}) {
  pageOpen = true;
  const box = $('page');
  box.hidden = false;
  const back = `<button class="page__back" type="button">← 返回大地图</button>`;
  const titles = { gov: '内政打卡', gen: '武将管理', war: '出征战斗', item: '宝物背包', save: '设置存档' };
  box.innerHTML = `
    <div class="page__mask"></div>
    <div class="page__panel">
      <div class="page__head">
        ${back}
        <h2 class="page__title">${titles[id] || ''}</h2>
      </div>
      <div class="page__body" id="pageBody"></div>
    </div>`;
  box.querySelector('.page__back').onclick = closePage;
  const body = box.querySelector('#pageBody');
  if (id === 'gov') pageGov(body, opts);
  else if (id === 'gen') pageGenerals(body, opts);
  else if (id === 'war') pageWar(body, opts);
  else if (id === 'item') pageItems(body, opts);
  else if (id === 'save') pageSave(body, opts);
}
function closePage() {
  pageOpen = false;
  const box = $('page');
  box.hidden = true;
  box.innerHTML = '';
}

/* ============================================================
 * 顶部资源栏（全局公共）
 * ========================================================== */
function renderResbar() {
  const s = G.state();
  if (!s) return;
  const r = G.me();
  const mine = G.cityCount(s.player);
  const total = s.cities.length;
  const pct = Math.round(mine / total * 100);
  const chip = (cls, val, label) => `
    <div class="res__chip" title="${label}">
      <i class="ricon ${cls}"></i><b>${val}</b><span>${label}</span>
    </div>`;
  $('resbar').innerHTML = `
    <div class="res__pill res__turn"><b>第 ${s.turn} 回合</b><span>第 ${s.week} 周</span></div>
    <div class="res__res">
      ${chip('ric-grain', r.food, '粮草')}
      ${chip('ric-sol', r.soldier, '兵马')}
      ${chip('ric-gold', r.gold, '金币')}
      ${chip('ric-rep', r.prestige, '声望')}
      ${chip('ric-shard', s.shards, '将星')}
    </div>
    ${chip('ric-city', `${mine}/${total}`, '城池')}
    <div class="res__bar" title="统一进度 ${pct}%">
      <div class="res__barfill" style="width:${pct}%"></div><span>${pct}%</span>
    </div>
    <div class="res__pill res__streak"><b>🔥 连续打卡 ${s.streak} 天</b></div>
  `;
}

/* ============================================================
 * 左侧 · 主公信息面板（全局公共）
 * ========================================================== */
function renderLordPanel() {
  const s = G.state();
  const el = $('citypanel');
  if (!s) { el.innerHTML = '<p class="cp__kicker">三国 · 学习志</p><p class="cp__note">选择一个势力即可开局。</p>'; return; }
  const f = FACTIONS[s.player];
  const gens = G.myGenerals();
  el.innerHTML = `
    <div class="cp__portrait">
      <img class="cp__avatar" src="${LORD_IMG[s.player] || ''}" alt="">
      <div class="cp__ribbon"><b style="color:${f.color}">${f.name}</b></div>
    </div>
    <p class="cp__kicker cp__kicker--gap">主公 · 第 ${s.turn} 回合</p>
    <div class="cp__stats">
      <div class="cp-row"><span>回合</span><b>第 ${s.turn} 回合 · 第 ${s.week} 周</b></div>
      <div class="cp-row"><span>粮草</span><b>${G.me().food}</b></div>
      <div class="cp-row"><span>兵马</span><b>${G.me().soldier}</b></div>
      <div class="cp-row"><span>金币</span><b>${G.me().gold}</b></div>
      <div class="cp-row"><span>将星碎片</span><b>${s.shards}</b></div>
      <div class="cp-row"><span>城池</span><b>${G.cityCount(s.player)} / ${s.cities.length}</b></div>
    </div>
    <p class="cp__kicker cp__kicker--gap">麾下武将（${gens.length}）</p>
    <div class="lord__gens">
      ${gens.map((g) => `
        <button class="lord__gen${g.loyalty < RULES.LOYALTY_REVOLT ? ' is-warnrow' : ''}" data-lg="${g.id}">
          <b>${g.name}</b>
          <span class="${g.loyalty < RULES.LOYALTY_REVOLT ? 'is-warn' : ''}">忠${g.loyalty}</span>
          <span class="${g.stamina < RULES.STAMINA_COST ? 'is-warn' : ''}">体${g.stamina}</span>
        </button>`).join('') || '<p class="cp__note">暂无武将</p>'}
    </div>
  `;
  el.querySelectorAll('[data-lg]').forEach((b) => {
    b.onclick = () => generalDetail(+b.dataset.lg, renderAll);
  });
}

/* ============================================================
 * 右侧 · 今日打卡面板（全局公共）
 * ========================================================== */
const UNLOCK_LABELS = { farm: '屯田', recruit: '募兵', search: '寻访', fortify: '加固' };
function renderTaskPanel() {
  const s = G.state();
  const el = $('taskpanel');
  if (!s) { el.innerHTML = '<p class="tp__head">今日打卡</p><p class="tp__empty">开局后出现在这里</p>'; return; }
  const tasks = G.effectiveTasks();
  const ul = G.unlocks();
  const done = (t) => !!s.todayTasks[t.id];

  const row = (t) => {
    const rw = t.reward || {};
    const rwText = [
      rw.food ? `粮+${rw.food}` : '', rw.soldier ? `兵+${rw.soldier}` : '',
      rw.gold ? `金+${rw.gold}` : '', rw.shards ? `星+${rw.shards}` : '',
    ].filter(Boolean).join(' ');
    return `
      <div class="tp__task${done(t) ? ' is-done' : ''}">
        <div class="tp__main">
          <b>${t.icon} ${t.name}</b>
          <span>${rwText}${t.unlock ? ` · 解锁【${UNLOCK_LABELS[t.unlock]}】` : ''}</span>
        </div>
        ${t.needFix && !done(t)
          ? `<label class="chk"><input type="checkbox" data-tfix="${t.id}" checked>订正</label>`
          : ''}
        <button class="btn btn--sm ${done(t) ? 'btn--dim' : 'btn--go'}" data-tclaim="${t.id}" ${done(t) ? 'disabled' : ''}>
          ${done(t) ? '✓' : '领'}
        </button>
      </div>`;
  };

  const dailies = tasks.filter((t) => t.cat === 'daily');
  const challenges = tasks.filter((t) => t.cat !== 'daily');

  el.innerHTML = `
    <p class="tp__head">今日学习打卡 <span>${ul.dailyDone} 项已领</span></p>
    ${dailies.map(row).join('')}
    <p class="tp__head tp__head--gap">自选挑战</p>
    ${challenges.map(row).join('')}
    <div class="tp__locks">
      ${Object.keys(UNLOCK_LABELS).map((k) => `
        <span class="tp__lock ${ul[k] ? 'is-on' : 'is-off'}">${UNLOCK_LABELS[k]}${ul[k] ? ' ✓' : ' 🔒'}</span>`).join('')}
      <span class="tp__lock ${ul.attack ? 'is-on' : 'is-off'}">出征${ul.attack ? ' ✓' : ` 🔒(${ul.dailyDone}/${ul.attackNeed})`}</span>
    </div>
  `;

  el.querySelectorAll('[data-tclaim]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.tclaim;
      const fix = el.querySelector(`[data-tfix="${id}"]`);
      const res = G.claimTask(id, { fixed: fix ? fix.checked : true });
      toast(res.msg, res.ok ? 'info' : 'bad');
      if (res.ok && res.needTrain) trainModal();
      renderAll();
    };
  });
}

/* ============================================================
 * 底部功能菜单（全局公共）
 * ========================================================== */
function renderMenu() {
  $('phasebar').innerHTML = `
    <button class="nav" data-nav="gov">🏯 内政</button>
    <button class="nav" data-nav="gen">🤝 武将</button>
    <button class="nav" data-nav="war">⚔️ 出征</button>
    <button class="nav" data-nav="item">🎁 宝物</button>
    <button class="nav" data-nav="save">⚙️ 存档</button>
    <button class="nav nav--end" data-end="1">结束回合 ⏭</button>
  `;
}

function renderAll() {
  renderResbar();
  renderLordPanel();
  renderTaskPanel();
  if (pageOpen) {
    const id = ($('page').querySelector('.page__title') || {}).textContent;
    const map = { '内政打卡': 'gov', '武将管理': 'gen', '出征战斗': 'war', '宝物背包': 'item', '设置存档': 'save' };
    const cur = map[id];
    if (cur) openPage(cur);
  }
}

/* ============================================================
 * 二级 · 内政打卡（城池经营，操作受打卡解锁门控）
 * ========================================================== */
function pageGov(body, opts = {}) {
  const s = G.state();
  const focus = opts.city ?? -1;
  const cities = G.myCities();
  const gens = G.myGenerals();
  const ul = G.unlocks();

  const lockBtn = (k) => (ul[k] ? '' : ` title="${ul.hint[k]}"`);
  const cityRows = cities.map((c) => {
    const st = CITIES[c.i];
    const a = s.actions[c.i] || { recruited: 0 };
    const cap = RULES.GARRISON_CAP[st.grade];
    const maxIn = Math.max(1, Math.min(cap - c.garrison, RULES.RECRUIT_MAX_PER_TURN - a.recruited, G.me().food));
    return `
      <div class="cityrow ${c.i === focus ? 'is-focus' : ''}" id="crow-${c.i}">
        <div class="cityrow__head">
          <b>${st.name}</b>
          <span class="tag tag--grade tag--grade-${st.grade}">${st.grade} · ${GRADE_STATS[st.grade].name}</span>
          <span class="tag">${st.zhou}</span>
        </div>
        <div class="cityrow__stat">
          <span>守军 <b>${c.garrison}</b> / ${cap}</span>
          <span>城防 <b>${c.defense}</b></span>
          <span>屯田 <b>Lv.${c.farm}</b></span>
          <span>本回合已征 <b>${a.recruited}</b></span>
        </div>
        <div class="cityrow__act">
          <div class="actgroup">
            <input class="num" type="number" min="1" max="${maxIn}" value="${Math.min(200, maxIn)}" data-rcnum="${c.i}">
            <button class="btn" data-rc="${c.i}" ${ul.recruit ? '' : 'disabled'}${lockBtn('recruit')}>🛡️ 募兵</button>
          </div>
          <button class="btn" data-fm="${c.i}" ${ul.farm ? '' : 'disabled'}${lockBtn('farm')}>🌾 屯田 (${RULES.FARM_COST}金)</button>
          <button class="btn" data-ft="${c.i}" ${ul.fortify ? '' : 'disabled'}${lockBtn('fortify')}>🏗️ 加固 (${RULES.DEF_UP_COST}金)</button>
          <button class="btn" data-sc="${c.i}" ${ul.search && s.searchTokens > 0 ? '' : 'disabled'}${lockBtn('search')}>🔮 寻访 (${RULES.SEARCH_COST}金)</button>
        </div>
      </div>`;
  }).join('');

  const genRows = gens.map((g) => `
    <div class="gencard">
      <div class="gencard__head">
        <b>${g.name}</b>
        ${g.skill !== 'none' ? `<span class="tag">${SKILLS[g.skill].name}</span>` : ''}
        ${g.item ? `<span class="tag tag--item">${ITEM_MAP[g.item].icon}${ITEM_MAP[g.item].name}</span>` : ''}
        <span class="tag">驻 ${g.cityId >= 0 && CITIES[g.cityId] ? CITIES[g.cityId].name : '随军'}</span>
      </div>
      <div class="gencard__stat">
        <span>武 ${G.forceOf(g)}</span><span>智 ${G.intelOf(g)}</span>
        <span class="${g.loyalty < RULES.LOYALTY_REVOLT ? 'is-warn' : ''}">忠 ${g.loyalty}</span>
        <span class="${g.stamina < RULES.STAMINA_COST ? 'is-warn' : ''}">体 ${g.stamina}/${G.staminaMaxOf(g)}</span>
      </div>
      <div class="gencard__note">${g.note || ''}</div>
      <div class="btnrow" style="margin-top:10px">
        <button class="btn" data-cf="${g.id}">🫂 安抚 (${RULES.COMFORT_COST}金)</button>
        <button class="btn" data-rw="${g.id}">🎁 赏赐 (${RULES.REWARD_COST}金)</button>
      </div>
    </div>`).join('');

  const allyRows = FACTION_IDS.filter((f) => f !== s.player).map((f) => {
    const left = s.allies[f] || 0;
    return `<button class="btn btn--sm" data-al="${f}" ${left > 0 ? 'disabled' : ''}>
      ${FACTION_SETUP[f].name}${left > 0 ? `（盟 ${left}）` : ` 结盟 ${RULES.ALLY_COST}金`}
    </button>`;
  }).join('');

  body.innerHTML = `
    <div class="modal__sec checkin-hero">
      <h4>📚 今日学习打卡</h4>
      <p class="modal__lead">完成右侧打卡清单可解锁内政操作；每日任务领满 <b>${G.unlocks().attackNeed}</b> 项后解锁【出征】。</p>
    </div>
    <div class="pagecols">
      <div class="modal__sec">
        <h4>🏯 城池经营（${cities.length}）　寻访机会：<b>${s.searchTokens}</b></h4>
        ${cityRows || '<p class="modal__lead">暂无城池</p>'}
      </div>
      <div class="modal__sec">
        <h4>🤝 武将安抚 / 赏赐（${gens.length}）</h4>
        ${genRows || '<p class="modal__lead">暂无武将</p>'}
      </div>
    </div>
    <div class="modal__sec">
      <h4>🔁 调兵遣将（每兵耗粮 ${RULES.TRANSFER_FOOD_PER}）</h4>
      ${cities.length >= 2 ? `
      <div class="trrow">
        <span class="trrow__tag">城池 → 城池</span>
        <select class="sel" id="trCC">${cities.map((c) => `<option value="${c.i}">${CITIES[c.i].name}（守军 ${c.garrison}）</option>`).join('')}</select>
        <span>→</span>
        <select class="sel" id="trCT">${cities.map((c) => `<option value="${c.i}">${CITIES[c.i].name}（守军 ${c.garrison}）</option>`).join('')}</select>
        <input class="num" type="number" min="1" value="100" id="trN1">
        <button class="btn" id="trGoCC">调兵</button>
      </div>` : ''}
      ${cities.length ? `
      <div class="trrow">
        <span class="trrow__tag">城池 → 手头</span>
        <select class="sel" id="trCH">${cities.map((c) => `<option value="${c.i}">${CITIES[c.i].name}（守军 ${c.garrison}）</option>`).join('')}</select>
        <input class="num" type="number" min="1" value="100" id="trN2">
        <button class="btn btn--go" id="trGoCH">调出（出征用）</button>
        <span class="modal__lead" style="margin:0">手头现有 <b>${G.me().soldier}</b> 兵</span>
      </div>
      <div class="trrow">
        <span class="trrow__tag">手头 → 城池</span>
        <select class="sel" id="trHC">${cities.map((c) => `<option value="${c.i}">${CITIES[c.i].name}（守军 ${c.garrison}）</option>`).join('')}</select>
        <input class="num" type="number" min="1" value="100" id="trN3">
        <button class="btn" id="trGoHC">调入补防</button>
      </div>` : ''}
      <p class="modal__lead">想出征攻打敌城：先把城里驻军「调出到手头」，再去出征页带兵出发。</p>
    </div>
    <div class="pagecols">
      <div class="modal__sec">
        <h4>🤝 同盟（暂时不互相进攻）</h4>
        <div class="btnrow">${allyRows}</div>
      </div>
      <div class="modal__sec">
        <h4>⚙️ 难度开关</h4>
        <label class="chk"><input type="checkbox" id="optAi" ${s.options.aiAggressive ? 'checked' : ''}> AI 会主动进攻我方城池</label>
        <div style="margin-top:10px"><label class="chk"><input type="checkbox" id="optEx" ${s.options.allowExecute ? 'checked' : ''}> 允许斩首俘虏（不推荐，默认关闭）</label></div>
      </div>
    </div>
  `;

  if (focus >= 0 && body.querySelector(`#crow-${focus}`)) {
    body.querySelector(`#crow-${focus}`).scrollIntoView({ block: 'center' });
  }

  body.querySelectorAll('[data-rc]').forEach((b) => {
    b.onclick = () => {
      const i = +b.dataset.rc;
      const inp = body.querySelector(`[data-rcnum="${i}"]`);
      const n = parseInt(inp ? inp.value : '0', 10);
      if (!n || n <= 0) { toast('请输入征兵人数', 'bad'); return; }
      const res = G.doRecruit(i, n);
      toast(res.msg, res.ok ? 'info' : 'bad');
      pageGov(body, opts); renderResbar();
    };
  });
  body.querySelectorAll('[data-fm]').forEach((b) => { b.onclick = () => { const r = G.doFarm(+b.dataset.fm); toast(r.msg, r.ok ? 'info' : 'bad'); pageGov(body, opts); renderResbar(); }; });
  body.querySelectorAll('[data-ft]').forEach((b) => { b.onclick = () => { const r = G.doFortify(+b.dataset.ft); toast(r.msg, r.ok ? 'info' : 'bad'); pageGov(body, opts); renderResbar(); }; });
  body.querySelectorAll('[data-sc]').forEach((b) => { b.onclick = () => { const r = G.doSearch(+b.dataset.sc); toast(r.msg, r.ok ? 'info' : 'bad'); pageGov(body, opts); renderResbar(); if (r.ok) searchReport(r); }; });
  body.querySelectorAll('[data-cf]').forEach((b) => { b.onclick = () => { const r = G.doComfort(+b.dataset.cf); toast(r.msg, r.ok ? 'info' : 'bad'); pageGov(body, opts); renderResbar(); }; });
  body.querySelectorAll('[data-rw]').forEach((b) => { b.onclick = () => { const r = G.doReward(+b.dataset.rw); toast(r.msg, r.ok ? 'info' : 'bad'); pageGov(body, opts); renderResbar(); }; });
  body.querySelectorAll('[data-al]').forEach((b) => { b.onclick = () => { const r = G.doAlly(b.dataset.al); toast(r.msg, r.ok ? 'info' : 'bad'); pageGov(body, opts); renderResbar(); }; });
  const trGo = (id, fn) => {
    const b = body.querySelector(id);
    if (b) b.onclick = () => { const r = fn(); toast(r.msg, r.ok ? 'info' : 'bad'); pageGov(body, opts); renderResbar(); };
  };
  const trNum = (id) => parseInt((body.querySelector(id) || {}).value, 10);
  trGo('#trGoCC', () => G.doTransfer(+body.querySelector('#trCC').value, +body.querySelector('#trCT').value, trNum('#trN1')));
  trGo('#trGoCH', () => G.doGarrisonPull(+body.querySelector('#trCH').value, trNum('#trN2')));
  trGo('#trGoHC', () => G.doGarrisonPush(+body.querySelector('#trHC').value, trNum('#trN3')));
  const oa = body.querySelector('#optAi'); if (oa) oa.onchange = () => G.setOption('aiAggressive', oa.checked);
  const oe = body.querySelector('#optEx'); if (oe) oe.onchange = () => G.setOption('allowExecute', oe.checked);
}

/* 寻访报告（三级弹窗：可能寻得武将或宝物） */
function searchReport(res) {
  if (!res) return;
  if (res.item) {
    const it = res.item;
    openModal('寻访报告', `
      <div class="classic__report">
        <p class="classic__big">✦ 偶得奇珍 ✦</p>
        <p class="classic__name">${it.icon} ${it.name}</p>
        <p>效果：${it.effect}</p>
        <p class="classic__note">${it.desc}（已放入宝物背包）</p>
      </div>
    `, (b) => {
      const ok = document.createElement('button');
      ok.className = 'btn btn--go'; ok.textContent = '收入囊中';
      ok.onclick = closeModal;
      b.appendChild(ok);
    }, { classic: true });
    return;
  }
  const g = res.general;
  if (!g) return;
  openModal('寻访报告', `
    <div class="classic__report">
      <p class="classic__big">✦ 喜得贤才 ✦</p>
      <p class="classic__name">${g.name}</p>
      <p>武力 ${G.forceOf(g)} · 智力 ${G.intelOf(g)} · 技能「${SKILLS[g.skill].name}」</p>
      <p class="classic__note">${g.note || ''}</p>
    </div>
  `, (b) => {
    const ok = document.createElement('button');
    ok.className = 'btn btn--go'; ok.textContent = '收入麾下';
    ok.onclick = closeModal;
    b.appendChild(ok);
  }, { classic: true });
}

/* 真题完成 → 培养武将 */
function trainModal() {
  const gens = G.myGenerals();
  if (!gens.length) return;
  openModal('武将培养 · 完成真题的奖励', `
    <p class="modal__lead">指定一名武将：武力 +${RULES.TRAIN_GAIN} 或 智力 +${RULES.TRAIN_GAIN}（武将变强 = 知识储备变强）</p>
    ${gens.map((g) => `
      <div class="genrow">
        <div class="genrow__main">
          <b>${g.name}</b><span>武 ${G.forceOf(g)}</span><span>智 ${G.intelOf(g)}</span>
          <span>忠 ${g.loyalty}</span><span>体 ${g.stamina}</span>
        </div>
        <button class="btn btn--sm" data-tr="${g.id}" data-at="force">武力 +${RULES.TRAIN_GAIN}</button>
        <button class="btn btn--sm" data-tr="${g.id}" data-at="intel">智力 +${RULES.TRAIN_GAIN}</button>
      </div>`).join('')}
  `, (b) => {
    b.querySelectorAll('[data-tr]').forEach((x) => {
      x.onclick = () => { const r = G.trainGeneral(+x.dataset.tr, x.dataset.at); toast(r.msg); closeModal(); };
    });
  }, { classic: true });
}

/* ============================================================
 * 二级 · 武将管理
 * ========================================================== */
function pageGenerals(body, opts = {}) {
  const gens = G.myGenerals();
  body.innerHTML = `
    <div class="modal__sec">
      <h4>🤝 麾下武将（${gens.length}）　点击查看详情 / 装备宝物 / 赏赐 / 驻守</h4>
      <div class="cardgrid">
      ${gens.map((g) => `
        <div class="gencard" data-g="${g.id}">
          <div class="gencard__head">
            <b>${g.name}</b>
            ${g.skill !== 'none' ? `<span class="tag">${SKILLS[g.skill].name}</span>` : ''}
            ${g.item ? `<span class="tag tag--item">${ITEM_MAP[g.item].icon}${ITEM_MAP[g.item].name}</span>` : ''}
            <span class="tag">驻 ${g.cityId >= 0 && CITIES[g.cityId] ? CITIES[g.cityId].name : '随军'}</span>
          </div>
          <div class="gencard__stat">
            <span>武 ${G.forceOf(g)}</span><span>智 ${G.intelOf(g)}</span>
            <span class="${g.loyalty < RULES.LOYALTY_REVOLT ? 'is-warn' : ''}">忠 ${g.loyalty}</span>
            <span class="${g.stamina < RULES.STAMINA_COST ? 'is-warn' : ''}">体 ${g.stamina}/${G.staminaMaxOf(g)}</span>
          </div>
          <div class="gencard__note">${g.note || ''}</div>
        </div>`).join('') || '<p class="modal__lead">暂无武将</p>'}
      </div>
    </div>
  `;
  body.querySelectorAll('[data-g]').forEach((el) => {
    el.onclick = () => generalDetail(+el.dataset.g, () => pageGenerals(body, opts));
  });
}

/* 三级 · 武将详情（装备 / 赏赐 / 驻守） */
function generalDetail(genId, rerender) {
  const g = G.generalById(genId);
  if (!g) return;
  const equipList = G.myItems().filter((it) => ITEM_MAP[it.id].equip);
  const cityOpts = G.myCities().map((c) =>
    `<option value="${c.i}" ${g.cityId === c.i ? 'selected' : ''}>${CITIES[c.i].name}</option>`).join('');
  openModal(`武将 · ${g.name}`, `
    <div class="gencard gencard--big">
      <div class="gencard__head">
        <b>${g.name}</b>
        ${g.skill !== 'none' ? `<span class="tag">${SKILLS[g.skill].name}</span>` : ''}
        ${g.item ? `<span class="tag tag--item">${ITEM_MAP[g.item].icon}${ITEM_MAP[g.item].name}</span>` : ''}
      </div>
      <div class="gencard__stat">
        <span>武力 ${G.forceOf(g)}</span><span>智力 ${G.intelOf(g)}</span>
        <span>忠诚 ${g.loyalty}</span><span>体力 ${g.stamina}/${G.staminaMaxOf(g)}</span>
      </div>
      <div class="gencard__note">${g.note || ''}<br>技能：${SKILLS[g.skill].desc}</div>
    </div>
    <div class="modal__sec">
      <h4>装备宝物</h4>
      ${equipList.length
        ? equipList.map((it) => `<button class="btn btn--sm" data-eq="${it.id}">${ITEM_MAP[it.id].icon} ${ITEM_MAP[it.id].name} ×${it.count}</button>`).join(' ')
        : '<span class="modal__lead">没有可装备的宝物</span>'}
      ${g.item ? `<button class="btn btn--sm" data-uneq="1">卸下 ${ITEM_MAP[g.item].name}</button>` : ''}
    </div>
    <div class="modal__sec">
      <h4>驻守与忠诚</h4>
      <div class="btnrow">
        <select class="sel" id="asCity">${cityOpts}</select>
        <button class="btn" id="asGo">调去驻守</button>
        <button class="btn" data-rw="1">赏赐 (${RULES.REWARD_COST}金 · 忠+${RULES.REWARD_GAIN})</button>
        <button class="btn" data-cf="1">安抚 (${RULES.COMFORT_COST}金 · 忠+${RULES.COMFORT_GAIN})</button>
      </div>
    </div>
    <div class="modal__note">忠诚低于 ${RULES.LOYALTY_REVOLT} 的武将战败后极易被俘，甚至叛逃 —— 常赏赐！</div>
  `, (b) => {
    b.querySelectorAll('[data-eq]').forEach((x) => {
      x.onclick = () => { const r = G.equipItem(genId, x.dataset.eq); toast(r.msg, r.ok ? 'info' : 'bad'); closeModal(); rerender?.(); renderAll(); };
    });
    const uq = b.querySelector('[data-uneq]');
    if (uq) uq.onclick = () => { const r = G.unequipItem(genId); toast(r.msg); closeModal(); rerender?.(); renderAll(); };
    b.querySelector('#asGo').onclick = () => {
      const r = G.doAssign(genId, +b.querySelector('#asCity').value);
      toast(r.msg, r.ok ? 'info' : 'bad');
      closeModal(); rerender?.(); renderAll();
    };
    const rw = b.querySelector('[data-rw]');
    if (rw) rw.onclick = () => { const r = G.doReward(genId); toast(r.msg, r.ok ? 'info' : 'bad'); closeModal(); rerender?.(); renderAll(); };
    const cf = b.querySelector('[data-cf]');
    if (cf) cf.onclick = () => { const r = G.doComfort(genId); toast(r.msg, r.ok ? 'info' : 'bad'); closeModal(); rerender?.(); renderAll(); };
  });
}

/* ============================================================
 * 二级 · 出征战斗（含 俘虏劝降 子页）——出征受打卡解锁门控
 * ========================================================== */
/** 俘虏 / 武将头像（按兵种给一个图形标识） */
function genAvatar(g) {
  if (!g) return '❓';
  if (g.skill === 'strategist') return '📖';
  if (g.skill === 'charge') return '⚔️';
  return '🛡️';
}

/** 劝降弹窗：可选投入金币，实时显示成功率 */
function openPersuade(genId, body, opts) {
  const g = G.generalById(genId);
  if (!g) return;
  const base = G.persuadeRate(genId);
  const maxGold = G.me().gold;
  const invBonus = (inv) => Math.min(RULES.PERSUADE_INVEST_CAP, Math.floor(inv / 100) * RULES.PERSUADE_INVEST_BONUS);
  const rateTxt = (inv) => Math.round(clampPct(base + invBonus(inv)) * 100) + '%';
  const clampPct = (v) => Math.max(0.05, Math.min(0.95, v));
  openModal(`劝降 · ${g.name}`, `
    <div class="modal__sec">
      <p>当前忠诚度 <b>${g.loyalty}</b>，基础成功率 <b>${Math.round(base * 100)}%</b>。</p>
      <p class="modal__lead">投入金币越多成功率越高（每 100 金 +${Math.round(RULES.PERSUADE_INVEST_BONUS * 100)}%，上限 +${Math.round(RULES.PERSUADE_INVEST_CAP * 100)}%）。</p>
      <div class="btnrow">
        <label>投入金币</label>
        <input class="inp" id="psGold" type="number" min="0" max="${maxGold}" value="0" />
        <button class="btn btn--sm" id="psMax">最大</button>
      </div>
      <div class="modal__rate">预计成功率：<b id="psRate">${rateTxt(0)}</b></div>
      <div class="modal__note">需支付：基础 ${RULES.PERSUADE_COST + g.tries * 20} 金 + 投入金币（失败不退还，可再劝）。</div>
    </div>
    <div class="modal__act"><button class="btn btn--go" id="psGo">开始劝降</button></div>
  `, (b) => {
    const inp = b.querySelector('#psGold');
    const rateEl = b.querySelector('#psRate');
    const upd = () => {
      const inv = Math.max(0, Math.min(maxGold, Math.floor(+inp.value || 0)));
      rateEl.textContent = rateTxt(inv);
    };
    inp.oninput = upd;
    b.querySelector('#psMax').onclick = () => { inp.value = maxGold; upd(); };
    b.querySelector('#psGo').onclick = () => {
      const inv = Math.max(0, Math.min(maxGold, Math.floor(+inp.value || 0)));
      const r = G.doPersuade(genId, inv);
      toast(r.msg, r.ok ? 'info' : 'bad');
      closeModal();
      pageWar(body, opts); renderAll();
    };
  });
}

/* 攻城视频：播放结束 / 点击跳过 / 出错 → 回调，绝不阻塞游戏 */
function playSiegeVideo(cb) {
  const layer = document.createElement('div');
  layer.className = 'videolayer';
  layer.innerHTML = `
    <video class="videolayer__video" src="video/siege.mp4" muted playsinline preload="auto"></video>
    <div class="videolayer__title">⚔ 攻城战</div>
    <button class="videolayer__skip" type="button">跳过 ▶</button>
  `;
  document.body.appendChild(layer);
  const v = layer.querySelector('video');
  let done = false;
  let timer = 0;
  const onKey = (e) => {
    if (e.key === 'Escape' || e.key === ' ') { e.preventDefault(); finish(); }
  };
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    v.pause();
    layer.remove();
    document.removeEventListener('keydown', onKey);
    if (typeof cb === 'function') cb();
  };
  document.addEventListener('keydown', onKey);
  layer.querySelector('.videolayer__skip').onclick = (e) => { e.stopPropagation(); finish(); };
  layer.addEventListener('click', finish);
  v.addEventListener('ended', finish);
  v.addEventListener('error', finish);
  timer = setTimeout(finish, 12000);
  const p = v.play();
  if (p && p.catch) p.catch(finish);
}

function pageWar(body, opts = {}) {
  const tab = opts.tab || 'war';
  const s = G.state();
  const ul = G.unlocks();
  const targets = G.attackable();
  const gens = G.myGenerals().filter((g) => g.stamina >= RULES.STAMINA_COST);

  const genOpts = (sel) => gens.map((g) =>
    `<option value="${g.id}" ${g.id === sel ? 'selected' : ''}>${g.name}（武${G.forceOf(g)} 体${g.stamina}）</option>`).join('');

  const warRows = targets.map((t) => {
    const own = FACTIONS[t.st.owner];
    const dg = t.st.generalId ? G.generalById(t.st.generalId) : null;
    return `
      <div class="warow">
        <div class="warow__head">
          <b>${t.city.name}</b>
          <span class="tag" style="background:${own.color};color:#101820">${own.name}</span>
          <span>${t.city.grade} 级</span>
        </div>
        <div class="warow__stat">
          守军 ${t.st.garrison} · 城防 ${t.st.defense}
          ${dg ? ` · 守将 ${dg.name}(武${G.forceOf(dg)})` : ' · 无守将'}
        </div>
        <div class="warow__act">
          <select class="sel" data-gen="${t.i}">${genOpts(gens[0]?.id)}</select>
          <input class="num" type="number" min="10" value="${Math.min(300, Math.max(10, G.me().soldier))}" data-num="${t.i}">
          <button class="btn btn--go" data-atk="${t.i}" ${ul.attack ? '' : 'disabled'} title="${ul.hint.attack}">⚔️ 出兵</button>
          <span class="warow__pv" data-pv="${t.i}"></span>
        </div>
      </div>`;
  }).join('');

  const caps = G.myCaptives();
  const capRows = caps.map((g) => `
    <div class="capcard">
      <div class="cap__ava">${genAvatar(g)}</div>
      <div class="cap__main">
        <b>${g.name}</b>
        <span class="tag">原属 ${FACTIONS[g.owner].name}</span>
        <span>武 ${G.forceOf(g)}</span><span>智 ${G.intelOf(g)}</span>
        <span class="cap__loy ${g.loyalty < RULES.LOYALTY_REVOLT ? 'is-warn' : ''}">忠诚 ${g.loyalty}</span>
        <span>劝降率 ${Math.round(G.persuadeRate(g.id) * 100)}%</span>
        ${s.persuadeBuff ? '<span class="tag tag--item">古文 buff +20%</span>' : ''}
      </div>
      <div class="cap__btns">
        <button class="btn btn--go" data-ps="${g.id}">🍶 劝降</button>
        <button class="btn" data-rl="${g.id}">🕊️ 释放 (+${RULES.RELEASE_PRESTIGE}声望)</button>
        <button class="btn" data-lock="${g.id}">🔒 关押</button>
        ${s.options.allowExecute ? `<button class="btn btn--bad" data-ex="${g.id}">⚔️ 斩首</button>` : ''}
      </div>
    </div>`).join('');

  body.innerHTML = `
    <div class="tabs">
      <button class="tab ${tab === 'war' ? 'is-on' : ''}" data-tab="war">⚔️ 出兵</button>
      <button class="tab ${tab === 'cap' ? 'is-on' : ''}" data-tab="cap">🏳️ 我方俘虏营 (${caps.length})</button>
    </div>
    ${tab === 'war' ? `
      <div class="modal__sec">
        <h4>可攻打的城池　可调动兵马 ${G.me().soldier}</h4>
        ${ul.attack
          ? (warRows ? `<div class="cardgrid">${warRows}</div>` : '<p class="modal__lead">暂时没有相邻的可攻目标</p>')
          : `<div class="modal__note">🔒 出征未解锁：${ul.hint.attack}。先完成每日打卡！</div>`}
      </div>
      <div class="modal__note">
        出征消耗：武将体力 -${RULES.STAMINA_COST}；途中可能遭遇<b>伏击</b> —— 答对奥数小题可减少兵力损失。<br>
        战胜有守将的城：60% 俘获对方武将，40% 守将突围逃往他城；战败：大量折兵，主将可能被俘。
      </div>`
    : `
      <div class="modal__sec">
        <h4>我方俘虏营（${caps.length}）</h4>
        ${capRows ? `<div class="cardgrid">${capRows}</div>` : '<p class="modal__lead">暂无俘虏 —— 攻打有守将的城，胜后有机会俘获对方武将。</p>'}
      </div>
      <div class="modal__note">「背诵古文」可让今日劝降成功率 +20%；「劝降」可投入金币提高成功率（每 100 金 +${Math.round(RULES.PERSUADE_INVEST_BONUS * 100)}%）。失败可反复尝试。</div>`}
  `;

  body.querySelectorAll('[data-tab]').forEach((b) => {
    b.onclick = () => pageWar(body, { tab: b.dataset.tab });
  });

  if (tab === 'war') {
    const refreshPv = () => {
      body.querySelectorAll('[data-pv]').forEach((el) => {
        const i = +el.dataset.pv;
        const gen = +(body.querySelector(`[data-gen="${i}"]`).value || 0);
        const num = +(body.querySelector(`[data-num="${i}"]`).value || 0);
        const p = G.previewBattle(i, num, gen);
        el.textContent = `战力 ${Math.round(p.atk)} vs ${Math.round(p.def)}`;
        el.className = 'warow__pv ' + (p.atk > p.def ? 'is-win' : 'is-lose');
      });
    };
    body.querySelectorAll('.sel,.num').forEach((el) => { el.onchange = refreshPv; el.oninput = refreshPv; });
    refreshPv();
    body.querySelectorAll('[data-atk]').forEach((b) => {
      b.onclick = () => {
        const i = +b.dataset.atk;
        const gen = +(body.querySelector(`[data-gen="${i}"]`).value || 0);
        const num = +(body.querySelector(`[data-num="${i}"]`).value || 0);
        const finishAttack = (r) => {
          pageWar(body, opts);
          renderAll();
          if (r && r.ok) playSiegeVideo(() => battleResult(i, r));
          else battleResult(i, r);
        };
        const amb = G.rollAmbush();
        if (amb) {
          ambushModal(amb, (correct, answer) => {
            finishAttack(G.doAttack(i, num, gen, { ambushCorrect: correct, ambushAnswer: answer }));
          }, () => { G.clearAmbush(); toast('已撤军'); });
        } else {
          finishAttack(G.doAttack(i, num, gen, {}));
        }
      };
    });
  } else {
    body.querySelectorAll('[data-ps]').forEach((b) => { b.onclick = () => openPersuade(+b.dataset.ps, body, opts); });
    body.querySelectorAll('[data-rl]').forEach((b) => { b.onclick = () => { const r = G.doRelease(+b.dataset.rl); toast(r.msg); pageWar(body, opts); renderAll(); }; });
    body.querySelectorAll('[data-lock]').forEach((b) => { b.onclick = () => { toast('已关押于俘虏营，可随时劝降或释放'); }; });
    body.querySelectorAll('[data-ex]').forEach((b) => { b.onclick = () => { const r = G.doExecute(+b.dataset.ex); toast(r.msg, 'bad'); pageWar(body, opts); renderAll(); }; });
  }
}

/* 三级 · 伏击（答对奥数小题减损） */
function ambushModal(amb, onFight, onFlee) {
  openModal('⚠ 行军遇伏', `
    <div class="classic__report">
      <p class="classic__big">前方狭道尘头大起 —— 有伏兵！</p>
      <p>主公速算，稳住军心：<b class="classic__name">${amb.q} = ?</b></p>
      <input class="num" type="number" id="ambAns" style="width:120px" placeholder="答案">
    </div>
  `, (b) => {
    const row = document.createElement('div');
    row.className = 'btnrow';
    const go = document.createElement('button');
    go.className = 'btn btn--go'; go.textContent = '应战！（答对减损）';
    go.onclick = () => {
      const v = parseInt(b.querySelector('#ambAns').value, 10);
      closeModal(); onFight(true, Number.isNaN(v) ? null : v);
    };
    const flee = document.createElement('button');
    flee.className = 'btn'; flee.textContent = '撤军';
    flee.onclick = () => { closeModal(); onFlee(); };
    row.appendChild(go); row.appendChild(flee);
    b.appendChild(row);
  }, { classic: true });
}

/* 三级 · 战斗结果 */
function battleResult(i, r) {
  /* doAttack 失败（兵不足/体力不足等）时只弹提示，不渲染结果 */
  if (!r || !r.ok) {
    toast((r && r.msg) || '出征失败', 'bad');
    return;
  }
  const name = CITIES[i].name;
  const amb = r.ambush
    ? `<p class="classic__note">伏击「${r.ambush.q} = ${r.ambush.a}」，主公${r.ambush.correct ? '答对，队伍从容' : '答错，军心慌乱'}。</p>`
    : '';
  openModal(r.win ? `攻下 ${name}！` : `进攻 ${name} 失利`, `
    <div class="result banner ${r.win ? 'is-win' : 'is-lose'}">
      <div class="result__big">${r.win ? '🏆 大胜' : '💧 败退'}</div>
      <p>${r.win
        ? `城池已归我方：折损 ${r.lost} 兵，留 ${r.occupy} 兵驻守。${r.capturedName ? `<br>🎯 俘获守将「${r.capturedName}」，可在出征 → 我方俘虏营里劝降。` : ''}${r.fledName ? `<br>🏃 守将「${r.fledName}」突围，逃往 ${r.fledTo}！` : ''}${r.lootName ? `<br>缴获宝物「${r.lootName}」！` : ''}`
        : `折损 ${r.lost} 兵，撤回 ${r.remain} 兵。${r.gCap ? `<br>主将「${r.gCap}」被俘！可日后赎回或劝降。` : ''}`}</p>
      ${amb}
    </div>
    <div class="modal__note">确认后返回大地图，旗帜已更新。</div>
  `, (b) => {
    const ok = document.createElement('button');
    ok.className = 'btn btn--go'; ok.textContent = '确认 · 返回大地图';
    ok.onclick = () => { closeModal(); closePage(); };
    b.appendChild(ok);
  }, { classic: true });
}

/* ============================================================
 * 二级 · 宝物背包（含将星碎片招募名将）
 * ========================================================== */
function pageItems(body) {
  const items = G.myItems();
  const s = G.state();
  const legends = G.legendPool();
  const myGens = G.myGenerals();
  body.innerHTML = `
    <div class="pagecols">
    <div class="modal__sec">
      <h4>⭐ 将星碎片（${s.shards} 枚）—— ${LEGEND_COST} 枚可招募一名传奇名将</h4>
      ${legends.length ? legends.map((g) => `
        <div class="gencard">
          <div class="gencard__head">
            <b>${g.name}</b>
            <span class="tag">${SKILLS[g.skill].name}</span>
          </div>
          <div class="gencard__stat">
            <span>武 ${g.force}</span><span>智 ${g.intel}</span><span>忠诚 ${g.loyalty}</span>
          </div>
          <div class="gencard__note">${g.note || ''}</div>
          <div class="btnrow" style="margin-top:10px">
            <button class="btn btn--go" data-leg="${g.name}" ${s.shards >= LEGEND_COST ? '' : 'disabled'}>🌟 招募（${LEGEND_COST} 碎片）</button>
          </div>
        </div>`).join('')
        : '<p class="modal__lead">名将都已在麾下或被 AI 招走 —— 单元测试 / 读书攒碎片，连续打卡 7 天也会送名将！</p>'}
      <div class="modal__note">碎片来源：单元测试达标、读完一本书、将星现世事件、连续打卡 7 天。</div>
    </div>
    <div>
    <div class="modal__sec">
      <h4>🎁 宝物背包</h4>
      ${items.length ? items.map((it) => {
        const def = ITEM_MAP[it.id];
        return `
          <div class="itemrow">
            <div class="itemrow__main">
              <b><i class="itemicon">${def.icon}</i>${def.name}</b>
              <span class="tag">×${it.count}</span>
              <span class="tag tag--item">${def.effect}</span>
            </div>
            <div class="itemrow__act">
              ${def.equip
                ? `<button class="btn" data-eq="${it.id}">🛡️ 装备武将</button>`
                : `<button class="btn btn--go" data-use="${it.id}">✨ 使用</button>`}
            </div>
          </div>
          <div class="itemrow__desc">${def.desc}</div>`;
      }).join('') : '<p class="modal__lead">背包空空 —— 完成打卡、寻访、攻城都可能获得宝物。</p>'}
    </div>
    <div class="modal__sec">
      <h4>📖 宝物图鉴（可获取一览）</h4>
      ${Object.entries(ITEM_MAP).map(([id, def]) => `
        <div class="itemrow">
          <div class="itemrow__main">
            <b><i class="itemicon">${def.icon}</i>${def.name}</b>
            <span class="tag tag--item">${def.effect}</span>
            ${items.some((it) => it.id === id) ? '<span class="tag">已拥有</span>' : ''}
          </div>
        </div>
        <div class="itemrow__desc">${def.desc}</div>`).join('')}
    </div>
    </div>
  `;
  body.querySelectorAll('[data-leg]').forEach((b) => {
    b.onclick = () => { const r = G.recruitLegend(b.dataset.leg); toast(r.msg, r.ok ? 'info' : 'bad'); pageItems(body); renderAll(); };
  });
  body.querySelectorAll('[data-use]').forEach((b) => {
    b.onclick = () => { const r = G.useItem(b.dataset.use); toast(r.msg, r.ok ? 'info' : 'bad'); pageItems(body); renderResbar(); };
  });
  body.querySelectorAll('[data-eq]').forEach((b) => {
    b.onclick = () => {
      if (!myGens.length) { toast('没有武将可装备', 'bad'); return; }
      genPicker(myGens, (gid) => {
        const r = G.equipItem(gid, b.dataset.eq);
        toast(r.msg, r.ok ? 'info' : 'bad');
        closeModal(); pageItems(body); renderAll();
      });
    };
  });
}

/* 选武将（装备宝物用） */
function genPicker(gens, cb) {
  openModal('选择武将', `
    <p class="modal__lead">把宝物装备给哪名武将？（每人同时只能装备 1 件）</p>
    ${gens.map((g) => `
      <div class="gencard">
        <div class="gencard__head">
          <b>${g.name}</b>
          ${g.skill !== 'none' ? `<span class="tag">${SKILLS[g.skill].name}</span>` : ''}
          ${g.item ? `<span class="tag tag--item">现装备 ${ITEM_MAP[g.item].name}</span>` : ''}
        </div>
        <div class="gencard__stat">
          <span>武 ${G.forceOf(g)}</span><span>智 ${G.intelOf(g)}</span>
          <span>忠 ${g.loyalty}</span><span>体 ${g.stamina}/${G.staminaMaxOf(g)}</span>
        </div>
        <div class="btnrow" style="margin-top:10px">
          <button class="btn" data-pick="${g.id}">🛡️ 装备给他</button>
        </div>
      </div>`).join('')}
  `, (b) => {
    b.querySelectorAll('[data-pick]').forEach((x) => { x.onclick = () => { closeModal(); cb(+x.dataset.pick); }; });
  });
}

/* ============================================================
 * 二级 · 设置存档（打卡日志 / 家长后台入口）
 * ========================================================== */
function pageSave(body) {
  const s = G.state();
  const statCards = [
    { label: '回合', val: s.turn },
    { label: '周数', val: s.week },
    { label: '连续打卡', val: s.streak + ' 天' },
    { label: '城池', val: G.cityCount(s.player) + ' / ' + s.cities.length },
    { label: '将星碎片', val: s.shards },
  ];
  body.innerHTML = `
    <div class="pagecols">
      <div>
        <div class="modal__sec">
          <h4>📅 本局进度</h4>
          <div class="statgrid">
            ${statCards.map((c) => `<div class="statcard"><span>${c.label}</span><b>${c.val}</b></div>`).join('')}
          </div>
          <div class="modal__note">长期目标：${MILESTONES.map((m) => `连续 ${m.streak} 天（${m.reward}）`).join('；')}。</div>
        </div>
        <div class="modal__sec">
          <h4>💾 存档与后台</h4>
          <div class="btnrow" style="gap:10px">
            <button class="btn" data-save="1">💾 立即保存</button>
            <button class="btn btn--go" data-end="1">⏭ 结束回合</button>
            <button class="btn" data-admin="1">🔐 家长后台</button>
            <button class="btn btn--bad" data-reset="1">🔄 重新开局</button>
          </div>
          <div class="modal__note">进度自动保存在浏览器本地；家长后台可自定义任务、调节难度、查看统计。</div>
        </div>
      </div>
      <div class="modal__sec diarybook">
        <h4>📓 打卡日志（最近 ${Math.min(14, s.diary.length)} 天）</h4>
        ${s.diary.length ? s.diary.slice(0, 14).map((d) => `
          <div class="logline">
            <span>第${d.turn}天</span>
            <div>${d.tasks.length ? d.tasks.join('、') : '<i style="color:#ff9d90">未打卡</i>'}
              <i style="color:var(--text-faint)">（${d.tasks.length} 项 · 连续 ${d.streak} 天）</i></div>
          </div>`).join('') : '<p class="modal__lead">还没有记录 —— 领完任务并结束回合后，这里会生成打卡日历。</p>'}
      </div>
    </div>
  `;
  body.querySelector('[data-save]').onclick = () => { G.save(); toast('已保存'); };
  body.querySelector('[data-end]').onclick = () => doEndTurn();
  body.querySelector('[data-admin]').onclick = () => window.open('admin.html', '_blank');
  body.querySelector('[data-reset]').onclick = () => { if (confirm('确定重新开局？当前进度会清空。')) { G.reset(); closePage(); panelChooseFaction(); } };
}

/* ============================================================
 * 三级 · 城池详情（群英传2 白底黑字弹窗）
 * ========================================================== */
export function renderCityPanel(i) { cityDetail(i); }
function cityDetail(i) {
  const s = G.state();
  const c = CITIES[i];
  const st = s.cities[i];
  const own = FACTIONS[st.owner];
  const g = GRADE_STATS[c.grade];
  const dg = st.generalId ? G.generalById(st.generalId) : null;
  const mine = st.owner === s.player;
  const links = neighborsOf(i);

  openModal(`【${c.name}】`, `
    <div class="classic__city" style="--fc:${own.color}">
      <p class="classic__cityname">${c.name}</p>
      <p class="classic__citymeta">
        <span>${c.zhou}</span>
        <span>${c.grade} · ${g.name}</span>
        <span style="color:${own.color}">▣ ${own.name}${st.owner === 'none' ? '（废墟空城）' : ''}</span>
      </p>
      <div class="classic__grid">
        <span>守军</span><b>${st.garrison} / ${RULES.GARRISON_CAP[c.grade]}</b>
        <span>城防</span><b>${st.defense}</b>
        <span>屯田</span><b>${st.farm} 级</b>
        <span>守将</span><b>${dg ? `${dg.name}（武${G.forceOf(dg)}）` : '无'}</b>
        <span>官道</span><b>${links.map((k) => CITIES[k].name).join('、') || '—'}</b>
      </div>
      <p class="classic__note">${c.note}</p>
    </div>
  `, (b) => {
    const row = document.createElement('div');
    row.className = 'btnrow';
    const mk = (txt, cls, fn, dis) => {
      const x = document.createElement('button');
      x.className = `btn ${cls}`; x.textContent = txt; x.disabled = !!dis; x.onclick = fn;
      return x;
    };
    row.appendChild(mk('🏯 内政', 'btn--go', () => { closeModal(); openPage('gov', { city: i }); }));
    row.appendChild(mk('🤝 驻守武将', 'btn', () => { closeModal(); openPage('gen'); }, !(dg && dg.owner === s.player)));
    row.appendChild(mk('⚔️ 出征', 'btn', () => { closeModal(); openPage('war', { tab: 'war' }); }, mine));
    if (!mine) {
      const ul = G.unlocks();
      row.appendChild(mk(`火速进攻（守军 ${st.garrison}）`, 'btn--go', () => { closeModal(); openPage('war', { tab: 'war' }); }, !ul.attack));
    }
    b.appendChild(row);
  }, { classic: true });
}

/* ============================================================
 * 回合结束：事件 / 结算 / 胜负
 * ========================================================== */
function doEndTurn() {
  if (pageOpen) closePage();
  G.endTurn();
  renderAll();
  const s = G.state();
  if (s.over) { overModal(); return; }
  if (s.lastEvent) {
    const e = s.lastEvent;
    openModal(`${e.icon} 随机事件：${e.name}`, `
      <div class="event">
        <p class="event__text">${e.text}</p>
        <p class="event__effect">${effectText(e)}</p>
      </div>
      <div class="modal__note">进入第 ${s.turn} 回合（第 ${s.week} 周）。新的一天，先打卡。</div>
    `, null, { classic: true });
  } else {
    toast(`进入第 ${s.turn} 回合 · 第 ${s.week} 周`);
  }
}

function effectText(e) {
  const p = [];
  if (e.effect.food) p.push(`粮草 ${e.effect.food > 0 ? '+' : ''}${e.effect.food}`);
  if (e.effect.gold) p.push(`金币 ${e.effect.gold > 0 ? '+' : ''}${e.effect.gold}`);
  if (e.effect.soldier) p.push(`兵马 ${e.effect.soldier > 0 ? '+' : ''}${e.effect.soldier}`);
  if (e.effect.shards) p.push(`将星碎片 +${e.effect.shards}`);
  if (e.effect.general) p.push('一名在野武将来投');
  if (e.effect.buff === 'challenge') p.push('下次完成真题额外 +150 粮 +80 兵');
  return p.join(' · ');
}

function overModal() {
  const s = G.state();
  const win = s.over === 'win';
  openModal(win ? '🏆 天下一统！' : '此局结束', `
    <div class="result ending ${win ? 'is-win' : 'is-lose'}">
      <div class="result__big">${win ? '小升初备考通关！' : '城池尽失'}</div>
      <p>${win
        ? `你在第 ${s.turn} 回合占领了全部 50 座城池。<br>【天下一统】成就达成 —— 去找爸妈领通关奖励吧。`
        : `所有城池丢失、武将离散。<br>没关系，重新开局选个势力再来，坚持每日打卡就能翻盘。`}</p>
    </div>
  `, (b) => {
    const x = document.createElement('button');
    x.className = 'btn btn--go'; x.textContent = '重新开局';
    x.onclick = () => { G.reset(); closeModal(); panelChooseFaction(); };
    b.appendChild(x);
  }, { classic: true });
}

/* ============================================================
 * 势力选择
 * ========================================================== */
export function panelChooseFaction() {
  const cards = FACTION_IDS.map((f) => {
    const st = FACTION_SETUP[f];
    const fc = FACTIONS[f];
    return `
      <div class="fcard" data-f="${f}">
        <div class="fcard__head" style="border-left-color:${fc.color}">
          <img class="fcard__avatar" src="${LORD_IMG[f] || ''}" alt="">
          <div>
            <b>${st.name}</b>
            <span class="fcard__diff">${st.difficulty}</span>
          </div>
        </div>
        <div class="fcard__stars">${'★'.repeat(st.stars)}${'☆'.repeat(5 - st.stars)}</div>
        <div class="fcard__row">城池 ${st.cities.length} 座：${st.cities.join('、')}</div>
        <div class="fcard__row">武将 ${st.generals.length} 名：${st.generals.join('、')}</div>
        <div class="fcard__row">粮草 ${st.res.food} · 兵马 ${st.res.soldier} · 金币 ${st.res.gold}</div>
        <div class="fcard__trait">${st.trait}</div>
        <div class="fcard__tip">${st.tip}</div>
        <button class="btn btn--go" data-choose="${f}">选这个势力</button>
      </div>`;
  }).join('');

  openModal('选择你的势力', `
    <p class="modal__lead">其余 5 个势力由 AI 接管，会自己屯田、征兵、互相攻伐，也会来打你。<br>
      目标是占领全部 50 座城池 —— 那就是小升初备考通关。</p>
    <div class="fcards">${cards}</div>
  `, (b) => {
    b.querySelectorAll('[data-choose]').forEach((x) => {
      x.onclick = () => {
        G.newGame(x.dataset.choose);
        closeModal();
        toast(`【${FACTION_SETUP[x.dataset.choose].name}】起兵！先完成右侧打卡，解锁内政与出征。`);
        renderAll();
        const home = G.myCities()[0];
        if (home) host?.focusCity(home.i);
      };
    });
  });
}

/* ============================================================
 * hover 情报（main.js 调用）
 * ========================================================== */
export function cityTooltipHTML(i) {
  const s = G.state();
  if (!s) return '';
  const c = CITIES[i];
  const st = s.cities[i];
  const own = FACTIONS[st.owner];
  const dg = st.generalId ? G.generalById(st.generalId) : null;
  return `
    <b style="color:${own.color}">${c.name}</b>
    <span class="tt__row">${own.name}${st.owner === 'none' ? ' · 空城废墟' : ''} · ${c.grade}级</span>
    <span class="tt__row">守军 ${st.garrison} · 城防 ${st.defense}</span>
    <span class="tt__row">守将 ${dg ? `${dg.name}（武${G.forceOf(dg)}）` : '无'}</span>
  `;
}

/* ============================================================
 * 初始化
 * ========================================================== */
export function initGameUI(h) {
  host = h;

  $('phasebar').addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    const end = e.target.closest('[data-end]');
    if (nav) { openPage(nav.dataset.nav); return; }
    if (end) { doEndTurn(); return; }
  });

  G.subscribe(() => {
    if (!G.state()) return;
    renderAll();
  });

  const s = G.load();
  renderMenu();
  if (s) {
    renderAll();
    toast(`继续上一局：第 ${s.turn} 回合 · ${FACTIONS[s.player].name}`);
  } else {
    renderLordPanel();
    panelChooseFaction();
  }
}

export { toast };
