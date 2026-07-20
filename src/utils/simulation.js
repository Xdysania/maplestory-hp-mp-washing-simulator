import {
  APR_NX_COST,
  getDefaultTargetInt,
  isDefaultAllIntStrategy,
  FRESH_AP_PER_LEVEL,
  INITIAL_STATS,
  APR_MP_DEDUCTION,
  FRESH_HP_WASH_RANGE,
  STALE_HP_WASH_GAIN,
  JOB_OPTIONS,
  MAX_HP,
  MAX_MP,
  MIN_STAT,
  getEquipmentHpBonus,
  getWashTargetHp,
  getHpGrowthRange,
  getMpGrowthRange,
  getMinMp,
  getLevelUpIntMpBonus,
  getMpWashGain,
  getEquipIntAtLevel,
  getMwBonusPercent,
  randomInt,
  allocateLevelUpAp,
  formatApAllocation,
  isMagicianClass,
} from '../config/jobConfig.js';
import {
  allocateSkillPoints,
  formatHpGainDetail,
  getLifeEnhancementHpBonus,
  getMagicBoostMpBonus,
} from '../config/skillConfig.js';

/**
 * @typedef {import('../config/jobConfig.js').JobId} JobId
 * @typedef {import('../config/jobConfig.js').BaseStats} BaseStats
 * @typedef {import('../config/jobConfig.js').HpEquipmentFlags} HpEquipmentFlags
 * @typedef {import('../config/skillConfig.js').SkillState} SkillState
 */

/**
 * @typedef {Object} SimulationParams
 * @property {JobId} job
 * @property {BaseStats} baseStats
 * @property {number} targetInt
 * @property {import('../config/jobConfig.js').EquipIntBonus[]} [equipIntBonuses] 按等级生效的装备智力列表
 * @property {number} [equipInt] 兼容旧参数：固定装备智力（等价于 1 级起生效）
 * @property {number} targetLevel
 * @property {number} mwStartLevel
 * @property {import('../config/jobConfig.js').MwLevel} mwLevel
 * @property {number} [reserveMp]
 * @property {HpEquipmentFlags} [hpEquipment]
 * @property {boolean} [noActiveMpExpand] 蓝不足时不主动扩蓝，等待自然增长
 */

/**
 * @typedef {Object} OperationSegment
 * @property {string} text 操作摘要文案
 * @property {string[]} [details] 悬浮查看的逐次明细
 */

/**
 * @typedef {Object} LevelRecord
 * @property {number} level
 * @property {number} hpGain
 * @property {number} mpGain
 * @property {string} operation
 * @property {OperationSegment[]} [operationSegments]
 * @property {boolean} warning
 * @property {string} [warningMessage]
 * @property {number} hp
 * @property {number} mp
 * @property {number} str
 * @property {number} dex
 * @property {number} int
 * @property {number} luk
 * @property {number} lifeEnhancement
 * @property {number} magicBoost
 * @property {number} minMp
 * @property {number} totalApr
 * @property {number} totalNx
 */

/**
 * @typedef {Object} SimulationResult
 * @property {LevelRecord[]} records
 * @property {number} finalHp
 * @property {number} finalBaseHp
 * @property {number} equipmentHp
 * @property {number} washTargetHp
 * @property {number} finalMp
 * @property {number} projectedMpAt200
 * @property {number} optimalTargetInt
 * @property {BaseStats} finalStats
 * @property {number} finalLifeEnhancement
 * @property {number} finalMagicBoost
 * @property {number} [peakMp] 模拟过程中达到的最高 MP（法师扩蓝用）
 * @property {number | null} [mpCapLevel] 首次达到 MP 上限的等级
 * @property {number} totalApr
 * @property {number} totalNx
 * @property {number | null} graduationLevel 出山等级（副属性洗回主属性）
 * @property {boolean} hasWarning
 * @property {string[]} validationErrors
 * @property {number} [optimalTargetInt]
 * @property {number | null} [defaultTargetInt] 职业默认目标 INT；法师为 null（全加 INT）
 * @property {boolean} [defaultAllInt] 默认方案是否为「AP 全加 INT」（法师）
 * @property {SimulationResult} [defaultPlan] 按职业默认策略跑出的方案
 * @property {number | null} [optimizationTargetMp]
 * @property {boolean} [optimizationFeasible]
 */

/**
 * @typedef {Object} SimState
 * @property {number} hp
 * @property {number} mp
 * @property {number} apr
 * @property {number} str
 * @property {number} dex
 * @property {number} int
 * @property {number} luk
 * @property {SkillState} skills
 */

/**
 * 校验 MP 是否满足底线与预留值
 * @param {number} mp
 * @param {number} level
 * @param {JobId} job
 * @param {number} reserveMp
 * @returns {{ ok: boolean; minMp: number }}
 */
function checkMpConstraint(mp, level, job, reserveMp) {
  const minMp = getMinMp(job, level);
  const effectiveMin = Math.max(minMp, reserveMp);
  return { ok: mp >= effectiveMin, minMp: effectiveMin };
}

/**
 * 法师 APR 扩蓝：AP→MP，再退 MP（-30），AP 回 INT（耗 1 张 APR）
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {number} [equipInt=0]
 * @returns {{ success: boolean; mpGain?: number; mpDeduct?: number; netMp?: number; peakMp?: number; reason?: string }}
 */
function tryMagicianAprMpCycle(state, job, level, reserveMp, equipInt = 0) {
  const totalInt = state.int + Math.max(0, equipInt);
  const mpGain = randomInt(18, 19) + Math.floor(totalInt / 10);
  const mpDeduct = APR_MP_DEDUCTION.magician;
  const peakMp = Math.min(MAX_MP, state.mp + mpGain);
  const projectedMp = peakMp - mpDeduct;
  const { ok, minMp } = checkMpConstraint(projectedMp, level, job, reserveMp);

  if (!ok) {
    return {
      success: false,
      reason: `MP 不足（需 ≥ ${minMp}，预计 ${projectedMp}）`,
    };
  }

  state.mp = projectedMp;
  state.apr += 1;
  state.int += 1;
  return {
    success: true,
    mpGain,
    mpDeduct,
    netMp: mpGain - mpDeduct,
    peakMp,
  };
}

/**
 * 法师最大化 HP：每点新鲜 AP 优先洗血；蓝不够则「+MP→退MP→+INT」补蓝并涨智力；
 * 再用重置洗血吃光蓝量库存。不考虑 NX。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {number} washTargetHp
 * @param {number} [apCount=5]
 * @param {number} [equipInt=0]
 * @returns {{ operation: string; warning: boolean; warningMessage: string; unusedAp: number }}
 */
