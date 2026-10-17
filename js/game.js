/**
 * ============================================================
 *  game.js —— 回合制三国 · 学习备考版
 * ============================================================
 *  1 天 = 1 回合：
 *    【学习】领任务 → 【内政】屯田/征兵/寻访/加固/安抚
 *    → 【军事】出兵/劝降/释放 → 【AI 行动】→ 【回合结算】
 *
 *  资源只有三条来源：完成学习任务、城池产出、战斗缴获。
 *  所有数值都在 gamedata.js 的 RULES 里。
 * ============================================================
 */
import { CITIES, GRADE_STATS, FACTION_IDS, neighborsOf } from './cities.js';
import {
  FACTION_SETUP, GENERAL_POOL, WANDER_POOL, TASKS, MISS_PLAN, EVENTS, RULES, SAVE_KEY,
  PRESTIGE, ITEMS, ITEM_MAP, ITEM_DROPS, ITEM_DROP_CHANCE,
  LEGEND_NAMES, LEGEND_COST, ATTACK_UNLOCK_DAILY, PERSUADE_BUFF, MILESTONES,
  CONFIG_KEY, ADMIN_DEFAULT_PASSWORD,
} from './gamedata.js';

let S = null;
const listeners = new Set();
let gid = 1;

/** 订阅状态变化（UI 用它刷新） */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((f) => f(S)); }

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = () => Math.random();
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

function log(text, kind = 'info') {
  S.log.unshift({ turn: S.turn, text, kind });
  if (S.log.length > 120) S.log.length = 120;
}

/* ============================================================
 * 开新局
 * ========================================================== */
export function newGame(playerFaction) {
  gid = 1;
  S = {
    turn: 1,
    player: playerFaction,
    res: {},            // factionId -> {food, soldier, gold, prestige}
    streak: 0,          // 连续打卡天数
    week: 1,            // 当前第几周
    shards: 0,          // 将星碎片
    items: [],          // [{id, count}]
    diary: [],          // 打卡日志 [{turn, week, tasks:[名]}]
    milestones: {},     // { 7: true, 30: true } 已领取的里程碑
    farmBuff: 0,        // 连续打卡 30 天解锁的屯田产出加成
    persuadeBuff: false, // 背诵古文后本回合劝降 +20%
    cities: [],         // { owner, garrison, defense, farm, generalId }
    generals: [],
    options: { aiAggressive: true, allowExecute: false },
    allies: {},         // factionId -> 剩余回合
    buffs: { challenge: false },
    searchTokens: 0,
    todayTasks: {},
    todayClaimed: 0,
    actions: {},        // cityId -> { recruited }
    lastEvent: null,
    log: [],
    wanderNames: [],
    over: null,
  };

  /* --- 城池 --- */
  CITIES.forEach((c) => {
    const own = c.faction;
    const base = RULES.NEUTRAL_GARRISON[c.grade];
    const gar = own === 'none' ? base : Math.round(base * RULES.START_GARRISON_MUL);
    S.cities.push({
      owner: own,
      garrison: gar,
      defense: GRADE_STATS[c.grade].defense,
      farm: 0,
      generalId: null,
    });
  });

  /* --- 势力资源 --- */
  FACTION_IDS.forEach((f) => {
    S.res[f] = { ...FACTION_SETUP[f].res, prestige: 0 };
  });

  /* --- 武将 --- */
  FACTION_IDS.forEach((f) => {
    FACTION_SETUP[f].generals.forEach((name) => {
      const g = mkGeneral(name, f);
      const home = FACTION_SETUP[f].cities
        .map((n) => CITIES.findIndex((c) => c.name === n))
        .find((i) => i >= 0);
      g.cityId = home ?? -1;
      S.generals.push(g);
      if (home >= 0 && !S.cities[home].generalId) S.cities[home].generalId = g.id;
    });
  });

  /* --- 为尚未分配守将的城池补将（含中立城），保证每城都有武将驻守 --- */
  const usedNames = new Set(S.generals.map((g) => g.name));
  S.cities.forEach((c, i) => {
    if (c.generalId) return;
    let proto = GENERAL_POOL.find(
      (g) => g.faction === c.owner && !usedNames.has(g.name) && !LEGEND_NAMES.includes(g.name)
    );
    if (!proto) proto = GENERAL_POOL.find(
      (g) => !usedNames.has(g.name) && !LEGEND_NAMES.includes(g.name)
    );
    if (!proto) return;
    usedNames.add(proto.name);
    const g = mkGeneral(proto.name, c.owner);
    S.generals.push(g);
    c.generalId = g.id;
  });

  S.wanderNames = WANDER_POOL.map((g) => g.name);
  log(`【${FACTION_SETUP[playerFaction].name}】起兵，共 ${FACTION_SETUP[playerFaction].cities.length} 城`, 'big');
  save();
  emit();
  return S;
}

function mkGeneral(name, faction) {
  const proto = GENERAL_POOL.find((g) => g.name === name) || GENERAL_STUB(name);
  const g = {
    id: gid++,
    name,
    owner: faction,
    capturedBy: null,
    force: proto.force,
    intel: proto.intel,
    loyalty: proto.loyalty,
    stamina: RULES.STAMINA_MAX,
    skill: proto.skill || 'none',
    note: proto.note || '',
    cityId: -1,
    tries: 0,
    fought: false,
  };
  return g;
}

/* GENERAL_POOL 里查不到时（理论上不会）给个兜底 */
function GENERAL_STUB(name) {
  return { name, force: 70, intel: 60, loyalty: 75, skill: 'none', note: '' };
}

/* ============================================================
 * 只读查询（给 UI 用）
 * ========================================================== */
export const state = () => S;
export const me = () => (S ? S.res[S.player] : null);
export const isPlayer = (f) => f === S.player;
export const cityCount = (f) => S.cities.filter((c) => c.owner === f).length;
export const myCities = () => S.cities.map((c, i) => ({ ...c, i })).filter((c) => c.owner === S.player);
export const myGenerals = () => S.generals.filter((g) => g.owner === S.player && !g.capturedBy);
export const myCaptives = () => S.generals.filter((g) => g.capturedBy === S.player);
export const generalById = (id) => S.generals.find((g) => g.id === id);

/** 玩家可攻打的目标：与己方任一一城相邻、且不属于自己 */
export function attackable() {
  const mine = new Set(myCities().map((c) => c.i));
  const out = new Set();
  mine.forEach((i) => neighborsOf(i).forEach((j) => { if (!mine.has(j)) out.add(j); }));
  return [...out].map((i) => ({ i, city: CITIES[i], st: S.cities[i] }));
}

