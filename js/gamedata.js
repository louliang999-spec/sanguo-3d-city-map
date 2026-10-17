/**
 * ============================================================
 *  gamedata.js —— 游戏规则的全部数值与静态表
 * ============================================================
 *  学习任务 = 内政收入 · 奥数打卡 = 积攒资源
 *  攻城略地 = 阶段性学习目标 · 统一全国 = 小升初备考通关
 *
 *  想调难度 / 调奖励 / 加任务, 只改这个文件就够了。
 * ============================================================
 */

/* ============================================================
 * 一、可选势力(6 个)
 *   cities   开局城池名(必须存在于 CITY_LIST)
 *   generals 开局武将名
 *   res      开局资源
 * ---------------------------------------------------------- */
export const FACTION_SETUP = {
  wei: {
    name: '曹魏', difficulty: '中等', stars: 3,
    cities: ['邺城', '洛阳', '长安'],
    generals: ['夏侯惇', '郭嘉', '张辽'],
    res: { food: 800, soldier: 600, gold: 300 },
    trait: '武将基础能力均衡，适合初次上手',
    tip: '北方起家，城池分散但武将全面。',
  },
  shu: {
    name: '蜀汉', difficulty: '偏难', stars: 4,
    cities: ['成都', '汉中'],
    generals: ['关羽', '张飞', '赵云', '诸葛亮'],
    res: { food: 500, soldier: 450, gold: 250 },
    trait: '武将单项能力很强，资源少，考验坚持打卡',
    tip: '只有两座城，但五虎上将与卧龙在手，稳扎稳打向西扩张。',
  },
  wu: {
    name: '东吴', difficulty: '简单 · 新手首选', stars: 1,
    cities: ['建业', '吴郡', '会稽', '江夏'],
    generals: ['周瑜', '甘宁', '陆逊'],
    res: { food: 1000, soldier: 700, gold: 350 },
    trait: '城池集中，粮草充足，容错高',
    tip: '江东四城连成一片，是最省心的开局。',
  },
  yuan: {
    name: '袁绍', difficulty: '简单', stars: 2,
    cities: ['南皮', '常山', '临淄', '下邳'],
    generals: ['颜良', '文丑'],
    res: { food: 1100, soldier: 650, gold: 300 },
    trait: '粮草储备丰厚，武将偏少，适合稳扎稳打刷题',
    tip: '粮草最多，但只有两员大将，尽早寻访补人。',
  },
  lvbu: {
    name: '吕布', difficulty: '困难', stars: 5,
    cities: ['濮阳'],
    generals: ['吕布'],
    res: { food: 300, soldier: 300, gold: 200 },
    trait: '唯一武将战力极高，但家底极薄，必须坚持每日打卡',
    tip: '吕布武力天下第一，但只有一座城，全靠每日奥数打卡续命。',
  },
  liubiao: {
    name: '刘表', difficulty: '中等偏易', stars: 3,
    cities: ['襄阳', '江陵', '宛城'],
    generals: ['黄忠', '魏延'],
    res: { food: 900, soldier: 550, gold: 300 },
    trait: '地处中部，周边强敌不多，适合稳步推进复习',
    tip: '荆襄三城居中，四面皆可扩张，压力最小。',
  },
};

/* ============================================================
 * 二、武将
 *   force 武力(战斗)  intel 智力(内政/劝降)  loyalty 忠诚  stamina 体力
 * ---------------------------------------------------------- */