function runMagicianMaxHpCycle(
  state,
  job,
  level,
  reserveMp,
  washTargetHp,
  apCount = FRESH_AP_PER_LEVEL,
  equipInt = 0,
) {
  let warning = false;
  let warningMessage = '';
  let usedAp = 0;
  let freshHpCount = 0;
  let freshHpTotal = 0;
  let aprMpCount = 0;
  let aprMpNet = 0;
  for (let i = 0; i < apCount; i += 1) {
    if (state.hp >= washTargetHp) {
      break;
    }

    const hpResult = tryFreshHpWash(state, job, level, reserveMp, washTargetHp);
    if (hpResult.success) {
      freshHpCount += 1;
      freshHpTotal += hpResult.hpGain ?? 0;
      usedAp += 1;
      continue;
    }

    // 峰值达标后 INT 已足够高，只允许净蓝为正的 APR 扩蓝循环，不再把 AP 直接加 MP
    const totalInt = state.int + Math.max(0, equipInt);
    const minNetMp =
      18 + Math.floor(totalInt / 10) - APR_MP_DEDUCTION.magician;
    if (minNetMp <= 0) {
      warning = true;
      warningMessage = '当前 INT 的扩蓝净收益未大于 0';
      break;
    }
    const mpCycle = tryMagicianAprMpCycle(state, job, level, reserveMp, equipInt);
    if (mpCycle.success) {
      aprMpCount += 1;
      aprMpNet += mpCycle.netMp ?? 0;
      usedAp += 1;
      continue;
    }

    warning = true;
    warningMessage = mpCycle.reason ?? '法师操作中断';
    break;
  }

  let bankCount = 0;
  let bankHp = 0;
  while (state.hp < washTargetHp) {
    const bank = tryStaleHpWash(state, job, level, reserveMp, washTargetHp);
    if (!bank.success) {
      break;
    }
    bankCount += 1;
    bankHp += bank.hpGain ?? 0;
  }

  const parts = /** @type {string[]} */ ([]);
  if (freshHpCount > 0) {
    parts.push(
      `升级洗血×${freshHpCount} [合计+${freshHpTotal}HP，退MP×${freshHpCount}]`,
    );
  }
  if (aprMpCount > 0) {
    parts.push(
      `APR扩蓝×${aprMpCount} [+MP再-30再+INT，净MP${aprMpNet >= 0 ? '+' : ''}${aprMpNet}]`,
    );
  }
  if (bankCount > 0) {
    parts.push(`重置洗血×${bankCount} [合计+${bankHp}HP，+6/-30]`);
  }
  if (parts.length === 0) {
    parts.push('法师无法洗血/扩蓝');
    warning = true;
    warningMessage = warningMessage || '法师无法洗血/扩蓝';
  }

  return {
    operation: parts.join(' → '),
    warning,
    warningMessage,
    unusedAp: Math.max(0, apCount - usedAp),
  };
}


/**
 * 法师峰值达标前的 AP 策略：净扩蓝收益未转正时全加 INT，转正后执行 APR 扩蓝。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {number} apCount
 * @param {number} [equipInt=0]
 * @returns {{ operation: string; unusedAp: number; peakMp: number; reachedCap: boolean; warning: boolean; warningMessage: string }}
 */
function runMagicianIntThenExpand(
  state,
  job,
  level,
  reserveMp,
  apCount,
  equipInt = 0,
) {
  let usedAp = 0;
  let intCount = 0;
  let intAfterDirectAdd = state.int;
  let expandCount = 0;
  let netMp = 0;
  let peakMp = state.mp;
  let warning = false;
  let warningMessage = '';

  for (let i = 0; i < apCount; i += 1) {
    const totalInt = state.int + Math.max(0, equipInt);
    const minNetMp =
      18 + Math.floor(totalInt / 10) - APR_MP_DEDUCTION.magician;

    if (minNetMp <= 0) {
      state.int += 1;
      intCount += 1;
      intAfterDirectAdd = state.int;
      usedAp += 1;
      continue;
    }

    const result = tryMagicianAprMpCycle(
      state,
      job,
      level,
      reserveMp,
      equipInt,
    );
    if (!result.success) {
      warning = true;
      warningMessage = result.reason ?? '法师 APR 扩蓝中断';
      break;
    }

    expandCount += 1;
    netMp += result.netMp ?? 0;
    peakMp = Math.max(peakMp, result.peakMp ?? state.mp);
    usedAp += 1;

    if (peakMp >= MAX_MP) {
      break;
    }
  }

  const parts = /** @type {string[]} */ ([]);
  if (intCount > 0) {
    parts.push(
      `净扩蓝收益未转正，AP全加INT×${intCount}（加至INT ${intAfterDirectAdd}）`,
    );
  }
  if (expandCount > 0) {
    parts.push(
      `净收益转正后APR扩蓝×${expandCount} [净MP+${netMp}，AP回INT]${
        peakMp >= MAX_MP ? ' · 峰值蓝已满' : ''
      }`,
    );
  }

  return {
    operation: parts.join(' → ') || '法师本级无操作',
    unusedAp: Math.max(0, apCount - usedAp),
    peakMp,
    reachedCap: peakMp >= MAX_MP,
    warning,
    warningMessage,
  };
}

/**
 * 法师防溢出：自然成长前先洗血扣蓝，给本级自然 MP 留出空间，避免超过 3 万浪费
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {number} washTargetHp
 * @param {number} estimatedNaturalMp
 * @returns {{ operation: string; washed: boolean }}
 */
function runMagicianPreGrowthOverflowWash(
  state,
  job,
  level,
  reserveMp,
  washTargetHp,
  estimatedNaturalMp,
) {
  if (state.hp >= washTargetHp) {
    return { operation: '', washed: false };
  }
  if (state.mp + estimatedNaturalMp <= MAX_MP) {
    return { operation: '', washed: false };
  }

  const minMp = Math.max(getMinMp(job, level), reserveMp);
  const targetMp = Math.max(minMp + APR_MP_DEDUCTION.magician, MAX_MP - estimatedNaturalMp);
  let count = 0;
  let totalHp = 0;

  while (state.mp > targetMp && state.hp < washTargetHp) {
    const result = tryStaleHpWash(state, job, level, reserveMp, washTargetHp);
    if (!result.success) {
      break;
    }
    count += 1;
    totalHp += result.hpGain ?? 0;
  }

  if (count === 0) {
    return { operation: '', washed: false };
  }

  return {
    operation: `防溢出洗血×${count} [合计+${totalHp}HP，给自然成长留空间]`,
    washed: true,
  };
}

/**
 * 尝试执行一次完整扩蓝（加 MP → 退点回主属性）
 * 物理职业净蓝 = floor(INT/10)-2；退点扣蓝只发生在流程内，不再从净蓝里重复扣除。
 * 战士等职业的 APR_MP_DEDUCTION 用于洗血退蓝，以及扩蓝时「加蓝量 − 退点」还原净蓝。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @returns {{ success: boolean; mpGain?: number; mpDeduct?: number; netMp?: number; reason?: string }}
 */
function tryMpWash(state, job, level, reserveMp, mwLevel, mwStartLevel) {
  const mpGain = getMpWashGain(job, state.int, level, mwLevel, mwStartLevel);
  const mpDeduct = APR_MP_DEDUCTION[job];
  const netMp = mpGain - mpDeduct;
  const projectedMp = state.mp + netMp;
  const { ok, minMp } = checkMpConstraint(projectedMp, level, job, reserveMp);

  if (!ok) {
    return {
      success: false,
      reason: `MP 不足（需 ≥ ${minMp}，预计 ${projectedMp}）`,
    };
  }

  state.mp = projectedMp;
  state.apr += 1;
  const mainStat = /** @type {'str'|'dex'|'int'|'luk'} */ (
    JOB_OPTIONS[job].mainStat.toLowerCase()
  );
  state[mainStat] += 1;
  return { success: true, mpGain, mpDeduct, netMp };
}

/**
 * 将 HP 增量限制在洗血目标内
 * @param {number} currentHp
 * @param {number} gain
 * @param {number} washTargetHp
 * @returns {number}
 */
function capHpGain(currentHp, gain, washTargetHp) {
  if (gain <= 0) {
    return 0;
  }
  return Math.min(gain, Math.max(0, washTargetHp - currentHp));
}

/**
 * 估算从当前等级起，仅靠后续自然成长到目标等级时的 HP。
 * 这里使用每级最小自然成长，作为保守估算。
 * @param {number} currentHp
 * @param {number} currentLevel
 * @param {number} goalLevel
 * @param {JobId} job
 * @param {SkillState} skills
 * @param {number} washTargetHp
 * @returns {number}
 */