/** 兵马总上限 = 所有己方城池的容量之和 */
export function soldierCap(f = S.player) {
  return S.cities.reduce((s, c, i) =>
    s + (c.owner === f ? RULES.GARRISON_CAP[CITIES[i].grade] : 0), 0);
}
export function soldierTotal(f = S.player) {
  return S.res[f].soldier + S.cities.reduce((s, c) => s + (c.owner === f ? c.garrison : 0), 0);
}

/* ============================================================
 * 〇、家长后台配置（任务自定义 + 难度调节）
 *   配置存 localStorage，与内置表合并后生效。
 * ========================================================== */
export function getConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* 忽略 */ }
  return { tasks: [], rules: {}, password: ADMIN_DEFAULT_PASSWORD };
}
export function saveConfig(cfg) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch (e) { /* 忽略 */ }
}

/** 规则覆盖：在读取配置后调用一次 */
function applyConfigRules() {
  const cfg = getConfig();
  Object.entries(cfg.rules || {}).forEach(([k, v]) => {
    if (typeof v === 'number' && k in RULES) RULES[k] = v;
  });
}

/* ---- 任务字段规范化（保留家长后台写入的全部扩展字段） ---- */
function normalizeTasks(list) {
  return list.map((t) => ({
    ...t,
    id: t.id,
    cat: t.cat || 'challenge',
    name: t.name || '未命名任务',
    icon: t.icon || '📝',
    desc: t.desc || '',
    reward: t.reward || {},
    hint: t.hint || '',
    needFix: !!t.needFix,
    train: !!t.train,
    grantSearch: !!t.grantSearch,
  }));
}

/** 实际生效的任务表：家长后台可编辑全部任务；未迁移的旧配置自动合并内置表 */
export function effectiveTasks() {
  const cfg = getConfig();
  const saved = cfg.tasks || [];
  if (!saved.length) return normalizeTasks(TASKS);
  if (cfg.taskMigrationDone) return normalizeTasks(saved);
  /* 兼容旧配置：当初家长后台只存自定义任务，需与内置表合并 */
  const builtinIds = new Set(TASKS.map((t) => t.id));
  const hasBuiltin = saved.some((t) => builtinIds.has(t.id));
  return hasBuiltin ? normalizeTasks(saved) : normalizeTasks([...TASKS, ...saved]);
}
const taskById = (id) => effectiveTasks().find((x) => x.id === id);

/* ============================================================
 * 一、学习阶段
 * ========================================================== */
export function claimTask(taskId, opts = {}) {
  const t = taskById(taskId);
  if (!t) return { ok: false, msg: '没有这个任务' };
  if (S.todayTasks[taskId]) return { ok: false, msg: '今天已经领过这项了' };
  if (t.needFix && !opts.fixed) {
    return { ok: false, msg: '错题还没订正 —— 本次不发放任何奖励' };
  }

  const r = S.res[S.player];
  const rw = t.reward || {};
  r.food += rw.food || 0;
  r.soldier += rw.soldier || 0;
  r.gold += rw.gold || 0;
  if (rw.shards) { S.shards += rw.shards; }
  r.prestige += PRESTIGE.perTask[t.id] || 0;

  let extra = '';
  if (rw.shards) extra += ` 将星碎片 +${rw.shards}。`;
  if (t.grantSearch) { S.searchTokens++; extra += ' 获得 1 次寻访机会。'; }
  if (t.unlock) {
    const NAMES = { farm: '屯田', recruit: '募兵', search: '寻访', fortify: '加固城防' };
    extra += ` 解锁【${NAMES[t.unlock]}】。`;
  }
  if (t.itemDrop && rnd() < ITEM_DROP_CHANCE) {
    const it = gainItem(t.itemDrop);
    if (it) extra += ` 拾得宝物「${it.name}」！`;
  }
  if (taskId === 'paper' && rnd() < 0.25) {
    const it = gainItem(pick(ITEM_DROPS.paper));
    if (it) extra += ` 拾得宝物「${it.name}」！`;
  }
  if (taskId === 'guwen') {
    S.persuadeBuff = true;
    extra += ' 今日劝降成功率 +20%。';
  }
  if (taskId === 'paper' && S.buffs.challenge) {
    S.buffs.challenge = false;
    r.food += 150; r.soldier += 80;
    extra += ' 击退敌将挑战，额外 +150 粮草 +80 兵马！';
  }
  S.todayTasks[taskId] = true;
  S.todayClaimed++;
  if (S.todayClaimed === 1) S.streak += 1;

  /* 连续打卡里程碑 */
  for (const m of MILESTONES) {
    if (S.streak >= m.streak && !S.milestones[m.streak]) {
      S.milestones[m.streak] = true;
      if (m.shards) S.shards += m.shards;
      if (m.farmBuff) S.farmBuff = m.farmBuff;
      if (m.general && S.wanderNames.length) {
        const name = S.wanderNames.splice(Math.floor(rnd() * S.wanderNames.length), 1)[0];
        const g = mkGeneral(name, S.player);
        const home = myCities()[0];
        g.cityId = home ? home.i : -1;
        S.generals.push(g);
        extra += ` 🏆 连续打卡 ${m.streak} 天：「${g.name}」来投！`;
        log(`连续打卡 ${m.streak} 天，在野武将「${g.name}」来投！`, 'big');
      } else {
        extra += ` 🏆 连续打卡 ${m.streak} 天：${m.reward}！`;
        log(`连续打卡 ${m.streak} 天：${m.reward}`, 'big');
      }
    }
  }

  log(`完成任务「${t.name}」：粮 +${rw.food || 0} 兵 +${rw.soldier || 0} 金 +${rw.gold || 0} 声望 +${PRESTIGE.perTask[t.id] || 0}${extra}`, 'good');
  save(); emit();
  return { ok: true, needTrain: !!t.train, msg: `已发放奖励${extra}` };
}

/* ---- 打卡解锁：内政 / 出征的门 ---- */
export function unlocks() {
  const t = S.todayTasks;
  const dailyDone = effectiveTasks().filter((x) => x.cat === 'daily' && t[x.id]).length;
  return {
    farm: !!t.hwMath,
    recruit: !!t.cuoti,
    search: !!t.yuedu,
    fortify: !!t.lianzi,
    attack: dailyDone >= ATTACK_UNLOCK_DAILY,
    dailyDone,
    attackNeed: ATTACK_UNLOCK_DAILY,
    hint: {
      farm: t.hwMath ? '' : '先完成「数学课后作业」',
      recruit: t.cuoti ? '' : '先完成「错题整理」',
      search: t.yuedu ? '' : '先完成「课外阅读 30 分钟」',
      fortify: t.lianzi ? '' : '先完成「练字 / 抄写」',
      attack: dailyDone >= ATTACK_UNLOCK_DAILY ? '' : `先完成 ${ATTACK_UNLOCK_DAILY} 项每日任务（今日已完成 ${dailyDone}）`,
    },
  };
}

