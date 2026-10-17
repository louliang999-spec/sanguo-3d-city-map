/**
 * ============================================================
 *  admin.js —— 家长后台逻辑（独立页面 admin.html）
 * ============================================================
 *  密码登录 → 任务自定义(CONFIG_KEY.tasks) → 难度调节
 *  (CONFIG_KEY.rules 覆盖 RULES) → 打卡统计(SAVE_KEY.diary)
 *  → 重置存档 / 修改密码
 * ============================================================
 */
import {
  TASKS, RULES, CONFIG_KEY, SAVE_KEY, ADMIN_DEFAULT_PASSWORD,
} from './gamedata.js';
import { saveConfig, effectiveTasks } from './game.js';

const $ = (id) => document.getElementById(id);
let cfg = null;

function readCfg() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* 忽略 */ }
  return { tasks: [], rules: {}, password: ADMIN_DEFAULT_PASSWORD };
}

function msg(id, text, ok = true) {
  const el = $(id);
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'bad');
}

/* ============ 登录 ============ */
$('btnLogin').onclick = () => {
  const c = readCfg();
  if ($('pwd').value === (c.password || ADMIN_DEFAULT_PASSWORD)) {
    cfg = c;
    /* 首次进入后台：把内置任务写入配置，使所有任务均可编辑/删除 */
    if (!cfg.taskMigrationDone) {
      cfg.tasks = effectiveTasks();
      cfg.taskMigrationDone = true;
      saveConfig(cfg);
    }
    $('loginBox').classList.add('hidden');
    $('adminBody').classList.remove('hidden');
    renderTasks();
    renderRules();
    renderStats();
  } else {
    msg('loginMsg', '密码不对，再想想～', false);
  }
};
$('pwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnLogin').click(); });

/* ============ 任务管理 ============ */
const REWARD_KEYS = ['food', 'soldier', 'gold', 'shards'];
const CAT_LABEL = { daily: '每日', challenge: '挑战' };
const UNLOCK_LABEL = { farm: '屯田', recruit: '募兵', search: '寻访', fortify: '加固' };

function cloneDefaults() { return JSON.parse(JSON.stringify(TASKS)); }
function rewardText(rw) {
  return REWARD_KEYS.filter((k) => rw && rw[k]).map((k) => `${k}+${rw[k]}`).join(' ') || '—';
}
function readTaskFromForm(prefix) {
  const reward = {};
  if (+$(prefix + 'Food').value) reward.food = +$(prefix + 'Food').value;
  if (+$(prefix + 'Sol').value) reward.soldier = +$(prefix + 'Sol').value;
  if (+$(prefix + 'Gold').value) reward.gold = +$(prefix + 'Gold').value;
  if (+$(prefix + 'Shard').value) reward.shards = +$(prefix + 'Shard').value;
  return {
    cat: $(prefix + 'Cat').value,
    name: $(prefix + 'Name').value.trim(),
    icon: $(prefix + 'Icon').value.trim() || '📝',
    reward,
    desc: $(prefix + 'Desc').value.trim(),
    hint: $(prefix + 'Hint').value.trim(),
    needFix: $(prefix + 'Fix').checked,
    train: $(prefix + 'Train').checked,
    grantSearch: $(prefix + 'GrantSearch').checked,
    unlock: $(prefix + 'Unlock').value || undefined,
  };
}
function resetAddForm() {
  $('ntName').value = '';
  $('ntIcon').value = '📝';
  $('ntCat').value = 'daily';
  $('ntUnlock').value = '';
  $('ntFood').value = '0';
  $('ntSol').value = '0';
  $('ntGold').value = '0';
  $('ntShard').value = '0';
  $('ntFix').checked = false;
  $('ntTrain').checked = false;
  $('ntGrantSearch').checked = false;
  $('ntDesc').value = '';
  $('ntHint').value = '';
}