function estimateNaturalHpToGoal(
  currentHp,
  currentLevel,
  goalLevel,
  job,
  skills,
  washTargetHp,
) {
  if (goalLevel <= currentLevel) {
    return currentHp;
  }

  /** @type {SkillState} */
  const projectedSkills = {
    lifeRecovery: skills.lifeRecovery,
    lifeEnhancement: skills.lifeEnhancement,
    magicBoost: skills.magicBoost ?? 0,
  };

  let projectedHp = currentHp;

  for (let level = currentLevel + 1; level <= goalLevel; level += 1) {
    const spResult = allocateSkillPoints(projectedSkills, job, level);
    projectedSkills.lifeRecovery = spResult.skills.lifeRecovery;
    projectedSkills.lifeEnhancement = spResult.skills.lifeEnhancement;
    projectedSkills.magicBoost = spResult.skills.magicBoost ?? 0;

    const [hpMin] = getHpGrowthRange(job, level);
    const naturalGain =
      hpMin +
      getLifeEnhancementHpBonus(
        job,
        projectedSkills.lifeEnhancement,
        'levelUp',
      );
    projectedHp += capHpGain(projectedHp, naturalGain, washTargetHp);

    if (projectedHp >= washTargetHp) {
      return washTargetHp;
    }
  }

  return projectedHp;
}

/**
 * 预测停止洗血后自然升级到 200 级可达到的最大 MP。
 * 使用每级自然 MP 上限；出山后不再增加 INT。
 * @param {number} currentMp
 * @param {number} currentLevel
 * @param {number} panelInt
 * @param {import('../config/jobConfig.js').EquipIntBonus[]} equipIntBonuses
 * @param {JobId} job
 * @param {import('../config/jobConfig.js').MwLevel} mwLevel
 * @param {number} mwStartLevel
 * @param {number} [magicBoostLevel=0]
 * @returns {number}
 */
function projectMaxMpAt200(
  currentMp,
  currentLevel,
  panelInt,
  equipIntBonuses,
  job,
  mwLevel,
  mwStartLevel,
  magicBoostLevel = 0,
) {
  let projectedMp = currentMp;
  const [, mpMax] = getMpGrowthRange(job);
  const skillMp = getMagicBoostMpBonus(job, magicBoostLevel);

  for (let level = currentLevel + 1; level <= 200; level += 1) {
    const equipInt = getEquipIntAtLevel(equipIntBonuses, level);
    projectedMp +=
      mpMax +
      getLevelUpIntMpBonus(panelInt, equipInt, level, mwLevel, mwStartLevel) +
      skillMp;
  }

  return projectedMp;
}

/**
 * 规范化装备智力列表（兼容旧版固定 equipInt）
 * @param {SimulationParams} params
 * @returns {import('../config/jobConfig.js').EquipIntBonus[]}
 */
function resolveEquipIntBonuses(params) {
  if (Array.isArray(params.equipIntBonuses)) {
    return params.equipIntBonuses
      .map((entry) => ({
        level: Number(entry.level),
        int: Number(entry.int),
      }))
      .filter(
        (entry) =>
          Number.isFinite(entry.level) &&
          entry.level >= 1 &&
          Number.isFinite(entry.int) &&
          entry.int > 0,
      )
      .sort((a, b) => a.level - b.level);
  }
  const legacy = Number(params.equipInt);
  if (Number.isFinite(legacy) && legacy > 0) {
    return [{ level: 1, int: legacy }];
  }
  return [];
}

/**
 * 尝试执行一次升级洗血（含生命强化额外 HP）
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {number} washTargetHp
 * @returns {{ success: boolean; hpGain?: number; baseHp?: number; skillBonus?: number; mpDeduct?: number; reason?: string; capped?: boolean }}
 */
function tryFreshHpWash(state, job, level, reserveMp, washTargetHp) {
  if (state.hp >= washTargetHp) {
    return {
      success: false,
      reason: `HP 已达洗血目标 ${washTargetHp.toLocaleString('zh-CN')}`,
    };
  }

  const [minHp, maxHp] = FRESH_HP_WASH_RANGE[job];
  const baseHp = randomInt(minHp, maxHp);
  const skillBonus = getLifeEnhancementHpBonus(
    job,
    state.skills.lifeEnhancement,
    'wash',
  );
  const rawHpGain = baseHp + skillBonus;
  const hpGain = capHpGain(state.hp, rawHpGain, washTargetHp);

  if (hpGain <= 0) {
    return {
      success: false,
      reason: `HP 已达洗血目标 ${washTargetHp.toLocaleString('zh-CN')}`,
    };
  }

  const mpDeduct = APR_MP_DEDUCTION[job];
  const projectedMp = state.mp - mpDeduct;
  const { ok, minMp } = checkMpConstraint(projectedMp, level, job, reserveMp);

  if (!ok) {
    return {
      success: false,
      reason: `MP 不足（需 ≥ ${minMp}，预计 ${projectedMp}）`,
    };
  }

  state.hp += hpGain;
  state.mp = projectedMp;
  state.apr += 1;
  const mainStat = /** @type {'str'|'dex'|'int'|'luk'} */ (
    JOB_OPTIONS[job].mainStat.toLowerCase()
  );
  state[mainStat] += 1;
  return {
    success: true,
    hpGain,
    baseHp,
    skillBonus,
    mpDeduct,
    capped: hpGain < rawHpGain,
  };
}

/**
 * 格式化完整扩蓝的净蓝结果
 * @param {number} netMp
 * @returns {string}
 */
function formatMpWashNet(netMp) {
  return `净MP${netMp >= 0 ? '+' : ''}${netMp}`;
}

/**
 * 循环执行扩蓝
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {import('../config/jobConfig.js').MwLevel} mwLevel
 * @param {number} mwStartLevel
 * @param {number} [count=5]
 * @returns {{ washCount: number; washDetails: string[]; warning: boolean; warningMessage: string }}
 */
function runMpWashLoop(
  state,
  job,
  level,
  reserveMp,
  mwLevel,
  mwStartLevel,
  count = FRESH_AP_PER_LEVEL,
) {
  let washCount = 0;
  let totalNetMp = 0;
  const washDetails = /** @type {string[]} */ ([]);
  let warning = false;
  let warningMessage = '';

  for (let i = 0; i < count; i += 1) {
    const result = tryMpWash(state, job, level, reserveMp, mwLevel, mwStartLevel);
    if (!result.success) {
      warning = true;
      warningMessage = result.reason ?? '扩蓝中断';
      break;
    }
    washCount += 1;
    totalNetMp += result.netMp ?? 0;
  }

  if (washCount > 0) {
    washDetails.push(formatMpWashNet(totalNetMp));
  }

  return { washCount, washDetails, warning, warningMessage };
}

/**
 * 未成功用于洗血/扩蓝的新鲜 AP，直接加到主属性（保证 AP 守恒）
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} apCount
 * @returns {string}
 */
function dumpFreshApToMain(state, job, apCount) {
  if (apCount <= 0) {
    return '';
  }
  const allocated = allocateLevelUpAp(state, job, state.int, apCount, true);
  return `剩余AP加主属性 (${formatApAllocation(allocated)})`;
}

/**
 * 低新鲜洗血收益职业（船长/弓手/飞侠）允许用重置洗血补足 HP
 * @param {JobId} job
 * @returns {boolean}
 */
function allowsStaleHpWash(job) {
  // 弓手/飞侠新鲜洗血收益低，需扩蓝后重置洗血；船长已与拳手同为 36~40，走新鲜洗血
  return job === 'archer' || job === 'thief';
}

/**
 * 尝试执行一次重置洗血（不消耗新鲜 AP，仅耗 APR/MP）
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {number} washTargetHp
 * @returns {{ success: boolean; hpGain?: number; reason?: string }}
 */
