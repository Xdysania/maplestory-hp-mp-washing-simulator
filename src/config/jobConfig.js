/**
 * @typedef {'warrior' | 'buccaneer' | 'corsair' | 'archer' | 'thief' | 'magician'} JobId
 */

/** @type {Record<JobId, { label: string; mainStat: string; group: string }>} */
export const JOB_OPTIONS = {
  warrior: { label: '战士 (Warrior)', mainStat: 'STR', group: 'warrior' },
  magician: { label: '法师 (Magician)', mainStat: 'INT', group: 'magician' },
  buccaneer: { label: '海盗 · 拳手 (Buccaneer)', mainStat: 'STR', group: 'pirate' },
  corsair: { label: '海盗 · 船长 (Corsair)', mainStat: 'DEX', group: 'pirate' },
  archer: { label: '弓手 (Archer)', mainStat: 'DEX', group: 'bowman' },
  thief: { label: '飞侠 (Thief)', mainStat: 'LUK', group: 'thief' },
};

/** 每张洗点卡(APR)消耗 NX */
export const APR_NX_COST = 3500;

/** 洗血模拟角色基础 HP 上限（不含装备） */
export const MAX_HP = 30000;

/** 法师优先堆蓝的 MP 上限（蓝满后再把蓝洗成血） */
export const MAX_MP = 30000;

/**
 * 可勾选的加血装备
 * @type {Record<string, { label: string; hp: number }>}
 */
export const HP_EQUIPMENT_OPTIONS = {
  t10Ring: { label: 'T10 戒指', hp: 1000 },
  butterflyRing: { label: '蝴蝶戒指', hp: 250 },
  monNecklace: { label: 'Mon 项链', hp: 300 },
};

/**
 * @typedef {Object} HpEquipmentFlags
 * @property {boolean} t10Ring
 * @property {boolean} butterflyRing
 * @property {boolean} monNecklace
 */

/**
 * 计算装备提供的 HP
 * @param {HpEquipmentFlags} equipment
 * @returns {number}
 */
export function getEquipmentHpBonus(equipment) {
  let bonus = 0;
  if (equipment?.t10Ring) bonus += HP_EQUIPMENT_OPTIONS.t10Ring.hp;
  if (equipment?.butterflyRing) bonus += HP_EQUIPMENT_OPTIONS.butterflyRing.hp;
  if (equipment?.monNecklace) bonus += HP_EQUIPMENT_OPTIONS.monNecklace.hp;
  return bonus;
}

/**
 * 洗血目标基础 HP = 面板目标 30,000 − 装备加血（装备越多，需洗越少，节约 NX）
 * @param {number} [equipmentHp=0]
 * @returns {number}
 */
export function getWashTargetHp(equipmentHp = 0) {
  return Math.max(1, MAX_HP - equipmentHp);
}

/** 每次升级获得的新鲜 AP 数量 */
export const FRESH_AP_PER_LEVEL = 5;

/** 单项属性的最低值 */
export const MIN_STAT = 4;

/**
 * @typedef {'str' | 'dex' | 'int' | 'luk'} StatKey
 */

/**
 * @typedef {Object} BaseStats
 * @property {number} str
 * @property {number} dex
 * @property {number} int
 * @property {number} luk
 */

/**
 * 各职业默认目标智力
 * @type {Record<JobId, number>}
 */
export const DEFAULT_TARGET_INT = {
  warrior: 100,
  magician: 120,
  buccaneer: 280,
  corsair: 460,
  archer: 440,
  thief: 440,
};

/**
 * 各职业升级 AP 分配优先级
 * @type {Record<JobId, { prereqStat: StatKey | null; prereqTarget: number }>}
 */
export const AP_ALLOCATION_RULES = {
  warrior: { prereqStat: 'str', prereqTarget: 35 },
  magician: { prereqStat: null, prereqTarget: 0 },
  buccaneer: { prereqStat: 'dex', prereqTarget: 20 },
  corsair: { prereqStat: 'dex', prereqTarget: 20 },
  archer: { prereqStat: 'dex', prereqTarget: 25 },
  thief: { prereqStat: 'dex', prereqTarget: 25 },
};