/** 完成真题后培养武将 */
export function trainGeneral(genId, attr) {
  const g = generalById(genId);
  if (!g || g.owner !== S.player) return { ok: false, msg: '武将不存在' };
  g[attr] = clamp(g[attr] + RULES.TRAIN_GAIN, 0, 200);
  log(`「${g.name}」${attr === 'force' ? '武力' : '智力'} +${RULES.TRAIN_GAIN}`, 'good');
  save(); emit();
  return { ok: true, msg: `${g.name} 的${attr === 'force' ? '武力' : '智力'}提升了` };
}

/* ============================================================
 * 一又二分之一、宝物
 * ========================================================== */
export function gainItem(id, n = 1) {
  const it = ITEM_MAP[id];
  if (!it) return null;
  const slot = S.items.find((x) => x.id === id);
  if (slot) slot.count += n;
  else S.items.push({ id, count: n });
  save(); emit();
  return it;
}
export const myItems = () => (S ? S.items : []);

/** 装备宝物带来的属性加成 */
export function itemBonus(g) {
  const out = { force: 0, intel: 0, loyalty: 0, staminaMax: 0, recover: 0, search: 0, atk: 0, def: 0 };
  if (!g || !g.item) return out;
  const e = ITEM_MAP[g.item]?.apply?.(g) || {};
  out.force += e.force || 0;
  out.intel += e.intel || 0;
  out.loyalty += e.loyalty || 0;
  out.staminaMax += e.staminaMax || 0;
  out.recover += e.recover || 0;
  out.search += e.search || 0;
  out.atk += e.atk || 0;
  out.def += e.def || 0;
  return out;
}
/** 武将的实际武力 / 智力 / 体力上限(含宝物) */
export const forceOf = (g) => (g ? g.force + itemBonus(g).force : 40);
export const intelOf = (g) => (g ? g.intel + itemBonus(g).intel : 50);
export const staminaMaxOf = (g) => RULES.STAMINA_MAX + itemBonus(g).staminaMax;

export function equipItem(genId, itemId) {
  const g = generalById(genId);
  if (!g || g.owner !== S.player || g.capturedBy) return { ok: false, msg: '武将不存在' };
  const slot = S.items.find((x) => x.id === itemId);
  if (!slot || slot.count <= 0) return { ok: false, msg: '没有这件宝物' };
  const it = ITEM_MAP[itemId];
  if (!it.equip) return { ok: false, msg: `${it.name} 不能装备` };
  if (g.item) {   // 换下旧的
    const back = ITEM_MAP[g.item];
    gainItem(back.id);
    slot.count -= 1;
  } else {
    slot.count -= 1;
  }
  g.item = itemId;
  if (slot.count <= 0) S.items = S.items.filter((x) => x.count > 0);
  log(`「${g.name}」装备了 ${it.name}`, 'good');
  save(); emit();
  return { ok: true, msg: `${g.name} 装备 ${it.name}` };
}

export function unequipItem(genId) {
  const g = generalById(genId);
  if (!g || !g.item) return { ok: false, msg: '没有装备宝物' };
  gainItem(g.item);
  g.item = null;
  log(`「${g.name}」卸下了宝物`, 'info');
  save(); emit();
  return { ok: true, msg: '已卸下' };
}

/** 即开即用的宝物 */
export function useItem(itemId) {
  const slot = S.items.find((x) => x.id === itemId);
  if (!slot || slot.count <= 0) return { ok: false, msg: '没有这件宝物' };
  const it = ITEM_MAP[itemId];
  if (it.equip) return { ok: false, needTarget: true, msg: `请选择要装备「${it.name}」的武将` };
  const e = it.use?.() || {};
  const r = S.res[S.player];
  if (e.food) r.food += e.food;
  if (e.gold) r.gold += e.gold;
  if (e.soldier) r.soldier += e.soldier;
  if (e.prestige) r.prestige += e.prestige;
  slot.count -= 1;
  if (slot.count <= 0) S.items = S.items.filter((x) => x.count > 0);
  log(`使用了 ${it.name}`, 'good');
  save(); emit();
  return { ok: true, msg: `${it.name} 已使用` };
}

/* ============================================================
 * 二、内政阶段
 * ========================================================== */
function act(i) {
  if (!S.actions[i]) S.actions[i] = { recruited: 0 };
  return S.actions[i];
}

export function doFarm(i) {
  const c = S.cities[i];
  if (c.owner !== S.player) return { ok: false, msg: '不是自己的城' };
  const ul = unlocks();
  if (!ul.farm) return { ok: false, msg: `尚未解锁：${ul.hint.farm}` };
  if (c.farm >= RULES.FARM_MAX) return { ok: false, msg: '屯田已满级' };
  if (S.res[S.player].gold < RULES.FARM_COST) return { ok: false, msg: '金币不足' };
  S.res[S.player].gold -= RULES.FARM_COST;
  c.farm++;
  log(`${CITIES[i].name} 屯田升至 ${c.farm} 级`, 'good');
  save(); emit();
  return { ok: true, msg: `${CITIES[i].name} 屯田 ${c.farm} 级` };
}

export function doRecruit(i, want) {
  const c = S.cities[i];
  if (c.owner !== S.player) return { ok: false, msg: '不是自己的城' };
  const ul = unlocks();
  if (!ul.recruit) return { ok: false, msg: `尚未解锁：${ul.hint.recruit}` };
  const r = S.res[S.player];
  const room = RULES.GARRISON_CAP[CITIES[i].grade] - c.garrison;
  const turnRoom = RULES.RECRUIT_MAX_PER_TURN - act(i).recruited;
  const foodRoom = Math.floor(r.food / RULES.RECRUIT_PER_FOOD);
  const n = Math.max(0, Math.floor(Math.min(want, room, turnRoom, foodRoom)));
  if (n <= 0) {
    return { ok: false, msg: room <= 0 ? '该城兵马已满' : (turnRoom <= 0 ? '本回合征兵已达上限' : '粮草不足') };
  }
  r.food -= n * RULES.RECRUIT_PER_FOOD;
  c.garrison += n;
  act(i).recruited += n;
  log(`${CITIES[i].name} 征兵 ${n}`, 'good');
  save(); emit();
  return { ok: true, msg: `征兵 ${n} 名` };
}