function tryStaleHpWash(state, job, level, reserveMp, washTargetHp) {
  if (state.hp >= washTargetHp) {
    return {
      success: false,
      reason: `HP 已达洗血目标 ${washTargetHp.toLocaleString('zh-CN')}`,
    };
  }

  const rawHpGain = STALE_HP_WASH_GAIN[job];
  const hpGain = capHpGain(state.hp, rawHpGain, washTargetHp);
  if (hpGain <= 0) {
    return {
      success: false,
      reason: `HP 已达洗血目标 ${washTargetHp.toLocaleString('zh-CN')}`,
    };
  }

  const mpDeduct = APR_MP_DEDUCTION[job];
  const projectedMp = state.mp - mpDeduct;
  const { ok, minMp } = checkMpConstraint(projectedMp, level, job, reserveMp);
  if (!ok) {
    return {
      success: false,
      reason: `MP 不足（需 ≥ ${minMp}，预计 ${projectedMp}）`,
    };
  }

  state.hp += hpGain;
  state.mp = projectedMp;
  state.apr += 1;
  // 法师重置洗血：退蓝换出的 AP 回到主属性 INT
  if (isMagicianClass(job)) {
    const mainStat = /** @type {'str'|'dex'|'int'|'luk'} */ (
      JOB_OPTIONS[job].mainStat.toLowerCase()
    );
    state[mainStat] += 1;
  }
  return { success: true, hpGain };
}

/**
 * 格式化一次升级洗血明细
 * @param {number} index
 * @param {{ hpGain?: number; baseHp?: number; skillBonus?: number; mpDeduct?: number }} hit
 * @param {number} [enhancementLevel=0]
 * @returns {string}
 */
function formatFreshHpWashDetail(index, hit, enhancementLevel = 0) {
  const skillBonus = hit.skillBonus ?? 0;
  const skillLabel =
    skillBonus > 0
      ? enhancementLevel > 0
        ? `生命强化Lv${enhancementLevel}+${skillBonus}`
        : `生命强化+${skillBonus}`
      : '';
  const hpPart =
    skillBonus > 0
      ? `+${hit.hpGain}HP（基础+${hit.baseHp} ${skillLabel}）`
      : `+${hit.hpGain}HP`;
  return `第${index}次：${hpPart}，MP-${hit.mpDeduct}`;
}

/**
 * 洗血优先；MP 不足洗血时，本级剩余 AP 改用于扩蓝（可关闭）。
 * 未用完的新鲜 AP 会返回 unusedAp，由调用方加回主属性。
 * 船长/弓手/飞侠：新鲜 AP 优先扩蓝，再以重置洗血堆 HP（其新鲜洗血收益过低）。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {import('../config/jobConfig.js').MwLevel} mwLevel
 * @param {number} mwStartLevel
 * @param {string} hpLabel
 * @param {number} washTargetHp
 * @param {number} [apCount=5]
 * @param {boolean} [noActiveMpExpand=false]
 * @returns {{ operation: string; segments: OperationSegment[]; warning: boolean; warningMessage: string; unusedAp: number }}
 */
function runFreshHpWashWithMpFallback(
  state,
  job,
  level,
  reserveMp,
  mwLevel,
  mwStartLevel,
  hpLabel,
  washTargetHp,
  apCount = FRESH_AP_PER_LEVEL,
  noActiveMpExpand = false,
) {
  let warning = false;
  let warningMessage = '';
  /** @type {OperationSegment[]} */
  const segments = [];
  let usedAp = 0;

  // 法师：交给最大化 HP 循环（升级洗血 + APR扩蓝 + 重置洗血）
  if (isMagicianClass(job)) {
    const mageResult = runMagicianMaxHpCycle(
      state,
      job,
      level,
      reserveMp,
      washTargetHp,
      apCount,
      0,
    );
    return {
      ...mageResult,
      segments: mageResult.operation
        ? mageResult.operation.split(' → ').map((text) => ({ text }))
        : [],
    };
  }

  // 远程职业：新鲜 AP → 扩蓝，再重置洗血
  if (allowsStaleHpWash(job)) {
    let mpWashCount = 0;
    let totalNetMp = 0;
    /** @type {string[]} */
    const mpDetails = [];
    let staleWashCount = 0;
    let totalStaleHp = 0;
    /** @type {string[]} */
    const staleDetails = [];

    if (!noActiveMpExpand) {
      for (let i = 0; i < apCount; i += 1) {
        if (state.hp >= washTargetHp) {
          break;
        }
        const mpResult = tryMpWash(state, job, level, reserveMp, mwLevel, mwStartLevel);
        if (!mpResult.success) {
          warning = true;
          warningMessage = mpResult.reason ?? '扩蓝中断';
          break;
        }
        mpWashCount += 1;
        totalNetMp += mpResult.netMp ?? 0;
        mpDetails.push(
          `第${mpWashCount}次：${formatMpWashNet(mpResult.netMp ?? 0)}（加蓝+${mpResult.mpGain}，退点-${mpResult.mpDeduct}）`,
        );
        usedAp += 1;
      }
    }

    while (state.hp < washTargetHp) {
      const staleResult = tryStaleHpWash(state, job, level, reserveMp, washTargetHp);
      if (!staleResult.success) {
        break;
      }
      staleWashCount += 1;
      totalStaleHp += staleResult.hpGain ?? 0;
      staleDetails.push(
        `第${staleWashCount}次：+${staleResult.hpGain}HP，MP-${APR_MP_DEDUCTION[job]}`,
      );
    }

    if (mpWashCount > 0) {
      segments.push({
        text: `智能扩蓝×${mpWashCount} [${formatMpWashNet(totalNetMp)}]`,
        details: mpDetails,
      });
    }
    if (staleWashCount > 0) {
      segments.push({
        text: `重置洗血×${staleWashCount} [合计+${totalStaleHp}HP]`,
        details: staleDetails,
      });
    }
    if (segments.length === 0) {
      if (noActiveMpExpand) {
        segments.push({ text: '蓝不足，等待自然增长（不主动扩蓝）' });
      } else {
        segments.push({ text: '扩蓝/重置洗血均失败' });
        if (!warning) {
          warning = true;
          warningMessage = 'MP 不足以扩蓝或重置洗血';
        }
      }
    } else if (
      noActiveMpExpand &&
      mpWashCount === 0 &&
      state.hp < washTargetHp
    ) {
      segments.push({ text: '蓝不足，等待自然增长（不主动扩蓝）' });
    }

    return {
      operation: segments.map((segment) => segment.text).join(' → '),
      segments,
      warning,
      warningMessage,
      unusedAp: Math.max(0, apCount - usedAp),
    };
  }

  // 战士/拳手：新鲜 AP 优先升级洗血，蓝不足再扩蓝（可关闭）
  let hpWashCount = 0;
  let totalHpFromWash = 0;
  /** @type {string[]} */
  const hpDetails = [];
  let mpFallback = false;
  let mpWashCount = 0;
  let totalNetMp = 0;
  /** @type {string[]} */
  const mpDetails = [];
  let skippedExpandForNatural = false;

  for (let i = 0; i < apCount; i += 1) {
    if (state.hp >= washTargetHp) {
      break;
    }

    if (!mpFallback) {
      const hpResult = tryFreshHpWash(state, job, level, reserveMp, washTargetHp);
      if (hpResult.success) {
        hpWashCount += 1;
        totalHpFromWash += hpResult.hpGain ?? 0;
        hpDetails.push(
          formatFreshHpWashDetail(
            hpWashCount,
            hpResult,
            state.skills.lifeEnhancement,
          ),
        );
        usedAp += 1;
        continue;
      }
      if (state.hp >= washTargetHp) {
        break;
      }
      mpFallback = true;
      if (noActiveMpExpand) {
        skippedExpandForNatural = true;
        break;
      }
    }

    const mpResult = tryMpWash(state, job, level, reserveMp, mwLevel, mwStartLevel);
    if (!mpResult.success) {
      warning = true;
      warningMessage = mpResult.reason ?? '扩蓝中断';
      break;
    }
    mpWashCount += 1;
    totalNetMp += mpResult.netMp ?? 0;
    mpDetails.push(
      `第${mpWashCount}次：${formatMpWashNet(mpResult.netMp ?? 0)}（加蓝+${mpResult.mpGain}，退点-${mpResult.mpDeduct}）`,
    );
    usedAp += 1;
  }

  if (hpWashCount > 0) {
    segments.push({
      text: `${hpLabel}×${hpWashCount} [合计+${totalHpFromWash}HP]`,
      details: hpDetails,
    });
  }

  if (skippedExpandForNatural) {
    segments.push({ text: '蓝不足，等待自然增长（不主动扩蓝）' });
  } else if (mpFallback) {
    if (mpWashCount > 0) {
      segments.push({
        text:
          hpWashCount > 0
            ? `蓝不足转扩蓝×${mpWashCount} [${formatMpWashNet(totalNetMp)}]`
            : `蓝不足改扩蓝×${mpWashCount} [${formatMpWashNet(totalNetMp)}]`,
        details: mpDetails,
      });
    } else if (hpWashCount === 0) {
      segments.push({ text: '洗血/扩蓝均失败' });
      if (!warning) {
        warning = true;
        warningMessage = 'MP 不足以洗血或扩蓝';
      }
    }
  } else if (hpWashCount === 0) {
    segments.push({ text: '洗血失败' });
    warning = true;
    warningMessage = '洗血失败';
  }

  return {
    operation: segments.map((segment) => segment.text).join(' → '),
    segments,
    warning,
    warningMessage,
    unusedAp: Math.max(0, apCount - usedAp),
  };
}