/** 开局武将 + 在野武将, 全部在这里 */
export const GENERAL_POOL = [
  // ---- 曹魏 ----
  { name: '夏侯惇', faction: 'wei', force: 92, intel: 55, loyalty: 95, skill: 'none', note: '独眼硬汉，冲锋在前' },
  { name: '郭嘉', faction: 'wei', force: 35, intel: 96, loyalty: 90, skill: 'strategist', note: '鬼才谋士，妙算无双' },
  { name: '张辽', faction: 'wei', force: 90, intel: 72, loyalty: 85, skill: 'charge', note: '威震逍遥津' },
  { name: '荀彧', faction: 'wei', force: 30, intel: 95, loyalty: 93, skill: 'strategist', note: '王佐之才' },
  { name: '贾诩', faction: 'wei', force: 32, intel: 94, loyalty: 65, skill: 'strategist', note: '毒士' },
  { name: '徐晃', faction: 'wei', force: 84, intel: 60, loyalty: 84, skill: 'charge', note: '周亚夫之风' },
  { name: '张郃', faction: 'wei', force: 82, intel: 65, loyalty: 68, skill: 'charge', note: '巧变之将' },
  { name: '司马懿', faction: 'wei', force: 45, intel: 97, loyalty: 60, skill: 'strategist', note: '冢虎（忠诚很低）' },
  { name: '曹仁', faction: 'wei', force: 80, intel: 62, loyalty: 90, skill: 'none', note: '大魏屏障' },
  { name: '李典', faction: 'wei', force: 74, intel: 66, loyalty: 88, skill: 'none', note: '儒雅将军' },
  { name: '典韦', faction: 'wei', force: 94, intel: 35, loyalty: 92, skill: 'charge', note: '古之恶来' },
  { name: '许褚', faction: 'wei', force: 93, intel: 38, loyalty: 90, skill: 'charge', note: '虎痴' },
  // ---- 蜀汉 ----
  { name: '关羽', faction: 'shu', force: 97, intel: 75, loyalty: 99, skill: 'charge', note: '武圣，忠义无双' },
  { name: '张飞', faction: 'shu', force: 96, intel: 45, loyalty: 98, skill: 'charge', note: '万人敌' },
  { name: '赵云', faction: 'shu', force: 93, intel: 70, loyalty: 96, skill: 'charge', note: '常胜将军' },
  { name: '诸葛亮', faction: 'shu', force: 38, intel: 99, loyalty: 99, skill: 'strategist', note: '卧龙，内政第一' },
  { name: '黄忠', faction: 'shu', force: 91, intel: 58, loyalty: 85, skill: 'charge', note: '老当益壮' },
  { name: '魏延', faction: 'shu', force: 85, intel: 55, loyalty: 70, skill: 'charge', note: '蜀中大将（忠诚偏低）' },
  { name: '姜维', faction: 'shu', force: 78, intel: 88, loyalty: 90, skill: 'strategist', note: '麒麟儿' },
  { name: '庞统', faction: 'shu', force: 33, intel: 93, loyalty: 80, skill: 'strategist', note: '凤雏' },
  { name: '马超', faction: 'shu', force: 95, intel: 52, loyalty: 70, skill: 'charge', note: '锦马超' },
  { name: '法正', faction: 'shu', force: 40, intel: 90, loyalty: 72, skill: 'strategist', note: '奇谋善断' },
  { name: '邓艾', faction: 'shu', force: 76, intel: 85, loyalty: 78, skill: 'strategist', note: '偷渡阴平' },
  // ---- 东吴 ----
  { name: '周瑜', faction: 'wu', force: 65, intel: 95, loyalty: 95, skill: 'strategist', note: '赤壁雄才' },
  { name: '甘宁', faction: 'wu', force: 88, intel: 60, loyalty: 80, skill: 'charge', note: '锦帆贼' },
  { name: '陆逊', faction: 'wu', force: 60, intel: 90, loyalty: 88, skill: 'strategist', note: '书生拜将' },
  { name: '太史慈', faction: 'wu', force: 87, intel: 62, loyalty: 82, skill: 'charge', note: '江东猛虎' },
  { name: '周泰', faction: 'wu', force: 83, intel: 48, loyalty: 92, skill: 'charge', note: '江东虎臣' },
  { name: '程普', faction: 'wu', force: 79, intel: 58, loyalty: 88, skill: 'charge', note: '三朝老将' },
  { name: '黄盖', faction: 'wu', force: 80, intel: 55, loyalty: 86, skill: 'charge', note: '苦肉计' },
  { name: '孙策', faction: 'wu', force: 90, intel: 68, loyalty: 90, skill: 'charge', note: '小霸王' },
  { name: '吕蒙', faction: 'wu', force: 78, intel: 80, loyalty: 85, skill: 'strategist', note: '白衣渡江' },
  { name: '鲁肃', faction: 'wu', force: 42, intel: 88, loyalty: 92, skill: 'strategist', note: '东吴股肱' },
  // ---- 袁绍 ----
  { name: '颜良', faction: 'yuan', force: 90, intel: 40, loyalty: 75, skill: 'charge', note: '河北上将' },
  { name: '文丑', faction: 'yuan', force: 88, intel: 42, loyalty: 72, skill: 'charge', note: '河北上将' },
  { name: '高览', faction: 'yuan', force: 82, intel: 50, loyalty: 70, skill: 'charge', note: '河北四庭柱' },
  { name: '田丰', faction: 'yuan', force: 30, intel: 92, loyalty: 80, skill: 'strategist', note: '刚直谋士' },
  { name: '沮授', faction: 'yuan', force: 35, intel: 90, loyalty: 85, skill: 'strategist', note: '冀州谋主' },
  { name: '审配', faction: 'yuan', force: 45, intel: 80, loyalty: 88, skill: 'strategist', note: '忠烈谋士' },
  // ---- 吕布 ----
  { name: '吕布', faction: 'lvbu', force: 100, intel: 30, loyalty: 50, skill: 'charge', note: '飞将，天下无双（忠诚偏低，小心被俘）' },
  { name: '高顺', faction: 'lvbu', force: 86, intel: 55, loyalty: 92, skill: 'charge', note: '陷阵营主将' },
  { name: '陈宫', faction: 'lvbu', force: 40, intel: 88, loyalty: 78, skill: 'strategist', note: '刚直谋臣' },
  // ---- 刘表 ----
  { name: '蔡瑁', faction: 'liubiao', force: 72, intel: 55, loyalty: 80, skill: 'none', note: '水军都督' },
  { name: '张允', faction: 'liubiao', force: 70, intel: 52, loyalty: 78, skill: 'none', note: '水军副将' },
  { name: '黄祖', faction: 'liubiao', force: 75, intel: 50, loyalty: 80, skill: 'none', note: '江夏守将' },
  { name: '文聘', faction: 'liubiao', force: 80, intel: 60, loyalty: 85, skill: 'charge', note: '江夏名将' },
  { name: '蒯越', faction: 'liubiao', force: 38, intel: 86, loyalty: 80, skill: 'strategist', note: '荆襄谋士' },
  // ---- 中立 / 群雄（可被寻访，也作为中立城守将）----
  { name: '公孙瓒', faction: 'none', force: 82, intel: 55, loyalty: 80, skill: 'charge', note: '白马将军' },
  { name: '陶谦', faction: 'none', force: 60, intel: 60, loyalty: 80, skill: 'none', note: '徐州牧' },
  { name: '孔融', faction: 'none', force: 40, intel: 80, loyalty: 85, skill: 'strategist', note: '北海名士' },
  { name: '刘繇', faction: 'none', force: 65, intel: 58, loyalty: 78, skill: 'none', note: '扬州牧' },
  { name: '王朗', faction: 'none', force: 42, intel: 78, loyalty: 80, skill: 'strategist', note: '东海名儒' },
  { name: '刘璋', faction: 'none', force: 55, intel: 60, loyalty: 82, skill: 'none', note: '益州牧' },
  { name: '张鲁', faction: 'none', force: 58, intel: 66, loyalty: 84, skill: 'strategist', note: '汉中天师' },
  { name: '马腾', faction: 'none', force: 86, intel: 55, loyalty: 82, skill: 'charge', note: '西凉军阀' },
  { name: '韩遂', faction: 'none', force: 80, intel: 62, loyalty: 70, skill: 'charge', note: '西凉宿将' },
  { name: '严白虎', faction: 'none', force: 74, intel: 48, loyalty: 70, skill: 'charge', note: '江东贼帅' },
  { name: '李傕', faction: 'none', force: 82, intel: 50, loyalty: 60, skill: 'charge', note: '凉州乱将' },
  { name: '郭汜', faction: 'none', force: 80, intel: 48, loyalty: 58, skill: 'charge', note: '凉州乱将' },
  { name: '张绣', faction: 'none', force: 88, intel: 62, loyalty: 72, skill: 'charge', note: '宛城之雄' },
  { name: '华雄', faction: 'none', force: 86, intel: 40, loyalty: 70, skill: 'charge', note: '董卓骁将' },
  { name: '袁术', faction: 'none', force: 62, intel: 55, loyalty: 70, skill: 'none', note: '仲家皇帝' },
  { name: '孙坚', faction: 'none', force: 90, intel: 60, loyalty: 88, skill: 'charge', note: '江东猛虎' },
  { name: '董卓', faction: 'none', force: 92, intel: 45, loyalty: 40, skill: 'charge', note: '乱世奸雄' },
  { name: '臧霸', faction: 'none', force: 82, intel: 52, loyalty: 78, skill: 'charge', note: '泰山豪杰' },
  { name: '庞德', faction: 'none', force: 89, intel: 55, loyalty: 85, skill: 'charge', note: '白马骁将' },
  { name: '徐庶', faction: 'none', force: 55, intel: 86, loyalty: 75, skill: 'strategist', note: '身在曹营' },
  { name: '陈登', faction: 'none', force: 50, intel: 82, loyalty: 85, skill: 'strategist', note: '广陵才俊' },
  { name: '霍峻', faction: 'none', force: 78, intel: 60, loyalty: 88, skill: 'none', note: '梓潼坚壁' },
  { name: '吴懿', faction: 'none', force: 76, intel: 58, loyalty: 82, skill: 'charge', note: '蜀中宿将' },
  { name: '张任', faction: 'none', force: 85, intel: 72, loyalty: 92, skill: 'strategist', note: '益州名将' },
  { name: '严颜', faction: 'none', force: 83, intel: 60, loyalty: 90, skill: 'charge', note: '巴郡老将' },
  { name: '刘封', faction: 'none', force: 78, intel: 55, loyalty: 65, skill: 'charge', note: '螟蛉之子' },
  { name: '孟获', faction: 'none', force: 80, intel: 40, loyalty: 70, skill: 'charge', note: '南中蛮王' },
  { name: '祝融', faction: 'none', force: 78, intel: 42, loyalty: 72, skill: 'charge', note: '南中女将' },
  { name: '高翔', faction: 'none', force: 72, intel: 55, loyalty: 80, skill: 'none', note: '蜀中偏将' },
  { name: '廖化', faction: 'none', force: 70, intel: 50, loyalty: 82, skill: 'none', note: '蜀中先锋' },
  { name: '关平', faction: 'none', force: 76, intel: 58, loyalty: 90, skill: 'charge', note: '将门虎子' },
  { name: '周仓', faction: 'none', force: 78, intel: 35, loyalty: 92, skill: 'charge', note: '扛刀力士' },
  { name: '马岱', faction: 'none', force: 80, intel: 58, loyalty: 82, skill: 'charge', note: '马超从弟' },
  { name: '曹真', faction: 'none', force: 82, intel: 68, loyalty: 88, skill: 'none', note: '大魏宗将' },
  { name: '曹休', faction: 'none', force: 80, intel: 64, loyalty: 86, skill: 'charge', note: '大魏千里驹' },
  { name: '满宠', faction: 'none', force: 45, intel: 84, loyalty: 88, skill: 'strategist', note: '刚正谋臣' },
  { name: '郝昭', faction: 'none', force: 75, intel: 65, loyalty: 92, skill: 'none', note: '陈仓死守' },
  { name: '王平', faction: 'none', force: 74, intel: 62, loyalty: 88, skill: 'none', note: '无当飞军' },
  { name: '马谡', faction: 'none', force: 40, intel: 85, loyalty: 80, skill: 'strategist', note: '言过其实' },
  { name: '张翼', faction: 'none', force: 76, intel: 60, loyalty: 84, skill: 'charge', note: '蜀中宿将' },
];