function renderTasks() {
  const rows = (cfg.tasks || []).map((t, i) => {
    const tags = [
      t.needFix ? '<span class="pill">需订正</span>' : '',
      t.train ? '<span class="pill">培养</span>' : '',
      t.grantSearch ? '<span class="pill">寻访</span>' : '',
    ].filter(Boolean).join(' ');
    return `<tr>
      <td><b>${t.icon || '📝'} ${t.name}</b>${tags ? ' ' + tags : ''}<br><span class="dim" style="font-size:11px">${t.desc || ''}</span></td>
      <td class="dim">${rewardText(t.reward)}</td>
      <td><span class="pill ${t.cat}">${CAT_LABEL[t.cat] || t.cat}</span></td>
      <td class="dim">${t.unlock ? '解锁' + UNLOCK_LABEL[t.unlock] : ''}</td>
      <td><button class="sm" data-edit="${i}">编辑</button> <button class="sm danger" data-del="${i}">删除</button></td>
    </tr>`;
  }).join('');
  $('taskList').innerHTML = `
    <table>
      <thead><tr><th>任务</th><th>奖励</th><th>类别</th><th>解锁</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="dim">暂无任务</td></tr>'}</tbody>
    </table>`;
  $('taskList').querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => {
      cfg.tasks.splice(+b.dataset.del, 1);
      saveConfig(cfg);
      renderTasks();
      msg('taskMsg', '已删除该任务。');
    };
  });
  $('taskList').querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => openEdit(+b.dataset.edit);
  });
}

function openEdit(i) {
  const t = cfg.tasks[i];
  if (!t) return;
  $('etIdx').value = i;
  $('etName').value = t.name || '';
  $('etIcon').value = t.icon || '📝';
  $('etCat').value = t.cat || 'daily';
  $('etUnlock').value = t.unlock || '';
  $('etFood').value = t.reward?.food || 0;
  $('etSol').value = t.reward?.soldier || 0;
  $('etGold').value = t.reward?.gold || 0;
  $('etShard').value = t.reward?.shards || 0;
  $('etFix').checked = !!t.needFix;
  $('etTrain').checked = !!t.train;
  $('etGrantSearch').checked = !!t.grantSearch;
  $('etDesc').value = t.desc || '';
  $('etHint').value = t.hint || '';
  $('editBox').classList.remove('hidden');
  $('etName').focus();
}
function closeEdit() { $('editBox').classList.add('hidden'); }

$('btnAddTask').onclick = () => {
  const name = $('ntName').value.trim();
  if (!name) { msg('taskMsg', '先填任务名', false); return; }
  const t = readTaskFromForm('nt');
  if (!Object.keys(t.reward).length) { msg('taskMsg', '至少填一项奖励（粮/兵/金/星）', false); return; }
  t.id = 'c_' + Date.now().toString(36);
  cfg.tasks = cfg.tasks || [];
  cfg.tasks.push(t);
  saveConfig(cfg);
  resetAddForm();
  renderTasks();
  msg('taskMsg', '已添加，游戏页面右侧打卡面板立刻可见。');
};

$('btnSaveEdit').onclick = () => {
  const i = +$('etIdx').value;
  const t = cfg.tasks[i];
  if (!t) return;
  const updated = readTaskFromForm('et');
  updated.id = t.id;
  cfg.tasks[i] = updated;
  saveConfig(cfg);
  closeEdit();
  renderTasks();
  msg('taskMsg', '已保存修改。');
};
$('btnCancelEdit').onclick = closeEdit;

$('btnResetTasks').onclick = () => {
  if (!confirm('确定恢复默认任务表？当前所有自定义/编辑过的任务都会被重置为内置表。')) return;
  cfg.tasks = cloneDefaults();
  saveConfig(cfg);
  renderTasks();
  msg('taskMsg', '已恢复默认任务表。');
};

/* ============ 难度调节 ============ */
const RULE_DESC = {
  FOOD_PER_SOLDIER: '每兵每回合耗粮（越大越难）',
  STARVE_LOSE: '断粮时士兵逃散比例',
  RECRUIT_MAX_PER_TURN: '每城每回合征兵上限',
  FARM_COST: '屯田升级耗金',
  FARM_BONUS: '屯田每级粮产加成',
  DEF_UP_COST: '加固城防耗金',
  SEARCH_COST: '寻访耗金',
  COMFORT_COST: '安抚武将耗金',
  COMFORT_GAIN: '安抚恢复忠诚',
  REWARD_COST: '赏赐武将耗金',
  REWARD_GAIN: '赏赐恢复忠诚',
  PERSUADE_COST: '劝降基础耗金',
  LOYALTY_REVOLT: '低于此忠诚会叛逃',
  STAMINA_COST: '出征消耗体力',
  ATTACK_UNLOCK_DAILY: '出征需完成的每日任务数',
  AMBUSH_CHANCE: '行军遇伏概率',
  AMBUSH_RELIEF: '伏击答对减损',
  AMBUSH_PENALTY: '伏击答错加损',
  TRANSFER_FOOD_PER: '调兵每兵耗粮',
};