/**
 * 出山：把除主属性外的属性洗到 4，最大化主属性。
 * 属性点转移只消耗 APR（每点 1 张），不扣除 MP。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} baseInt
 * @param {number} targetInt
 * @param {boolean} [allowEarlyGraduation=false]
 * @param {number} [washTargetHp=30000]
 * @returns {{ count: number; graduated: boolean; detail: string }}
 */
function tryGraduateToMainStat(
  state,
  job,
  level,
  baseInt,
  targetInt,
  allowEarlyGraduation = false,
  washTargetHp = MAX_HP,
) {
  if (state.int < targetInt) {
    return { count: 0, graduated: false, detail: '' };
  }
  // 物理职业需确实加过 INT；法师主属性即 INT，允许维持初始 INT 出山
  if (!isMagicianClass(job) && state.int <= baseInt) {
    return { count: 0, graduated: false, detail: '' };
  }

  if (state.hp < washTargetHp && !allowEarlyGraduation) {
    return { count: 0, graduated: false, detail: '' };
  }

  const mainStat = /** @type {'str'|'dex'|'int'|'luk'} */ (
    JOB_OPTIONS[job].mainStat.toLowerCase()
  );
  /** @type {Array<'str'|'dex'|'int'|'luk'>} */
  const otherStats = ['str', 'dex', 'int', 'luk'].filter(
    (stat) => stat !== mainStat,
  );

  let count = 0;
  const detailParts = /** @type {string[]} */ ([]);

  for (const stat of otherStats) {
    const excess = state[stat] - MIN_STAT;
    if (excess > 0) {
      state[stat] -= excess;
      state[mainStat] += excess;
      state.apr += excess;
      count += excess;
      detailParts.push(`${stat.toUpperCase()}-${excess}`);
    }
  }

  if (count === 0) {
    // 法师主属性即 INT，副属性常已是 4：血量达标即可出山
    if (state.int >= targetInt && (state.hp >= washTargetHp || allowEarlyGraduation)) {
      return { count: 0, graduated: true, detail: '副属性已在下限' };
    }
    return { count: 0, graduated: false, detail: '' };
  }

  return {
    count,
    graduated: true,
    detail: `${detailParts.join(' ')} → ${mainStat.toUpperCase()}+${count}`,
  };
}

/**
 * 校验模拟参数
 * @param {SimulationParams} params
 * @returns {string[]}
 */
export function validateParams(params) {
  const errors = [];

  if (params.targetLevel < 1 || params.targetLevel > 200) {
    errors.push('目标等级需在 1 ~ 200 之间');
  }
  if (params.mwStartLevel < 7 || params.mwStartLevel > 199) {
    errors.push('MW 生效等级需在 7 ~ 199 之间');
  }
  if (params.mwLevel > 0 && params.mwStartLevel > params.targetLevel) {
    errors.push('MW 生效等级不能大于目标等级');
  }

  const statKeys = /** @type {const} */ (['str', 'dex', 'int', 'luk']);
  for (const key of statKeys) {
    if (params.baseStats[key] < 4) {
      errors.push(`初始${key.toUpperCase()}不能低于 4`);
    }
  }

  if (params.targetInt < params.baseStats.int) {
    errors.push('目标智力不能低于初始智力');
  }
  const bonuses = resolveEquipIntBonuses(params);
  for (const entry of bonuses) {
    if (entry.level < 1 || entry.level > 200) {
      errors.push('装备智力生效等级需在 1 ~ 200 之间');
      break;
    }
  }

  return errors;
}

/**
 * 给洗血/扩蓝分段追加备注（如 INT已满）
 * @param {{ segments?: OperationSegment[]; operation: string }} washResult
 * @param {string} [leftover]
 * @param {string} [note]
 * @returns {OperationSegment[]}
 */
function annotateWashSegments(washResult, leftover = '', note = '') {
  const segments = /** @type {OperationSegment[]} */ (
    washResult.segments?.length
      ? washResult.segments.map((segment) => ({
          text: segment.text,
          details: segment.details ? [...segment.details] : undefined,
        }))
      : [{ text: washResult.operation }]
  );
  if (segments.length === 0) {
    return [{ text: `${leftover}${note}`.trim() || '洗血' }];
  }
  const suffix = `${leftover ? ` → ${leftover}` : ''}${note}`;
  if (!suffix) {
    return segments;
  }
  const last = segments[segments.length - 1];
  segments[segments.length - 1] = {
    ...last,
    text: `${last.text}${suffix}`,
  };
  return segments;
}

/**
 * 构建等级记录
 * @param {Object} input
 * @returns {LevelRecord}
 */
function buildLevelRecord(input) {
  return {
    level: input.level,
    hpGain: input.hpGain,
    mpGain: input.mpGain,
    operation: input.operation,
    operationSegments: input.operationSegments,
    warning: input.warning,
    warningMessage: input.warningMessage,
    hp: input.state.hp,
    mp: input.state.mp,
    str: input.state.str,
    dex: input.state.dex,
    int: input.state.int,
    luk: input.state.luk,
    lifeEnhancement: input.state.skills.lifeEnhancement,
    magicBoost: input.state.skills.magicBoost ?? 0,
    minMp: input.minMp,
    totalApr: input.state.apr,
    totalNx: input.state.apr * APR_NX_COST,
  };
}

/**
 * 执行完整等级模拟
 * @param {SimulationParams} params
 * @returns {SimulationResult}
 */
