/**
 * @typedef {'warrior' | 'darkKnight' | 'buccaneer' | 'corsair' | 'archer' | 'thief'} JobId
 */

/** @type {Record<JobId, { label: string; mainStat: string; group: string }>} */
export const JOB_OPTIONS = {
  warrior: { label: '战士 (Warrior)', mainStat: 'STR', group: 'warrior' },
  darkKnight: { label: '黑骑士 (Dark Knight)', mainStat: 'STR', group: 'warrior' },
  buccaneer: { label: '海盗 · 拳手 (Buccaneer)', mainStat: 'STR', group: 'pirate' },
  corsair: { label: '海盗 · 船长 (Corsair)', mainStat: 'DEX', group: 'pirate' },
  archer: { label: '弓手 (Archer)', mainStat: 'DEX', group: 'bowman' },
  thief: { label: '飞侠 (Thief)', mainStat: 'LUK', group: 'thief' },
};

/** 每张洗点卡(APR)消耗 NX */
export const APR_NX_COST = 3500;

/** 每次升级获得的新鲜 AP 数量 */
export const FRESH_AP_PER_LEVEL = 5;

/**
 * 各职业 1 级初始 HP/MP（模拟起点）
 * @type {Record<JobId, { hp: number; mp: number }>}
 */
export const INITIAL_STATS = {
  warrior: { hp: 50, mp: 4 },
  darkKnight: { hp: 50, mp: 4 },
  buccaneer: { hp: 50, mp: 18 },
  corsair: { hp: 50, mp: 18 },
  archer: { hp: 50, mp: 14 },
  thief: { hp: 50, mp: 14 },
};

/**
 * 扩蓝时 AP 加到 MP 的基础获得量（不含智力加成）
 * @type {Record<JobId, number>}
 */
export const MP_WASH_BASE_GAIN = {
  warrior: 4,
  darkKnight: 4,
  buccaneer: 14,
  corsair: 14,
  archer: 10,
  thief: 10,
};

/**
 * 使用 APR 时扣除的 MP 固定值
 * @type {Record<JobId, number>}
 */
export const APR_MP_DEDUCTION = {
  warrior: 4,
  darkKnight: 4,
  buccaneer: 16,
  corsair: 16,
  archer: 12,
  thief: 12,
};

/**
 * 升级洗血 (Fresh HP Wash) 随机 HP 区间 [min, max]
 * @type {Record<JobId, [number, number]>}
 */
export const FRESH_HP_WASH_RANGE = {
  warrior: [50, 54],
  darkKnight: [50, 54],
  buccaneer: [36, 40],
  corsair: [16, 20],
  archer: [16, 20],
  thief: [16, 20],
};

/**
 * 重置洗血 (Stale HP Wash) 固定 HP 收益
 * @type {Record<JobId, number>}
 */
export const STALE_HP_WASH_GAIN = {
  warrior: 20,
  darkKnight: 20,
  buccaneer: 18,
  corsair: 18,
  archer: 16,
  thief: 16,
};

/**
 * 获取指定等级升级时的 HP 自然增长区间
 * @param {JobId} job
 * @param {number} level 升级后的目标等级
 * @returns {[number, number]}
 */
export function getHpGrowthRange(job, level) {
  if (level <= 10) {
    return [12, 16];
  }

  switch (job) {
    case 'warrior':
    case 'darkKnight':
      return [64, 68];
    case 'buccaneer':
      return level <= 30 ? [22, 28] : [52, 58];
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
 * 获取 MP 自然增长区间
 * @param {JobId} job
 * @returns {[number, number]}
 */
export function getMpGrowthRange(job) {
  if (job === 'warrior' || job === 'darkKnight') {
    return [4, 6];
  }
  if (job === 'archer' || job === 'thief') {
    return [14, 16];
  }
  return [18, 23];
}

/**
 * 计算等级 MP 底线
 * @param {JobId} job
 * @param {number} level
 * @returns {number}
 */
export function getMinMp(job, level) {
  if (job === 'darkKnight') {
    return 4 * level + 155;
  }
  if (job === 'warrior') {
    return 4 * level + 55;
  }
  if (job === 'archer' || job === 'thief') {
    return 14 * level + 135;
  }
  return 18 * level + 95;
}

/**
 * 升级时智力额外 MP 加成（面板基础 INT + 装备 INT）
 * @param {number} baseInt
 * @param {number} equipInt
 * @returns {number}
 */
export function getLevelUpIntMpBonus(baseInt, equipInt) {
  return Math.floor((baseInt + equipInt) / 10);
}

/**
 * 扩蓝时智力额外 MP 加成（仅面板基础 INT，不含装备）
 * @param {number} baseInt
 * @returns {number}
 */
export function getMpWashIntBonus(baseInt) {
  return Math.floor(baseInt / 10) - 2;
}

/**
 * 计算扩蓝单次获得的 MP
 * @param {JobId} job
 * @param {number} baseInt
 * @returns {number}
 */
export function getMpWashGain(job, baseInt) {
  return MP_WASH_BASE_GAIN[job] + getMpWashIntBonus(baseInt);
}

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