/** 开局武将名(这些不会出现在在野池里) */
const STARTING = new Set(
  Object.values(FACTION_SETUP).flatMap((f) => f.generals)
);

/* ============================================================
 * 二又二分之一、将星碎片与传奇名将
 *   名将只能用将星碎片招募(单元测试 / 读整本书 / 连续打卡获得碎片)。
 * ---------------------------------------------------------- */
export const LEGEND_NAMES = ['马超', '典韦', '许褚', '太史慈', '姜维', '邓艾'];

/** 在野武将池(寻访 / 名将来投 从这里出; 名将只能用碎片招募) */
export const WANDER_POOL = GENERAL_POOL.filter(
  (g) => !STARTING.has(g.name) && !LEGEND_NAMES.includes(g.name)
);

/** 招募一名名将需要的将星碎片 */
export const LEGEND_COST = 3;

/** 武将技能(和学习能力对应) */
export const SKILLS = {
  charge: { name: '冲锋', desc: '攻城战斗伤害 +15%（对应做题速度快）' },
  strategist: { name: '妙算', desc: '劝降成功率 +20%（对应擅长总结归纳）' },
  none: { name: '无', desc: '暂无技能' },
};

/* ============================================================
 * 三、学习任务 → 资源（整个游戏的驱动引擎）
 *   cat       'daily' 每日必做 / 'challenge' 自选挑战
 *   needFix   true 时未勾选「已订正」则不发放任何奖励
 *   unlock    完成后解锁的内政操作: farm/recruit/search/fortify
 *   shards    奖励将星碎片
 *   家长可在后台自定义增删（见 admin.html），自定义项存在
 *   localStorage 的 CONFIG_KEY 里，与本表合并生效。
 * ========================================================== */