export function doFortify(i) {
  const c = S.cities[i];
  if (c.owner !== S.player) return { ok: false, msg: '不是自己的城' };
  const ul = unlocks();
  if (!ul.fortify) return { ok: false, msg: `尚未解锁：${ul.hint.fortify}` };
  const cap = Math.round(GRADE_STATS[CITIES[i].grade].defense * RULES.DEF_CAP_MUL);
  if (c.defense >= cap) return { ok: false, msg: '城防已达上限' };
  if (S.res[S.player].gold < RULES.DEF_UP_COST) return { ok: false, msg: '金币不足' };
  S.res[S.player].gold -= RULES.DEF_UP_COST;
  c.defense = Math.min(cap, c.defense + RULES.DEF_UP_GAIN);
  log(`${CITIES[i].name} 加固城防至 ${c.defense}`, 'good');
  save(); emit();
  return { ok: true, msg: `城防 ${c.defense}` };
}

export function doSearch(i) {
  const c = S.cities[i];
  if (c.owner !== S.player) return { ok: false, msg: '不是自己的城' };
  const ul = unlocks();
  if (!ul.search) return { ok: false, msg: `尚未解锁：${ul.hint.search}` };
  if (S.searchTokens <= 0) return { ok: false, msg: '没有寻访机会了 —— 完成一次「奥数专题训练」可获得' };
  if (S.res[S.player].gold < RULES.SEARCH_COST) return { ok: false, msg: '金币不足' };

  S.searchTokens--;
  S.res[S.player].gold -= RULES.SEARCH_COST;

  const advisor = S.generals
    .filter((g) => g.owner === S.player && !g.capturedBy)
    .sort((a, b) => intelOf(b) - intelOf(a))[0];
  const pBonus = Math.min(PRESTIGE.persuadeCap, S.res[S.player].prestige / 100 * PRESTIGE.searchBonus);
  const iBonus = advisor ? itemBonus(advisor).search : 0;
  const rate = clamp(RULES.SEARCH_BASE + (advisor ? intelOf(advisor) : 50) / 500 + pBonus + iBonus, 0.1, 0.95);

  const roll = rnd();
  // 50% 寻得宝物
  if (roll < 0.5) {
    const it = gainItem(pick(ITEM_DROPS.search));
    if (it) {
      log(`在 ${CITIES[i].name} 寻得宝物「${it.name}」（${it.effect}）！`, 'big');
      save(); emit();
      return { ok: true, msg: `寻得宝物 ${it.name}！`, item: it };
    }
  }
  // 30% 寻得武将
  if (roll < 0.8) {
    if (!S.wanderNames.length) {
      log(`${CITIES[i].name} 在野已无贤才可寻`, 'info');
      save(); emit();
      return { ok: false, msg: '在野已无贤才可寻' };
    }
    const name = S.wanderNames.splice(Math.floor(rnd() * S.wanderNames.length), 1)[0];
    const g = mkGeneral(name, S.player);
    g.cityId = i;
    if (!c.generalId) c.generalId = g.id;
    S.generals.push(g);
    log(`在 ${CITIES[i].name} 寻得在野武将「${g.name}」（武力 ${g.force} 智力 ${g.intel}）！`, 'big');
    save(); emit();
    return { ok: true, msg: `寻得武将 ${g.name}！`, general: g };
  }
  // 20% 未果
  log(`${CITIES[i].name} 寻访未果（成功率 ${Math.round(rate * 100)}%）`, 'info');
  save(); emit();
  return { ok: false, msg: `寻访未果（成功率 ${Math.round(rate * 100)}%）` };
}

export function doComfort(genId) {
  const g = generalById(genId);
  if (!g || g.owner !== S.player || g.capturedBy) return { ok: false, msg: '武将不存在' };
  if (g.loyalty >= 100) return { ok: false, msg: '忠诚已满' };
  if (S.res[S.player].gold < RULES.COMFORT_COST) return { ok: false, msg: '金币不足' };
  S.res[S.player].gold -= RULES.COMFORT_COST;
  g.loyalty = clamp(g.loyalty + RULES.COMFORT_GAIN, 0, 100);
  log(`安抚「${g.name}」，忠诚升至 ${g.loyalty}`, 'good');
  save(); emit();
  return { ok: true, msg: `${g.name} 忠诚 ${g.loyalty}` };
}

export function doAlly(f) {
  if (f === S.player || f === 'none') return { ok: false, msg: '不能与自己结盟' };
  if ((S.allies[f] || 0) > 0) return { ok: false, msg: '已在同盟中' };
  if (S.res[S.player].gold < RULES.ALLY_COST) return { ok: false, msg: '金币不足' };
  S.res[S.player].gold -= RULES.ALLY_COST;
  S.allies[f] = RULES.ALLY_TURNS;
  log(`与 ${FACTION_SETUP[f].name} 结盟 ${RULES.ALLY_TURNS} 回合`, 'good');
  save(); emit();
  return { ok: true, msg: `与 ${FACTION_SETUP[f].name} 结盟` };
}

/* ---- 调兵：在我方相邻城池间转移兵马 ---- */
export function doTransfer(fromIdx, toIdx, n) {
  const a = S.cities[fromIdx], b = S.cities[toIdx];
  if (!a || !b) return { ok: false, msg: '城池不存在' };
  if (a.owner !== S.player || b.owner !== S.player) return { ok: false, msg: '只能在我方城池之间调兵' };
  if (fromIdx === toIdx) return { ok: false, msg: '同一座城' };
  const want = Math.max(0, Math.floor(n || 0));
  if (want <= 0) return { ok: false, msg: '请输入调兵人数' };
  if (a.garrison < want) return { ok: false, msg: `${CITIES[fromIdx].name} 守军不足` };
  const cap = RULES.GARRISON_CAP[CITIES[toIdx].grade];
  const room = cap - b.garrison;
  if (room <= 0) return { ok: false, msg: `${CITIES[toIdx].name} 兵马已满` };
  const foodCost = Math.ceil(want * RULES.TRANSFER_FOOD_PER);
  if (S.res[S.player].food < foodCost) return { ok: false, msg: `粮草不足（需要 ${foodCost}）` };
  const mv = Math.min(want, room);
  S.res[S.player].food -= Math.ceil(mv * RULES.TRANSFER_FOOD_PER);
  a.garrison -= mv;
  b.garrison += mv;
  log(`${CITIES[fromIdx].name} → ${CITIES[toIdx].name} 调兵 ${mv}（耗粮 ${Math.ceil(mv * RULES.TRANSFER_FOOD_PER)}）`, 'info');
  save(); emit();
  return { ok: true, msg: `调兵 ${mv} 名` };
}