/** 通用 1 级默认四属性 */
export const DEFAULT_BASE_STATS = { str: 4, dex: 4, int: 4, luk: 4 };

/**
 * 各职业初始四属性默认值
 * @type {Record<JobId, BaseStats>}
 */
export const DEFAULT_BASE_STATS_BY_JOB = {
  warrior: { str: 5, dex: 5, int: 10, luk: 5 },
  magician: { str: 4, dex: 4, int: 12, luk: 4 },
  buccaneer: { str: 4, dex: 4, int: 4, luk: 4 },
  corsair: { str: 4, dex: 4, int: 4, luk: 4 },
  archer: { str: 4, dex: 4, int: 4, luk: 4 },
  thief: { str: 4, dex: 4, int: 4, luk: 4 },
};

/**
 * 获取职业默认初始四属性
 * @param {JobId} job
 * @returns {BaseStats}
 */
export function getDefaultBaseStats(job) {
  return { ...DEFAULT_BASE_STATS_BY_JOB[job] };
}

/**
 * 是否为战士
 * @param {JobId} job
 * @returns {boolean}
 */
export function isWarriorClass(job) {
  return job === 'warrior';
}

/**
 * 是否为法师
 * @param {JobId} job
 * @returns {boolean}
 */
export function isMagicianClass(job) {
  return job === 'magician';
}

/**
 * 各职业 1 级初始 HP/MP（模拟起点）
 * @type {Record<JobId, { hp: number; mp: number }>}
 */
export const INITIAL_STATS = {
  warrior: { hp: 50, mp: 4 },
  // 法师二转后 Min MP = 22L+449，1 级起点至少满足底线
  magician: { hp: 50, mp: 471 },
  buccaneer: { hp: 50, mp: 18 },
  corsair: { hp: 50, mp: 18 },
  archer: { hp: 50, mp: 14 },
  thief: { hp: 50, mp: 14 },
};

/**
 * 扩蓝时 AP 加到 MP 的基础获得量（不含智力加成）
 * 法师为区间均值占位；实际取值见 getMpWashGain 内随机 18~19
 * @type {Record<JobId, number>}
 */
export const MP_WASH_BASE_GAIN = {
  warrior: 4,
  magician: 18,
  buccaneer: 14,
  corsair: 14,
  archer: 10,
  thief: 10,
};

/**
 * 使用 APR 从 MP 退点时扣除的 MP 固定值
 * @type {Record<JobId, number>}
 */
export const APR_MP_DEDUCTION = {
  warrior: 4,
  magician: 30,
  buccaneer: 16,
  corsair: 16,
  archer: 12,
  thief: 12,
};

/**
 * 使用 APR 从 HP 退点时扣除的 HP（法师 15；其他职业当前模拟未使用）
 * @type {Record<JobId, number>}
 */
export const APR_HP_DEDUCTION = {
  warrior: 0,
  magician: 15,
  buccaneer: 0,
  corsair: 0,
  archer: 0,
  thief: 0,
};

/**
 * 升级洗血 (Fresh HP Wash) 随机 HP 区间 [min, max]
 * 对照表：战士 50~54 / 法师 6~10 / 弓飞 16~20 / 船长拳手 36~40
 * @type {Record<JobId, [number, number]>}
 */
export const FRESH_HP_WASH_RANGE = {
  warrior: [50, 54],
  magician: [6, 10],
  buccaneer: [36, 40],
  corsair: [36, 40],
  archer: [16, 20],
  thief: [16, 20],
};

/**
 * 重置洗血 (Stale HP Wash) 固定 HP 收益
 * 对照表：战士 20 / 法师 6 / 弓飞 16 / 海盗 18
 * @type {Record<JobId, number>}
 */