export const TASKS = [
  /* ---- 每日必做：不完成则锁出征 ---- */
  { id: 'hwMath',   cat: 'daily', name: '数学课后作业',   icon: '📗',
    desc: '完成当天的数学作业', reward: { food: 80 },
    needFix: false, unlock: 'farm',
    hint: '解锁【屯田】：囤积粮草' },
  { id: 'cuoti',    cat: 'daily', name: '错题整理',       icon: '📕',
    desc: '错题订正 + 抄进错题本', reward: { soldier: 60 },
    needFix: true, unlock: 'recruit',
    hint: '解锁【募兵】：招兵买马；不订正不给兵' },
  { id: 'yuedu',    cat: 'daily', name: '课外阅读 30 分钟', icon: '📚',
    desc: '课外书 / 阅读理解', reward: { gold: 15 },
    needFix: false, unlock: 'search',
    hint: '解锁【寻访】：搜寻在野武将' },
  { id: 'lianzi',   cat: 'daily', name: '练字 / 抄写',    icon: '✒️',
    desc: '生字抄写 / 英语单词抄写', reward: { gold: 10 },
    needFix: false, unlock: 'fortify',
    hint: '解锁【加固城防】' },
  { id: 'hwYuwen',  cat: 'daily', name: '语文课文朗读',   icon: '🗣️',
    desc: '朗读课文 / 背诵段落', reward: { gold: 25 } },
  { id: 'hwYingyu', cat: 'daily', name: '英语单词跟读',   icon: '🔤',
    desc: '单词背诵 + 跟读打卡', reward: { gold: 20 } },
  { id: 'kousuan',  cat: 'daily', name: '口算打卡',       icon: '🧮',
    desc: '口算题卡一页', reward: { food: 40 } },
  { id: 'daily',    cat: 'daily', name: '每日奥数小题',   icon: '✅',
    desc: '5 道小题，全部订正', reward: { food: 60, soldier: 30, gold: 10 },
    needFix: true, itemDrop: 'bingshu',
    hint: '基本盘；有机会捡到「兵书残卷」' },
  { id: 'review',   cat: 'daily', name: '公式背诵 / 复盘', icon: '📖',
    desc: '知识点背诵、错题复盘', reward: { food: 40, gold: 15 } },

  /* ---- 自选挑战：额外资源 ---- */
  { id: 'topic',    cat: 'challenge', name: '奥数专题训练', icon: '📐',
    desc: '1 个专题完整刷题 + 订正复盘', reward: { food: 150, soldier: 80, gold: 30 },
    needFix: true, grantSearch: true,
    hint: '再获得 1 次【寻访】机会' },
  { id: 'paper',    cat: 'challenge', name: '奥数真题一套', icon: '📝',
    desc: '限时完成 + 错题整理', reward: { food: 250, soldier: 120, gold: 50 },
    needFix: true, train: true,
    hint: '可指定 1 名武将：武力 +2 或 智力 +2' },
  { id: 'guwen',    cat: 'challenge', name: '背诵古文',     icon: '🎋',
    desc: '背诵一篇古文 / 长课文', reward: { gold: 100 },
    hint: '今日劝降成功率 +20%（议价的资本）' },
  { id: 'unitTest', cat: 'challenge', name: '单元测试达标', icon: '🎯',
    desc: '单元测试达到目标分', reward: { food: 200, shards: 1 },
    hint: '奖励 1 枚【将星碎片】' },
  { id: 'readBook', cat: 'challenge', name: '读完一本书',   icon: '📖',
    desc: '完整读完一本课外书', reward: { gold: 40, shards: 1 },
    hint: '奖励 1 枚【将星碎片】' },
  { id: 'extra',    cat: 'challenge', name: '附加自选任务', icon: '➕',
    desc: '其它自备任务', reward: { food: 50, gold: 20 } },
];