/** 城池驻军 → 手头可调动兵马（出征前先把兵调出来） */
export function doGarrisonPull(cityIdx, n) {
  const c = S.cities[cityIdx];
  if (!c) return { ok: false, msg: '城池不存在' };
  if (c.owner !== S.player) return { ok: false, msg: '只能调自己城池的驻军' };
  const want = Math.max(0, Math.floor(n || 0));
  if (want <= 0) return { ok: false, msg: '请输入调兵人数' };
  if (c.garrison < want) return { ok: false, msg: `${CITIES[cityIdx].name} 守军不足` };
  const foodCost = Math.ceil(want * RULES.TRANSFER_FOOD_PER);
  if (S.res[S.player].food < foodCost) return { ok: false, msg: `粮草不足（需要 ${foodCost}）` };
  c.garrison -= want;
  S.res[S.player].soldier += want;
  S.res[S.player].food -= foodCost;
  log(`${CITIES[cityIdx].name} 调出 ${want} 兵到手头（耗粮 ${foodCost}）`, 'info');
  save(); emit();
  return { ok: true, msg: `${want} 名驻军调到手头，可用于出征` };
}

/** 手头可调动兵马 → 城池驻军（回城补防） */
export function doGarrisonPush(cityIdx, n) {
  const c = S.cities[cityIdx];
  if (!c) return { ok: false, msg: '城池不存在' };
  if (c.owner !== S.player) return { ok: false, msg: '只能调进自己城池' };
  const want = Math.max(0, Math.floor(n || 0));
  if (want <= 0) return { ok: false, msg: '请输入调兵人数' };
  if (S.res[S.player].soldier < want) return { ok: false, msg: '手头可调动兵马不足' };
  const room = RULES.GARRISON_CAP[CITIES[cityIdx].grade] - c.garrison;
  if (room <= 0) return { ok: false, msg: `${CITIES[cityIdx].name} 兵马已满` };
  const mv = Math.min(want, room);
  const foodCost = Math.ceil(mv * RULES.TRANSFER_FOOD_PER);
  if (S.res[S.player].food < foodCost) return { ok: false, msg: `粮草不足（需要 ${foodCost}）` };
  S.res[S.player].soldier -= mv;
  c.garrison += mv;
  S.res[S.player].food -= foodCost;
  log(`手头 ${mv} 兵调进 ${CITIES[cityIdx].name}（耗粮 ${foodCost}）`, 'info');
  save(); emit();
  return { ok: true, msg: `${mv} 名兵马调进 ${CITIES[cityIdx].name}` };
}

/* ---- 驻守分配：把武将派到指定城池 ---- */
export function doAssign(genId, cityIdx) {
  const g = generalById(genId);
  const c = S.cities[cityIdx];
  if (!g || g.owner !== S.player || g.capturedBy) return { ok: false, msg: '武将不存在' };
  if (!c || c.owner !== S.player) return { ok: false, msg: '只能驻守我方城池' };
  const old = S.cities.find((x) => x.generalId === g.id);
  if (old) old.generalId = null;
  g.cityId = cityIdx;
  if (!c.generalId) c.generalId = g.id;
  log(`「${g.name}」调驻 ${CITIES[cityIdx].name}`, 'info');
  save(); emit();
  return { ok: true, msg: `${g.name} 驻守 ${CITIES[cityIdx].name}` };
}

/* ---- 赏赐武将：金币换忠诚 ---- */
export function doReward(genId) {
  const g = generalById(genId);
  if (!g || g.owner !== S.player || g.capturedBy) return { ok: false, msg: '武将不存在' };
  if (g.loyalty >= 100) return { ok: false, msg: '忠诚已满' };
  if (S.res[S.player].gold < RULES.REWARD_COST) return { ok: false, msg: `金币不足（需要 ${RULES.REWARD_COST}）` };
  S.res[S.player].gold -= RULES.REWARD_COST;
  g.loyalty = clamp(g.loyalty + RULES.REWARD_GAIN, 0, 100);
  log(`赏赐「${g.name}」${RULES.REWARD_COST} 金，忠诚升至 ${g.loyalty}`, 'good');
  save(); emit();
  return { ok: true, msg: `${g.name} 忠诚 ${g.loyalty}` };
}

/* ---- 将星碎片招募传奇名将 ---- */
export const legendCost = () => LEGEND_COST;
export function legendPool() {
  return LEGEND_NAMES
    .filter((n) => !S.generals.some((g) => g.name === n))
    .map((n) => GENERAL_POOL.find((g) => g.name === n))
    .filter(Boolean);
}
export function recruitLegend(name) {
  if (!LEGEND_NAMES.includes(name)) return { ok: false, msg: '不是名将' };
  if (S.generals.some((g) => g.name === name)) return { ok: false, msg: '已在麾下或已被他人所得' };
  if (S.shards < LEGEND_COST) return { ok: false, msg: `将星碎片不足（需要 ${LEGEND_COST}，现有 ${S.shards}）` };
  S.shards -= LEGEND_COST;
  const g = mkGeneral(name, S.player);
  g.loyalty = 95;
  const home = myCities()[0];
  g.cityId = home ? home.i : -1;
  S.generals.push(g);
  log(`将星汇聚，传奇名将「${g.name}」前来效力！（${LEGEND_COST} 碎片）`, 'big');
  save(); emit();
  return { ok: true, msg: `${g.name} 加入了！` };
}

/* ============================================================
 * 三、军事阶段
 * ========================================================== */
function power(soldiers, force, skill, atkBonus = 0) {
  let p = soldiers * (1 + force / RULES.FORCE_FACTOR);
  if (skill === 'charge') p *= 1.15;
  if (atkBonus) p *= (1 + atkBonus / 100);
  return p;
}
function defensePower(cityIdx, st) {
  const g = st.generalId ? generalById(st.generalId) : null;
  const defBonus = g ? itemBonus(g).def : 0;
  return st.garrison * (1 + (g ? forceOf(g) : 40) / RULES.FORCE_FACTOR)
    + st.defense * RULES.DEFENSE_FACTOR
    + defBonus * RULES.DEFENSE_FACTOR;
}