export const STALE_HP_WASH_GAIN = {
  warrior: 20,
  magician: 6,
  buccaneer: 18,
  corsair: 18,
  archer: 16,
  thief: 16,
};

/**
 * 获取指定等级升级时的 HP 基础自然增长区间（不含生命强化额外加成）
 * @param {JobId} job
 * @param {number} level 升级后的目标等级
 * @returns {[number, number]}
 */
export function getHpGrowthRange(job, level) {
  if (job === 'magician') {
    return [10, 14];
  }

  if (level <= 10) {
    return [12, 16];
  }

  switch (job) {
    case 'warrior':
      // 满级生命强化后合计 64~68，基础部分 34~38
      return [34, 38];
    case 'buccaneer':
      // 二转后满强化合计 52~58，基础部分 22~28
      return [22, 28];
    case 'corsair':
      return [22, 28];
    case 'archer':
    case 'thief':
      return [20, 24];
    default:
      return [12, 16];
  }
}

/**
 * 获取 MP 自然增长区间（不含智力/技能加成）
 * @param {JobId} job
 * @returns {[number, number]}
 */
export function getMpGrowthRange(job) {
  if (job === 'magician') {
    return [22, 24];
  }
  if (job === 'warrior') {
    return [4, 6];
  }
  if (job === 'archer' || job === 'thief') {
    return [14, 16];
  }
  return [18, 23];
}

/**
 * 计算等级 HP 底线（法师：等级×10+2；其他职业当前不限制）
 * @param {JobId} job
 * @param {number} level
 * @returns {number}
 */
export function getMinHp(job, level) {
  if (job === 'magician') {
    return 10 * level + 2;
  }
  return 0;
}

/**
 * 计算等级 MP 底线
 * @param {JobId} job
 * @param {number} level
 * @returns {number}
 */
export function getMinMp(job, level) {
  // 二转后 Min MP（对照表）
  if (job === 'magician') {
    return 22 * level + 449;
  }
  if (job === 'warrior') {
    return 4 * level + 55;
  }
  if (job === 'archer' || job === 'thief') {
    return 14 * level + 135;
  }
  // 船长 / 拳手
  return 18 * level + 95;
}

/** @typedef {0 | 10 | 20 | 30} MwLevel */

/** Maple Warrior 选项 */
export const MW_OPTIONS = [
  { value: 0, label: '无 MW' },
  { value: 10, label: 'MW Lv.10（+5% 面板 INT）' },
  { value: 20, label: 'MW Lv.20（+10% 面板 INT）' },
  { value: 30, label: 'MW Lv.30（+13% 面板 INT）' },
];

/**
 * 获取当前等级下 MW 对面板 INT 的加成比例
 * @param {number} characterLevel
 * @param {MwLevel} mwLevel
 * @param {number} mwStartLevel 开始享受 MW 加成的角色等级（7~199）
 * @returns {number}
 */
export function getMwBonusPercent(characterLevel, mwLevel, mwStartLevel) {
  if (!mwLevel || characterLevel < mwStartLevel) {
    return 0;
  }
  if (mwLevel >= 30) {
    return 0.13;
  }
  if (mwLevel >= 20) {
    return 0.1;
  }
  return 0.05;
}

/**
 * MW 加成后的有效面板 INT（不含装备）
 * @param {number} panelInt
 * @param {number} characterLevel
 * @param {MwLevel} mwLevel
 * @param {number} mwStartLevel
 * @returns {number}
 */
export function getEffectiveBaseInt(panelInt, characterLevel, mwLevel, mwStartLevel) {
  const bonus = getMwBonusPercent(characterLevel, mwLevel, mwStartLevel);
  return Math.floor(panelInt * (1 + bonus));
}

/**
 * 升级时智力额外 MP 加成（MW 加成后面板 INT + 装备 INT）
 * @param {number} panelInt
 * @param {number} equipInt
 * @param {number} characterLevel
 * @param {MwLevel} mwLevel
 * @param {number} mwStartLevel
 * @returns {number}
 */