export function runSimulation(params) {
  const validationErrors = validateParams(params);
  if (validationErrors.length > 0) {
    return {
      records: [],
      finalHp: 0,
      finalBaseHp: 0,
      equipmentHp: 0,
      washTargetHp: MAX_HP,
      finalMp: 0,
      projectedMpAt200: 0,
      optimalTargetInt: params.targetInt,
      finalStats: { ...params.baseStats },
      finalLifeEnhancement: 0,
      finalMagicBoost: 0,
      peakMp: 0,
      mpCapLevel: null,
      totalApr: 0,
      totalNx: 0,
      graduationLevel: null,
      hasWarning: false,
      validationErrors,
    };
  }

  const {
    job,
    baseStats,
    targetInt,
    targetLevel,
    mwStartLevel,
    mwLevel,
    reserveMp = 0,
    hpEquipment = {
      t10Ring: false,
      butterflyRing: false,
      monNecklace: false,
    },
    noActiveMpExpand = false,
  } = params;
  const equipIntBonuses = resolveEquipIntBonuses(params);
  const washGoalLevel = targetLevel;
  const equipmentHp = getEquipmentHpBonus(hpEquipment);
  const washTargetHp = getWashTargetHp(equipmentHp);
  const initial = INITIAL_STATS[job];

  /** @type {SimState} */
  const state = {
    hp: initial.hp,
    mp: initial.mp,
    apr: 0,
    str: baseStats.str,
    dex: baseStats.dex,
    int: baseStats.int,
    luk: baseStats.luk,
    skills: { lifeRecovery: 0, lifeEnhancement: 0, magicBoost: 0 },
  };

  /** @type {LevelRecord[]} */
  const records = [];
  /** @type {number | null} */
  let graduationLevel = null;
  /** 出山后不再补 INT / 洗血，AP 全部加主属性 */
  let hasGraduated = false;

  records.push(
    buildLevelRecord({
      level: 1,
      hpGain: 0,
      mpGain: 0,
      operation: `初始状态 STR${state.str} DEX${state.dex} INT${state.int} LUK${state.luk}`,
      warning: false,
      state,
      minMp: getMinMp(job, 1),
    }),
  );

  let hasWarning = false;
  let peakMp = state.mp;
  /** @type {number | null} */
  let mpCapLevel = state.mp >= MAX_MP ? 1 : null;
  /** 法师：峰值蓝达到 3 万后进入持续洗血阶段 */
  let mageWashPhase = state.mp >= MAX_MP;
  for (let level = 2; level <= targetLevel; level += 1) {
    // 先分配当级 SP，使生命强化/魔力强化当级生效（与预估路径一致）
    const spResult = allocateSkillPoints(state.skills, job, level);
    state.skills = spResult.skills;

    const [hpMin, hpMax] = getHpGrowthRange(job, level);
    const [mpMin, mpMax] = getMpGrowthRange(job);
    const enhancementForGrowth = state.skills.lifeEnhancement;
    const skillBonusForGrowth = getLifeEnhancementHpBonus(
      job,
      enhancementForGrowth,
      'levelUp',
    );
    const baseHpGain = randomInt(hpMin, hpMax);
    const rawHpGain = baseHpGain + skillBonusForGrowth;
    const hpGain = capHpGain(state.hp, rawHpGain, washTargetHp);
    const equipInt = getEquipIntAtLevel(equipIntBonuses, level);
    const intMpBonus = getLevelUpIntMpBonus(
      state.int,
      equipInt,
      level,
      mwLevel,
      mwStartLevel,
    );
    const magicBoostBonus = getMagicBoostMpBonus(job, state.skills.magicBoost ?? 0);
    const estimatedNaturalMp = mpMax + intMpBonus + magicBoostBonus;

    const preWashParts = /** @type {string[]} */ ([]);
    if (isMagicianClass(job) && !hasGraduated && state.hp < washTargetHp) {
      // 下一级自然成长会超 3 万时，先洗血扣蓝，避免触顶浪费；不因此提前结束扩蓝阶段
      const preWash = runMagicianPreGrowthOverflowWash(
        state,
        job,
        level,
        reserveMp,
        washTargetHp,
        estimatedNaturalMp,
      );
      if (preWash.washed) {
        preWashParts.push(preWash.operation);
      }
    }

    const mpGainRaw = randomInt(mpMin, mpMax) + intMpBonus + magicBoostBonus;
    let mpGain = mpGainRaw;
    let mpCapped = false;
    if (isMagicianClass(job) && state.mp + mpGain > MAX_MP) {
      mpGain = Math.max(0, MAX_MP - state.mp);
      mpCapped = mpGain < mpGainRaw;
    }

    state.hp += hpGain;
    state.mp += mpGain;
    if (state.mp > peakMp) {
      peakMp = state.mp;
    }
    if (mpCapLevel === null && state.mp >= MAX_MP) {
      mpCapLevel = level;
      mageWashPhase = true;
    }

    const mwPercent = getMwBonusPercent(level, mwLevel, mwStartLevel);
    const mpDetailParts = /** @type {string[]} */ ([]);
    if (intMpBonus > 0) {
      mpDetailParts.push(`INT加成+${intMpBonus}`);
    }
    if (magicBoostBonus > 0) {
      mpDetailParts.push(`魔力强化+${magicBoostBonus}`);
    }
    if (mwPercent > 0) {
      mpDetailParts.push(`MW+${Math.round(mwPercent * 100)}%`);
    }
    if (mpCapped) {
      mpDetailParts.push('触顶封顶');
    }
    const mpDetail =
      mpDetailParts.length > 0 ? `(${mpDetailParts.join(', ')})` : '';

    /** 操作顺序：SP 加点 → 防溢出 → 自然成长（生命强化按当前技能等级计入） */
    const operationParts = [
      ...(spResult.description ? [spResult.description] : []),
      ...preWashParts,
      hpGain < rawHpGain
        ? `自然成长 ${formatHpGainDetail(baseHpGain, skillBonusForGrowth, enhancementForGrowth)}→封顶 HP+${hpGain} MP+${mpGain}${mpDetail}`
        : `自然成长 ${formatHpGainDetail(baseHpGain, skillBonusForGrowth, enhancementForGrowth)} MP+${mpGain}${mpDetail}`,
    ];
    /** @type {OperationSegment[]} */
    const operationSegments = operationParts.map((text) => ({ text }));
    let warning = false;
    let warningMessage = '';

    /**
     * @param {string} text
     */
    const pushPlain = (text) => {
      operationParts.push(text);
      operationSegments.push({ text });
    };

    /**
     * @param {OperationSegment[]} segments
     */
    const pushSegments = (segments) => {
      for (const segment of segments) {
        operationParts.push(segment.text);
        operationSegments.push(segment);
      }
    };

    if (hasGraduated) {
      const allocated = allocateLevelUpAp(
        state,
        job,
        targetInt,
        FRESH_AP_PER_LEVEL,
        true,
      );
      pushPlain(
        `出山后正常升级 (${formatApAllocation(allocated)}，AP 全加主属性)`,
      );
    } else if (isMagicianClass(job)) {
      // 法师：扩蓝净收益未转正时全加 INT，转正后才循环扩蓝；
      // 自然成长将超上限时先防溢出洗血，峰值达 3 万后持续洗血
      if (state.hp >= washTargetHp) {
        const allocated = allocateLevelUpAp(
          state,
          job,
          targetInt,
          FRESH_AP_PER_LEVEL,
          true,
        );
        pushPlain(
          `血量目标已达成，本级 AP 加主属性 (${formatApAllocation(allocated)})`,
        );
      } else {
        const stepParts = /** @type {string[]} */ ([]);
        let apLeft = FRESH_AP_PER_LEVEL;

        // 峰值未满 3 万：动态判断全加 INT 或 APR 扩蓝；达标后持续洗血
        const reachedMpCap = peakMp >= MAX_MP || state.mp >= MAX_MP || mageWashPhase;

        if (!reachedMpCap && apLeft > 0) {
          const expand = runMagicianIntThenExpand(
            state,
            job,
            level,
            reserveMp,
            apLeft,
            equipInt,
          );
          stepParts.push(expand.operation);
          peakMp = Math.max(peakMp, expand.peakMp);
          if (expand.warning) {
            warning = true;
            hasWarning = true;
            warningMessage = expand.warningMessage;
          }
          if (expand.reachedCap) {
            mageWashPhase = true;
            if (mpCapLevel === null) {
              mpCapLevel = level;
            }
          }
          apLeft = expand.unusedAp;
          // 扩蓝过程中达到 3 万峰值后，剩余 AP 立刻开始洗血
          if (apLeft > 0 && expand.reachedCap) {
            mageWashPhase = true;
            const cycle = runMagicianMaxHpCycle(
              state,
              job,
              level,
              reserveMp,
              washTargetHp,
              apLeft,
              equipInt,
            );
            if (cycle.warning) {
              warning = true;
              hasWarning = true;
              warningMessage = cycle.warningMessage;
            }
            stepParts.push(cycle.operation);
            apLeft = cycle.unusedAp;
          }
        } else if (apLeft > 0) {
          mageWashPhase = true;
          const cycle = runMagicianMaxHpCycle(
            state,
            job,
            level,
            reserveMp,
            washTargetHp,
            apLeft,
            equipInt,
          );
          if (cycle.warning) {
            warning = true;
            hasWarning = true;
            warningMessage = cycle.warningMessage;
          }
          stepParts.push(`${cycle.operation}（峰值蓝≥3万后持续洗血）`);
          apLeft = cycle.unusedAp;
        }

        const leftover = dumpFreshApToMain(state, job, apLeft);
        if (leftover) {
          stepParts.push(leftover);
        }
        pushPlain(stepParts.join(' → ') || '法师本级无操作');
      }
    } else if (state.int >= targetInt) {
      // 智能路径：INT 加满后优先洗血；蓝不够自动扩蓝；能靠自然成长达标则提前出山
      const shouldSaveNx =
        level < washGoalLevel &&
        estimateNaturalHpToGoal(
          state.hp,
          level,
          washGoalLevel,
          job,
          state.skills,
          washTargetHp,
        ) >= washTargetHp;

      if (shouldSaveNx || state.hp >= washTargetHp) {
        const allocated = allocateLevelUpAp(
          state,
          job,
          targetInt,
          FRESH_AP_PER_LEVEL,
          true,
        );
        pushPlain(
          shouldSaveNx
            ? `智能节约NX：预计 Lv.${washGoalLevel} 自然成长可达洗血目标 ${washTargetHp.toLocaleString('zh-CN')} HP，本级停止洗血 (${formatApAllocation(allocated)})`
            : `洗血目标已达成，本级 AP 加主属性 (${formatApAllocation(allocated)})`,
        );
      } else {
        const washResult = runFreshHpWashWithMpFallback(
          state,
          job,
          level,
          reserveMp,
          mwLevel,
          mwStartLevel,
          '智能洗血',
          washTargetHp,
          FRESH_AP_PER_LEVEL,
          noActiveMpExpand,
        );
        if (washResult.warning) {
          warning = true;
          hasWarning = true;
          warningMessage = washResult.warningMessage;
        }
        const leftover = dumpFreshApToMain(state, job, washResult.unusedAp);
        pushSegments(
          annotateWashSegments(washResult, leftover, '（INT已满）'),
        );
      }
    } else {
      // INT 未满：先补前置/INT；剩余 AP 按职业分流
      const allocated = allocateLevelUpAp(
        state,
        job,
        targetInt,
        FRESH_AP_PER_LEVEL,
        false,
        false,
      );
      /** @type {OperationSegment[]} */
      const stepSegments = [];
      if (
        allocated.str > 0 ||
        allocated.dex > 0 ||
        allocated.int > 0 ||
        allocated.luk > 0
      ) {
        stepSegments.push({
          text: `补属性 (${formatApAllocation(allocated)})`,
        });
      }

      let remainingAp = allocated.overflow;
      if (remainingAp > 0 && state.int >= targetInt) {
          const shouldSaveNx =
            level < washGoalLevel &&
            estimateNaturalHpToGoal(
              state.hp,
              level,
              washGoalLevel,
              job,
              state.skills,
              washTargetHp,
            ) >= washTargetHp;

          if (shouldSaveNx || state.hp >= washTargetHp) {
            const mainAlloc = allocateLevelUpAp(
              state,
              job,
              targetInt,
              remainingAp,
              true,
            );
            stepSegments.push({
              text: shouldSaveNx
                ? `智能节约NX：剩余 AP 加主属性 (${formatApAllocation(mainAlloc)})`
                : `洗血目标已达成，剩余 AP 加主属性 (${formatApAllocation(mainAlloc)})`,
            });
          } else {
            const washResult = runFreshHpWashWithMpFallback(
              state,
              job,
              level,
              reserveMp,
              mwLevel,
              mwStartLevel,
              '智能洗血',
              washTargetHp,
              remainingAp,
              noActiveMpExpand,
            );
            if (washResult.warning) {
              warning = true;
              hasWarning = true;
              warningMessage = washResult.warningMessage;
            }
            const leftover = dumpFreshApToMain(state, job, washResult.unusedAp);
            stepSegments.push(
              ...annotateWashSegments(
                washResult,
                leftover,
                '（INT刚满，剩余AP洗血）',
              ),
            );
          }
      } else if (remainingAp > 0) {
        const mainAlloc = allocateLevelUpAp(
          state,
          job,
          targetInt,
          remainingAp,
          true,
        );
        stepSegments.push({
          text: `剩余 AP 加主属性 (${formatApAllocation(mainAlloc)})`,
        });
      }

      if (stepSegments.length === 0) {
        stepSegments.push({ text: '正常升级' });
      }
      stepSegments.push({
        text: `当前 INT ${state.int}/${targetInt}`,
      });
      pushSegments(stepSegments);
    }

    if (!hasGraduated) {
      const allowEarlyGraduation =
        level <= washGoalLevel &&
        (
          level === washGoalLevel ||
          estimateNaturalHpToGoal(
            state.hp,
            level,
            washGoalLevel,
            job,
            state.skills,
            washTargetHp,
          ) >= washTargetHp
        );

      const graduation = tryGraduateToMainStat(
        state,
        job,
        level,
        baseStats.int,
        targetInt,
        allowEarlyGraduation,
        washTargetHp,
      );
      if (graduation.graduated && graduationLevel === null) {
        graduationLevel = level;
        hasGraduated = true;
        if (graduation.count > 0) {
          pushPlain(
            `出山 Lv.${level}：洗净副属性转主属性×${graduation.count} (${graduation.detail}，消耗${graduation.count}张APR，不扣MP)`,
          );
        } else {
          pushPlain(
            `出山 Lv.${level}：停止洗血，此后 AP 全加主属性`,
          );
        }
      }
    }

    if (state.mp > peakMp) {
      peakMp = state.mp;
    }
    if (mpCapLevel === null && state.mp >= MAX_MP) {
      mpCapLevel = level;
    }

    records.push(
      buildLevelRecord({
        level,
        hpGain,
        mpGain,
        operation: operationSegments.map((segment) => segment.text).join(' → '),
        operationSegments,
        warning,
        warningMessage: warning ? warningMessage : undefined,
        state,
        minMp: Math.max(getMinMp(job, level), reserveMp),
      }),
    );
  }

  const finalBaseHp = Math.min(state.hp, washTargetHp);
  const projectedMpAt200 = projectMaxMpAt200(
    state.mp,
    targetLevel,
    state.int,
    equipIntBonuses,
    job,
    mwLevel,
    mwStartLevel,
    state.skills.magicBoost ?? 0,
  );
  return {
    records,
    finalHp: finalBaseHp + equipmentHp,
    finalBaseHp,
    equipmentHp,
    washTargetHp,
    finalMp: state.mp,
    projectedMpAt200,
    optimalTargetInt: targetInt,
    finalStats: {
      str: state.str,
      dex: state.dex,
      int: state.int,
      luk: state.luk,
    },
    finalLifeEnhancement: state.skills.lifeEnhancement,
    finalMagicBoost: state.skills.magicBoost ?? 0,
    peakMp,
    mpCapLevel,
    totalApr: state.apr,
    totalNx: state.apr * APR_NX_COST,
    graduationLevel,
    hasWarning,
    validationErrors: [],
  };
}