/** 每日打卡掉宝物的概率 */
export const ITEM_DROP_CHANCE = 0.12;

/** 出征解锁：今日需领取的每日任务数 */
export const ATTACK_UNLOCK_DAILY = 3;

/** 背诵古文给劝降的加成 */
export const PERSUADE_BUFF = 0.20;

/** 连续打卡里程碑 */
export const MILESTONES = [
  { streak: 7,  reward: '将星碎片 ×1 + 一名在野武将来投', shards: 1, general: true },
  { streak: 14, reward: '将星碎片 ×1', shards: 1 },
  { streak: 30, reward: '屯田产出永久 +20%（特殊城池 buff）', farmBuff: 0.20 },
];

/** 未完成任务(回合结算时的内政惩罚) */
export const MISS_PLAN = { id: 'miss', name: '当日未完成计划', food: -100 };

/* ============================================================
 * 三又二分之一、声望
 *   完成学习任务涨声望; 声望越高, 寻访/劝降/名将来投越顺。
 * ========================================================== */
export const PRESTIGE = {
  perTask: {
    hwMath: 1, cuoti: 2, yuedu: 1, lianzi: 1, hwYuwen: 1, hwYingyu: 1,
    kousuan: 1, daily: 2, review: 1, topic: 8, paper: 15, guwen: 3,
    unitTest: 8, readBook: 5, extra: 3,
  },
  /** 每 100 点声望给寻访 + 这个比例(上限 0.25) */
  searchBonus: 0.10, searchCap: 0.25,
  /** 每 100 点声望给劝降 + 这个比例(上限 0.20) */
  persuadeBonus: 0.08, persuadeCap: 0.20,
  /** 每 1000 点声望给"名将来投"事件 + 这个概率 */
  heroBonus: 0.05,
};

/* ============================================================
 * 三又四分之三、宝物
 *   equip = true 的可以装备到武将身上(每人 1 件), 其余即开即用。
 * ========================================================== */
