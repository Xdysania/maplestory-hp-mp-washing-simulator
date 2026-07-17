/**
 * @typedef {import('./jobConfig.js').JobId} JobId
 */

/** 生命强化最高等级 */
export const LIFE_ENHANCEMENT_MAX = 10;

/** 生命强化每级额外 HP（升级 / 洗血均适用） */
export const LIFE_ENHANCEMENT_HP_PER_LEVEL = 3;

/** 生命强化解锁所需生命恢复等级 */
export const LIFE_RECOVERY_UNLOCK = 5;

/** 法师魔力强化最高等级 */
export const MAGIC_BOOST_MAX = 10;

/** 魔力强化每级额外升级 MP */
export const MAGIC_BOOST_MP_PER_LEVEL = 1;

/**
 * @typedef {Object} SkillState
 * @property {number} lifeRecovery
 * @property {number} lifeEnhancement
 * @property {number} magicBoost
 */

/**
 * @typedef {Object} SkillAllocationResult
 * @property {SkillState} skills
 * @property {string} description
 */

/**
 * 战士 10~15 级 SP 优先加点（生命恢复 → 生命强化）
 * @type {Record<number, { lifeRecovery?: number; lifeEnhancement?: number; magicBoost?: number }>}
 */
export const WARRIOR_SP_SCHEDULE = {
  10: { lifeRecovery: 1 },
  11: { lifeRecovery: 3 },
  12: { lifeRecovery: 1, lifeEnhancement: 2 },
  13: { lifeEnhancement: 3 },
  14: { lifeEnhancement: 3 },
  15: { lifeEnhancement: 2 },
};

/**
 * 拳手 30~33 级 SP 优先加满生命强化
 * @type {Record<number, { lifeEnhancement: number }>}
 */
export const BUCCANEER_SP_SCHEDULE = {
  30: { lifeEnhancement: 1 },
  31: { lifeEnhancement: 3 },
  32: { lifeEnhancement: 3 },
  33: { lifeEnhancement: 3 },
};

/**
 * 法师 8~12 级 SP 优先加满魔力强化（Improved Max MP）
 * @type {Record<number, { magicBoost: number }>}
 */
export const MAGICIAN_SP_SCHEDULE = {
  8: { magicBoost: 1 },
  9: { magicBoost: 3 },
  10: { magicBoost: 3 },
  11: { magicBoost: 3 },
};

/**
 * 判断职业是否拥有生命强化技能
 * @param {JobId} job
 * @returns {boolean}
 */
export function hasLifeEnhancement(job) {
  return job === 'warrior' || job === 'buccaneer';
}

/**
 * 判断职业是否拥有魔力强化技能
 * @param {JobId} job
 * @returns {boolean}
 */
export function hasMagicBoost(job) {
  return job === 'magician';
}

/**
 * 计算生命强化提供的额外 HP
 * @param {JobId} job
 * @param {number} enhancementLevel
 * @returns {number}
 */
export function getLifeEnhancementHpBonus(job, enhancementLevel) {
  if (!hasLifeEnhancement(job) || enhancementLevel <= 0) {
    return 0;
  }
  return enhancementLevel * LIFE_ENHANCEMENT_HP_PER_LEVEL;
}

/**
 * 计算魔力强化提供的额外升级 MP
 * @param {JobId} job
 * @param {number} magicBoostLevel
 * @returns {number}
 */
export function getMagicBoostMpBonus(job, magicBoostLevel) {
  if (!hasMagicBoost(job) || magicBoostLevel <= 0) {
    return 0;
  }
  return magicBoostLevel * MAGIC_BOOST_MP_PER_LEVEL;
}

/**
 * 获取指定等级 SP 加点计划
 * @param {JobId} job
 * @param {number} level
 * @returns {{ lifeRecovery?: number; lifeEnhancement?: number; magicBoost?: number } | null}
 */
function getSpScheduleForLevel(job, level) {
  if (job === 'warrior') {
    return WARRIOR_SP_SCHEDULE[level] ?? null;
  }
  if (job === 'buccaneer') {
    return BUCCANEER_SP_SCHEDULE[level] ?? null;
  }
  if (job === 'magician') {
    return MAGICIAN_SP_SCHEDULE[level] ?? null;
  }
  return null;
}

/**
 * 按优先级分配当级 SP（生命强化 / 魔力强化优先）
 * @param {SkillState} skills
 * @param {JobId} job
 * @param {number} level
 * @returns {SkillAllocationResult}
 */
export function allocateSkillPoints(skills, job, level) {
  const schedule = getSpScheduleForLevel(job, level);
  if (!schedule) {
    return { skills, description: '' };
  }

  const next = {
    lifeRecovery: skills.lifeRecovery,
    lifeEnhancement: skills.lifeEnhancement,
    magicBoost: skills.magicBoost ?? 0,
  };
  const parts = /** @type {string[]} */ ([]);

  if (schedule.lifeRecovery) {
    next.lifeRecovery = Math.min(
      LIFE_RECOVERY_UNLOCK,
      next.lifeRecovery + schedule.lifeRecovery,
    );
    parts.push(`生命恢复+${schedule.lifeRecovery}(Lv${next.lifeRecovery})`);
  }

  if (schedule.lifeEnhancement) {
    next.lifeEnhancement = Math.min(
      LIFE_ENHANCEMENT_MAX,
      next.lifeEnhancement + schedule.lifeEnhancement,
    );
    parts.push(`生命强化+${schedule.lifeEnhancement}(Lv${next.lifeEnhancement})`);
  }

  if (schedule.magicBoost) {
    next.magicBoost = Math.min(
      MAGIC_BOOST_MAX,
      next.magicBoost + schedule.magicBoost,
    );
    parts.push(`魔力强化+${schedule.magicBoost}(Lv${next.magicBoost})`);
  }

  return {
    skills: next,
    description: parts.length > 0 ? `SP: ${parts.join(' ')}` : '',
  };
}

/**
 * 格式化 HP 增长明细
 * @param {number} baseHp
 * @param {number} skillBonus
 * @returns {string}
 */
export function formatHpGainDetail(baseHp, skillBonus) {
  if (skillBonus <= 0) {
    return `HP+${baseHp}`;
  }
  return `HP+${baseHp + skillBonus}(基础+${baseHp} 生命强化+${skillBonus})`;
}
