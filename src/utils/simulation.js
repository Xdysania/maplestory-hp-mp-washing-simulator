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
  isExpandThenWashJob,
  getMinProfitableExpandInt,
  getPhysicalMpWashNet,
} from '../config/jobConfig.js';
import {
  allocateSkillPoints,
  formatHpGainDetail,
  getLifeEnhancementHpBonus,
  getMagicBoostMpBonus,
  LIFE_ENHANCEMENT_MAX,
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
 * @property {number} [expandStartInt] 船长/弓手/飞侠：开始边扩蓝边洗血的 INT（默认=targetInt，即旧逻辑等满才洗）
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
 * @property {number} [optimalExpandStartInt] 船长/弓手/飞侠最优扩蓝启动 INT
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
 * 法师单次 APR 扩蓝可获得的 MP 区间（含 INT/10）
 * @param {number} totalInt
 * @returns {[number, number]}
 */
function getMagicianExpandMpGainRange(totalInt) {
  const base = Math.floor(Math.max(0, totalInt) / 10);
  return [18 + base, 19 + base];
}

/**
 * 法师不亏损蓝的 MP 上限：为即将发生的蓝增长预留空间
 * @param {number} headroom
 * @returns {number}
 */
function getMagicianNoLossMpCeiling(headroom) {
  return Math.max(0, MAX_MP - Math.max(0, headroom));
}

/**
 * 将法师 MP 洗到不超过 ceiling（只用重置洗血），用于扩蓝/自然成长前腾空间。
 * 不会洗到 Min MP，只降到不亏损极限。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {number} washTargetHp
 * @param {number} mpCeiling
 * @returns {{ count: number; totalHp: number }}
 */
function washMagicianMpToCeiling(
  state,
  job,
  level,
  reserveMp,
  washTargetHp,
  mpCeiling,
) {
  let count = 0;
  let totalHp = 0;
  while (state.mp > mpCeiling && state.hp < washTargetHp) {
    const result = tryStaleHpWash(state, job, level, reserveMp, washTargetHp);
    if (!result.success) {
      break;
    }
    count += 1;
    totalHp += result.hpGain ?? 0;
  }
  return { count, totalHp };
}

/**
 * 法师 APR 扩蓝：AP→MP，再退 MP（-30），AP 回 INT（耗 1 张 APR）。
 * 若加蓝会超过 3 万则拒绝执行，避免触顶亏损。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {number} [equipInt=0]
 * @returns {{ success: boolean; mpGain?: number; mpDeduct?: number; netMp?: number; peakMp?: number; wouldOverflow?: boolean; reason?: string }}
 */
function tryMagicianAprMpCycle(state, job, level, reserveMp, equipInt = 0) {
  const totalInt = state.int + Math.max(0, equipInt);
  const mpGain = randomInt(18, 19) + Math.floor(totalInt / 10);
  const mpDeduct = APR_MP_DEDUCTION.magician;

  if (state.mp + mpGain > MAX_MP) {
    return {
      success: false,
      wouldOverflow: true,
      reason: `扩蓝会触顶亏损（当前 ${state.mp} +${mpGain} > ${MAX_MP}）`,
    };
  }

  const peakMp = state.mp + mpGain;
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
 * 法师近蓝上限循环：每点 AP 先洗到「扩蓝不亏损极限」，再完整扩蓝；
 * 结束后再洗到「下一级自然成长不亏损极限」。绝不一次洗到 Min MP。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {number} washTargetHp
 * @param {number} [apCount=5]
 * @param {number} [equipInt=0]
 * @param {number} [nextNaturalMpHeadroom=0] 预估下一级自然 MP，用于收尾留空间
 * @returns {{ operation: string; warning: boolean; warningMessage: string; unusedAp: number; peakMp: number }}
 */
function runMagicianMaxHpCycle(
  state,
  job,
  level,
  reserveMp,
  washTargetHp,
  apCount = FRESH_AP_PER_LEVEL,
  equipInt = 0,
  nextNaturalMpHeadroom = 0,
) {
  let warning = false;
  let warningMessage = '';
  let usedAp = 0;
  let roomWashCount = 0;
  let roomWashHp = 0;
  let aprMpCount = 0;
  let aprMpNet = 0;
  let freshHpCount = 0;
  let freshHpTotal = 0;
  let peakMp = state.mp;

  for (let i = 0; i < apCount; i += 1) {
    if (state.hp >= washTargetHp) {
      break;
    }

    const totalInt = state.int + Math.max(0, equipInt);
    const [minGain, maxGain] = getMagicianExpandMpGainRange(totalInt);
    const minNetMp = minGain - APR_MP_DEDUCTION.magician;

    if (minNetMp <= 0) {
      warning = true;
      warningMessage = '当前 INT 的扩蓝净收益未大于 0';
      break;
    }

    // 先把蓝降到扩蓝不亏损极限，再扩蓝（完整加蓝，不触顶）
    const expandCeiling = getMagicianNoLossMpCeiling(maxGain);
    const room = washMagicianMpToCeiling(
      state,
      job,
      level,
      reserveMp,
      washTargetHp,
      expandCeiling,
    );
    roomWashCount += room.count;
    roomWashHp += room.totalHp;

    if (state.hp >= washTargetHp) {
      break;
    }

    if (state.mp + maxGain > MAX_MP) {
      // 已无法再为扩蓝腾出完整空间，剩余 AP 留给主属性
      break;
    }

    const mpCycle = tryMagicianAprMpCycle(
      state,
      job,
      level,
      reserveMp,
      equipInt,
    );
    if (mpCycle.success) {
      aprMpCount += 1;
      aprMpNet += mpCycle.netMp ?? 0;
      peakMp = Math.max(peakMp, mpCycle.peakMp ?? state.mp);
      usedAp += 1;
      continue;
    }

    // 扩蓝失败时，若仍高于「自然成长不亏损极限」，用升级洗血消化超额蓝
    const keepCeiling = getMagicianNoLossMpCeiling(nextNaturalMpHeadroom);
    if (state.mp > keepCeiling) {
      const hpResult = tryFreshHpWash(
        state,
        job,
        level,
        reserveMp,
        washTargetHp,
      );
      if (hpResult.success) {
        freshHpCount += 1;
        freshHpTotal += hpResult.hpGain ?? 0;
        usedAp += 1;
        continue;
      }
    }

    warning = true;
    warningMessage = mpCycle.reason ?? '法师操作中断';
    break;
  }

  // 收尾：只洗到下一级自然成长不亏损极限，不洗到 Min MP
  const keepCeiling = getMagicianNoLossMpCeiling(nextNaturalMpHeadroom);
  const trim = washMagicianMpToCeiling(
    state,
    job,
    level,
    reserveMp,
    washTargetHp,
    keepCeiling,
  );
  roomWashCount += trim.count;
  roomWashHp += trim.totalHp;
  peakMp = Math.max(peakMp, state.mp);

  const parts = /** @type {string[]} */ ([]);
  if (roomWashCount > 0) {
    parts.push(
      `防亏损洗血×${roomWashCount} [合计+${roomWashHp}HP，蓝降至不触顶极限]`,
    );
  }
  if (aprMpCount > 0) {
    parts.push(
      `APR扩蓝×${aprMpCount} [完整加蓝再-30再+INT，净MP${aprMpNet >= 0 ? '+' : ''}${aprMpNet}]`,
    );
  }
  if (freshHpCount > 0) {
    parts.push(
      `升级洗血×${freshHpCount} [合计+${freshHpTotal}HP，退MP×${freshHpCount}]`,
    );
  }
  if (parts.length === 0) {
    parts.push('法师本级无需洗血/扩蓝');
  }

  return {
    operation: parts.join(' → '),
    warning,
    warningMessage,
    unusedAp: Math.max(0, apCount - usedAp),
    peakMp,
  };
}

/**
 * 法师峰值达标前的 AP 策略：净扩蓝收益未转正时全加 INT；
 * 转正后先洗到扩蓝不亏损极限，再完整扩蓝（绝不触顶亏损）。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {number} apCount
 * @param {number} [equipInt=0]
 * @param {number} [washTargetHp=MAX_HP]
 * @returns {{ operation: string; unusedAp: number; peakMp: number; reachedCap: boolean; warning: boolean; warningMessage: string }}
 */
function runMagicianIntThenExpand(
  state,
  job,
  level,
  reserveMp,
  apCount,
  equipInt = 0,
  washTargetHp = MAX_HP,
) {
  let usedAp = 0;
  let intCount = 0;
  let intAfterDirectAdd = state.int;
  let expandCount = 0;
  let netMp = 0;
  let roomWashCount = 0;
  let roomWashHp = 0;
  let peakMp = state.mp;
  let warning = false;
  let warningMessage = '';

  for (let i = 0; i < apCount; i += 1) {
    const totalInt = state.int + Math.max(0, equipInt);
    const [minGain, maxGain] = getMagicianExpandMpGainRange(totalInt);
    const minNetMp = minGain - APR_MP_DEDUCTION.magician;

    if (minNetMp <= 0) {
      state.int += 1;
      intCount += 1;
      intAfterDirectAdd = state.int;
      usedAp += 1;
      continue;
    }

    const expandCeiling = getMagicianNoLossMpCeiling(maxGain);
    if (state.mp > expandCeiling && state.hp < washTargetHp) {
      const room = washMagicianMpToCeiling(
        state,
        job,
        level,
        reserveMp,
        washTargetHp,
        expandCeiling,
      );
      roomWashCount += room.count;
      roomWashHp += room.totalHp;
    }

    if (state.mp + maxGain > MAX_MP) {
      // 腾不出完整扩蓝空间：视为已贴近蓝上限
      peakMp = Math.max(peakMp, state.mp);
      break;
    }

    const result = tryMagicianAprMpCycle(
      state,
      job,
      level,
      reserveMp,
      equipInt,
    );
    if (!result.success) {
      if (result.wouldOverflow) {
        peakMp = Math.max(peakMp, state.mp);
        break;
      }
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
  if (roomWashCount > 0) {
    parts.push(
      `防亏损洗血×${roomWashCount} [合计+${roomWashHp}HP，给扩蓝留空间]`,
    );
  }
  if (expandCount > 0) {
    parts.push(
      `净收益转正后APR扩蓝×${expandCount} [净MP+${netMp}，AP回INT]${
        peakMp >= MAX_MP ? ' · 峰值蓝已满' : ''
      }`,
    );
  }

  const [, maxGainNow] = getMagicianExpandMpGainRange(
    state.int + Math.max(0, equipInt),
  );
  const nearCap =
    peakMp >= MAX_MP ||
    state.mp > getMagicianNoLossMpCeiling(maxGainNow);

  return {
    operation: parts.join(' → ') || '法师本级无操作',
    unusedAp: Math.max(0, apCount - usedAp),
    peakMp,
    reachedCap: nearCap,
    warning,
    warningMessage,
  };
}

/**
 * 法师防溢出：自然成长前先洗血扣蓝，只降到「本级自然 MP 不亏损」极限
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

  const targetMp = getMagicianNoLossMpCeiling(estimatedNaturalMp);
  const { count, totalHp } = washMagicianMpToCeiling(
    state,
    job,
    level,
    reserveMp,
    washTargetHp,
    targetMp,
  );

  if (count === 0) {
    return { operation: '', washed: false };
  }

  return {
    operation: `防溢出洗血×${count} [合计+${totalHp}HP，降至不亏损极限 ${targetMp}]`,
    washed: true,
  };
}

/**
 * 洗血/扩蓝退点后 AP 去向：INT 未满回 INT，已满回主属性
 * @param {SimState} state
 * @param {JobId} job
 * @param {number | null | undefined} targetInt
 * @returns {'str'|'dex'|'int'|'luk'}
 */
function getAprReturnStat(state, job, targetInt) {
  const mainStat = /** @type {'str'|'dex'|'int'|'luk'} */ (
    JOB_OPTIONS[job].mainStat.toLowerCase()
  );
  if (
    typeof targetInt === 'number' &&
    Number.isFinite(targetInt) &&
    state.int < targetInt
  ) {
    return 'int';
  }
  return mainStat;
}

/**
 * 尝试执行一次完整扩蓝（加 MP → 退点回 INT/主属性）
 * 物理职业净蓝 = floor(INT/10)-2；退点扣蓝只发生在流程内，不再从净蓝里重复扣除。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {import('../config/jobConfig.js').MwLevel} mwLevel
 * @param {number} mwStartLevel
 * @param {number | null} [targetInt=null]
 * @returns {{ success: boolean; mpGain?: number; mpDeduct?: number; netMp?: number; returnStat?: string; reason?: string }}
 */
function tryMpWash(
  state,
  job,
  level,
  reserveMp,
  mwLevel,
  mwStartLevel,
  targetInt = null,
) {
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

  const returnStat = getAprReturnStat(state, job, targetInt);
  state.mp = projectedMp;
  state.apr += 1;
  state[returnStat] += 1;
  return { success: true, mpGain, mpDeduct, netMp, returnStat };
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
 * AP→HP 后，用 APR 退 MP，AP 回 INT（未满目标）或主属性（已满）
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {number} washTargetHp
 * @param {number | null} [targetInt=null]
 * @returns {{ success: boolean; hpGain?: number; baseHp?: number; skillBonus?: number; mpDeduct?: number; returnStat?: string; reason?: string; capped?: boolean }}
 */
function tryFreshHpWash(
  state,
  job,
  level,
  reserveMp,
  washTargetHp,
  targetInt = null,
) {
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

  const returnStat = getAprReturnStat(state, job, targetInt);
  state.hp += hpGain;
  state.mp = projectedMp;
  state.apr += 1;
  state[returnStat] += 1;
  return {
    success: true,
    hpGain,
    baseHp,
    skillBonus,
    mpDeduct,
    returnStat,
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
  const returnPart = hit.returnStat
    ? `→${String(hit.returnStat).toUpperCase()}`
    : '';
  return `第${index}次：${hpPart}，MP-${hit.mpDeduct}${returnPart}`;
}

/**
 * 拳手：满生命强化后，每点升级 AP 优先洗血（+HP，退 MP 回 INT/STR）；
 * 蓝不够扣时该点改为扩蓝（+MP −MP +INT/STR）。下一点再优先尝试洗血。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {import('../config/jobConfig.js').MwLevel} mwLevel
 * @param {number} mwStartLevel
 * @param {number} washTargetHp
 * @param {number} targetInt
 * @param {number} [apCount=5]
 * @param {boolean} [noActiveMpExpand=false]
 * @returns {{ operation: string; segments: OperationSegment[]; warning: boolean; warningMessage: string; unusedAp: number }}
 */
function runBuccaneerWashCycle(
  state,
  job,
  level,
  reserveMp,
  mwLevel,
  mwStartLevel,
  washTargetHp,
  targetInt,
  apCount = FRESH_AP_PER_LEVEL,
  noActiveMpExpand = false,
) {
  let warning = false;
  let warningMessage = '';
  let usedAp = 0;
  let hpWashCount = 0;
  let totalHpFromWash = 0;
  /** @type {string[]} */
  const hpDetails = [];
  let mpWashCount = 0;
  let totalNetMp = 0;
  /** @type {string[]} */
  const mpDetails = [];
  let skippedExpandForNatural = false;

  for (let i = 0; i < apCount; i += 1) {
    if (state.hp >= washTargetHp) {
      break;
    }

    const hpResult = tryFreshHpWash(
      state,
      job,
      level,
      reserveMp,
      washTargetHp,
      targetInt,
    );
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

    if (noActiveMpExpand) {
      skippedExpandForNatural = true;
      break;
    }

    // 蓝不够扣：本点 AP 改为 +MP −MP +INT（或满 INT 后 +STR）
    const mpResult = tryMpWash(
      state,
      job,
      level,
      reserveMp,
      mwLevel,
      mwStartLevel,
      targetInt,
    );
    if (!mpResult.success) {
      warning = true;
      warningMessage = mpResult.reason ?? '扩蓝中断';
      break;
    }

    mpWashCount += 1;
    totalNetMp += mpResult.netMp ?? 0;
    const ret = mpResult.returnStat
      ? String(mpResult.returnStat).toUpperCase()
      : 'INT';
    mpDetails.push(
      `第${mpWashCount}次：+MP−MP→${ret}，${formatMpWashNet(mpResult.netMp ?? 0)}（加蓝+${mpResult.mpGain}，退点-${mpResult.mpDeduct}）`,
    );
    usedAp += 1;
  }

  /** @type {OperationSegment[]} */
  const segments = [];
  if (hpWashCount > 0) {
    segments.push({
      text: `升级洗血×${hpWashCount} [合计+${totalHpFromWash}HP]`,
      details: hpDetails,
    });
  }
  if (skippedExpandForNatural) {
    segments.push({ text: '蓝不足，等待自然增长（不主动扩蓝）' });
  } else if (mpWashCount > 0) {
    segments.push({
      text: `蓝不足改扩蓝×${mpWashCount} [${formatMpWashNet(totalNetMp)}]`,
      details: mpDetails,
    });
  } else if (hpWashCount === 0) {
    segments.push({ text: '洗血/扩蓝均失败' });
    if (!warning) {
      warning = true;
      warningMessage = 'MP 不足以洗血或扩蓝';
    }
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
 * @param {number | null} [targetInt=null]
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
  targetInt = null,
) {
  let warning = false;
  let warningMessage = '';
  /** @type {OperationSegment[]} */
  const segments = [];
  let usedAp = 0;

  // 拳手满生命强化后走专用循环（每点优先洗血，不够蓝再扩蓝）
  if (
    job === 'buccaneer' &&
    state.skills.lifeEnhancement >= LIFE_ENHANCEMENT_MAX
  ) {
    return runBuccaneerWashCycle(
      state,
      job,
      level,
      reserveMp,
      mwLevel,
      mwStartLevel,
      washTargetHp,
      targetInt ?? state.int,
      apCount,
      noActiveMpExpand,
    );
  }

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
        const mpResult = tryMpWash(
          state,
          job,
          level,
          reserveMp,
          mwLevel,
          mwStartLevel,
          targetInt,
        );
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
      const hpResult = tryFreshHpWash(
        state,
        job,
        level,
        reserveMp,
        washTargetHp,
        targetInt,
      );
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

    const mpResult = tryMpWash(
      state,
      job,
      level,
      reserveMp,
      mwLevel,
      mwStartLevel,
      targetInt,
    );
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
 * @param {{ lite?: boolean }} [options] lite=true 时不记录逐级明细（用于 INT 搜索加速）
 * @returns {SimulationResult}
 */
export function runSimulation(params, options = {}) {
  const lite = Boolean(options.lite);
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
    expandStartInt: expandStartIntParam,
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
  const expandStartInt = isExpandThenWashJob(job)
    ? Math.max(
        getMinProfitableExpandInt(),
        Math.min(
          targetInt,
          typeof expandStartIntParam === 'number' &&
            Number.isFinite(expandStartIntParam)
            ? expandStartIntParam
            : targetInt,
        ),
      )
    : targetInt;
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

  if (!lite) {
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
  }

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
            washTargetHp,
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
          // 扩蓝贴近上限后，剩余 AP 进入近上限循环（只洗到不亏损极限）
          if (apLeft > 0 && expand.reachedCap) {
            mageWashPhase = true;
            const [, nextMpMax] = getMpGrowthRange(job);
            const nextNaturalHeadroom =
              nextMpMax +
              getLevelUpIntMpBonus(
                state.int,
                equipInt,
                Math.min(targetLevel, level + 1),
                mwLevel,
                mwStartLevel,
              ) +
              getMagicBoostMpBonus(job, state.skills.magicBoost ?? 0);
            const cycle = runMagicianMaxHpCycle(
              state,
              job,
              level,
              reserveMp,
              washTargetHp,
              apLeft,
              equipInt,
              nextNaturalHeadroom,
            );
            if (cycle.warning) {
              warning = true;
              hasWarning = true;
              warningMessage = cycle.warningMessage;
            }
            peakMp = Math.max(peakMp, cycle.peakMp);
            stepParts.push(cycle.operation);
            apLeft = cycle.unusedAp;
          }
        } else if (apLeft > 0) {
          mageWashPhase = true;
          const [, nextMpMax] = getMpGrowthRange(job);
          const nextNaturalHeadroom =
            nextMpMax +
            getLevelUpIntMpBonus(
              state.int,
              equipInt,
              Math.min(targetLevel, level + 1),
              mwLevel,
              mwStartLevel,
            ) +
            getMagicBoostMpBonus(job, state.skills.magicBoost ?? 0);
          const cycle = runMagicianMaxHpCycle(
            state,
            job,
            level,
            reserveMp,
            washTargetHp,
            apLeft,
            equipInt,
            nextNaturalHeadroom,
          );
          if (cycle.warning) {
            warning = true;
            hasWarning = true;
            warningMessage = cycle.warningMessage;
          }
          peakMp = Math.max(peakMp, cycle.peakMp);
          stepParts.push(`${cycle.operation}（近蓝上限循环，不一次洗到最低）`);
          apLeft = cycle.unusedAp;
        }

        const leftover = dumpFreshApToMain(state, job, apLeft);
        if (leftover) {
          stepParts.push(leftover);
        }
        pushPlain(stepParts.join(' → ') || '法师本级无操作');
      }
    } else if (isExpandThenWashJob(job)) {
      // 船长/弓手/飞侠：免费加 INT 至扩蓝启动点，之后边扩蓝边洗血（不必等目标 INT 满）
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
      } else if (state.int < expandStartInt) {
        // 未到扩蓝启动：免费加 INT（不耗 APR），加到启动阈值为止
        const allocated = allocateLevelUpAp(
          state,
          job,
          expandStartInt,
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
            text: `免费加INT至扩蓝启动 (${formatApAllocation(allocated)})`,
          });
        }

        let remainingAp = allocated.overflow;
        if (remainingAp > 0 && state.int >= expandStartInt) {
          const washResult =
            job === 'corsair'
              ? runBuccaneerWashCycle(
                  state,
                  job,
                  level,
                  reserveMp,
                  mwLevel,
                  mwStartLevel,
                  washTargetHp,
                  targetInt,
                  remainingAp,
                  noActiveMpExpand,
                )
              : runFreshHpWashWithMpFallback(
                  state,
                  job,
                  level,
                  reserveMp,
                  mwLevel,
                  mwStartLevel,
                  '智能扩蓝洗血',
                  washTargetHp,
                  remainingAp,
                  noActiveMpExpand,
                  targetInt,
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
              `（达扩蓝启动 INT ${expandStartInt}）`,
            ),
          );
        } else if (remainingAp > 0) {
          const mainAlloc = allocateLevelUpAp(
            state,
            job,
            expandStartInt,
            remainingAp,
            false,
            true,
          );
          stepSegments.push({
            text: `继续加属性 (${formatApAllocation(mainAlloc)})`,
          });
        }

        stepSegments.push({
          text: `INT ${state.int}/${targetInt} · 扩蓝启动 ${expandStartInt}`,
        });
        pushSegments(stepSegments);
      } else {
        // 已达扩蓝启动：每点优先洗血/扩蓝，退点回 INT（满后回主属性）
        const allocated = allocateLevelUpAp(
          state,
          job,
          state.int,
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
            text: `补前置属性 (${formatApAllocation(allocated)})`,
          });
        }

        let remainingAp = allocated.overflow;
        if (remainingAp > 0) {
          const washResult =
            job === 'corsair'
              ? runBuccaneerWashCycle(
                  state,
                  job,
                  level,
                  reserveMp,
                  mwLevel,
                  mwStartLevel,
                  washTargetHp,
                  targetInt,
                  remainingAp,
                  noActiveMpExpand,
                )
              : runFreshHpWashWithMpFallback(
                  state,
                  job,
                  level,
                  reserveMp,
                  mwLevel,
                  mwStartLevel,
                  '智能扩蓝洗血',
                  washTargetHp,
                  remainingAp,
                  noActiveMpExpand,
                  targetInt,
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
              `（扩蓝启动后，INT ${state.int}/${targetInt}）`,
            ),
          );
        } else {
          stepSegments.push({
            text: `INT ${state.int}/${targetInt} · 扩蓝启动 ${expandStartInt}`,
          });
        }
        pushSegments(stepSegments);
      }
    } else if (job === 'buccaneer') {
      // 拳手：满生命强化后每点 AP 都洗血（不够蓝则该点扩蓝）；不要求先满 INT
      const lifeMaxed =
        state.skills.lifeEnhancement >= LIFE_ENHANCEMENT_MAX;
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
      } else if (lifeMaxed) {
        // 仅补前置 DEX；剩余 AP 全部用于洗血/扩蓝（INT 靠退点攒）
        const allocated = allocateLevelUpAp(
          state,
          job,
          state.int,
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
            text: `补前置属性 (${formatApAllocation(allocated)})`,
          });
        }

        let remainingAp = allocated.overflow;
        if (remainingAp > 0) {
          const washResult = runBuccaneerWashCycle(
            state,
            job,
            level,
            reserveMp,
            mwLevel,
            mwStartLevel,
            washTargetHp,
            targetInt,
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
              `（生命强化满，INT ${state.int}/${targetInt}）`,
            ),
          );
        } else {
          stepSegments.push({
            text: `当前 INT ${state.int}/${targetInt}`,
          });
        }
        pushSegments(stepSegments);
      } else {
        // 生命强化未满：先补前置/INT，暂不洗血
        const allocated = allocateLevelUpAp(
          state,
          job,
          targetInt,
          FRESH_AP_PER_LEVEL,
          false,
          true,
        );
        pushPlain(
          `生命强化未满(Lv.${state.skills.lifeEnhancement}/${LIFE_ENHANCEMENT_MAX})，先加属性 (${formatApAllocation(allocated)}) · INT ${state.int}/${targetInt}`,
        );
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
          targetInt,
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
              targetInt,
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

    if (!lite) {
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
 * 让出主线程，便于 UI 更新进度
 * @returns {Promise<void>}
 */
function yieldToUi() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * 按步长生成 INT 候选（始终包含两端）
 * @param {number} minInt
 * @param {number} maxInt
 * @param {number} step
 * @returns {number[]}
 */
function buildIntCandidates(minInt, maxInt, step) {
  /** @type {number[]} */
  const list = [];
  for (let value = minInt; value <= maxInt; value += step) {
    list.push(value);
  }
  if (list.length === 0 || list[list.length - 1] !== maxInt) {
    list.push(maxInt);
  }
  return list;
}

/**
 * 自动寻找满足 HP（与可选的 200 级目标 MP）时总 NX 最低的目标 INT。
 * 船长/弓手/飞侠会同时搜索「扩蓝启动 INT」（不必等目标 INT 满才洗血）。
 * 采用粗搜→精搜，并支持进度回调（异步让出主线程，避免界面卡死）。
 * @param {Omit<SimulationParams, 'targetInt' | 'reserveMp'>} params
 * @param {number | null | undefined} targetMpAt200 留空/null 表示不强制目标蓝，按推演结果为准
 * @param {(progress: { percent: number; message: string }) => void} [onProgress]
 * @returns {Promise<SimulationResult>}
 */
export async function optimizeTargetInt(params, targetMpAt200, onProgress) {
  const baseInt = params.baseStats.int;
  const maxAvailableInt = Math.min(
    999,
    baseInt + FRESH_AP_PER_LEVEL * Math.max(0, params.targetLevel - 1),
  );
  const hasMpTarget =
    typeof targetMpAt200 === 'number' &&
    Number.isFinite(targetMpAt200) &&
    targetMpAt200 > 0;
  const isMage = isMagicianClass(params.job);
  const needsExpandStartSearch = isExpandThenWashJob(params.job);
  const minExpandInt = getMinProfitableExpandInt();
  const equipIntForExpandGate = getEquipIntAtLevel(
    resolveEquipIntBonuses(params),
    Math.max(1, params.targetLevel),
  );
  const magicianExpandStartInt = Math.max(
    baseInt,
    130 - Math.max(0, equipIntForExpandGate),
  );

  let bestTargetInt = null;
  let bestExpandStartInt = null;
  /** 平衡 NX 与扩蓝收益后的综合分，越低越好 */
  let bestPlanScore = Number.POSITIVE_INFINITY;
  let bestMageHp = -1;
  let fallbackTargetInt = baseInt;
  let fallbackExpandStartInt = baseInt;
  let bestFallbackHp = -1;
  let bestFallbackMp = -1;
  let bestFallbackPeakMp = -1;
  let bestFallbackScore = -1;

  /**
   * 综合分（越低越好）：总 NX × 偏离理想扩蓝收益的惩罚。
   * 理想净蓝约 25（基础 INT≈270，贴近图2 的 300），过早/过晚都会变差。
   * @param {number} totalNx
   * @param {number} expandStartInt
   * @returns {number}
   */
  const scoreExpandThenWashPlan = (totalNx, expandStartInt) => {
    const netAtStart = Math.max(1, getPhysicalMpWashNet(expandStartInt));
    const idealNet = 25;
    const efficiencyPenalty =
      1 + ((netAtStart - idealNet) / idealNet) ** 2;
    return totalNx * efficiencyPenalty;
  };

  /**
   * 未完成洗血时的回退分（越高越好）：HP 优先，并贴近理想扩蓝收益
   * @param {number} averageHp
   * @param {number} expandStartInt
   * @returns {number}
   */
  const scoreExpandThenWashFallback = (averageHp, expandStartInt) => {
    const netAtStart = Math.max(1, getPhysicalMpWashNet(expandStartInt));
    const idealNet = 25;
    const efficiencyPenalty =
      1 + ((netAtStart - idealNet) / idealNet) ** 2;
    return averageHp / efficiencyPenalty;
  };

  /**
   * @param {number} percent
   * @param {string} message
   */
  const report = (percent, message) => {
    onProgress?.({
      percent: Math.max(0, Math.min(100, percent)),
      message,
    });
  };

  /**
   * 为某个目标 INT 生成扩蓝启动候选。
   * 以约 200~320（图2 的 300 附近）为重点，并保留更早/更晚对照。
   * @param {number} targetInt
   * @returns {number[]}
   */
  const buildExpandStartCandidates = (targetInt) => {
    // 净蓝约 ≥10 才较划算：floor(INT/10)-2 ≥ 10 → INT ≥ 120
    const worthwhileMin = Math.max(baseInt, minExpandInt, 120);
    const lo = Math.max(baseInt, minExpandInt);
    const hi = Math.max(lo, targetInt);
    /** @type {Set<number>} */
    const set = new Set([
      Math.min(hi, worthwhileMin),
      Math.min(hi, 300),
      hi,
    ]);
    for (const preset of [120, 160, 200, 240, 280, 300, 320, 360, 400]) {
      if (preset >= lo && preset <= hi) {
        set.add(preset);
      }
    }
    for (const ratio of [0.4, 0.5, 0.6, 0.7, 0.8]) {
      const value = Math.round(worthwhileMin + (hi - worthwhileMin) * ratio);
      set.add(Math.max(lo, Math.min(hi, value)));
    }
    return [...set].sort((a, b) => a - b);
  };

  /**
   * @param {{ targetInt: number; expandStartInt: number }[]} pairs
   * @param {number} trials
   * @param {number} progressStart
   * @param {number} progressEnd
   * @param {string} phaseLabel
   */
  const evaluatePairs = async (
    pairs,
    trials,
    progressStart,
    progressEnd,
    phaseLabel,
  ) => {
    const total = Math.max(1, pairs.length);
    for (let index = 0; index < pairs.length; index += 1) {
      const { targetInt, expandStartInt } = pairs[index];
      let totalMpAt200 = 0;
      let totalHp = 0;
      let totalPeakMp = 0;
      let validTrials = 0;
      let completeTrials = 0;
      let completeNx = 0;
      let completeMp = 0;
      let completeHp = 0;

      for (let trial = 0; trial < trials; trial += 1) {
        const result = runSimulation(
          {
            ...params,
            targetInt,
            expandStartInt,
            reserveMp: 0,
          },
          { lite: true },
        );

        if (result.validationErrors.length > 0) {
          continue;
        }

        validTrials += 1;
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

      if (validTrials > 0) {
        const averageHp = totalHp / validTrials;
        const averageMpAt200 = totalMpAt200 / validTrials;
        const averagePeakMp = totalPeakMp / validTrials;

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
            fallbackExpandStartInt = expandStartInt;
          }
        } else if (needsExpandStartSearch) {
          const fallbackScore = scoreExpandThenWashFallback(
            averageHp,
            expandStartInt,
          );
          if (fallbackScore > bestFallbackScore) {
            bestFallbackScore = fallbackScore;
            bestFallbackHp = averageHp;
            bestFallbackMp = averageMpAt200;
            fallbackTargetInt = targetInt;
            fallbackExpandStartInt = expandStartInt;
          }
        } else if (
          averageHp > bestFallbackHp ||
          (averageHp === bestFallbackHp && averageMpAt200 > bestFallbackMp)
        ) {
          bestFallbackHp = averageHp;
          bestFallbackMp = averageMpAt200;
          fallbackTargetInt = targetInt;
          fallbackExpandStartInt = expandStartInt;
        }

        if (completeTrials > 0) {
          const averageCompleteNx = completeNx / completeTrials;
          const averageCompleteMp = completeMp / completeTrials;
          const averageCompleteHp = completeHp / completeTrials;

          if (isMage) {
            if (averageCompleteHp > bestMageHp) {
              bestMageHp = averageCompleteHp;
              bestTargetInt = targetInt;
              bestExpandStartInt = expandStartInt;
            }
          } else if (
            !hasMpTarget ||
            averageCompleteMp >= /** @type {number} */ (targetMpAt200)
          ) {
            const planScore = needsExpandStartSearch
              ? scoreExpandThenWashPlan(averageCompleteNx, expandStartInt)
              : averageCompleteNx;
            if (planScore < bestPlanScore) {
              bestPlanScore = planScore;
              bestTargetInt = targetInt;
              bestExpandStartInt = expandStartInt;
            }
          }
        }
      }

      const ratio = (index + 1) / total;
      report(
        progressStart + (progressEnd - progressStart) * ratio,
        needsExpandStartSearch
          ? `${phaseLabel}：目标INT ${targetInt} / 扩蓝启动 ${expandStartInt}（${index + 1}/${total}）`
          : `${phaseLabel}：INT ${targetInt}（${index + 1}/${total}）`,
      );
      if (index % 3 === 0) {
        await yieldToUi();
      }
    }
  };

  /**
   * @param {number[]} targetInts
   * @param {(t: number) => number[]} expandPicker
   * @returns {{ targetInt: number; expandStartInt: number }[]}
   */
  const buildPairs = (targetInts, expandPicker) => {
    /** @type {{ targetInt: number; expandStartInt: number }[]} */
    const pairs = [];
    for (const targetInt of targetInts) {
      const starts = needsExpandStartSearch
        ? expandPicker(targetInt)
        : [targetInt];
      for (const expandStartInt of starts) {
        pairs.push({ targetInt, expandStartInt });
      }
    }
    return pairs;
  };

  report(2, needsExpandStartSearch ? '准备搜索最优 INT 与扩蓝启动点…' : '准备搜索最优 INT…');
  await yieldToUi();

  if (isMage) {
    await evaluatePairs(
      [
        {
          targetInt: Math.min(maxAvailableInt, magicianExpandStartInt),
          expandStartInt: Math.min(maxAvailableInt, magicianExpandStartInt),
        },
      ],
      2,
      5,
      70,
      '法师路径',
    );
  } else {
    /** @type {Set<number>} */
    const coarseSet = new Set(buildIntCandidates(baseInt, maxAvailableInt, 10));
    const defaultInt = getDefaultTargetInt(params.job);
    if (typeof defaultInt === 'number') {
      coarseSet.add(Math.max(baseInt, Math.min(maxAvailableInt, defaultInt)));
    }
    const coarse = [...coarseSet].sort((a, b) => a - b);
    await evaluatePairs(
      buildPairs(coarse, (t) =>
        needsExpandStartSearch
          ? buildExpandStartCandidates(t).filter((_, i, arr) => i % 2 === 0 || i === arr.length - 1)
          : [t],
      ),
      2,
      5,
      50,
      '粗搜',
    );

    const center = bestTargetInt ?? fallbackTargetInt;
    const expandCenter = bestExpandStartInt ?? fallbackExpandStartInt;
    /** @type {Set<number>} */
    const fineSet = new Set(
      buildIntCandidates(
        Math.max(baseInt, center - 20),
        Math.min(maxAvailableInt, center + 20),
        4,
      ),
    );
    if (typeof defaultInt === 'number') {
      fineSet.add(Math.max(baseInt, Math.min(maxAvailableInt, defaultInt)));
    }
    const fine = [...fineSet].sort((a, b) => a - b);
    await evaluatePairs(
      buildPairs(fine, (t) => {
        if (!needsExpandStartSearch) {
          return [t];
        }
        const lo = Math.max(baseInt, minExpandInt, expandCenter - 60);
        const hi = Math.min(t, expandCenter + 60);
        return buildIntCandidates(lo, Math.max(lo, hi), 20);
      }),
      2,
      50,
      78,
      '细搜',
    );

    const refineCenter = bestTargetInt ?? fallbackTargetInt;
    const refineExpand = bestExpandStartInt ?? fallbackExpandStartInt;
    const refineTargets = buildIntCandidates(
      Math.max(baseInt, refineCenter - 6),
      Math.min(maxAvailableInt, refineCenter + 6),
      1,
    );
    await evaluatePairs(
      buildPairs(refineTargets, (t) => {
        if (!needsExpandStartSearch) {
          return [t];
        }
        const lo = Math.max(baseInt, minExpandInt, refineExpand - 24);
        const hi = Math.min(t, refineExpand + 24);
        return buildIntCandidates(lo, Math.max(lo, hi), 4);
      }),
      3,
      78,
      90,
      '精搜',
    );
  }

  const selectedTargetInt = bestTargetInt ?? fallbackTargetInt;
  const selectedExpandStartInt = needsExpandStartSearch
    ? Math.max(
        minExpandInt,
        Math.min(
          selectedTargetInt,
          bestExpandStartInt ?? fallbackExpandStartInt ?? selectedTargetInt,
        ),
      )
    : selectedTargetInt;

  report(
    92,
    needsExpandStartSearch
      ? `生成推荐方案（目标 INT ${selectedTargetInt}，扩蓝启动 ${selectedExpandStartInt}）…`
      : `生成推荐方案（INT ${selectedTargetInt}）…`,
  );
  await yieldToUi();

  let selectedResult = runSimulation({
    ...params,
    targetInt: selectedTargetInt,
    expandStartInt: selectedExpandStartInt,
    reserveMp: 0,
  });

  for (
    let retry = 0;
    retry < 12 &&
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
      expandStartInt: selectedExpandStartInt,
      reserveMp: 0,
    });
  }

  const defaultAllInt = isDefaultAllIntStrategy(params.job);
  const defaultTargetInt = defaultAllInt
    ? null
    : (getDefaultTargetInt(params.job) ?? baseInt);

  report(96, '生成默认 INT 对照方案…');
  await yieldToUi();

  const defaultPlan = defaultAllInt
    ? selectedResult
    : runSimulation({
        ...params,
        targetInt: /** @type {number} */ (defaultTargetInt),
        expandStartInt: needsExpandStartSearch
          ? Math.max(
              minExpandInt,
              Math.min(
                /** @type {number} */ (defaultTargetInt),
                selectedExpandStartInt,
              ),
            )
          : /** @type {number} */ (defaultTargetInt),
        reserveMp: 0,
      });

  report(100, '完成');

  return {
    ...selectedResult,
    optimalTargetInt: selectedTargetInt,
    optimalExpandStartInt: needsExpandStartSearch
      ? selectedExpandStartInt
      : undefined,
    defaultTargetInt,
    defaultAllInt,
    defaultPlan: {
      ...defaultPlan,
      optimalTargetInt: defaultAllInt
        ? selectedTargetInt
        : /** @type {number} */ (defaultTargetInt),
      optimalExpandStartInt: needsExpandStartSearch
        ? selectedExpandStartInt
        : undefined,
      defaultTargetInt,
      defaultAllInt,
      optimizationTargetMp: hasMpTarget ? targetMpAt200 : null,
      optimizationFeasible: defaultPlan.graduationLevel !== null,
    },
    optimizationTargetMp: hasMpTarget ? targetMpAt200 : null,
    optimizationFeasible: bestTargetInt !== null,
  };
}