export const ITEMS = [
  {
    id: 'bingfa', name: '孙子兵法', icon: '📜', equip: true,
    get: '寻访 / 攻下州重镇',
    effect: '智力 +8',
    apply: () => ({ intel: 8 }),
    desc: '知己知彼，百战不殆 —— 内政与劝降都更顺手',
  },
  {
    id: 'qinggang', name: '青釭剑', icon: '🗡️', equip: true,
    get: '攻下州重镇',
    effect: '武力 +8',
    apply: () => ({ force: 8 }),
    desc: '曹操的佩剑，斩将利器',
  },
  {
    id: 'chitu', name: '赤兔马', icon: '🐎', equip: true,
    get: '攻城大胜 / 名将来投',
    effect: '体力上限 +30，每回合多恢复 10',
    apply: () => ({ staminaMax: 30, recover: 10 }),
    desc: '人中吕布，马中赤兔',
  },
  {
    id: 'dilu', name: '的卢', icon: '🐴', equip: true,
    get: '寻访',
    effect: '忠诚 +10',
    apply: () => ({ loyalty: 10 }),
    desc: '檀溪一跃，危难时救主',
  },
  {
    id: 'mengde', name: '孟德新书', icon: '📕', equip: true,
    get: '完成奥数真题',
    effect: '智力 +5，寻访成功率 +10%',
    apply: () => ({ intel: 5, search: 0.10 }),
    desc: '兵贵神速 —— 也贵多做题',
  },
  {
    id: 'yuxi', name: '传国玉玺', icon: '👑', equip: false,
    get: '占领都城级城池',
    effect: '声望 +50',
    use: () => ({ prestige: 50 }),
    desc: '受命于天，既寿永昌（声望高了，劝降和寻访都更顺）',
  },
  {
    id: 'taiping', name: '太平要术', icon: '✨', equip: false,
    get: '贤士献策事件',
    effect: '金币 +200',
    use: () => ({ gold: 200 }),
    desc: '南华老仙所遗',
  },
  {
    id: 'liangcao', name: '粮草袋', icon: '🌾', equip: false,
    get: '丰收屯田事件',
    effect: '粮草 +500',
    use: () => ({ food: 500 }),
    desc: '一袋沉甸甸的军粮',
  },
  {
    id: 'bingshu', name: '兵书残卷', icon: '📗', equip: false,
    get: '每日打卡',
    effect: '兵马 +150',
    use: () => ({ soldier: 150 }),
    desc: '捡到就是赚到',
  },

  /* ---- 稀有武器（武力 / 攻击加成）---- */
  {
    id: 'qinglong', name: '青龙偃月刀', icon: '🗡️', equip: true, cat: 'weapon',
    get: '攻下都城 / 寻访',
    effect: '武力 +12，攻击 +10%',
    apply: () => ({ force: 12, atk: 10 }),
    desc: '关将军的成名之刃，过五关斩六将',
  },
  {
    id: 'yitian', name: '倚天剑', icon: '⚔️', equip: true, cat: 'weapon',
    get: '攻城大胜',
    effect: '武力 +10',
    apply: () => ({ force: 10 }),
    desc: '曹操佩剑，与青釭并称双锋',
  },
  {
    id: 'zhangba', name: '丈八蛇矛', icon: '🔱', equip: true, cat: 'weapon',
    get: '攻下州重镇 / 寻访',
    effect: '武力 +11，攻击 +8%',
    apply: () => ({ force: 11, atk: 8 }),
    desc: '张翼德立马桥上，喝退曹军',
  },
  {
    id: 'fangtian', name: '方天画戟', icon: '🪝', equip: true, cat: 'weapon',
    get: '攻下都城',
    effect: '武力 +13，攻击 +12%',
    apply: () => ({ force: 13, atk: 12 }),
    desc: '吕奉先的招牌兵器，天下无双',
  },
  {
    id: 'shuanggu', name: '雌雄双股剑', icon: '🗡️', equip: true, cat: 'weapon',
    get: '攻下州重镇',
    effect: '武力 +9',
    apply: () => ({ force: 9 }),
    desc: '刘玄德阵战之剑',
  },

  /* ---- 铠甲（忠诚 / 防御加成）---- */
  {
    id: 'qilinjia', name: '麒麟甲', icon: '🛡️', equip: true, cat: 'armor',
    get: '攻下都城 / 寻访',
    effect: '忠诚 +8，守城防御 +15',
    apply: () => ({ loyalty: 8, def: 15 }),
    desc: '披之可安军心，守城如铁桶',
  },
  {
    id: 'xuanjia', name: '玄铁铠', icon: '🥋', equip: true, cat: 'armor',
    get: '攻下州重镇',
    effect: '守城防御 +20，武力 +3',
    apply: () => ({ def: 20, force: 3 }),
    desc: '重甲在身，刀枪难入',
  },
  {
    id: 'mingguang', name: '明光铠', icon: '🦺', equip: true, cat: 'armor',
    get: '攻下州重镇',
    effect: '守城防御 +18，忠诚 +5',
    apply: () => ({ def: 18, loyalty: 5 }),
    desc: '光照如月，护身之宝',
  },

  /* ---- 宝马（体力上限 / 恢复）---- */
  {
    id: 'zhuanghuang', name: '爪黄飞电', icon: '🐎', equip: true, cat: 'horse',
    get: '寻访 / 攻城大胜',
    effect: '体力上限 +25，每回合多恢复 8',
    apply: () => ({ staminaMax: 25, recover: 8 }),
    desc: '曹魏御马，日行千里',
  },
  {
    id: 'jueying', name: '绝影', icon: '🐴', equip: true, cat: 'horse',
    get: '攻下州重镇',
    effect: '体力上限 +20，每回合多恢复 6',
    apply: () => ({ staminaMax: 20, recover: 6 }),
    desc: '宛城陷落，载曹操突围的快马',
  },

  /* ---- 符咒 / 兵书（智力 / 寻访 / 防御）---- */
  {
    id: 'bazhen', name: '八阵图', icon: '🧩', equip: true, cat: 'talisman',
    get: '攻下都城 / 寻访',
    effect: '智力 +10，寻访 +10%，守城防御 +10',
    apply: () => ({ intel: 10, search: 0.10, def: 10 }),
    desc: '武侯奇阵，困敌于无形',
  },
  {
    id: 'qixing', name: '七星灯', icon: '🕯️', equip: true, cat: 'talisman',
    get: '贤士献策事件',
    effect: '智力 +6，每回合多恢复 6',
    apply: () => ({ intel: 6, recover: 6 }),
    desc: '续命之灯，亦助谋略',
  },
  {
    id: 'kongming', name: '孔明羽扇', icon: '🪶', equip: true, cat: 'talisman',
    get: '寻访',
    effect: '智力 +9',
    apply: () => ({ intel: 9 }),
    desc: '羽扇纶巾，谈笑间樯橹灰飞烟灭',
  },

  /* ---- 即开即用 consumable ---- */
  {
    id: 'junling', name: '军令状', icon: '📜', equip: false,
    get: '完成奥数真题 / 攻城',
    effect: '兵马 +300',
    use: () => ({ soldier: 300 }),
    desc: '立状为凭，士气大振',
  },
  {
    id: 'jinyin', name: '金银珠宝', icon: '💰', equip: false,
    get: '商队纳贡 / 攻城',
    effect: '金币 +300',
    use: () => ({ gold: 300 }),
    desc: '搜刮所得，充作军资',
  },
  {
    id: 'shangyao', name: '金疮药', icon: '🧪', equip: false,
    get: '丰收屯田事件',
    effect: '兵马 +200',
    use: () => ({ soldier: 200 }),
    desc: '疗伤续命，补充兵员',
  },
  {
    id: 'xiandan', name: '仙丹', icon: '🔮', equip: false,
    get: '南华老仙事件',
    effect: '声望 +30',
    use: () => ({ prestige: 30 }),
    desc: '服之可延誉于天下',
  },
];
export const ITEM_MAP = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** 宝物掉落的来源权重表 */
export const ITEM_DROPS = {
  search: ['bingfa', 'dilu', 'qinggang', 'qinglong', 'yitian', 'qilinjia', 'zhuanghuang', 'bazhen', 'mengde', 'kongming', 'zhangba'],
  paper: ['mengde'],
  winS: ['yuxi', 'chitu', 'qinglong', 'fangtian', 'qilinjia', 'bazhen', 'yitian'],
  winA: ['qinggang', 'bingfa', 'xuanjia', 'mingguang', 'zhangba', 'kongming', 'jueying'],
  hero: ['chitu', 'bingfa', 'zhuanghuang'],
};