export function getLevelUpIntMpBonus(panelInt, equipInt, characterLevel, mwLevel, mwStartLevel) {
  const effectiveBase = getEffectiveBaseInt(panelInt, characterLevel, mwLevel, mwStartLevel);
  return Math.floor((effectiveBase + equipInt) / 10);
}

/**
 * 扩蓝时智力额外 MP 加成（仅面板基础 INT，不含 MW、不含装备）
 * 法师不加 -2；物理职业保持 floor(INT/10)-2
 * @param {JobId} job
 * @param {number} panelInt
 * @returns {number}
 */
export function getMpWashIntBonus(job, panelInt) {
  const intBonus = Math.floor(panelInt / 10);
  if (job === 'magician') {
    return intBonus;
  }
  return intBonus - 2;
}

/**
 * 计算扩蓝单次获得的 MP
 * 法师：18~19 + floor(INT/10)；其他：固定基础 + floor(INT/10)-2
 * @param {JobId} job
 * @param {number} panelInt
 * @param {number} [_characterLevel]
 * @param {MwLevel} [_mwLevel]
 * @param {number} [_mwStartLevel]
 * @returns {number}
 */
export function getMpWashGain(job, panelInt, _characterLevel, _mwLevel, _mwStartLevel) {
  const base =
    job === 'magician' ? randomInt(18, 19) : MP_WASH_BASE_GAIN[job];
  return base + getMpWashIntBonus(job, panelInt);
}

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 分配升级获得的 AP：先补前置属性，再补智力至目标，剩余加主属性。
 * 出山后（graduated=true）不再补智力，全部加主属性。
 * dumpToMain=false 时剩余 AP 不落主属性，由调用方决定是否洗血。
 * @param {BaseStats & Record<string, number>} state
 * @param {JobId} job
 * @param {number} targetInt
 * @param {number} [apCount=5]
 * @param {boolean} [graduated=false]
 * @param {boolean} [dumpToMain=true]
 * @returns {{ str: number; dex: number; int: number; luk: number; overflow: number }}
 */
export function allocateLevelUpAp(
  state,
  job,
  targetInt,
  apCount = FRESH_AP_PER_LEVEL,
  graduated = false,
  dumpToMain = true,
) {
  /** @type {{ str: number; dex: number; int: number; luk: number }} */
  const allocated = { str: 0, dex: 0, int: 0, luk: 0 };
  let remaining = apCount;
  const rule = AP_ALLOCATION_RULES[job];
  const mainStat = /** @type {StatKey} */ (JOB_OPTIONS[job].mainStat.toLowerCase());

  if (!graduated && rule.prereqStat && rule.prereqTarget > 0) {
    const statKey = rule.prereqStat;
    const need = Math.max(0, rule.prereqTarget - state[statKey]);
    const add = Math.min(remaining, need);
    state[statKey] += add;
    allocated[statKey] += add;
    remaining -= add;
  }

  if (!graduated && remaining > 0 && state.int < targetInt) {
    const need = targetInt - state.int;
    const add = Math.min(remaining, need);
    state.int += add;
    allocated.int += add;
    remaining -= add;
  }

  if (dumpToMain && remaining > 0) {
    state[mainStat] += remaining;
    allocated[mainStat] += remaining;
    remaining = 0;
  }

  return { ...allocated, overflow: remaining };
}

/**
 * 格式化 AP 分配结果为可读文本
 * @param {{ str: number; dex: number; int: number; luk: number; overflow?: number }} allocated
 * @returns {string}
 */
export function formatApAllocation(allocated) {
  const parts = /** @type {string[]} */ ([]);

  if (allocated.str > 0) parts.push(`STR+${allocated.str}`);
  if (allocated.dex > 0) parts.push(`DEX+${allocated.dex}`);
  if (allocated.int > 0) parts.push(`INT+${allocated.int}`);
  if (allocated.luk > 0) parts.push(`LUK+${allocated.luk}`);

  return parts.length > 0 ? parts.join(' ') : '无分配';
}