/** 战力预览（UI 用） */
export function previewBattle(targetIdx, soldiers, genId) {
  const st = S.cities[targetIdx];
  const g = genId ? generalById(genId) : null;
  return {
    atk: power(soldiers, g ? forceOf(g) : 40, g ? g.skill : 'none', g ? itemBonus(g).atk : 0),
    def: defensePower(targetIdx, st),
  };
}

/* ---- 行军伏击：出征前roll，答对奥数小题可减损 ---- */
let pendingAmbush = null;
export function rollAmbush() {
  pendingAmbush = null;
  if (rnd() >= RULES.AMBUSH_CHANCE) return null;
  const a = 3 + Math.floor(rnd() * 16);
  const b = 2 + Math.floor(rnd() * 12);
  const ops = [
    { q: `${a} + ${b}`, a: a + b },
    { q: `${a + b} − ${Math.min(a, b)}`, a: a + b - Math.min(a, b) },
    { q: `${Math.min(a, b)} × ${Math.max(2, Math.floor(rnd() * 7) + 2)}`, a: 0 },
  ];
  const op = ops[Math.floor(rnd() * (ops.length - 1))] || ops[0];
  pendingAmbush = { q: op.q, a: op.a };
  return pendingAmbush;
}
export function peekAmbush() { return pendingAmbush; }
export function clearAmbush() { pendingAmbush = null; }

export function doAttack(targetIdx, soldiers, genId, opts = {}) {
  const st = S.cities[targetIdx];
  if (st.owner === S.player) return { ok: false, msg: '已经是自己的城' };
  if ((S.allies[st.owner] || 0) > 0) return { ok: false, msg: '对方是盟友' };
  if (!attackable().some((t) => t.i === targetIdx)) return { ok: false, msg: '不与己方城池相邻' };
  const ul = unlocks();
  if (!ul.attack) return { ok: false, msg: `尚未解锁出征：${ul.hint.attack}` };

  const g = generalById(genId);
  if (!g || g.owner !== S.player || g.capturedBy) return { ok: false, msg: '请选择一名武将' };
  if (g.stamina < RULES.STAMINA_COST) return { ok: false, msg: `${g.name} 体力不足，需要休息` };
  if (soldiers < 10) return { ok: false, msg: '至少带 10 名兵马' };
  if (S.res[S.player].soldier < soldiers) return { ok: false, msg: '可调动兵马不足' };

  const atk = power(soldiers, forceOf(g), g.skill, itemBonus(g).atk);
  const def = defensePower(targetIdx, st);
  const r = S.res[S.player];

  /* 伏击结算 */
  let ambush = null;
  if (pendingAmbush) {
    const correct = !!opts.ambushCorrect && opts.ambushAnswer === pendingAmbush.a;
    ambush = { q: pendingAmbush.q, a: pendingAmbush.a, correct };
    pendingAmbush = null;
    if (correct) log(`行军遇伏！主公答对「${ambush.q}」，队伍从容应对。`, 'good');
    else log(`行军遇伏！「${ambush.q}」答错（应为 ${ambush.a}），队伍慌乱。`, 'bad');
  }

  g.stamina -= RULES.STAMINA_COST;
  g.fought = true;
  r.soldier -= soldiers;

  const from = st.owner;
  let capturedName = null;
  let fledName = null;
  let fledTo = null;
  let result;

  if (atk > def) {
    /* ---- 攻方胜 ---- */
    let lossRate = clamp(def / atk, RULES.WIN_LOSS_MIN, 0.95);
    if (ambush) lossRate *= ambush.correct ? (1 - RULES.AMBUSH_RELIEF) : (1 + RULES.AMBUSH_PENALTY);
    const lost = Math.round(soldiers * lossRate);
    const remain = soldiers - lost;
    const cap = RULES.GARRISON_CAP[CITIES[targetIdx].grade];
    const occupy = Math.min(remain, cap);

    // 守将：60% 被俘，40% 突围逃往同势力他城
    if (st.generalId) {
      const dg = generalById(st.generalId);
      if (dg) {
        if (rnd() < RULES.CAPTURE_CHANCE) {
          dg.capturedBy = S.player; dg.cityId = -1; capturedName = dg.name;
        } else {
          const others = [];
          S.cities.forEach((c, idx) => { if (c.owner === from && idx !== targetIdx) others.push(idx); });
          const free = others.filter((idx) => !S.cities[idx].generalId);
          const dest = free.length ? pick(free) : (others.length ? pick(others) : null);
          if (dest != null) {
            st.generalId = null;
            dg.cityId = dest;
            S.cities[dest].generalId = dg.id;
            fledName = dg.name;
            fledTo = CITIES[dest].name;
          } else {
            dg.capturedBy = S.player; dg.cityId = -1; capturedName = dg.name;
          }
        }
      }
    }
    st.owner = S.player;
    st.garrison = occupy;
    st.defense = Math.max(st.defense, Math.round(GRADE_STATS[CITIES[targetIdx].grade].defense * 0.6));
    st.generalId = null;
    r.soldier += (remain - occupy);

    // 缴获宝物: 都城级掉玉玺/赤兔, 其它掉青釭/兵书
    let lootName = null;
    if (rnd() < 0.22) {
      const pool = CITIES[targetIdx].grade === 'S' ? ITEM_DROPS.winS : ITEM_DROPS.winA;
      const it = gainItem(pick(pool));
      if (it) { lootName = it.name; log(`缴获宝物「${it.name}」`, 'good'); }
    }

    result = { ok: true, win: true, lost, occupy, capturedName, fledName, fledTo, lootName, ambush };
    log(`攻下 ${CITIES[targetIdx].name}！折损 ${lost} 兵，留 ${occupy} 守${capturedName ? `，俘获 ${capturedName}` : ''}${fledName ? `，守将 ${fledName} 突围逃往 ${fledTo}` : ''}${lootName ? `，缴获 ${lootName}` : ''}`, 'big');
  } else {
    /* ---- 攻方败 ---- */
    let lossRate = clamp(RULES.LOSE_LOSS_MAX * (1 - atk / def) + 0.35, 0.35, RULES.LOSE_LOSS_MAX);
    if (ambush) lossRate *= ambush.correct ? (1 - RULES.AMBUSH_RELIEF) : (1 + RULES.AMBUSH_PENALTY);
    const lost = Math.round(soldiers * lossRate);
    const remain = soldiers - lost;
    r.soldier += remain;

    let gCap = null;
    const dchance = clamp(RULES.CAPTURED_CHANCE + (100 - g.loyalty) / 400, 0.05, 0.55);
    if (from !== 'none' && rnd() < dchance) {
      g.capturedBy = from; g.cityId = -1; gCap = g.name;
    }
    result = { ok: true, win: false, lost, remain, gCap, ambush };
    log(`进攻 ${CITIES[targetIdx].name} 失利，折损 ${lost} 兵${gCap ? `，${gCap} 被俘` : ''}`, 'bad');
  }

  checkOver();
  save(); emit();
  return result;
}