/* ============================================================
 * 四、随机事件
 * ========================================================== */
export const EVENTS = [
  { id: 'wise', name: '贤士献策', icon: '🎓', text: '错题复盘做得很好，先生献上一计。', effect: { gold: 40 } },
  { id: 'harvest', name: '丰收屯田', icon: '🌾', text: '本周连续打卡 5 天，田间大熟。', effect: { food: 200 } },
  { id: 'famine', name: '粮草灾荒', icon: '🌧️', text: '连续两天未完成任务，仓廪见底。', effect: { food: -120 } },
  { id: 'hero', name: '名将来投', icon: '⭐', text: '完成奥数难点突破，一名在野武将主动来投！', effect: { general: 1 } },
  { id: 'challenge', name: '敌将挑战', icon: '⚔️', text: '敌方派人挑衅：完成一套真题即可击退，并获额外犒赏。', effect: { buff: 'challenge' } },
  { id: 'donate', name: '商队纳贡', icon: '💰', text: '途经商队仰慕你的名声，献上金币。', effect: { gold: 60 } },
  { id: 'meteor', name: '将星现世', icon: '🌠', text: '夜有将星坠于营中，拾得将星碎片。', effect: { shards: 1 } },
  { id: 'desert', name: '士卒思归', icon: '😟', text: '久未犒赏，部分士卒开了小差。', effect: { soldier: -60 } },
];