function renderRules() {
  const keys = Object.keys(RULES).filter((k) => typeof RULES[k] === 'number' && !Number.isNaN(RULES[k]));
  const overridden = cfg.rules || {};
  $('ruleList').innerHTML = keys.map((k) => `
    <div class="row">
      <b>${k}</b>
      <input type="number" step="0.01" data-rule="${k}" value="${overridden[k] ?? RULES[k]}" />
      <label class="dim">${RULE_DESC[k] || ''}${overridden[k] !== undefined ? '（已覆盖）' : ''}</label>
    </div>`).join('');
}

$('btnSaveRules').onclick = () => {
  cfg.rules = cfg.rules || {};
  $('ruleList').querySelectorAll('[data-rule]').forEach((inp) => {
    const k = inp.dataset.rule;
    const v = parseFloat(inp.value);
    if (!Number.isNaN(v) && v !== RULES[k]) cfg.rules[k] = v;
    else delete cfg.rules[k];
  });
  saveConfig(cfg);
  msg('ruleMsg', '已保存 —— 刷新游戏页面后生效。');
  renderRules();
};
$('btnResetRules').onclick = () => {
  cfg.rules = {};
  saveConfig(cfg);
  renderRules();
  msg('ruleMsg', '已恢复默认难度。');
};

/* ============ 打卡统计 ============ */
function renderStats() {
  let save = null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) save = JSON.parse(raw);
  } catch (e) { /* 忽略 */ }

  if (!save || !save.diary) {
    $('statCards').innerHTML = '<p class="lead">还没有游戏存档 —— 孩子开局并结束过回合后，这里会出现统计。</p>';
    $('statTable').querySelector('tbody').innerHTML = '';
    return;
  }

  const diary = save.diary || [];
  const totalClaims = diary.reduce((s, d) => s + (d.tasks ? d.tasks.length : 0), 0);
  const activeDays = diary.filter((d) => d.tasks && d.tasks.length).length;
  $('statCards').innerHTML = `
    <div class="stat"><b>${save.turn ?? '—'}</b><span>进行到第几天</span></div>
    <div class="stat"><b>${save.streak ?? 0}</b><span>连续打卡</span></div>
    <div class="stat"><b>${activeDays}</b><span>有打卡的天数</span></div>
    <div class="stat"><b>${totalClaims}</b><span>累计领任务</span></div>
    <div class="stat"><b>${save.shards ?? 0}</b><span>将星碎片</span></div>
    <div class="stat"><b>${(save.cities || []).filter((c) => c.owner === save.player).length}</b><span>占领城池</span></div>`;

  /* 每项任务完成次数（diary.tasks 存的是任务名，直接聚合） */
  const counter = {};
  diary.forEach((d) => (d.tasks || []).forEach((n) => { counter[n] = (counter[n] || 0) + 1; }));
  const rows = Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `<tr><td>${name}</td><td>${n}</td></tr>`).join('');
  $('statTable').querySelector('tbody').innerHTML = rows || '<tr><td colspan="2" class="dim">暂无打卡记录</td></tr>';
  $('statHint').textContent = `统计来自本地存档，共记录 ${diary.length} 天日志。`;
}

/* ============ 存档与安全 ============ */
$('btnResetSave').onclick = () => {
  if (!confirm('确定清空游戏进度？城池、武将、资源全部回到初始。任务与难度设置保留。')) return;
  localStorage.removeItem(SAVE_KEY);
  msg('saveMsg', '游戏存档已清空。回到游戏页面刷新即可重新选势力开局。');
  renderStats();
};
$('btnResetAll').onclick = () => {
  if (!confirm('全部恢复出厂？游戏进度、自定义任务、难度设置、家长密码都会清空。')) return;
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(CONFIG_KEY);
  cfg = readCfg();
  renderTasks();
  renderRules();
  renderStats();
  msg('saveMsg', '已全部恢复出厂设置。');
};
$('btnPwd').onclick = () => {
  const p = $('newPwd').value.trim();
  if (!p) { msg('saveMsg', '密码不能为空', false); return; }
  cfg.password = p;
  saveConfig(cfg);
  $('newPwd').value = '';
  msg('saveMsg', '家长密码已更新。');
};
