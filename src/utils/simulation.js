import {
  APR_NX_COST,
  getDefaultTargetInt,
  isDefaultAllIntStrategy,
  FRESH_AP_PER_LEVEL,
  INITIAL_STATS,
  APR_MP_DEDUCTION,
  JOB_OPTIONS,
  MAX_HP,
  MAX_MP,
  MAX_GAME_LEVEL,
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
  canUseExpandStartInt,
  getMinProfitableExpandInt,
  getPhysicalMpWashNet,
  getFreshHpWashRange,
  getAprMpDeduction,
  getStaleHpWashGain,
  getStatFloor,
  checkSecondJobAdvancement,
  SECOND_JOB_LEVEL,
  getDefaultExpandStartInt,
} from '../config/jobConfig.js';
import {
  allocateSkillPoints,
  formatHpGainDetail,
  getLifeEnhancementHpBonus,
  getMagicBoostMpBonus,
  projectSkillsToLevel,
  LIFE_ENHANCEMENT_MAX,
  MAGIC_BOOST_MAX,
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
 * @property {number} [expandStartInt] 船长/弓手/飞侠/战士：开始边扩蓝边洗血的 INT（默认=targetInt）
 * @property {number} [preferredTargetInt] 用户设定的目标 INT（智能寻优时作种子/对照方案）
 * @property {number} [preferredExpandStartInt] 用户设定的扩蓝启动 INT（智能寻优时作种子/对照）
 * @property {import('../config/jobConfig.js').EquipIntBonus[]} [equipIntBonuses] 按等级生效的装备智力列表
 * @property {number} [equipInt] 兼容旧参数：固定装备智力（等价于 1 级起生效）
 * @property {number} [targetLevel] 兼容旧参数：同时作为 3w 血目标与出山/模拟终点
 * @property {number} [hpGoalLevel] 目标 3w 血等级（洗血规划终点；默认=targetLevel）
 * @property {number} [graduationTargetLevel] 目标出山等级（此级把 INT 洗回主属性；默认=targetLevel）
 * @property {number} [graduationHpTarget] 出山时目标血量（留空=不单独设，等同满血洗血目标；填写后出山前先洗到此值）
 * @property {number} mwStartLevel
 * @property {import('../config/jobConfig.js').MwLevel} mwLevel
 * @property {number} [reserveMp]
 * @property {HpEquipmentFlags} [hpEquipment]
 * @property {boolean} [noActiveMpExpand] 蓝不足时不主动扩蓝，等待自然增长
 * @property {number} [startLevel] 模拟起点等级（默认 1）；>1 时为中途洗
 * @property {number} [startHp] 中途洗：当前 HP（不含装备加成展示用，模拟用基础 HP）
 * @property {number} [startMp] 中途洗：当前 MP
 * @property {SkillState} [startSkills] 中途洗：当前技能等级；未填则按等级自动推算
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
 * @property {number} hp 基础 HP（模拟状态）
 * @property {number} [panelHp] 面板 HP（基础 + 装备，上限 30,000）
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
 * @property {boolean} [naturalPreview] 满血目标已达成后的自然成长预览行
 */

/**
 * @typedef {Object} SimulationResult
 * @property {LevelRecord[]} records
 * @property {number} finalHp
 * @property {number} finalBaseHp
 * @property {number} equipmentHp
 * @property {number} washTargetHp
 * @property {number} finalMp
 * @property {number} washGoalLevel 目标 3w 血等级（洗血规划终点）
 * @property {number} simEndLevel 模拟终点（含自然成长预览，默认 200）
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
 * @property {number | null} [graduationHp] 出山当时的 HP
 * @property {number} [graduationHpTarget] 设定的出山目标血量
 * @property {boolean} hasWarning
 * @property {string[]} validationErrors
 * @property {number} [optimalTargetInt]
 * @property {number} [optimalExpandStartInt] 最优扩蓝启动 INT（提前扩蓝职业）
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
 * 解析模拟起点（1 级新手 / 中途洗）
 * @param {SimulationParams} params
 * @param {number} graduationTargetLevel
 * @returns {{ startLevel: number; hp: number; mp: number; skills: SkillState; hasGraduated: boolean }}
 */
function resolveSimulationStart(params, graduationTargetLevel) {
  const rawLevel = Number(params.startLevel);
  const startLevel =
    Number.isFinite(rawLevel) && rawLevel > 1
      ? Math.min(199, Math.max(2, Math.floor(rawLevel)))
      : 1;

  if (startLevel <= 1) {
    const initial = INITIAL_STATS[params.job];
    return {
      startLevel: 1,
      hp: initial.hp,
      mp: initial.mp,
      skills: { lifeRecovery: 0, lifeEnhancement: 0, magicBoost: 0 },
      hasGraduated: false,
    };
  }

  const hp = Number(params.startHp);
  const mp = Number(params.startMp);
  const skills =
    params.startSkills && typeof params.startSkills === 'object'
      ? {
          lifeRecovery: params.startSkills.lifeRecovery ?? 0,
          lifeEnhancement: params.startSkills.lifeEnhancement ?? 0,
          magicBoost: params.startSkills.magicBoost ?? 0,
        }
      : projectSkillsToLevel(params.job, startLevel);

  return {
    startLevel,
    hp,
    mp,
    skills,
    hasGraduated: startLevel > graduationTargetLevel,
  };
}

/**
 * 解析模拟起点等级（1 或中途洗等级）
 * @param {SimulationParams} params
 * @returns {number}
 */
function resolveStartLevel(params) {
  const raw = Number(params.startLevel);
  if (Number.isFinite(raw) && raw > 1) {
    return Math.min(199, Math.max(2, Math.floor(raw)));
  }
  return 1;
}

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
 * 法师单次 APR 扩蓝可获得的 MP 区间（仅基础 INT/10，不含 MW/装备）
 * @param {number} baseInt
 * @returns {[number, number]}
 */
function getMagicianExpandMpGainRange(baseInt) {
  const bonus = Math.floor(Math.max(0, baseInt) / 10);
  return [18 + bonus, 19 + bonus];
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
 * 加蓝量 = 18~19 + floor(基础 INT / 10)，不含 MW、不含装备 INT。
 * 若加蓝会超过 3 万则拒绝执行，避免触顶亏损。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @returns {{ success: boolean; mpGain?: number; mpDeduct?: number; netMp?: number; intUsed?: number; peakMp?: number; wouldOverflow?: boolean; reason?: string }}
 */
function tryMagicianAprMpCycle(state, job, level, reserveMp) {
  const intUsed = state.int;
  const mpGain = randomInt(18, 19) + Math.floor(intUsed / 10);
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
    intUsed,
    peakMp,
  };
}

/**
 * 法师近蓝上限循环：每点 AP 先洗到「扩蓝不亏损极限」，再完整扩蓝；
 * 结束后再洗到「下一级自然成长不亏损极限」。绝不一次洗到 Min MP。
 * 扩蓝仅用基础 INT；equipInt 仅保留兼容（自然成长预留由调用方传入 nextNaturalMpHeadroom）。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {number} washTargetHp
 * @param {number} [apCount=5]
 * @param {number} [_equipInt=0] 已废弃：扩蓝不计装备 INT
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
  _equipInt = 0,
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

    const [minGain, maxGain] = getMagicianExpandMpGainRange(state.int);
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

    const mpCycle = tryMagicianAprMpCycle(state, job, level, reserveMp);
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
 * 扩蓝仅用基础 INT；`_equipInt` 保留兼容调用方。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {number} apCount
 * @param {number} [_equipInt=0] 已废弃：扩蓝不计装备 INT
 * @param {number} [washTargetHp=MAX_HP]
 * @returns {{ operation: string; unusedAp: number; peakMp: number; reachedCap: boolean; warning: boolean; warningMessage: string }}
 */
function runMagicianIntThenExpand(
  state,
  job,
  level,
  reserveMp,
  apCount,
  _equipInt = 0,
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
    const [minGain, maxGain] = getMagicianExpandMpGainRange(state.int);
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

    const result = tryMagicianAprMpCycle(state, job, level, reserveMp);
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

  const [, maxGainNow] = getMagicianExpandMpGainRange(state.int);
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
 * 物理职业净蓝 = floor(基础INT/10)-2（仅基础 INT，不含 MW/装备）；
 * 退点扣蓝只发生在流程内，加蓝量 = 净蓝 + 职业 APR 扣蓝，不再从净蓝里重复扣除。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {import('../config/jobConfig.js').MwLevel} mwLevel
 * @param {number} mwStartLevel
 * @param {number | null} [targetInt=null]
 * @returns {{ success: boolean; mpGain?: number; mpDeduct?: number; netMp?: number; intUsed?: number; returnStat?: string; reason?: string }}
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
  const intUsed = state.int;
  const mpGain = getMpWashGain(job, intUsed, level, mwLevel, mwStartLevel);
  const mpDeduct = getAprMpDeduction(job, level);
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
  return { success: true, mpGain, mpDeduct, netMp, intUsed, returnStat };
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
 * 自然升级 HP 封顶：基础 HP 可继续成长至 MAX_HP（30,000）
 * 洗血目标 washTargetHp 仅限制洗血操作，不限制升级自然成长
 * @param {number} currentHp
 * @param {number} gain
 * @returns {number}
 */
function capNaturalHpGain(currentHp, gain) {
  if (gain <= 0) {
    return 0;
  }
  return Math.min(gain, Math.max(0, MAX_HP - currentHp));
}

/**
 * 面板 HP = 基础 + 装备，总上限 30,000
 * @param {number} baseHp
 * @param {number} equipmentHp
 * @returns {number}
 */
function getPanelHp(baseHp, equipmentHp) {
  return Math.min(baseHp + Math.max(0, equipmentHp), MAX_HP);
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
 * 估算单次新鲜洗血的保守 HP（取区间下限 + 生命强化）
 * @param {JobId} job
 * @param {number} level
 * @param {number} lifeEnhancement
 * @returns {number}
 */
function estimateMinFreshWashHp(job, level, lifeEnhancement) {
  const [hpMin] = getFreshHpWashRange(job, level);
  return (
    hpMin + getLifeEnhancementHpBonus(job, lifeEnhancement, 'wash')
  );
}

/**
 * 推演到目标等级：每级自然成长（HP/MP 取下限）+ 新鲜 AP 智能洗血。
 * 用于判断「出山前渐洗 + 出山后每级新鲜 AP」是否够 3w，以及当前蓝是否够支撑。
 * @param {Object} args
 * @param {number} args.currentHp
 * @param {number} args.currentMp
 * @param {number} args.currentLevel 当前已完成的等级
 * @param {number} args.goalLevel
 * @param {JobId} args.job
 * @param {SkillState} args.skills
 * @param {number} args.washTargetHp
 * @param {number} args.panelInt 自然涨蓝用的面板 INT（出山后为下限 INT）
 * @param {import('../config/jobConfig.js').EquipIntBonus[]} args.equipIntBonuses
 * @param {import('../config/jobConfig.js').MwLevel} args.mwLevel
 * @param {number} args.mwStartLevel
 * @param {number} args.reserveMp
 * @param {number} [args.apThisLevel=0] 本级还可用于洗血的新鲜 AP
 * @param {number} [args.graduationLevel] 出山等级；此级之后自然涨蓝按 graduationInt
 * @param {number} [args.graduationInt] 出山后面板 INT（通常为属性下限）
 * @returns {{ finalHp: number; finalMp: number; washesUsed: number; reachable: boolean; blockedByMp: boolean }}
 */
function projectFreshWashPathToGoal({
  currentHp,
  currentMp,
  currentLevel,
  goalLevel,
  job,
  skills,
  washTargetHp,
  panelInt,
  equipIntBonuses,
  mwLevel,
  mwStartLevel,
  reserveMp,
  apThisLevel = 0,
  graduationLevel = null,
  graduationInt = null,
}) {
  /** @type {SkillState} */
  const projectedSkills = {
    lifeRecovery: skills.lifeRecovery,
    lifeEnhancement: skills.lifeEnhancement,
    magicBoost: skills.magicBoost ?? 0,
  };

  let hp = currentHp;
  let mp = currentMp;
  let washesUsed = 0;
  let blockedByMp = false;
  const gradLv =
    typeof graduationLevel === 'number' && Number.isFinite(graduationLevel)
      ? graduationLevel
      : null;
  const gradInt =
    typeof graduationInt === 'number' && Number.isFinite(graduationInt)
      ? graduationInt
      : getStatFloor(job, 'int');

  /**
   * @param {number} level
   * @returns {number}
   */
  const intForLevel = (level) =>
    gradLv !== null && level > gradLv ? gradInt : panelInt;

  /**
   * @param {number} level
   * @param {number} apCount
   */
  const tryWashes = (level, apCount) => {
    for (let i = 0; i < apCount; i += 1) {
      if (hp >= washTargetHp) {
        return;
      }
      const mpDeduct = getAprMpDeduction(job, level);
      const projectedMp = mp - mpDeduct;
      const { ok } = checkMpConstraint(projectedMp, level, job, reserveMp);
      if (!ok) {
        blockedByMp = true;
        return;
      }
      const washHp = estimateMinFreshWashHp(
        job,
        level,
        projectedSkills.lifeEnhancement,
      );
      const gained = capHpGain(hp, washHp, washTargetHp);
      if (gained <= 0) {
        return;
      }
      hp += gained;
      mp = projectedMp;
      washesUsed += 1;
    }
  };

  if (apThisLevel > 0 && currentLevel >= 1) {
    tryWashes(currentLevel, apThisLevel);
  }

  for (let level = currentLevel + 1; level <= goalLevel; level += 1) {
    const spResult = allocateSkillPoints(projectedSkills, job, level);
    projectedSkills.lifeRecovery = spResult.skills.lifeRecovery;
    projectedSkills.lifeEnhancement = spResult.skills.lifeEnhancement;
    projectedSkills.magicBoost = spResult.skills.magicBoost ?? 0;

    const [hpMin] = getHpGrowthRange(job, level);
    const naturalHp =
      hpMin +
      getLifeEnhancementHpBonus(
        job,
        projectedSkills.lifeEnhancement,
        'levelUp',
      );
    hp += capHpGain(hp, naturalHp, washTargetHp);

    const [mpMin] = getMpGrowthRange(job, level);
    const equipInt = getEquipIntAtLevel(equipIntBonuses, level);
    mp +=
      mpMin +
      getLevelUpIntMpBonus(
        intForLevel(level),
        equipInt,
        level,
        mwLevel,
        mwStartLevel,
      ) +
      getMagicBoostMpBonus(job, projectedSkills.magicBoost ?? 0);

    if (hp < washTargetHp) {
      tryWashes(level, FRESH_AP_PER_LEVEL);
    }
  }

  return {
    finalHp: hp,
    finalMp: mp,
    washesUsed,
    reachable: hp >= washTargetHp,
    blockedByMp,
  };
}

/**
 * 当前蓝若不够支撑到满血目标的新鲜洗血规划，则应优先扩蓝。
 * 若设定了出山血量且出山早于满血等级：先保证出山血量，再保证满血。
 * @param {Object} args
 * @returns {boolean}
 */
function shouldExpandToMeetWashPlan(args) {
  const {
    goalLevel,
    washTargetHp,
    graduationLevel,
    graduationHpTarget,
    graduationInt,
  } = args;

  const hasInterim =
    typeof graduationLevel === 'number' &&
    typeof graduationHpTarget === 'number' &&
    graduationLevel < goalLevel &&
    graduationHpTarget < washTargetHp &&
    args.currentLevel < graduationLevel;

  if (hasInterim) {
    const phase1 = projectFreshWashPathToGoal({
      ...args,
      goalLevel: graduationLevel,
      washTargetHp: graduationHpTarget,
      // 出山前 INT 仍按当前面板
      graduationLevel: null,
    });
    if (!phase1.reachable && phase1.blockedByMp) {
      return true;
    }

    const phase2 = projectFreshWashPathToGoal({
      ...args,
      currentHp: Math.max(phase1.finalHp, args.currentHp),
      currentMp: phase1.finalMp,
      currentLevel: graduationLevel,
      goalLevel,
      washTargetHp,
      panelInt:
        typeof graduationInt === 'number' ? graduationInt : args.panelInt,
      graduationLevel: null,
      apThisLevel: 0,
    });
    return !phase2.reachable && phase2.blockedByMp;
  }

  const plan = projectFreshWashPathToGoal(args);
  return !plan.reachable && plan.blockedByMp;
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
  const skillMp = getMagicBoostMpBonus(job, magicBoostLevel);

  for (let level = currentLevel + 1; level <= 200; level += 1) {
    const [, mpMax] = getMpGrowthRange(job, level);
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

  const [minHp, maxHp] = getFreshHpWashRange(job, level);
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

  const mpDeduct = getAprMpDeduction(job, level);
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
 * 单次扩蓝明细：标明所用基础 INT 与净蓝公式（避免与「退点扣蓝」混淆）
 * 物理：净蓝 = ⌊基础INT/10⌋−2；加蓝量 = 净蓝 + 职业退点扣蓝
 * 法师：加蓝 = 18~19+⌊INT/10⌋，退点 −30
 * @param {number} index
 * @param {{ netMp?: number; mpGain?: number; mpDeduct?: number; intUsed?: number; returnStat?: string }} result
 * @param {{ withReturn?: boolean }} [options]
 * @returns {string}
 */
function formatMpWashDetailLine(index, result, options = {}) {
  const intUsed = result.intUsed ?? 0;
  const net = result.netMp ?? 0;
  const ret =
    options.withReturn && result.returnStat
      ? `+MP−MP→${String(result.returnStat).toUpperCase()}，`
      : '';
  const formula = `⌊${intUsed}/10⌋−2`;
  return `第${index}次：基础INT${intUsed}，${ret}${formatMpWashNet(net)}=${formula}（加蓝+${result.mpGain}，退点-${result.mpDeduct}）`;
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
 * 重置洗血不含生命强化加成。
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

  const rawHpGain = getStaleHpWashGain(job, level);
  const hpGain = capHpGain(state.hp, rawHpGain, washTargetHp);
  if (hpGain <= 0) {
    return {
      success: false,
      reason: `HP 已达洗血目标 ${washTargetHp.toLocaleString('zh-CN')}`,
    };
  }

  const mpDeduct = getAprMpDeduction(job, level);
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
 * 超过目标 3w 血等级仍未达标时，继续用新鲜 AP 洗血/扩蓝；蓝不足则等待自然涨蓝。
 * @param {Object} args
 * @param {SimState} args.state
 * @param {JobId} args.job
 * @param {number} args.level
 * @param {number} args.reserveMp
 * @param {import('../config/jobConfig.js').MwLevel} args.mwLevel
 * @param {number} args.mwStartLevel
 * @param {number} args.washTargetHp
 * @param {number} args.targetInt
 * @param {number} args.expandStartInt
 * @param {boolean} args.noActiveMpExpand
 * @param {Object} args.washPlan
 * @param {boolean} args.hasGraduated
 * @param {number} args.equipInt
 * @returns {{ operation: string; segments: OperationSegment[]; warning: boolean; warningMessage: string; unusedAp: number }}
 */
function runExtendedWashAfterGoal({
  state,
  job,
  level,
  reserveMp,
  mwLevel,
  mwStartLevel,
  washTargetHp,
  targetInt,
  expandStartInt,
  noActiveMpExpand,
  washPlan,
  hasGraduated,
  equipInt,
}) {
  if (isMagicianClass(job)) {
    const [, nextMpMax] = getMpGrowthRange(
      job,
      Math.min(level + 1, MAX_GAME_LEVEL),
    );
    const nextNaturalHeadroom =
      nextMpMax +
      getLevelUpIntMpBonus(
        state.int,
        equipInt,
        Math.min(level + 1, MAX_GAME_LEVEL),
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
      FRESH_AP_PER_LEVEL,
      equipInt,
      nextNaturalHeadroom,
    );
    return {
      operation: cycle.operation,
      segments: cycle.operation
        ? cycle.operation.split(' → ').map((text) => ({ text }))
        : [{ text: '延后达标：本级蓝不足，等待自然涨蓝' }],
      warning: cycle.warning,
      warningMessage: cycle.warning
        ? cycle.warningMessage || '延后达标洗血中断（蓝不足，等待自然涨蓝）'
        : '',
      unusedAp: cycle.unusedAp,
    };
  }

  if (
    job === 'buccaneer' ||
    job === 'corsair' ||
    isExpandThenWashJob(job) ||
    (canUseExpandStartInt(job) && expandStartInt < targetInt)
  ) {
    const washResult =
      job === 'buccaneer' || job === 'corsair'
        ? runBuccaneerWashCycle(
            state,
            job,
            level,
            reserveMp,
            mwLevel,
            mwStartLevel,
            washTargetHp,
            targetInt,
            FRESH_AP_PER_LEVEL,
            noActiveMpExpand,
            washPlan,
          )
        : runFreshHpWashWithMpFallback(
            state,
            job,
            level,
            reserveMp,
            mwLevel,
            mwStartLevel,
            '延后达标洗血',
            washTargetHp,
            FRESH_AP_PER_LEVEL,
            noActiveMpExpand,
            targetInt,
            washPlan,
          );
    if (washResult.warning && washResult.warningMessage) {
      washResult.warningMessage = washResult.warningMessage.includes('自然')
        ? washResult.warningMessage
        : `${washResult.warningMessage}（可等待自然涨蓝后在后续等级继续）`;
    }
    return washResult;
  }

  if (hasGraduated) {
    const washResult = runFreshHpWashWithMpFallback(
      state,
      job,
      level,
      reserveMp,
      mwLevel,
      mwStartLevel,
      '延后达标洗血',
      washTargetHp,
      FRESH_AP_PER_LEVEL,
      noActiveMpExpand,
      targetInt,
      washPlan,
    );
    if (washResult.warning && washResult.warningMessage) {
      washResult.warningMessage = washResult.warningMessage.includes('自然')
        ? washResult.warningMessage
        : `${washResult.warningMessage}（可等待自然涨蓝后在后续等级继续）`;
    }
    return washResult;
  }

  return runFreshHpWashWithMpFallback(
    state,
    job,
    level,
    reserveMp,
    mwLevel,
    mwStartLevel,
    '延后达标洗血',
    washTargetHp,
    FRESH_AP_PER_LEVEL,
    noActiveMpExpand,
    targetInt,
    washPlan,
  );
}

/**
 * 出山后智能洗血：每级仅用新鲜升级 AP（+HP → 退 MP 回主属性）。
 * 不靠一次性抽干库存蓝；蓝量靠「出山时库存 + 之后自然涨蓝」支撑到 3w 血目标等级。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @param {number} washTargetHp
 * @param {number} [apCount=5]
 * @returns {{ operation: string; segments: OperationSegment[]; warning: boolean; warningMessage: string; unusedAp: number }}
 */
function runPostGraduationHpWash(
  state,
  job,
  level,
  reserveMp,
  washTargetHp,
  apCount = FRESH_AP_PER_LEVEL,
) {
  let warning = false;
  let warningMessage = '';
  /** @type {OperationSegment[]} */
  const segments = [];
  let usedAp = 0;
  let freshCount = 0;
  let freshHp = 0;
  /** @type {string[]} */
  const freshDetails = [];

  const returnToMain = null;

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
      returnToMain,
    );
    if (!hpResult.success) {
      if (state.hp < washTargetHp) {
        warning = true;
        warningMessage = hpResult.reason ?? '出山后智能洗血中断（蓝不足）';
      }
      break;
    }
    freshCount += 1;
    freshHp += hpResult.hpGain ?? 0;
    freshDetails.push(
      formatFreshHpWashDetail(
        freshCount,
        hpResult,
        state.skills.lifeEnhancement,
      ),
    );
    usedAp += 1;
  }

  if (freshCount > 0) {
    segments.push({
      text: `出山后智能洗血×${freshCount} [合计+${freshHp}HP，+HP后退MP回主属性]`,
      details: freshDetails,
    });
  } else if (state.hp >= washTargetHp) {
    segments.push({ text: '出山后血量已达标' });
  } else {
    segments.push({ text: '出山后蓝不足，本级无法智能洗血' });
    warning = true;
    warningMessage = '出山后 MP 不足以进行智能洗血';
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
 * 拳手/船长类：满生命强化后逐级智能洗血（+HP → 退 MP）。
 * 拳手：未达目标 INT 时优先洗血，仅蓝不够才扩蓝；达目标 INT 后按规划提前为出山存蓝。
 * 船长等：仍按「到洗血目标的新鲜洗血推演」决定是否规划扩蓝。
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
 * @param {Object} [washPlan]
 * @param {number} [washPlan.washGoalLevel]
 * @param {import('../config/jobConfig.js').EquipIntBonus[]} [washPlan.equipIntBonuses]
 * @param {number} [washPlan.graduationLevel]
 * @param {number} [washPlan.graduationInt]
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
  washPlan = null,
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
  let plannedExpandCount = 0;

  const goalLevel =
    washPlan && typeof washPlan.washGoalLevel === 'number'
      ? washPlan.washGoalLevel
      : level;
  const equipIntBonuses = washPlan?.equipIntBonuses ?? [];
  const graduationLevel = washPlan?.graduationLevel ?? null;
  const graduationInt = washPlan?.graduationInt ?? getStatFloor(job, 'int');
  const planGraduationHpTarget =
    washPlan?.graduationHpTarget ?? washTargetHp;
  const fullWashTargetHp =
    washPlan?.fullWashTargetHp ?? washTargetHp;
  /** 拳手达目标 INT 后才规划性为出山存蓝；未达时仅蓝不够洗血才扩 */
  const atTargetInt = state.int >= targetInt;
  const allowProactiveExpand = job !== 'buccaneer' || atTargetInt;

  for (let i = 0; i < apCount; i += 1) {
    if (state.hp >= washTargetHp) {
      break;
    }

    const apLeftIncludingThis = apCount - usedAp;
    const preferExpand =
      allowProactiveExpand &&
      !noActiveMpExpand &&
      goalLevel > level &&
      shouldExpandToMeetWashPlan({
        currentHp: state.hp,
        currentMp: state.mp,
        currentLevel: level,
        goalLevel,
        job,
        skills: state.skills,
        washTargetHp: fullWashTargetHp,
        panelInt: state.int,
        equipIntBonuses,
        mwLevel,
        mwStartLevel,
        reserveMp,
        apThisLevel: apLeftIncludingThis,
        graduationLevel,
        graduationInt,
        graduationHpTarget: planGraduationHpTarget,
      });

    if (!preferExpand) {
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
    if (preferExpand) {
      plannedExpandCount += 1;
    }
    totalNetMp += mpResult.netMp ?? 0;
    mpDetails.push(formatMpWashDetailLine(mpWashCount, mpResult, { withReturn: true }));
    usedAp += 1;
  }

  /** @type {OperationSegment[]} */
  const segments = [];
  if (hpWashCount > 0) {
    segments.push({
      text: `智能洗血×${hpWashCount} [合计+${totalHpFromWash}HP]`,
      details: hpDetails,
    });
  }
  if (skippedExpandForNatural) {
    segments.push({ text: '蓝不足，等待自然增长（不主动扩蓝）' });
  } else if (mpWashCount > 0) {
    const expandLabel =
      plannedExpandCount > 0
        ? job === 'buccaneer' && atTargetInt
          ? `为出山存蓝×${mpWashCount}`
          : `规划扩蓝×${mpWashCount}`
        : `蓝不足改扩蓝×${mpWashCount}`;
    const expandSuffix =
      plannedExpandCount > 0
        ? `，补足到 Lv.${goalLevel} 洗血所需蓝`
        : '';
    segments.push({
      text: `${expandLabel} [${formatMpWashNet(totalNetMp)}${expandSuffix}]`,
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
 * @param {Object} [washPlan] 洗血规划（目标等级与装备 INT，用于判断是否需提前扩蓝）
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
  washPlan = null,
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
      washPlan,
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
        mpDetails.push(formatMpWashDetailLine(mpWashCount, mpResult));
        usedAp += 1;
      }
    }

    while (state.hp < washTargetHp) {
      const staleResult = tryStaleHpWash(
        state,
        job,
        level,
        reserveMp,
        washTargetHp,
      );
      if (!staleResult.success) {
        break;
      }
      staleWashCount += 1;
      totalStaleHp += staleResult.hpGain ?? 0;
      staleDetails.push(
        `第${staleWashCount}次：+${staleResult.hpGain}HP，MP-${getAprMpDeduction(job, level)}`,
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

  // 战士等：新鲜 AP 优先智能洗血；若规划显示到目标等级蓝不够则先扩蓝
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
  let plannedExpandCount = 0;

  const goalLevel =
    washPlan && typeof washPlan.washGoalLevel === 'number'
      ? washPlan.washGoalLevel
      : level;
  const equipIntBonuses = washPlan?.equipIntBonuses ?? [];
  const graduationLevel = washPlan?.graduationLevel ?? null;
  const graduationInt = washPlan?.graduationInt ?? getStatFloor(job, 'int');
  const planGraduationHpTarget =
    washPlan?.graduationHpTarget ?? washTargetHp;
  const fullWashTargetHp =
    washPlan?.fullWashTargetHp ?? washTargetHp;

  for (let i = 0; i < apCount; i += 1) {
    if (state.hp >= washTargetHp) {
      break;
    }

    const apLeftIncludingThis = apCount - usedAp;
    const preferExpand =
      !noActiveMpExpand &&
      goalLevel > level &&
      shouldExpandToMeetWashPlan({
        currentHp: state.hp,
        currentMp: state.mp,
        currentLevel: level,
        goalLevel,
        job,
        skills: state.skills,
        washTargetHp: fullWashTargetHp,
        panelInt: state.int,
        equipIntBonuses,
        mwLevel,
        mwStartLevel,
        reserveMp,
        apThisLevel: apLeftIncludingThis,
        graduationLevel,
        graduationInt,
        graduationHpTarget: planGraduationHpTarget,
      });

    if (!preferExpand && !mpFallback) {
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
    } else if (preferExpand) {
      // 规划性扩蓝
    } else if (noActiveMpExpand) {
      skippedExpandForNatural = true;
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
    if (preferExpand) {
      plannedExpandCount += 1;
    }
    totalNetMp += mpResult.netMp ?? 0;
    mpDetails.push(formatMpWashDetailLine(mpWashCount, mpResult));
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
  } else if (mpWashCount > 0) {
    segments.push({
      text:
        plannedExpandCount > 0
          ? `规划扩蓝×${mpWashCount} [${formatMpWashNet(totalNetMp)}，补足到 Lv.${goalLevel} 洗血所需蓝]`
          : hpWashCount > 0
            ? `蓝不足转扩蓝×${mpWashCount} [${formatMpWashNet(totalNetMp)}]`
            : mpFallback
              ? `蓝不足改扩蓝×${mpWashCount} [${formatMpWashNet(totalNetMp)}]`
              : `扩蓝×${mpWashCount} [${formatMpWashNet(totalNetMp)}]`,
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
 * 出山：把除主属性外的属性洗到各自下限，最大化主属性。
 * 一转前置属性（如拳手 DEX20、飞侠 DEX25）保留为下限，不可洗到 4。
 * 属性点转移只消耗 APR（每点 1 张），不扣除 MP。
 * @param {SimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} baseInt
 * @param {number} targetInt
 * @param {boolean} [allowEarlyGraduation=false]
 * @param {number} [washTargetHp=30000]
 * @param {boolean} [force=false] 强制出山（目标出山等级到达时，不要求满 INT / 满血）
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
  force = false,
) {
  if (!force && state.int < targetInt) {
    return { count: 0, graduated: false, detail: '' };
  }
  // 物理职业需确实加过 INT；法师主属性即 INT，允许维持初始 INT 出山
  if (!force && !isMagicianClass(job) && state.int <= baseInt) {
    return { count: 0, graduated: false, detail: '' };
  }

  if (!force && state.hp < washTargetHp && !allowEarlyGraduation) {
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
    const floor = getStatFloor(job, stat, level);
    const excess = state[stat] - floor;
    if (excess > 0) {
      state[stat] -= excess;
      state[mainStat] += excess;
      state.apr += excess;
      count += excess;
      detailParts.push(
        floor > MIN_STAT
          ? `${stat.toUpperCase()}-${excess}(留${floor})`
          : `${stat.toUpperCase()}-${excess}`,
      );
    }
  }

  if (count === 0) {
    // 法师主属性即 INT，副属性常已是下限：血量达标或强制出山即可
    if (
      force ||
      (state.int >= targetInt &&
        (state.hp >= washTargetHp || allowEarlyGraduation))
    ) {
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
 * 是否显式填写了出山目标血量（留空 = 不单独考核出山血量）
 * @param {SimulationParams} params
 * @returns {boolean}
 */
function hasExplicitGraduationHpTarget(params) {
  if (params.graduationHpTarget === undefined || params.graduationHpTarget === null) {
    return false;
  }
  const trimmed = String(params.graduationHpTarget).trim();
  if (trimmed === '') {
    return false;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0;
}

/**
 * 解析出山目标血量（不超过满血洗血目标；未填写 = 不单独设目标，等同满血洗血目标）
 * @param {SimulationParams} params
 * @param {number} washTargetHp
 * @returns {number}
 */
function resolveGraduationHpTarget(params, washTargetHp) {
  const raw = Number(params.graduationHpTarget);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(washTargetHp, Math.max(1, Math.floor(raw)));
  }
  return washTargetHp;
}

/**
 * 解析洗血目标等级与出山等级（兼容旧的单一 targetLevel）
 * @param {SimulationParams} params
 * @returns {{ hpGoalLevel: number; graduationTargetLevel: number; washGoalLevel: number; simEndLevel: number }}
 */
function resolveLevelGoals(params) {
  const hasLegacy =
    typeof params.targetLevel === 'number' && Number.isFinite(params.targetLevel);
  const legacy = hasLegacy ? params.targetLevel : null;
  const hpGoalLevel =
    typeof params.hpGoalLevel === 'number' && Number.isFinite(params.hpGoalLevel)
      ? params.hpGoalLevel
      : (legacy ?? 180);
  const graduationTargetLevel =
    typeof params.graduationTargetLevel === 'number' &&
    Number.isFinite(params.graduationTargetLevel)
      ? params.graduationTargetLevel
      : (legacy ?? 160);
  return {
    hpGoalLevel,
    graduationTargetLevel,
    washGoalLevel: hpGoalLevel,
    /** 洗血优先止于 hpGoalLevel；未达标则延后至 200 级继续洗血/扩蓝 */
    simEndLevel: MAX_GAME_LEVEL,
  };
}

/**
 * 校验模拟参数
 * @param {SimulationParams} params
 * @returns {string[]}
 */
export function validateParams(params) {
  const errors = [];
  const { hpGoalLevel, graduationTargetLevel, simEndLevel } =
    resolveLevelGoals(params);

  if (hpGoalLevel < 1 || hpGoalLevel > MAX_GAME_LEVEL) {
    errors.push(`目标 3w 血等级需在 1 ~ ${MAX_GAME_LEVEL} 之间`);
  }
  if (graduationTargetLevel < 1 || graduationTargetLevel > MAX_GAME_LEVEL) {
    errors.push(`目标出山等级需在 1 ~ ${MAX_GAME_LEVEL} 之间`);
  }
  const equipHp = getEquipmentHpBonus(
    params.hpEquipment ?? {
      t10Ring: false,
      butterflyRing: false,
      monNecklace: false,
    },
  );
  const washCap = getWashTargetHp(equipHp);
  const gradHpRaw =
    params.graduationHpTarget === undefined ||
    params.graduationHpTarget === null
      ? ''
      : String(params.graduationHpTarget).trim();
  if (gradHpRaw !== '') {
    const ghp = Number(gradHpRaw);
    if (!Number.isFinite(ghp) || ghp < 1 || ghp > washCap) {
      errors.push(
        `出山目标血量需在 1 ~ ${washCap.toLocaleString('zh-CN')} 之间`,
      );
    }
  }
  if (params.mwStartLevel < 7 || params.mwStartLevel > 199) {
    errors.push('MW 生效等级需在 7 ~ 199 之间');
  }
  if (params.mwLevel > 0 && params.mwStartLevel > simEndLevel) {
    errors.push('MW 生效等级不能大于模拟终点等级');
  }

  const startLevel = resolveStartLevel(params);
  if (startLevel > 1) {
    if (startLevel >= hpGoalLevel) {
      errors.push('当前等级须低于目标 3w 血等级');
    }
    const shp = Number(params.startHp);
    const smp = Number(params.startMp);
    if (!Number.isFinite(shp) || shp < 1) {
      errors.push('中途洗需填写有效的当前 HP');
    }
    if (!Number.isFinite(smp) || smp < 0) {
      errors.push('中途洗需填写有效的当前 MP');
    }
    if (params.startSkills) {
      const le = Number(params.startSkills.lifeEnhancement);
      const mb = Number(params.startSkills.magicBoost ?? 0);
      if (Number.isFinite(le) && (le < 0 || le > LIFE_ENHANCEMENT_MAX)) {
        errors.push(`生命强化等级需在 0 ~ ${LIFE_ENHANCEMENT_MAX} 之间`);
      }
      if (Number.isFinite(mb) && (mb < 0 || mb > MAGIC_BOOST_MAX)) {
        errors.push(`魔力强化等级需在 0 ~ ${MAGIC_BOOST_MAX} 之间`);
      }
    }
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
  const equipmentHp = Math.max(0, input.equipmentHp ?? 0);
  return {
    level: input.level,
    hpGain: input.hpGain,
    mpGain: input.mpGain,
    operation: input.operation,
    operationSegments: input.operationSegments,
    warning: input.warning,
    warningMessage: input.warningMessage,
    hp: input.state.hp,
    panelHp: getPanelHp(input.state.hp, equipmentHp),
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
    naturalPreview: Boolean(input.naturalPreview),
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
      washGoalLevel: 180,
      simEndLevel: MAX_GAME_LEVEL,
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
      graduationHp: null,
      graduationHpTarget: MAX_HP,
      hasWarning: false,
      validationErrors,
    };
  }

  const {
    job,
    baseStats,
    targetInt,
    expandStartInt: expandStartIntParam,
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
  const { hpGoalLevel: washGoalLevel, graduationTargetLevel, simEndLevel } =
    resolveLevelGoals(params);
  const targetLevel = simEndLevel;
  const expandStartInt = canUseExpandStartInt(job)
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
  const equipmentHp = getEquipmentHpBonus(hpEquipment);
  const washTargetHp = getWashTargetHp(equipmentHp);
  const graduationHpTarget = resolveGraduationHpTarget(params, washTargetHp);
  const explicitGraduationHp = hasExplicitGraduationHpTarget(params);
  /** 出山前的阶段性洗血目标；出山后改为满血目标 */
  const preGradWashTarget = Math.min(washTargetHp, graduationHpTarget);
  const simStart = resolveSimulationStart(params, graduationTargetLevel);

  /** @type {SimState} */
  const state = {
    hp: simStart.hp,
    mp: simStart.mp,
    apr: 0,
    str: baseStats.str,
    dex: baseStats.dex,
    int: baseStats.int,
    luk: baseStats.luk,
    skills: { ...simStart.skills },
  };

  /** @type {LevelRecord[]} */
  const records = [];
  /** @type {number | null} */
  let graduationLevel = null;
  /** @type {number | null} */
  let graduationHp = null;
  /** 出山后不再补 INT；血未满则继续用新鲜 AP 智能洗血 */
  let hasGraduated = simStart.hasGraduated;

  if (!lite) {
    const startOp =
      simStart.startLevel <= 1
        ? `初始状态 STR${state.str} DEX${state.dex} INT${state.int} LUK${state.luk}`
        : `中途起点 Lv.${simStart.startLevel} · HP ${simStart.hp} MP ${simStart.mp} · STR${state.str} DEX${state.dex} INT${state.int} LUK${state.luk}${
            state.skills.lifeEnhancement > 0
              ? ` · 生命强化 Lv.${state.skills.lifeEnhancement}`
              : ''
          }${
            (state.skills.magicBoost ?? 0) > 0
              ? ` · 魔力强化 Lv.${state.skills.magicBoost}`
              : ''
          }${hasGraduated ? ' · 已出山' : ''}`;
    records.push(
      buildLevelRecord({
        level: simStart.startLevel,
        hpGain: 0,
        mpGain: 0,
        operation: startOp,
        warning: false,
        state,
        equipmentHp,
        minMp: getMinMp(job, simStart.startLevel),
      }),
    );
  }

  let hasWarning = false;
  let peakMp = state.mp;
  /** @type {number | null} */
  let mpCapLevel =
    state.mp >= MAX_MP ? simStart.startLevel : null;
  /** 法师：峰值蓝达到 3 万后进入持续洗血阶段 */
  let mageWashPhase = state.mp >= MAX_MP;
  const loopFrom = simStart.startLevel + 1;
  for (let level = loopFrom; level <= targetLevel; level += 1) {
    if (level === SECOND_JOB_LEVEL) {
      const adv = checkSecondJobAdvancement(state, job);
      if (!adv.ok) {
        hasWarning = true;
        warningMessage = adv.message ?? '30级转职失败';
        break;
      }
    }

    // 先分配当级 SP，使生命强化/魔力强化当级生效（与预估路径一致）
    const spResult = allocateSkillPoints(state.skills, job, level);
    state.skills = spResult.skills;

    const [hpMin, hpMax] = getHpGrowthRange(job, level);
    const [mpMin, mpMax] = getMpGrowthRange(job, level);
    const enhancementForGrowth = state.skills.lifeEnhancement;
    const skillBonusForGrowth = getLifeEnhancementHpBonus(
      job,
      enhancementForGrowth,
      'levelUp',
    );
    const baseHpGain = randomInt(hpMin, hpMax);
    const rawHpGain = baseHpGain + skillBonusForGrowth;
    const hpGain = capNaturalHpGain(state.hp, rawHpGain);
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

    /**
     * 本级洗血目标：出山前冲出山血量，出山后冲满血（含装备时已扣减为基础 HP 目标）
     */
    const stageWashTarget = hasGraduated ? washTargetHp : preGradWashTarget;
    const washTargetReached = state.hp >= washTargetHp;
    const isBeyondWashGoal = level > washGoalLevel;

    /**
     * 仅靠自然成长是否已够本阶段目标（可停洗省 NX）
     * 出山后：未达目标等级时看到目标等级；已达/超过目标等级时看到 200 级。
     * @returns {boolean}
     */
    const canStopWashingByNatural = () => {
      if (hasGraduated) {
        const naturalEndLevel =
          level >= washGoalLevel ? simEndLevel : washGoalLevel;
        return (
          estimateNaturalHpToGoal(
            state.hp,
            level,
            naturalEndLevel,
            job,
            state.skills,
            washTargetHp,
          ) >= washTargetHp
        );
      }
      return (
        level < graduationTargetLevel &&
        estimateNaturalHpToGoal(
          state.hp,
          level,
          graduationTargetLevel,
          job,
          state.skills,
          preGradWashTarget,
        ) >= preGradWashTarget
      );
    };

    const willReachWashTargetNaturally = canStopWashingByNatural();
    /** 有装备且已达/超过目标等级：面板 3w 靠自然成长即可，不再花 NX 洗血 */
    const stopPaidWashAfterGoal =
      equipmentHp > 0 && level >= washGoalLevel;
    /** 已达目标、自然成长足够、或有装备且已过目标等级：仅自然预览 */
    const isNaturalPreview =
      isBeyondWashGoal &&
      (washTargetReached ||
        willReachWashTargetNaturally ||
        equipmentHp > 0);
    /** 无装备时才在超过目标等级后延后洗血；有装备时交给自然成长 */
    const isExtendedWash =
      equipmentHp === 0 &&
      isBeyondWashGoal &&
      !washTargetReached &&
      !willReachWashTargetNaturally;

    /**
     * 洗血规划上下文：用「自然成长 + 每级新鲜 AP 洗血 + 蓝量收支」判断扩蓝与否
     */
    const washPlan = {
      washGoalLevel: isExtendedWash ? simEndLevel : washGoalLevel,
      equipIntBonuses,
      graduationLevel: graduationTargetLevel,
      graduationInt: getStatFloor(job, 'int'),
      graduationHpTarget: preGradWashTarget,
      /** 满血目标（出山后的最终洗血目标） */
      fullWashTargetHp: washTargetHp,
    };

    /**
     * @param {number} endLevel
     * @returns {string}
     */
    const formatNaturalWashStopHint = (endLevel) => {
      if (equipmentHp > 0) {
        return `装备加成下预计 Lv.${endLevel} 自然成长可达面板 ${MAX_HP.toLocaleString('zh-CN')} HP（基础 ${washTargetHp.toLocaleString('zh-CN')}）`;
      }
      return `预计 Lv.${endLevel} 自然成长可达洗血目标 ${washTargetHp.toLocaleString('zh-CN')} HP`;
    };

    if (isNaturalPreview) {
      const allocated = allocateLevelUpAp(
        state,
        job,
        targetInt,
        FRESH_AP_PER_LEVEL,
        true,
      );
      pushPlain(
        washTargetReached
          ? `自然成长预览 (${formatApAllocation(allocated)}，AP 全加主属性，不计洗血)`
          : `自然成长预览 (${formatApAllocation(allocated)}，${formatNaturalWashStopHint(simEndLevel)}，AP 全加主属性不计洗血 NX)`,
      );
    } else if (isExtendedWash) {
      const washResult = runExtendedWashAfterGoal({
        state,
        job,
        level,
        reserveMp,
        mwLevel,
        mwStartLevel,
        washTargetHp,
        targetInt,
        expandStartInt,
        noActiveMpExpand,
        washPlan,
        hasGraduated,
        equipInt,
      });
      if (washResult.warning) {
        warning = true;
        hasWarning = true;
        warningMessage = washResult.warningMessage;
      }
      const leftover = dumpFreshApToMain(state, job, washResult.unusedAp);
      pushSegments(
        annotateWashSegments(washResult, leftover, '（超过目标等级延后达标）'),
      );
    } else if (hasGraduated) {
      if (
        willReachWashTargetNaturally ||
        washTargetReached ||
        stopPaidWashAfterGoal
      ) {
        const allocated = allocateLevelUpAp(
          state,
          job,
          targetInt,
          FRESH_AP_PER_LEVEL,
          true,
        );
        const naturalEndLevel =
          level >= washGoalLevel ? simEndLevel : washGoalLevel;
        pushPlain(
          washTargetReached
            ? `出山后正常升级 (${formatApAllocation(allocated)}，AP 全加主属性${equipmentHp > 0 ? '，面板 HP 已达标' : ''})`
            : stopPaidWashAfterGoal
              ? `出山后节约NX：${equipmentHp > 0 ? `已过 Lv.${washGoalLevel}，装备加成下靠自然成长追面板 ${MAX_HP.toLocaleString('zh-CN')} HP` : formatNaturalWashStopHint(naturalEndLevel)}，本级 AP 全加主属性 (${formatApAllocation(allocated)})`
              : `出山后节约NX：${formatNaturalWashStopHint(naturalEndLevel)}，本级 AP 全加主属性 (${formatApAllocation(allocated)})`,
        );
      } else {
        // 出山后：每级只用新鲜 AP 智能洗血（不抽干库存蓝）
        const washResult = runPostGraduationHpWash(
          state,
          job,
          level,
          reserveMp,
          washTargetHp,
          FRESH_AP_PER_LEVEL,
        );
        if (washResult.warning) {
          warning = true;
          hasWarning = true;
          warningMessage = washResult.warningMessage;
        }
        const leftover = dumpFreshApToMain(state, job, washResult.unusedAp);
        pushSegments(
          annotateWashSegments(washResult, leftover, '（出山后智能洗血）'),
        );
      }
    } else if (isMagicianClass(job)) {
      // 法师：扩蓝净收益未转正时全加 INT，转正后才循环扩蓝；
      // 自然成长将超上限时先防溢出洗血，峰值达 3 万后持续洗血
      if (state.hp >= stageWashTarget) {
        const allocated = allocateLevelUpAp(
          state,
          job,
          targetInt,
          FRESH_AP_PER_LEVEL,
          true,
        );
        pushPlain(
          `血量阶段目标已达成 (${stageWashTarget.toLocaleString('zh-CN')} HP)，本级 AP 加主属性 (${formatApAllocation(allocated)})`,
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
            stageWashTarget,
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
            const [, nextMpMax] = getMpGrowthRange(job, Math.min(targetLevel, level + 1));
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
              stageWashTarget,
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
          const [, nextMpMax] = getMpGrowthRange(job, Math.min(targetLevel, level + 1));
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
            stageWashTarget,
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
    } else if (
      isExpandThenWashJob(job) ||
      (canUseExpandStartInt(job) && expandStartInt < targetInt)
    ) {
      // 船长/弓手/飞侠（及战士提前扩蓝）：免费加 INT 至扩蓝启动点，之后边扩蓝边洗血
      const shouldSaveNx = canStopWashingByNatural();

      if (shouldSaveNx || state.hp >= stageWashTarget) {
        const allocated = allocateLevelUpAp(
          state,
          job,
          targetInt,
          FRESH_AP_PER_LEVEL,
          true,
        );
        pushPlain(
          state.hp >= stageWashTarget
            ? `出山血量已达成 (${stageWashTarget.toLocaleString('zh-CN')} HP)，本级 AP 加主属性 (${formatApAllocation(allocated)})`
            : `智能节约NX：预计 Lv.${graduationTargetLevel} 自然成长可达出山血量 ${stageWashTarget.toLocaleString('zh-CN')}，本级停止洗血 (${formatApAllocation(allocated)})`,
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
                  stageWashTarget,
                  targetInt,
                  remainingAp,
                  noActiveMpExpand,
                  washPlan,
                )
              : runFreshHpWashWithMpFallback(
                  state,
                  job,
                  level,
                  reserveMp,
                  mwLevel,
                  mwStartLevel,
                  '智能扩蓝洗血',
                  stageWashTarget,
                  remainingAp,
                  noActiveMpExpand,
                  targetInt,
                  washPlan,
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
          const intBeforeWash = state.int;
          const washResult =
            job === 'corsair'
              ? runBuccaneerWashCycle(
                  state,
                  job,
                  level,
                  reserveMp,
                  mwLevel,
                  mwStartLevel,
                  stageWashTarget,
                  targetInt,
                  remainingAp,
                  noActiveMpExpand,
                  washPlan,
                )
              : runFreshHpWashWithMpFallback(
                  state,
                  job,
                  level,
                  reserveMp,
                  mwLevel,
                  mwStartLevel,
                  '智能扩蓝洗血',
                  stageWashTarget,
                  remainingAp,
                  noActiveMpExpand,
                  targetInt,
                  washPlan,
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
              `（扩蓝启动后，基础INT ${intBeforeWash}→${state.int}/${targetInt}）`,
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
      // 拳手：满生命强化后优先洗血；未达目标 INT 时蓝不够才扩，达目标 INT 后为出山存蓝
      const lifeMaxed =
        state.skills.lifeEnhancement >= LIFE_ENHANCEMENT_MAX;
      const shouldSaveNx = canStopWashingByNatural();

      if (shouldSaveNx || state.hp >= stageWashTarget) {
        const allocated = allocateLevelUpAp(
          state,
          job,
          targetInt,
          FRESH_AP_PER_LEVEL,
          true,
        );
        pushPlain(
          state.hp >= stageWashTarget
            ? `出山血量已达成 (${stageWashTarget.toLocaleString('zh-CN')} HP)，本级 AP 加主属性 (${formatApAllocation(allocated)})`
            : `智能节约NX：预计 Lv.${washGoalLevel} 自然成长可达洗血目标 ${stageWashTarget.toLocaleString('zh-CN')} HP，本级停止洗血 (${formatApAllocation(allocated)})`,
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
          const intBeforeWash = state.int;
          const washResult = runBuccaneerWashCycle(
            state,
            job,
            level,
            reserveMp,
            mwLevel,
            mwStartLevel,
            stageWashTarget,
            targetInt,
            remainingAp,
            noActiveMpExpand,
            washPlan,
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
              `（生命强化满，基础INT ${intBeforeWash}→${state.int}/${targetInt}）`,
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
      // 智能路径：INT 加满后优先洗血；蓝不够按规划扩蓝
      const shouldSaveNx = canStopWashingByNatural();

      if (shouldSaveNx || state.hp >= stageWashTarget) {
        const allocated = allocateLevelUpAp(
          state,
          job,
          targetInt,
          FRESH_AP_PER_LEVEL,
          true,
        );
        pushPlain(
          state.hp >= stageWashTarget
            ? `出山血量已达成 (${stageWashTarget.toLocaleString('zh-CN')} HP)，本级 AP 加主属性 (${formatApAllocation(allocated)})`
            : `智能节约NX：预计 Lv.${washGoalLevel} 自然成长可达洗血目标 ${stageWashTarget.toLocaleString('zh-CN')} HP，本级停止洗血 (${formatApAllocation(allocated)})`,
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
          stageWashTarget,
          FRESH_AP_PER_LEVEL,
          noActiveMpExpand,
          targetInt,
          washPlan,
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
              stageWashTarget,
            ) >= stageWashTarget;

          if (shouldSaveNx || state.hp >= stageWashTarget) {
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
                : `出山血量已达成，剩余 AP 加主属性 (${formatApAllocation(mainAlloc)})`,
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
              stageWashTarget,
              remainingAp,
              noActiveMpExpand,
              targetInt,
              washPlan,
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

    if (!hasGraduated && level >= graduationTargetLevel) {
      const graduation = tryGraduateToMainStat(
        state,
        job,
        level,
        baseStats.int,
        targetInt,
        true,
        washTargetHp,
        true,
      );
      if (graduation.graduated && graduationLevel === null) {
        graduationLevel = level;
        graduationHp = state.hp;
        hasGraduated = true;
        let hpNote = `血量 ${state.hp.toLocaleString('zh-CN')}`;
        if (explicitGraduationHp) {
          hpNote += `/${preGradWashTarget.toLocaleString('zh-CN')}`;
          if (state.hp < preGradWashTarget) {
            hpNote += '（未达出山目标血）';
            warning = true;
            hasWarning = true;
            warningMessage = `出山时血量未达设定目标 ${preGradWashTarget.toLocaleString('zh-CN')}`;
          }
        } else if (state.hp < washTargetHp) {
          // 未单独设出山血量：出山时未满血是正常现象（出山后继续洗），不标警告
          hpNote += `（满血目标 ${washTargetHp.toLocaleString('zh-CN')}，出山后继续洗）`;
        } else {
          hpNote += `/${washTargetHp.toLocaleString('zh-CN')}`;
        }
        if (graduation.count > 0) {
          pushPlain(
            `出山 Lv.${level}：洗净副属性转主属性×${graduation.count} (${graduation.detail}，消耗${graduation.count}张APR，不扣MP) · ${hpNote}`,
          );
        } else {
          pushPlain(
            `出山 Lv.${level}：停止补 INT，此后 AP 全加主属性 · ${hpNote}`,
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
          equipmentHp,
          minMp: Math.max(getMinMp(job, level), reserveMp),
          naturalPreview: isNaturalPreview,
        }),
      );
    }
  }

  const finalBaseHp = Math.min(state.hp, MAX_HP);
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
    finalHp: getPanelHp(state.hp, equipmentHp),
    finalBaseHp,
    equipmentHp,
    washTargetHp,
    finalMp: state.mp,
    washGoalLevel,
    simEndLevel: targetLevel,
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
    graduationHp,
    graduationHpTarget: preGradWashTarget,
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
 * 解析用户偏好的目标 INT（未填则回落到职业默认）
 * @param {Omit<SimulationParams, 'targetInt' | 'reserveMp'>} params
 * @param {number} baseInt
 * @param {number} maxAvailableInt
 * @returns {number | null} 法师返回 null
 */
function resolvePreferredTargetInt(params, baseInt, maxAvailableInt) {
  if (isDefaultAllIntStrategy(params.job)) {
    return null;
  }
  const raw = Number(params.preferredTargetInt);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.max(baseInt, Math.min(maxAvailableInt, Math.floor(raw)));
  }
  const fallback = getDefaultTargetInt(params.job) ?? baseInt;
  return Math.max(baseInt, Math.min(maxAvailableInt, fallback));
}

/**
 * 解析用户偏好的扩蓝启动 INT
 * @param {Omit<SimulationParams, 'targetInt' | 'reserveMp'>} params
 * @param {number} targetInt
 * @param {number} baseInt
 * @returns {number}
 */
function resolvePreferredExpandStartInt(params, targetInt, baseInt) {
  const minExpand = getMinProfitableExpandInt();
  const raw = Number(params.preferredExpandStartInt);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.max(
      baseInt,
      minExpand,
      Math.min(targetInt, Math.floor(raw)),
    );
  }
  const fallback =
    getDefaultExpandStartInt(params.job) ?? targetInt;
  return Math.max(
    baseInt,
    minExpand,
    Math.min(targetInt, fallback),
  );
}

/**
 * 按固定目标 INT（及扩蓝启动 INT）直接模拟，不智能寻优
 * @param {Omit<SimulationParams, 'reserveMp'> & { targetInt: number }} params
 * @param {number | null | undefined} targetMpAt200
 * @param {(progress: { percent: number; message: string }) => void} [onProgress]
 * @returns {Promise<SimulationResult>}
 */
export async function runFixedTargetInt(params, targetMpAt200, onProgress) {
  const hasMpTarget =
    typeof targetMpAt200 === 'number' &&
    Number.isFinite(targetMpAt200) &&
    targetMpAt200 > 0;

  onProgress?.({ percent: 15, message: '按设定 INT 模拟…' });
  await yieldToUi();

  const result = runSimulation({
    ...params,
    reserveMp: 0,
  });

  onProgress?.({ percent: 100, message: '完成' });

  const needsExpand =
    isExpandThenWashJob(params.job) ||
    (hasMpTarget && canUseExpandStartInt(params.job)) ||
    canUseExpandStartInt(params.job);

  return {
    ...result,
    optimalTargetInt: params.targetInt,
    optimalExpandStartInt: needsExpand
      ? (params.expandStartInt ?? params.targetInt)
      : undefined,
    defaultTargetInt: isDefaultAllIntStrategy(params.job)
      ? null
      : params.targetInt,
    defaultAllInt: isDefaultAllIntStrategy(params.job),
    optimizationTargetMp: hasMpTarget ? targetMpAt200 : null,
    optimizationFeasible: result.graduationLevel !== null,
  };
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
 * 船长/弓手/飞侠会同时搜索「扩蓝启动 INT」；设了目标蓝时战士也会搜索，并偏向提前扩蓝以攒更多蓝。
 * 采用粗搜→精搜，并支持进度回调（异步让出主线程，避免界面卡死）。
 * @param {Omit<SimulationParams, 'targetInt' | 'reserveMp'>} params
 * @param {number | null | undefined} targetMpAt200 留空/null 表示不强制目标蓝，按推演结果为准
 * @param {(progress: { percent: number; message: string }) => void} [onProgress]
 * @returns {Promise<SimulationResult>}
 */
export async function optimizeTargetInt(params, targetMpAt200, onProgress) {
  const baseInt = params.baseStats.int;
  const startLevel = resolveStartLevel(params);
  const { washGoalLevel, simEndLevel } = resolveLevelGoals(params);
  const maxAvailableInt = Math.min(
    999,
    baseInt + FRESH_AP_PER_LEVEL * Math.max(0, washGoalLevel - startLevel),
  );
  const hasMpTarget =
    typeof targetMpAt200 === 'number' &&
    Number.isFinite(targetMpAt200) &&
    targetMpAt200 > 0;
  const isMage = isMagicianClass(params.job);
  /** 设目标蓝时战士也搜扩蓝启动，以便提前扩蓝 */
  const needsExpandStartSearch =
    isExpandThenWashJob(params.job) ||
    (hasMpTarget && canUseExpandStartInt(params.job));
  const minExpandInt = getMinProfitableExpandInt();
  /** 法师扩蓝净收益转正：18+⌊INT/10⌋−30 > 0 → INT≥130（仅基础 INT） */
  const magicianExpandStartInt = Math.max(baseInt, 130);
  const preferredTargetInt = resolvePreferredTargetInt(
    params,
    baseInt,
    maxAvailableInt,
  );
  const preferredExpandStartInt =
    typeof preferredTargetInt === 'number'
      ? resolvePreferredExpandStartInt(
          params,
          preferredTargetInt,
          baseInt,
        )
      : magicianExpandStartInt;

  let bestTargetInt = null;
  let bestExpandStartInt = null;
  /** 综合分越低越好 */
  let bestPlanScore = Number.POSITIVE_INFINITY;
  let bestCompleteMp = -1;
  let bestMageHp = -1;
  let fallbackTargetInt = baseInt;
  let fallbackExpandStartInt = baseInt;
  let bestFallbackHp = -1;
  let bestFallbackMp = -1;
  let bestFallbackPeakMp = -1;
  let bestFallbackScore = -1;

  /**
   * 无目标蓝时：总 NX × 偏离理想扩蓝收益的惩罚（理想净蓝约 25 ≈ INT 270）。
   * 有目标蓝时：优先够蓝，再比 NX；同档偏向更高蓝量 / 更早扩蓝。
   * @param {number} totalNx
   * @param {number} expandStartInt
   * @param {number} [projectedMp=0]
   * @returns {number}
   */
  const scoreExpandThenWashPlan = (
    totalNx,
    expandStartInt,
    projectedMp = 0,
  ) => {
    if (hasMpTarget) {
      // NX 为主；略奖励更高蓝与更早启动，避免挤掉「提前扩蓝」方案
      return (
        totalNx -
        projectedMp * 0.002 -
        (maxAvailableInt - expandStartInt) * 0.05
      );
    }
    const netAtStart = Math.max(1, getPhysicalMpWashNet(expandStartInt));
    const idealNet = 25;
    const efficiencyPenalty =
      1 + ((netAtStart - idealNet) / idealNet) ** 2;
    return totalNx * efficiencyPenalty;
  };

  /**
   * 未完成洗血时的回退分（越高越好）
   * @param {number} averageHp
   * @param {number} expandStartInt
   * @param {number} [averageMp=0]
   * @returns {number}
   */
  const scoreExpandThenWashFallback = (
    averageHp,
    expandStartInt,
    averageMp = 0,
  ) => {
    if (hasMpTarget) {
      // 目标蓝优先：蓝量权重高于血量
      return averageMp * 1000 + averageHp;
    }
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
   * 无目标蓝：以约 200~320 为重点；有目标蓝：加密偏早启动点以多攒蓝。
   * @param {number} targetInt
   * @returns {number[]}
   */
  const buildExpandStartCandidates = (targetInt) => {
    const worthwhileMin = Math.max(baseInt, minExpandInt, 120);
    const lo = Math.max(baseInt, minExpandInt);
    const hi = Math.max(lo, targetInt);
    /** @type {Set<number>} */
    const set = new Set([
      Math.min(hi, worthwhileMin),
      Math.min(hi, 300),
      hi,
      Math.max(lo, Math.min(hi, preferredExpandStartInt)),
    ]);

    if (hasMpTarget) {
      // 目标蓝：尽早扩蓝 → 加密低 INT 启动点
      for (const preset of [
        30, 50, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300,
        320, 360, 400,
      ]) {
        if (preset >= lo && preset <= hi) {
          set.add(preset);
        }
      }
      for (let value = lo; value <= Math.min(hi, worthwhileMin + 80); value += 10) {
        set.add(value);
      }
      for (const ratio of [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85]) {
        const value = Math.round(lo + (hi - lo) * ratio);
        set.add(Math.max(lo, Math.min(hi, value)));
      }
    } else {
      for (const preset of [120, 160, 200, 240, 280, 300, 320, 360, 400]) {
        if (preset >= lo && preset <= hi) {
          set.add(preset);
        }
      }
      for (const ratio of [0.4, 0.5, 0.6, 0.7, 0.8]) {
        const value = Math.round(worthwhileMin + (hi - worthwhileMin) * ratio);
        set.add(Math.max(lo, Math.min(hi, value)));
      }
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
          : result.finalBaseHp >= result.washTargetHp &&
            result.graduationLevel !== null;

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
            averageMpAt200,
          );
          if (fallbackScore > bestFallbackScore) {
            bestFallbackScore = fallbackScore;
            bestFallbackHp = averageHp;
            bestFallbackMp = averageMpAt200;
            fallbackTargetInt = targetInt;
            fallbackExpandStartInt = expandStartInt;
          }
        } else if (hasMpTarget) {
          if (
            averageMpAt200 > bestFallbackMp ||
            (averageMpAt200 === bestFallbackMp && averageHp > bestFallbackHp)
          ) {
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
              ? scoreExpandThenWashPlan(
                  averageCompleteNx,
                  expandStartInt,
                  averageCompleteMp,
                )
              : hasMpTarget
                ? averageCompleteNx - averageCompleteMp * 0.002
                : averageCompleteNx;
            const betterScore = planScore < bestPlanScore - 1e-9;
            const similarScore =
              Math.abs(planScore - bestPlanScore) <= 1e-9 &&
              (averageCompleteMp > bestCompleteMp ||
                (averageCompleteMp === bestCompleteMp &&
                  expandStartInt < (bestExpandStartInt ?? Infinity)));
            if (bestTargetInt === null || betterScore || similarScore) {
              bestPlanScore = planScore;
              bestCompleteMp = averageCompleteMp;
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

  report(
    2,
    needsExpandStartSearch
      ? hasMpTarget
        ? '准备搜索最优 INT 与提前扩蓝启动点（目标蓝优先）…'
        : '准备搜索最优 INT 与扩蓝启动点…'
      : '准备搜索最优 INT…',
  );
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
    if (typeof preferredTargetInt === 'number') {
      coarseSet.add(preferredTargetInt);
    }
    const coarse = [...coarseSet].sort((a, b) => a - b);
    await evaluatePairs(
      buildPairs(coarse, (t) => {
        if (!needsExpandStartSearch) {
          return [t];
        }
        const candidates = buildExpandStartCandidates(t);
        // 有目标蓝时保留全部偏早候选；无目标蓝时粗搜可抽稀
        if (hasMpTarget) {
          return candidates;
        }
        return candidates.filter(
          (_, i, arr) => i % 2 === 0 || i === arr.length - 1,
        );
      }),
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
    if (typeof preferredTargetInt === 'number') {
      fineSet.add(preferredTargetInt);
    }
    const fine = [...fineSet].sort((a, b) => a - b);
    await evaluatePairs(
      buildPairs(fine, (t) => {
        if (!needsExpandStartSearch) {
          return [t];
        }
        if (hasMpTarget) {
          // 细搜同时覆盖「当前最优点附近」与「更早启动」区间
          const earlyLo = Math.max(baseInt, minExpandInt);
          const earlyHi = Math.min(t, Math.max(expandCenter, earlyLo + 40));
          /** @type {Set<number>} */
          const set = new Set([
            ...buildIntCandidates(earlyLo, earlyHi, 15),
            ...buildIntCandidates(
              Math.max(earlyLo, expandCenter - 80),
              Math.min(t, expandCenter + 40),
              10,
            ),
          ]);
          return [...set].sort((a, b) => a - b);
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
        if (hasMpTarget) {
          const earlyLo = Math.max(baseInt, minExpandInt);
          /** @type {Set<number>} */
          const set = new Set([
            ...buildIntCandidates(earlyLo, Math.min(t, refineExpand + 10), 8),
            ...buildIntCandidates(
              Math.max(earlyLo, refineExpand - 32),
              Math.min(t, refineExpand + 16),
              2,
            ),
          ]);
          return [...set].sort((a, b) => a - b);
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
          selectedResult.finalBaseHp < selectedResult.washTargetHp ||
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
    : (preferredTargetInt ?? baseInt);

  report(96, '生成设定 INT 对照方案…');
  await yieldToUi();

  const defaultPlan = defaultAllInt
    ? selectedResult
    : runSimulation({
        ...params,
        targetInt: /** @type {number} */ (defaultTargetInt),
        expandStartInt: needsExpandStartSearch
          ? preferredExpandStartInt
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