/* ---- 俘虏处理 ---- */
export function persuadeRate(genId) {
  const g = generalById(genId);
  const best = myGenerals().sort((a, b) => intelOf(b) - intelOf(a))[0];
  let rate = RULES.PERSUADE_BASE + (best ? intelOf(best) : 50) / 250 + g.tries * RULES.PERSUADE_TRY_BONUS;
  if (best && best.skill === 'strategist') rate += 0.20;
  if (best) rate += itemBonus(best).search;
  if (S.persuadeBuff) rate += PERSUADE_BUFF;
  rate += Math.min(PRESTIGE.persuadeCap, S.res[S.player].prestige / 100 * PRESTIGE.persuadeBonus);
  return clamp(rate, 0.05, 0.95);
}

export function doPersuade(genId, invest = 0) {
  const g = generalById(genId);
  if (!g || g.capturedBy !== S.player) return { ok: false, msg: '没有这名俘虏' };
  invest = clamp(Math.floor(invest) || 0, 0, S.res[S.player].gold);
  const cost = RULES.PERSUADE_COST + g.tries * 20 + invest;
  if (S.res[S.player].gold < cost) return { ok: false, msg: `金币不足（需要 ${cost}）` };
  S.res[S.player].gold -= cost;

  const rate = clamp(persuadeRate(genId) + Math.min(RULES.PERSUADE_INVEST_CAP, Math.floor(invest / 100) * RULES.PERSUADE_INVEST_BONUS), 0, 0.95);
  g.tries++;
  if (rnd() < rate) {
    g.capturedBy = null;
    g.owner = S.player;
    g.loyalty = clamp(65 + Math.round(rnd() * 15), 0, 100);
    g.tries = 0;
    const home = myCities()[0];
    g.cityId = home ? home.i : -1;
    log(`劝降成功！「${g.name}」归顺（投入 ${invest} 金，成功率 ${Math.round(rate * 100)}%）`, 'big');
    save(); emit();
    return { ok: true, msg: `${g.name} 归顺了！（成功率 ${Math.round(rate * 100)}%）` };
  }
  log(`劝降「${g.name}」失败（投入 ${invest} 金，成功率 ${Math.round(rate * 100)}%）`, 'info');
  save(); emit();
  return { ok: false, msg: `劝降失败（成功率 ${Math.round(rate * 100)}%）` };
}

export function doRelease(genId) {
  const g = generalById(genId);
  if (!g || g.capturedBy !== S.player) return { ok: false, msg: '没有这名俘虏' };
  g.capturedBy = null;
  g.loyalty = clamp(g.loyalty - 10, 20, 100);
  g.tries = 0;
  S.res[S.player].prestige += RULES.RELEASE_PRESTIGE;
  log(`释放「${g.name}」，仁德之名远扬（声望 +${RULES.RELEASE_PRESTIGE}）`, 'info');
  save(); emit();
  return { ok: true, msg: `${g.name} 已被释放，声望 +${RULES.RELEASE_PRESTIGE}` };
}

export function doExecute(genId) {
  if (!S.options.allowExecute) return { ok: false, msg: '斩首功能已关闭' };
  const g = generalById(genId);
  if (!g || g.capturedBy !== S.player) return { ok: false, msg: '没有这名俘虏' };
  S.generals = S.generals.filter((x) => x.id !== genId);
  log(`斩首「${g.name}」`, 'bad');
  save(); emit();
  return { ok: true, msg: `${g.name} 已被斩首` };
}

/* ============================================================
 * 四、AI 行动
 * ========================================================== */
function aiTurn() {
  FACTION_IDS.filter((f) => f !== S.player).forEach((f) => {
    const r = S.res[f];
    const cities = S.cities.map((c, i) => ({ ...c, i })).filter((c) => c.owner === f);
    if (!cities.length) return;

    /* 屯田 */
    if (r.gold >= RULES.FARM_COST) {
      const t = cities.find((c) => c.farm < 3) || cities[0];
      if (t.farm < RULES.FARM_MAX) { r.gold -= RULES.FARM_COST; t.farm++; }
    }

    /* 征兵 */
    const foodForSoldiers = Math.floor(r.food * RULES.AI_RECRUIT_RATE);
    if (foodForSoldiers > 50) {
      const room = soldierCap(f) - soldierTotal(f);
      const n = Math.min(foodForSoldiers, Math.max(0, room), 400);
      if (n > 0) { r.food -= n; r.soldier += n; }
    }

    /* 攻城 */
    const gens = S.generals.filter((g) => g.owner === f && !g.capturedBy && g.stamina >= RULES.STAMINA_COST);
    if (!gens.length || r.soldier < 100) return;

    const mine = new Set(cities.map((c) => c.i));
    const cand = new Set();
    mine.forEach((i) => neighborsOf(i).forEach((j) => { if (!mine.has(j)) cand.add(j); }));
    const targets = [...cand]
      .filter((j) => {
        const o = S.cities[j].owner;
        if (o === f) return false;
        if (o === S.player) return S.options.aiAggressive && !(S.allies[f] > 0);
        return !(S.allies[o] > 0);
      })
      .map((j) => ({ j, def: defensePower(j, S.cities[j]) }))
      .sort((a, b) => a.def - b.def);

    if (rnd() > RULES.AI_ATTACK_CHANCE) return;

    const g = gens.sort((a, b) => b.force - a.force)[0];
    for (const t of targets.slice(0, 3)) {
      const need = Math.ceil(t.def * RULES.AI_ATTACK_RATIO / (1 + g.force / RULES.FORCE_FACTOR));
      if (need > r.soldier) continue;
      const atk = power(Math.min(need, r.soldier), g.force, g.skill);
      g.stamina -= RULES.STAMINA_COST;
      g.fought = true;
      r.soldier -= Math.min(need, r.soldier);
      if (atk > t.def) {
        const st = S.cities[t.j];
        const wasPlayer = st.owner === S.player;
        if (st.generalId && rnd() < RULES.CAPTURE_CHANCE) {
          const dg = generalById(st.generalId);
          if (dg) { dg.capturedBy = f; dg.cityId = -1; }
        }
        st.owner = f;
        st.garrison = Math.min(Math.round(Math.min(need, r.soldier) * 0.7), RULES.GARRISON_CAP[CITIES[t.j].grade]);
        st.defense = Math.max(st.defense, Math.round(GRADE_STATS[CITIES[t.j].grade].defense * 0.6));
        st.generalId = null;
        r.soldier += Math.round(need * 0.3);
        log(`${FACTION_SETUP[f].name} 攻下 ${CITIES[t.j].name}`, wasPlayer ? 'bad' : 'info');
      } else {
        log(`${FACTION_SETUP[f].name} 进攻 ${CITIES[t.j].name} 失利`, 'info');
      }
      break;   // 每回合每势力只打一次
    }
  });
}