/**
 * 自动寻找满足 HP（与可选的 200 级目标 MP）时总 NX 最低的目标 INT。
 * @param {Omit<SimulationParams, 'targetInt' | 'reserveMp'>} params
 * @param {number | null | undefined} targetMpAt200 留空/null 表示不强制目标蓝，按推演结果为准
 * @returns {SimulationResult}
 */
export function optimizeTargetInt(params, targetMpAt200) {
  const baseInt = params.baseStats.int;
  const maxAvailableInt = Math.min(
    999,
    baseInt + FRESH_AP_PER_LEVEL * Math.max(0, params.targetLevel - 1),
  );
  const hasMpTarget =
    typeof targetMpAt200 === 'number' &&
    Number.isFinite(targetMpAt200) &&
    targetMpAt200 > 0;
  const trialsPerInt = 5;
  const isMage = isMagicianClass(params.job);
  const equipIntForExpandGate = getEquipIntAtLevel(
    resolveEquipIntBonuses(params),
    Math.max(1, params.targetLevel),
  );
  const magicianExpandStartInt = Math.max(
    baseInt,
    130 - Math.max(0, equipIntForExpandGate),
  );
  const targetIntCandidates = isMage
    ? [Math.min(maxAvailableInt, magicianExpandStartInt)]
    : Array.from(
        { length: maxAvailableInt - baseInt + 1 },
        (_, index) => baseInt + index,
      );
  let bestTargetInt = null;
  let bestAverageNx = Number.POSITIVE_INFINITY;
  let bestMageHp = -1;
  let fallbackTargetInt = baseInt;
  let bestFallbackHp = -1;
  let bestFallbackMp = -1;
  let bestFallbackPeakMp = -1;

  for (const targetInt of targetIntCandidates) {
    let totalNx = 0;
    let totalMpAt200 = 0;
    let totalHp = 0;
    let totalPeakMp = 0;
    let validTrials = 0;
    let completeTrials = 0;
    let completeNx = 0;
    let completeMp = 0;
    let completeHp = 0;

    for (let trial = 0; trial < trialsPerInt; trial += 1) {
      const result = runSimulation({
        ...params,
        targetInt,
        reserveMp: 0,
      });

      if (result.validationErrors.length > 0) {
        continue;
      }

      validTrials += 1;
      totalNx += result.totalNx;
      totalMpAt200 += result.projectedMpAt200;
      totalHp += result.finalHp;
      totalPeakMp += result.peakMp ?? result.finalMp;

      const planComplete = isMage
        ? (result.peakMp ?? 0) >= MAX_MP && result.graduationLevel !== null
        : result.finalHp >= MAX_HP && result.graduationLevel !== null;

      if (planComplete) {
        completeTrials += 1;
        completeNx += result.totalNx;
        completeMp += result.projectedMpAt200;
        completeHp += result.finalHp;
      }
    }

    if (validTrials === 0) {
      continue;
    }

    const averageHp = totalHp / validTrials;
    const averageMpAt200 = totalMpAt200 / validTrials;
    const averagePeakMp = totalPeakMp / validTrials;

    // 不可行回退：法师优先峰值蓝≥3万且最终 HP 高；其他职业优先血再蓝
    if (isMage) {
      const peakOk = averagePeakMp >= MAX_MP;
      const bestPeakOk = bestFallbackPeakMp >= MAX_MP;
      if (
        (peakOk && !bestPeakOk) ||
        (peakOk === bestPeakOk && averageHp > bestFallbackHp) ||
        (peakOk === bestPeakOk &&
          averageHp === bestFallbackHp &&
          averagePeakMp > bestFallbackPeakMp)
      ) {
        bestFallbackPeakMp = averagePeakMp;
        bestFallbackHp = averageHp;
        bestFallbackMp = averageMpAt200;
        fallbackTargetInt = targetInt;
      }
    } else if (
      averageHp > bestFallbackHp ||
      (averageHp === bestFallbackHp && averageMpAt200 > bestFallbackMp)
    ) {
      bestFallbackHp = averageHp;
      bestFallbackMp = averageMpAt200;
      fallbackTargetInt = targetInt;
    }

    if (completeTrials === 0) {
      continue;
    }

    const averageCompleteNx = completeNx / completeTrials;
    const averageCompleteMp = completeMp / completeTrials;
    const averageCompleteHp = completeHp / completeTrials;

    if (isMage) {
      // 法师：必须峰值蓝≥3万，再取最终 HP 最高（不计 NX）
      if (averageCompleteHp > bestMageHp) {
        bestMageHp = averageCompleteHp;
        bestTargetInt = targetInt;
      }
    } else if (
      (!hasMpTarget || averageCompleteMp >= /** @type {number} */ (targetMpAt200)) &&
      averageCompleteNx < bestAverageNx
    ) {
      // 未设置目标蓝：只要求洗血完成，取 NX 最低；有目标则同时满足蓝量
      bestAverageNx = averageCompleteNx;
      bestTargetInt = targetInt;
    }
  }

  const selectedTargetInt = bestTargetInt ?? fallbackTargetInt;
  let selectedResult = runSimulation({
    ...params,
    targetInt: selectedTargetInt,
    reserveMp: 0,
  });

  for (
    let retry = 0;
    retry < 20 &&
    bestTargetInt !== null &&
    (
      isMage
        ? (selectedResult.peakMp ?? 0) < MAX_MP ||
          selectedResult.graduationLevel === null
        : (hasMpTarget &&
            selectedResult.projectedMpAt200 <
              /** @type {number} */ (targetMpAt200)) ||
          selectedResult.finalHp < MAX_HP ||
          selectedResult.graduationLevel === null
    );
    retry += 1
  ) {
    selectedResult = runSimulation({
      ...params,
      targetInt: selectedTargetInt,
      reserveMp: 0,
    });
  }

  const defaultAllInt = isDefaultAllIntStrategy(params.job);
  /** 法师默认即「全加 INT」路径，与推荐方案一致；其他职业按固定默认 INT 再跑一遍 */
  const defaultTargetInt = defaultAllInt
    ? null
    : (getDefaultTargetInt(params.job) ?? baseInt);
  const defaultPlan = defaultAllInt
    ? selectedResult
    : runSimulation({
        ...params,
        targetInt: /** @type {number} */ (defaultTargetInt),
        reserveMp: 0,
      });

  return {
    ...selectedResult,
    optimalTargetInt: selectedTargetInt,
    defaultTargetInt,
    defaultAllInt,
    defaultPlan: {
      ...defaultPlan,
      optimalTargetInt: defaultAllInt
        ? selectedTargetInt
        : /** @type {number} */ (defaultTargetInt),
      defaultTargetInt,
      defaultAllInt,
      optimizationTargetMp: hasMpTarget ? targetMpAt200 : null,
      optimizationFeasible: defaultPlan.graduationLevel !== null,
    },
    optimizationTargetMp: hasMpTarget ? targetMpAt200 : null,
    optimizationFeasible: bestTargetInt !== null,
  };
}