/* ============================================================
 * 五、数值规则(调平衡就改这里)
 * ========================================================== */
export const RULES = {
  /** 每回合每名士兵消耗粮草 */
  FOOD_PER_SOLDIER: 0.08,
  /** 粮草不足时，士兵逃散比例 */
  STARVE_LOSE: 0.20,

  /** 无主城池的初始守军 */
  NEUTRAL_GARRISON: { S: 800, A: 550, B: 380, C: 250 },
  /** 势力开局城池的守军 = 无主守军 × 这个系数 */
  START_GARRISON_MUL: 1.4,
  /** 单城兵马上限(也决定全国可征兵总量) */
  GARRISON_CAP: { S: 4000, A: 2600, B: 1600, C: 1000 },

  /** 每城每回合产出(屯田每级 +FARM_BONUS) */
  CITY_OUTPUT: {
    S: { food: 90, gold: 30 },
    A: { food: 60, gold: 20 },
    B: { food: 40, gold: 12 },
    C: { food: 25, gold: 8 },
  },

  /** 屯田：消耗金币，粮草产出 +25%/级 */
  FARM_COST: 100,
  FARM_BONUS: 0.25,
  FARM_MAX: 5,

  /** 征兵：1 粮草 = 1 兵马 */
  RECRUIT_PER_FOOD: 1,
  /** 每回合每城最多征兵 */
  RECRUIT_MAX_PER_TURN: 600,

  /** 守备加固 */
  DEF_UP_COST: 120,
  DEF_UP_GAIN: 60,
  /** 城防上限 = 基础城防 × 这个倍数 */
  DEF_CAP_MUL: 2.0,

  /** 寻访武将 */
  SEARCH_COST: 150,
  SEARCH_BASE: 0.30,

  /** 俘虏劝降 */
  PERSUADE_COST: 100,
  PERSUADE_BASE: 0.20,
  PERSUADE_TRY_BONUS: 0.08,
  /** 劝降时每投入 100 金，成功率 +5%（上限 +40%） */
  PERSUADE_INVEST_BONUS: 0.05,
  PERSUADE_INVEST_CAP: 0.40,
  /** 释放俘虏获得的声望 */
  RELEASE_PRESTIGE: 12,

  /** 安抚武将：+忠诚 */
  COMFORT_COST: 60,
  COMFORT_GAIN: 8,

  /** 体力 */
  STAMINA_MAX: 100,
  STAMINA_COST: 30,
  STAMINA_RECOVER: 40,

  /** 忠诚 */
  LOYALTY_REVOLT: 40,
  REVOLT_CHANCE: 0.06,

  /** 战斗 */
  FORCE_FACTOR: 150,      // 战力 = 兵马 × (1 + 武力 / 150)
  DEFENSE_FACTOR: 1.5,    // 守方额外 = 城防 × 1.5
  WIN_LOSS_MIN: 0.15,     // 攻方胜：最少损失比例
  LOSE_LOSS_MAX: 0.90,    // 攻方败：最多损失比例
  CAPTURE_CHANCE: 0.60,   // 攻方胜，俘虏守将的概率（其余 40% 守将突围逃往他城）
  CAPTURED_CHANCE: 0.25,  // 攻方败，主将被俘概率

  /** 武将培养 */
  TRAIN_GAIN: 2,

  /** 随机事件概率 */
  EVENT_CHANCE: 0.35,

  /** 同盟 */
  ALLY_COST: 400,
  ALLY_TURNS: 5,

  /** AI 每回合行动强度（调小 = 压力更小，孩子追得上） */
  AI_RECRUIT_RATE: 0.35,
  AI_ATTACK_RATIO: 1.25,   // AI 战力达到守方 1.25 倍才攻城
  AI_ATTACK_CHANCE: 0.5,   // 每个 AI 势力每回合的出兵概率

  /** 调兵：在我方城池间转移兵马，每兵消耗粮草 */
  TRANSFER_FOOD_PER: 0.25,

  /** 赏赐武将（提升忠诚） */
  REWARD_COST: 80,
  REWARD_GAIN: 12,

  /** 行军伏击 */
  AMBUSH_CHANCE: 0.28,     // 出征遭遇伏击概率
  AMBUSH_RELIEF: 0.35,     // 答对题目：折损减少比例
  AMBUSH_PENALTY: 0.15,    // 答错：额外折损比例

  /** 连续打卡 30 天的屯田 buff（乘在 farm 产出上） */
  STREAK30_FARM_BUFF: 0.20,
};

/** 家长后台配置（任务自定义 / 难度调节）存这里 */
export const CONFIG_KEY = 'sanguo-study-config-v1';
/** 家长后台默认密码（可在后台修改） */
export const ADMIN_DEFAULT_PASSWORD = '2024';

export const SAVE_KEY = 'sanguo-study-save-v1';