/* ============================================================
 * 五、回合结算
 * ========================================================== */
function settle() {
  FACTION_IDS.forEach((f) => {
    const r = S.res[f];
    let food = 0, gold = 0;
    S.cities.forEach((c, i) => {
      if (c.owner !== f) return;
      const o = RULES.CITY_OUTPUT[CITIES[i].grade];
      food += Math.round(o.food * (1 + c.farm * RULES.FARM_BONUS) * (1 + (S.farmBuff || 0)));
      gold += Math.round(o.gold * (1 + c.farm * RULES.FARM_BONUS * 0.6));
    });
    r.food += food;
    r.gold += gold;

    const total = soldierTotal(f);
    const eat = Math.ceil(total * RULES.FOOD_PER_SOLDIER);
    r.food -= eat;
    if (r.food < 0) {
      r.food = 0;
      const lose = Math.ceil(r.soldier * RULES.STARVE_LOSE);
      r.soldier = Math.max(0, r.soldier - lose);
      S.cities.forEach((c) => {
        if (c.owner === f) c.garrison = Math.max(0, Math.round(c.garrison * (1 - RULES.STARVE_LOSE)));
      });
      if (f === S.player) log(`粮草耗尽，${lose} 名士兵逃散！`, 'bad');
    }

    /* 武将体力与忠诚 */
    S.generals.filter((g) => g.owner === f && !g.capturedBy).forEach((g) => {
      const recover = RULES.STAMINA_RECOVER + itemBonus(g).recover + (g.fought ? -20 : 0);
      g.stamina = clamp(g.stamina + recover, 0, staminaMaxOf(g));
      g.fought = false;
      if (g.loyalty < RULES.LOYALTY_REVOLT && rnd() < RULES.REVOLT_CHANCE) {
        const others = FACTION_IDS.filter((x) => x !== f);
        g.owner = pick(others);
        g.cityId = -1;
        if (f === S.player) log(`「${g.name}」忠诚过低，叛逃了！`, 'bad');
      }
    });
  });

  /* 未完成任务惩罚 */
  if (S.todayClaimed === 0) {
    S.res[S.player].food += MISS_PLAN.food;
    log(`当日未完成计划，粮草 ${MISS_PLAN.food}`, 'bad');
  }

  /* 同盟倒计时 */
  Object.keys(S.allies).forEach((f) => {
    if (S.allies[f] > 0) {
      S.allies[f]--;
      if (S.allies[f] === 0) log(`与 ${FACTION_SETUP[f].name} 的同盟到期`, 'info');
    }
  });

  /* 随机事件 */
  S.lastEvent = null;
  if (rnd() < RULES.EVENT_CHANCE) {
    const e = pick(EVENTS);
    applyEvent(e);
    S.lastEvent = e;
  }

  /* 连续打卡：今天一项都没领，中断；否则已在学习阶段累加过 */
  if (S.todayClaimed === 0) {
    S.streak = 0;
  }
  /* 打卡日志：记录今天领了哪些任务 */
  const doneNames = effectiveTasks()
    .filter((t) => S.todayTasks[t.id])
    .map((t) => t.name);
  S.diary.unshift({
    turn: S.turn, week: S.week, streak: S.streak,
    count: doneNames.length, tasks: doneNames,
  });
  if (S.diary.length > 90) S.diary.length = 90;
  S.persuadeBuff = false;
  S.turn++;
  S.week = Math.floor((S.turn - 1) / 7) + 1;
  S.todayTasks = {};
  S.todayClaimed = 0;
  S.actions = {};
}

function applyEvent(e) {
  const r = S.res[S.player];
  if (e.effect.food) r.food = Math.max(0, r.food + e.effect.food);
  if (e.effect.gold) r.gold = Math.max(0, r.gold + e.effect.gold);
  if (e.effect.soldier) r.soldier = Math.max(0, r.soldier + e.effect.soldier);
  if (e.effect.buff) S.buffs[e.effect.buff] = true;
  if (e.effect.shards) S.shards += e.effect.shards;
  if (e.effect.general && S.wanderNames.length) {
    const name = S.wanderNames.splice(Math.floor(rnd() * S.wanderNames.length), 1)[0];
    const g = mkGeneral(name, S.player);
    const home = myCities()[0];
    g.cityId = home ? home.i : -1;
    S.generals.push(g);
    log(`${e.name}：在野武将「${g.name}」来投！`, 'big');
    return;
  }
  log(`${e.name}：${e.text}`, e.effect.food < 0 || e.effect.soldier < 0 ? 'bad' : 'good');
}

/* ============================================================
 * 回合推进
 * ========================================================== */
export function endTurn() {
  if (S.over) return;
  aiTurn();
  settle();
  checkOver();
  save();
  emit();
}

function checkOver() {
  if (S.over) return;
  const mine = cityCount(S.player);
  const gens = myGenerals();
  if (mine === 0 && gens.length === 0) {
    S.over = 'lose';
    log('城池尽失、武将离散 —— 此局结束，可重新开局再来。', 'bad');
  } else if (mine === S.cities.length) {
    S.over = 'win';
    log('占领全部 50 城，统一全国 —— 小升初备考通关！', 'big');
  }
}

/* ============================================================
 * 存档
 * ========================================================== */
export function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 忽略 */ }
}
export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.player || !s.cities || s.cities.length !== CITIES.length) return null;
    S = s;
    gid = Math.max(0, ...S.generals.map((g) => g.id)) + 1;
    if (S.shards == null) S.shards = 0;
    if (!S.diary) S.diary = [];
    if (!S.milestones) S.milestones = {};
    applyConfigRules();
    emit();
    return S;
  } catch (e) { return null; }
}
export function reset() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 忽略 */ }
}
export function setOption(k, v) { S.options[k] = v; save(); emit(); }

/* 模块加载时应用一次家长配置的难度覆盖 */
applyConfigRules();
