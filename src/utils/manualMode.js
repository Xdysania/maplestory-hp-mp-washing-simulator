import {
  APR_NX_COST,
  FRESH_AP_PER_LEVEL,
  INITIAL_STATS,
  JOB_OPTIONS,
  MAX_GAME_LEVEL,
  MAX_HP,
  MAX_MP,
  MIN_STAT,
  allocateLevelUpAp,
  checkSecondJobAdvancement,
  formatApAllocation,
  getAprMpDeduction,
  getEquipmentHpBonus,
  getEquipIntAtLevel,
  getFreshHpWashRange,
  getHpGrowthRange,
  getLevelUpIntMpBonus,
  getMinMp,
  getMpGrowthRange,
  getMpWashGain,
  getStaleHpWashGain,
  getStatFloor,
  getWashTargetHp,
  isMagicianClass,
  randomInt,
  SECOND_JOB_LEVEL,
} from '../config/jobConfig.js';
import {
  allocateSkillPoints,
  formatHpGainDetail,
  getLifeEnhancementHpBonus,
  getMagicBoostMpBonus,
  projectSkillsToLevel,
} from '../config/skillConfig.js';

/**
 * @typedef {import('../config/jobConfig.js').JobId} JobId
 * @typedef {import('../config/jobConfig.js').BaseStats} BaseStats
 * @typedef {import('../config/jobConfig.js').HpEquipmentFlags} HpEquipmentFlags
 * @typedef {import('../config/skillConfig.js').SkillState} SkillState
 */

/**
 * @typedef {Object} ManualSimState
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
 * @typedef {Object} ManualModeConfig
 * @property {JobId} job
 * @property {BaseStats} baseStats
 * @property {number} targetInt
 * @property {number} graduationTargetLevel
 * @property {HpEquipmentFlags} hpEquipment
 * @property {import('../config/jobConfig.js').EquipIntBonus[]} equipIntBonuses
 * @property {import('../config/jobConfig.js').MwLevel} mwLevel
 * @property {number} mwStartLevel
 * @property {number} [startLevel]
 * @property {number} [startHp]
 * @property {number} [startMp]
 * @property {SkillState} [startSkills]
 */

/**
 * @typedef {Object} ManualLogEntry
 * @property {number} id
 * @property {number} level
 * @property {string} kind
 * @property {string} message
 */

/**
 * @typedef {Object} FreshWashUndo
 * @property {'freshHp'} kind
 * @property {number} hpGain
 * @property {number} mpDeduct
 * @property {'str'|'dex'|'int'|'luk'} returnStat
 */

/**
 * @typedef {Object} ResetWashUndo
 * @property {'resetHp'} kind
 * @property {number} hpGain
 * @property {number} mpDeduct
 * @property {'str'|'dex'|'int'|'luk'} [returnStat]
 */

/**
 * @typedef {Object} HpAllocateUndo
 * @property {'hpAllocate'} kind
 * @property {number} hpGain
 * @property {'fresh'|'reset'} apSource
 */

/**
 * @typedef {Object} MpAllocateUndo
 * @property {'mpAllocate'} kind
 * @property {number} mpGain
 * @property {'fresh'|'reset'} apSource
 */

/**
 * @typedef {Object} ExpandUndo
 * @property {'expand'|'mageExpand'} kind
 * @property {number} netMp
 * @property {'str'|'dex'|'int'|'luk'} returnStat
 * @property {'fresh'|'reset'} apSource
 */

/** @typedef {FreshWashUndo | ResetWashUndo | HpAllocateUndo | MpAllocateUndo | ExpandUndo} ManualUndoEntry */

/**
 * @typedef {Object} ApInvestedMap
 * @property {number} str
 * @property {number} dex
 * @property {number} int
 * @property {number} luk
 * @property {number} hp
 * @property {number} mp
 */

/**
 * @typedef {Object} ManualSession
 * @property {ManualModeConfig} config
 * @property {number} equipmentHp
 * @property {number} washTargetHp
 * @property {number} level
 * @property {ManualSimState} state
 * @property {number} freshAp 未投入四属性的新鲜 AP
 * @property {number} resetAp 从四属性扣回的重置 AP
 * @property {boolean} hasGraduated
 * @property {number} baseInt
 * @property {ManualLogEntry[]} log
 * @property {number} nextLogId
 * @property {ManualUndoEntry | null} [lastUndo]
 * @property {number} [hpApInvestedThisLevel] 本级已向 HP 投入的 AP（净额）
 * @property {number} [mpApInvestedThisLevel] 本级已向 MP 投入的 AP（净额）
 * @property {ApInvestedMap} [apInvested] 会话累计投入各属性的 AP 点数
 */

/**
 * @typedef {Object} ManualActionResult
 * @property {boolean} ok
 * @property {string} message
 * @property {ManualSession} session
 */

/**
 * @param {number} mp
 * @param {number} level
 * @param {JobId} job
 * @returns {{ ok: boolean; minMp: number }}
 */
function checkMpConstraint(mp, level, job) {
  const minMp = getMinMp(job, level);
  return { ok: mp >= minMp, minMp };
}

/**
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
 * @param {number} baseHp
 * @param {number} equipmentHp
 * @returns {number}
 */
export function getManualPanelHp(baseHp, equipmentHp) {
  return Math.min(baseHp + Math.max(0, equipmentHp), MAX_HP);
}

/**
 * @param {ManualSimState} state
 * @param {JobId} job
 * @param {number | null} targetInt
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
 * @returns {ApInvestedMap}
 */
function createEmptyApInvested() {
  return { str: 0, dex: 0, int: 0, luk: 0, hp: 0, mp: 0 };
}

/**
 * @param {ApInvestedMap | undefined | null} apInvested
 * @returns {ApInvestedMap}
 */
function cloneApInvested(apInvested) {
  return {
    str: apInvested?.str ?? 0,
    dex: apInvested?.dex ?? 0,
    int: apInvested?.int ?? 0,
    luk: apInvested?.luk ?? 0,
    hp: apInvested?.hp ?? 0,
    mp: apInvested?.mp ?? 0,
  };
}

/**
 * @param {ApInvestedMap} apInvested
 * @param {{ str?: number; dex?: number; int?: number; luk?: number }} allocated
 * @returns {ApInvestedMap}
 */
function applyApAllocationToInvested(apInvested, allocated) {
  return {
    ...apInvested,
    str: apInvested.str + (allocated.str ?? 0),
    dex: apInvested.dex + (allocated.dex ?? 0),
    int: apInvested.int + (allocated.int ?? 0),
    luk: apInvested.luk + (allocated.luk ?? 0),
  };
}

/**
 * 出山时副属性洗净转主属性，同步 AP 投入统计
 * @param {ApInvestedMap} apInvested
 * @param {JobId} job
 * @param {ManualSimState} beforeState
 * @returns {ApInvestedMap}
 */
function applyGraduateApInvested(apInvested, job, beforeState, level) {
  const next = cloneApInvested(apInvested);
  const mainStat = /** @type {'str'|'dex'|'int'|'luk'} */ (
    JOB_OPTIONS[job].mainStat.toLowerCase()
  );
  /** @type {Array<'str'|'dex'|'int'|'luk'>} */
  const otherStats = ['str', 'dex', 'int', 'luk'].filter(
    (stat) => stat !== mainStat,
  );

  for (const stat of otherStats) {
    const floor = getStatFloor(job, stat, level);
    const excess = beforeState[stat] - floor;
    if (excess > 0) {
      next[stat] -= excess;
      next[mainStat] += excess;
    }
  }

  return next;
}

/**
 * @param {ManualSession} session
 * @returns {ApInvestedMap}
 */
export function getManualApInvested(session) {
  return cloneApInvested(session.apInvested);
}

/**
 * @param {ManualSession} session
 * @returns {{ freshAp: number; resetAp: number; totalAp: number }}
 */
export function getManualApPools(session) {
  const freshAp = session.freshAp ?? 0;
  const resetAp = session.resetAp ?? 0;
  return { freshAp, resetAp, totalAp: freshAp + resetAp };
}

/**
 * @param {ManualSession} session
 * @returns {number}
 */
function getTotalAp(session) {
  return (session.freshAp ?? 0) + (session.resetAp ?? 0);
}

/**
 * 统计本级 AP 使用情况
 * @param {ManualSession} session
 * @returns {{ used: number; statAp: number; hpAp: number; mpAp: number }}
 */
export function getApUsageThisLevel(session) {
  const used = Math.max(0, FRESH_AP_PER_LEVEL - getTotalAp(session));
  const hpAp = session.hpApInvestedThisLevel ?? 0;
  const mpAp = session.mpApInvestedThisLevel ?? 0;
  return {
    used,
    statAp: Math.max(0, used - hpAp - mpAp),
    hpAp,
    mpAp,
  };
}

/**
 * HP/MP 共用轨道是否已有 AP 投入（HP 或 MP 累计 ≥ 1）
 * @param {ManualSession} session
 * @returns {boolean}
 */
export function hasWashTrackInvestment(session) {
  const inv = session.apInvested ?? createEmptyApInvested();
  return inv.hp + inv.mp >= 1;
}

/**
 * 是否允许向 HP 直接投入 AP（仅 +HP，不涉及洗血）
 * @param {ManualSession} session
 * @returns {{ ok: boolean; reason?: string }}
 */
export function canManualHpPlus(session) {
  if ((session.freshAp ?? 0) + (session.resetAp ?? 0) <= 0) {
    return { ok: false, reason: '没有可用的 AP' };
  }
  if (session.state.hp >= session.washTargetHp) {
    return {
      ok: false,
      reason: `HP 已达洗血目标 ${session.washTargetHp.toLocaleString('zh-CN')}`,
    };
  }
  return { ok: true };
}

/**
 * 是否允许对 HP 执行 −（撤销上一步直接加点）
 * @param {ManualSession} session
 * @returns {{ ok: boolean; reason?: string }}
 */
export function canManualHpMinus(session) {
  if (session.lastUndo?.kind === 'hpAllocate') {
    return { ok: true };
  }
  return { ok: false, reason: '没有可撤销的 HP 加点' };
}

/**
 * 是否允许向 MP 直接投入 AP（仅 +MP，不涉及扩蓝洗点）
 * @param {ManualSession} session
 * @returns {{ ok: boolean; reason?: string }}
 */
export function canManualMpPlus(session) {
  if ((session.freshAp ?? 0) + (session.resetAp ?? 0) <= 0) {
    return { ok: false, reason: '没有可用的 AP' };
  }
  if (session.state.mp >= MAX_MP) {
    return { ok: false, reason: `MP 已达上限 ${MAX_MP.toLocaleString('zh-CN')}` };
  }
  return { ok: true };
}

/**
 * 是否允许对 MP 执行 −（撤销上一步直接加点）
 * @param {ManualSession} session
 * @returns {{ ok: boolean; reason?: string }}
 */
export function canManualMpMinus(session) {
  if (session.lastUndo?.kind === 'mpAllocate') {
    return { ok: true };
  }
  return { ok: false, reason: '没有可撤销的 MP 加点' };
}

/**
 * 是否允许新鲜 AP 洗血（+HP −MP，消耗 APR）
 * @param {ManualSession} session
 * @returns {{ ok: boolean; reason?: string }}
 */
export function canManualFreshHpWash(session) {
  if ((session.freshAp ?? 0) <= 0) {
    return { ok: false, reason: '没有新鲜 AP' };
  }
  if (session.state.hp >= session.washTargetHp) {
    return {
      ok: false,
      reason: `HP 已达洗血目标 ${session.washTargetHp.toLocaleString('zh-CN')}`,
    };
  }
  return { ok: true };
}

/**
 * 是否允许扩蓝（+MP −退点，消耗 APR）
 * @param {ManualSession} session
 * @returns {{ ok: boolean; reason?: string }}
 */
export function canManualMpExpand(session) {
  if ((session.freshAp ?? 0) > 0) {
    return { ok: true };
  }
  if ((session.resetAp ?? 0) > 0) {
    if (!hasWashTrackInvestment(session)) {
      return {
        ok: false,
        reason: '须先在 HP/MP 轨道投入至少 1 点 AP，才能使用重置 AP 扩蓝',
      };
    }
    return { ok: true };
  }
  return { ok: false, reason: '没有可用的 AP' };
}

/**
 * @param {ManualSession} session
 * @param {string} kind
 * @param {string} message
 * @returns {ManualSession}
 */
function appendLog(session, kind, message) {
  const entry = {
    id: session.nextLogId,
    level: session.level,
    kind,
    message,
  };
  return {
    ...session,
    nextLogId: session.nextLogId + 1,
    log: [entry, ...session.log].slice(0, 200),
  };
}

/**
 * @param {ManualModeConfig} config
 * @returns {ManualSession}
 */
export function createManualSession(config) {
  const equipmentHp = getEquipmentHpBonus(config.hpEquipment);
  const washTargetHp = getWashTargetHp(equipmentHp);
  const rawStart = Number(config.startLevel);
  const startLevel =
    Number.isFinite(rawStart) && rawStart > 1
      ? Math.min(MAX_GAME_LEVEL - 1, Math.max(2, Math.floor(rawStart)))
      : 1;

  /** @type {ManualSimState} */
  let state;
  let level = startLevel;
  let hasGraduated = false;

  if (startLevel <= 1) {
    const initial = INITIAL_STATS[config.job];
    state = {
      hp: initial.hp,
      mp: initial.mp,
      apr: 0,
      str: config.baseStats.str,
      dex: config.baseStats.dex,
      int: config.baseStats.int,
      luk: config.baseStats.luk,
      skills: { lifeRecovery: 0, lifeEnhancement: 0, magicBoost: 0 },
    };
  } else {
    state = {
      hp: Number(config.startHp) || 1,
      mp: Number(config.startMp) || 0,
      apr: 0,
      str: config.baseStats.str,
      dex: config.baseStats.dex,
      int: config.baseStats.int,
      luk: config.baseStats.luk,
      skills: config.startSkills
        ? { ...config.startSkills }
        : projectSkillsToLevel(config.job, startLevel),
    };
    hasGraduated = startLevel >= config.graduationTargetLevel;
  }

  /** @type {ManualSession} */
  const session = {
    config,
    equipmentHp,
    washTargetHp,
    level,
    state,
    freshAp: 0,
    resetAp: 0,
    hasGraduated,
    baseInt: config.baseStats.int,
    log: [],
    nextLogId: 1,
    lastUndo: null,
    hpApInvestedThisLevel: 0,
    mpApInvestedThisLevel: 0,
    apInvested: createEmptyApInvested(),
  };

  return appendLog(
    session,
    'init',
    startLevel <= 1
      ? `手动模式开始 · ${JOB_OPTIONS[config.job].label} · 洗血目标基础 ${washTargetHp.toLocaleString('zh-CN')} HP`
      : `手动模式开始 · 中途 Lv.${startLevel} · HP ${state.hp} MP ${state.mp}`,
  );
}

/**
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
export function manualLevelUp(session) {
  if (getTotalAp(session) > 0) {
    const { freshAp, resetAp } = getManualApPools(session);
    return {
      ok: false,
      message: `请先分配完本级 AP（新鲜 ${freshAp} · 重置 ${resetAp}）`,
      session,
    };
  }
  if (session.level >= MAX_GAME_LEVEL) {
    return { ok: false, message: '已达等级上限', session };
  }

  const nextLevel = session.level + 1;
  const { job, mwLevel, mwStartLevel, equipIntBonuses, targetInt } =
    session.config;
  const state = cloneState(session.state);

  const spResult = allocateSkillPoints(state.skills, job, nextLevel);
  state.skills = spResult.skills;

  const [hpMin, hpMax] = getHpGrowthRange(job, nextLevel);
  const [mpMin, mpMax] = getMpGrowthRange(job, nextLevel);
  const enhancement = state.skills.lifeEnhancement;
  const skillBonus = getLifeEnhancementHpBonus(job, enhancement, 'levelUp');
  const baseHpGain = randomInt(hpMin, hpMax);
  const hpGain = capNaturalHpGain(state.hp, baseHpGain + skillBonus);

  const equipInt = getEquipIntAtLevel(equipIntBonuses, nextLevel);
  const intMpBonus = getLevelUpIntMpBonus(
    state.int,
    equipInt,
    nextLevel,
    mwLevel,
    mwStartLevel,
  );
  const magicBoostBonus = getMagicBoostMpBonus(job, state.skills.magicBoost ?? 0);
  let mpGain = randomInt(mpMin, mpMax) + intMpBonus + magicBoostBonus;
  if (isMagicianClass(job) && state.mp + mpGain > MAX_MP) {
    mpGain = Math.max(0, MAX_MP - state.mp);
  }

  state.hp += hpGain;
  state.mp += mpGain;

  if (nextLevel === SECOND_JOB_LEVEL) {
    const adv = checkSecondJobAdvancement(state, job);
    if (!adv.ok) {
      return { ok: false, message: adv.message ?? '30级转职失败', session };
    }
  }

  let hasGraduated = session.hasGraduated;
  if (!hasGraduated && nextLevel >= session.config.graduationTargetLevel) {
    hasGraduated = true;
  }

  const hpDetail = formatHpGainDetail(baseHpGain, skillBonus, enhancement);
  const parts = [
    spResult.description,
    `自然成长 HP+${hpGain}(${hpDetail}) MP+${mpGain}`,
    `获得 ${FRESH_AP_PER_LEVEL} 点新鲜 AP`,
  ].filter(Boolean);

  const nextSession = appendLog(
    {
      ...session,
      level: nextLevel,
      state,
      freshAp: FRESH_AP_PER_LEVEL,
      resetAp: 0,
      hasGraduated,
      lastUndo: null,
      hpApInvestedThisLevel: 0,
      mpApInvestedThisLevel: 0,
    },
    'levelUp',
    `Lv.${nextLevel}：${parts.join(' → ')}`,
  );

  return { ok: true, message: parts.join(' → '), session: nextSession };
}

/**
 * HP 行 +：直接向 HP 投入 AP（按规则 +HP，不涉及洗血）
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
export function manualHpApPlus(session) {
  const gate = canManualHpPlus(session);
  if (!gate.ok) {
    return { ok: false, message: gate.reason ?? '无法操作', session };
  }

  const apSource = (session.freshAp ?? 0) > 0 ? 'fresh' : 'reset';
  const { job } = session.config;
  const state = cloneState(session.state);
  const result = rollDirectHpApGain(
    state,
    job,
    session.level,
    session.washTargetHp,
  );

  if (!result.success) {
    return { ok: false, message: result.reason ?? 'HP 加点失败', session };
  }

  state.hp += result.hpGain;
  const apInvested = cloneApInvested(session.apInvested);
  apInvested.hp += 1;

  const skillPart =
    (result.skillBonus ?? 0) > 0
      ? `（基础+${result.baseHp} 生命强化+${result.skillBonus}）`
      : '';
  const apLabel = apSource === 'fresh' ? '新鲜' : '重置';
  const message = `HP+${result.hpGain}${skillPart}（消耗 1 ${apLabel} AP）`;

  const nextSession = appendLog(
    {
      ...session,
      state,
      freshAp: apSource === 'fresh' ? session.freshAp - 1 : session.freshAp,
      resetAp: apSource === 'reset' ? session.resetAp - 1 : session.resetAp,
      hpApInvestedThisLevel: (session.hpApInvestedThisLevel ?? 0) + 1,
      apInvested,
      lastUndo: {
        kind: 'hpAllocate',
        hpGain: result.hpGain,
        apSource,
      },
    },
    'hpAllocate',
    message,
  );

  return { ok: true, message, session: nextSession };
}

/**
 * 新鲜 AP 洗血（+HP −MP，消耗 1 AP + 1 APR）
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
export function manualFreshHpWash(session) {
  const gate = canManualFreshHpWash(session);
  if (!gate.ok) {
    return { ok: false, message: gate.reason ?? '无法洗血', session };
  }

  const { job, targetInt } = session.config;
  const state = cloneState(session.state);
  const result = tryFreshHpWash(
    state,
    job,
    session.level,
    session.washTargetHp,
    session.hasGraduated ? null : targetInt,
  );

  if (!result.success) {
    return { ok: false, message: result.reason ?? '洗血失败', session };
  }

  const returnLabel = result.returnStat
    ? `→${String(result.returnStat).toUpperCase()}`
    : '';
  const skillPart =
    (result.skillBonus ?? 0) > 0
      ? `（基础+${result.baseHp} 生命强化+${result.skillBonus}）`
      : '';
  const message = `新鲜洗血：+${result.hpGain}HP${skillPart}，MP-${result.mpDeduct}${returnLabel}（消耗 1 新鲜 AP + 1 APR）`;
  const returnStat = /** @type {'str'|'dex'|'int'|'luk'} */ (result.returnStat);
  const apInvested = cloneApInvested(session.apInvested);
  apInvested.hp += 1;
  apInvested[returnStat] += 1;

  const nextSession = appendLog(
    {
      ...session,
      state,
      freshAp: session.freshAp - 1,
      hpApInvestedThisLevel: (session.hpApInvestedThisLevel ?? 0) + 1,
      apInvested,
      lastUndo: {
        kind: 'freshHp',
        hpGain: result.hpGain,
        mpDeduct: result.mpDeduct,
        returnStat,
      },
    },
    'freshWash',
    message,
  );

  return { ok: true, message, session: nextSession };
}

/**
 * 重置 AP 洗血
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
export function manualResetHpWash(session) {
  if ((session.resetAp ?? 0) <= 0) {
    return { ok: false, message: '没有可用的重置 AP', session };
  }
  if (!hasWashTrackInvestment(session)) {
    return {
      ok: false,
      message: '须先在 HP/MP 轨道投入至少 1 点 AP，才能使用重置 AP 洗血',
      session,
    };
  }

  const { job, targetInt } = session.config;
  const state = cloneState(session.state);
  const result = tryStaleHpWash(
    state,
    job,
    session.level,
    session.washTargetHp,
    session.hasGraduated ? null : targetInt,
  );

  if (!result.success) {
    return { ok: false, message: result.reason ?? '重置洗血失败', session };
  }

  const mpDeduct = result.mpDeduct;
  const returnStat = /** @type {'str'|'dex'|'int'|'luk'} */ (result.returnStat);
  const apInvested = cloneApInvested(session.apInvested);
  apInvested.hp += 1;
  apInvested[returnStat] += 1;

  const message = `重置洗血：+${result.hpGain}HP，MP-${mpDeduct} →${returnStat.toUpperCase()}（消耗 1 重置 AP + 1 APR）`;

  const nextSession = appendLog(
    {
      ...session,
      state,
      resetAp: session.resetAp - 1,
      apInvested,
      lastUndo: {
        kind: 'resetHp',
        hpGain: result.hpGain,
        mpDeduct,
        returnStat,
      },
    },
    'resetWash',
    message,
  );

  return { ok: true, message, session: nextSession };
}

/**
 * HP 行 −：撤销上一步直接加点
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
export function manualHpApMinus(session) {
  const gate = canManualHpMinus(session);
  if (!gate.ok) {
    return { ok: false, message: gate.reason ?? '无法操作', session };
  }

  return manualUndoHpAllocate(session);
}

/**
 * 撤销 HP 直接加点
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
function manualUndoHpAllocate(session) {
  const undo = /** @type {HpAllocateUndo} */ (session.lastUndo);
  const state = cloneState(session.state);

  if (state.hp - undo.hpGain < 1) {
    return { ok: false, message: 'HP 不足以撤销本次加点', session };
  }

  state.hp -= undo.hpGain;
  const apInvested = cloneApInvested(session.apInvested);
  apInvested.hp -= 1;

  const apLabel = undo.apSource === 'fresh' ? '新鲜' : '重置';
  const message = `撤销 HP 加点：-${undo.hpGain}HP，退回 1 ${apLabel} AP`;

  const nextSession = appendLog(
    {
      ...session,
      state,
      freshAp: undo.apSource === 'fresh' ? session.freshAp + 1 : session.freshAp,
      resetAp: undo.apSource === 'reset' ? session.resetAp + 1 : session.resetAp,
      hpApInvestedThisLevel: Math.max(0, (session.hpApInvestedThisLevel ?? 0) - 1),
      apInvested,
      lastUndo: null,
    },
    'undoHpAllocate',
    message,
  );

  return { ok: true, message, session: nextSession };
}

/**
 * 撤销新鲜洗血
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
export function manualUndoFreshHpWash(session) {
  const undo = /** @type {FreshWashUndo} */ (session.lastUndo);
  const { job } = session.config;
  const state = cloneState(session.state);
  const returnStat = undo.returnStat;
  const floor = getStatFloor(job, returnStat, session.level);

  if (state[returnStat] <= floor) {
    return {
      ok: false,
      message: `${returnStat.toUpperCase()} 已达下限，无法撤销洗血`,
      session,
    };
  }
  if (state.hp - undo.hpGain < 1) {
    return { ok: false, message: 'HP 不足以撤销本次洗血', session };
  }
  if (state.apr <= 0) {
    return { ok: false, message: 'APR 计数异常，无法撤销', session };
  }

  state.hp -= undo.hpGain;
  state.mp += undo.mpDeduct;
  state.apr -= 1;
  state[returnStat] -= 1;

  const apInvested = cloneApInvested(session.apInvested);
  apInvested.hp -= 1;
  apInvested[returnStat] -= 1;

  const message = `撤销新鲜洗血：-${undo.hpGain}HP，MP+${undo.mpDeduct}，退回 1 新鲜 AP + 1 APR`;

  const nextSession = appendLog(
    {
      ...session,
      state,
      freshAp: session.freshAp + 1,
      hpApInvestedThisLevel: Math.max(0, (session.hpApInvestedThisLevel ?? 0) - 1),
      apInvested,
      lastUndo: null,
    },
    'undoFreshWash',
    message,
  );

  return { ok: true, message, session: nextSession };
}

/**
 * 撤销重置洗血
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
function manualUndoResetHpWash(session) {
  const undo = /** @type {ResetWashUndo} */ (session.lastUndo);
  const { job } = session.config;
  const state = cloneState(session.state);

  if (state.hp - undo.hpGain < 1) {
    return { ok: false, message: 'HP 不足以撤销本次洗血', session };
  }
  if (state.apr <= 0) {
    return { ok: false, message: 'APR 计数异常，无法撤销', session };
  }

  state.hp -= undo.hpGain;
  state.mp += undo.mpDeduct;
  state.apr -= 1;

  const apInvested = cloneApInvested(session.apInvested);
  apInvested.hp -= 1;

  if (undo.returnStat) {
    const floor = getStatFloor(job, undo.returnStat, session.level);
    if (state[undo.returnStat] <= floor) {
      return {
        ok: false,
        message: `${undo.returnStat.toUpperCase()} 已达下限，无法撤销洗血`,
        session,
      };
    }
    state[undo.returnStat] -= 1;
    apInvested[undo.returnStat] -= 1;
  }

  const message = `撤销重置洗血：-${undo.hpGain}HP，MP+${undo.mpDeduct}，退回 1 重置 AP + 1 APR`;

  const nextSession = appendLog(
    {
      ...session,
      state,
      resetAp: session.resetAp + 1,
      apInvested,
      lastUndo: null,
    },
    'undoResetWash',
    message,
  );

  return { ok: true, message, session: nextSession };
}

/**
 * 提交一次扩蓝结果
 * @param {ManualSession} session
 * @param {ManualSimState} state
 * @param {Object} result
 * @param {'fresh'|'reset'} apSource
 * @param {'expand'|'mageExpand'} kind
 * @param {string} message
 * @returns {ManualActionResult}
 */
function commitMpExpand(
  session,
  state,
  result,
  apSource,
  kind,
  message,
) {
  const returnStat = /** @type {'str'|'dex'|'int'|'luk'} */ (
    kind === 'mageExpand' ? 'int' : result.returnStat
  );
  const apInvested = cloneApInvested(session.apInvested);
  apInvested.mp += 1;
  apInvested[returnStat] += 1;

  const nextSession = appendLog(
    {
      ...session,
      state,
      freshAp: apSource === 'fresh' ? session.freshAp - 1 : session.freshAp,
      resetAp: apSource === 'reset' ? session.resetAp - 1 : session.resetAp,
      mpApInvestedThisLevel: (session.mpApInvestedThisLevel ?? 0) + 1,
      apInvested,
      lastUndo: {
        kind,
        netMp: result.netMp,
        returnStat,
        apSource,
      },
    },
    kind === 'mageExpand' ? 'mageExpand' : 'mpExpand',
    message,
  );

  return { ok: true, message, session: nextSession };
}

/**
 * MP 行 +：直接向 MP 投入 AP（按规则 +MP，不涉及扩蓝洗点）
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
export function manualMpApPlus(session) {
  const gate = canManualMpPlus(session);
  if (!gate.ok) {
    return { ok: false, message: gate.reason ?? '无法操作', session };
  }

  const apSource = (session.freshAp ?? 0) > 0 ? 'fresh' : 'reset';
  const { job } = session.config;
  const state = cloneState(session.state);
  const result = rollDirectMpApGain(state, job, session.level);

  if (!result.success) {
    return { ok: false, message: result.reason ?? 'MP 加点失败', session };
  }

  state.mp += result.mpGain;
  const apInvested = cloneApInvested(session.apInvested);
  apInvested.mp += 1;

  const apLabel = apSource === 'fresh' ? '新鲜' : '重置';
  const message = `MP+${result.mpGain}（基础 INT ${result.intUsed}，消耗 1 ${apLabel} AP）`;

  const nextSession = appendLog(
    {
      ...session,
      state,
      freshAp: apSource === 'fresh' ? session.freshAp - 1 : session.freshAp,
      resetAp: apSource === 'reset' ? session.resetAp - 1 : session.resetAp,
      mpApInvestedThisLevel: (session.mpApInvestedThisLevel ?? 0) + 1,
      apInvested,
      lastUndo: {
        kind: 'mpAllocate',
        mpGain: result.mpGain,
        apSource,
      },
    },
    'mpAllocate',
    message,
  );

  return { ok: true, message, session: nextSession };
}

/**
 * 扩蓝（+MP −退点，消耗 1 AP + 1 APR）
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
export function manualMpExpand(session) {
  const gate = canManualMpExpand(session);
  if (!gate.ok) {
    return { ok: false, message: gate.reason ?? '无法扩蓝', session };
  }

  const apSource = (session.freshAp ?? 0) > 0 ? 'fresh' : 'reset';
  const { job, mwLevel, mwStartLevel, targetInt } = session.config;
  const state = cloneState(session.state);

  const result = tryMpWash(
    state,
    job,
    session.level,
    mwLevel,
    mwStartLevel,
    session.hasGraduated ? null : targetInt,
  );

  if (!result.success) {
    return { ok: false, message: result.reason ?? '扩蓝失败', session };
  }

  const returnLabel = result.returnStat
    ? `→${String(result.returnStat).toUpperCase()}`
    : '';
  const message = `扩蓝：基础INT${result.intUsed}，净MP${result.netMp >= 0 ? '+' : ''}${result.netMp}${returnLabel}（消耗 1 ${apSource === 'fresh' ? '新鲜' : '重置'} AP + 1 APR）`;
  return commitMpExpand(session, state, result, apSource, 'expand', message);
}

/**
 * 法师 APR 扩蓝
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
export function manualMagicianAprExpand(session) {
  const gate = canManualMpExpand(session);
  if (!gate.ok) {
    return { ok: false, message: gate.reason ?? '无法扩蓝', session };
  }

  const apSource = (session.freshAp ?? 0) > 0 ? 'fresh' : 'reset';
  const { job } = session.config;
  const state = cloneState(session.state);
  const result = tryMagicianAprMpCycle(state, job, session.level);

  if (!result.success) {
    return { ok: false, message: result.reason ?? '法师扩蓝失败', session };
  }

  const message = `法师 APR 扩蓝：+${result.mpGain}MP，退点-${result.mpDeduct}，净MP+${result.netMp} →INT（消耗 1 ${apSource === 'fresh' ? '新鲜' : '重置'} AP + 1 APR）`;
  return commitMpExpand(session, state, result, apSource, 'mageExpand', message);
}

/**
 * MP 行 −：撤销上一步直接加点
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
export function manualMpApMinus(session) {
  const gate = canManualMpMinus(session);
  if (!gate.ok) {
    return { ok: false, message: gate.reason ?? '无法操作', session };
  }

  return manualUndoMpAllocate(session);
}

/**
 * 撤销 MP 直接加点
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
function manualUndoMpAllocate(session) {
  const undo = /** @type {MpAllocateUndo} */ (session.lastUndo);
  const { job } = session.config;
  const state = cloneState(session.state);
  const projectedMp = state.mp - undo.mpGain;
  const { ok, minMp } = checkMpConstraint(projectedMp, session.level, job);

  if (!ok) {
    return {
      ok: false,
      message: `撤销后 MP 将低于 Min MP（${minMp.toLocaleString('zh-CN')}）`,
      session,
    };
  }

  state.mp = projectedMp;
  const apInvested = cloneApInvested(session.apInvested);
  apInvested.mp -= 1;

  const apLabel = undo.apSource === 'fresh' ? '新鲜' : '重置';
  const message = `撤销 MP 加点：-${undo.mpGain}MP，退回 1 ${apLabel} AP`;

  const nextSession = appendLog(
    {
      ...session,
      state,
      freshAp: undo.apSource === 'fresh' ? session.freshAp + 1 : session.freshAp,
      resetAp: undo.apSource === 'reset' ? session.resetAp + 1 : session.resetAp,
      mpApInvestedThisLevel: Math.max(0, (session.mpApInvestedThisLevel ?? 0) - 1),
      apInvested,
      lastUndo: null,
    },
    'undoMpAllocate',
    message,
  );

  return { ok: true, message, session: nextSession };
}

/**
 * 撤销扩蓝
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
export function manualUndoMpExpand(session) {
  const undo = /** @type {ExpandUndo} */ (session.lastUndo);
  const { job } = session.config;
  const state = cloneState(session.state);
  const returnStat = undo.returnStat;
  const floor = getStatFloor(job, returnStat, session.level);

  if (state[returnStat] <= floor) {
    return {
      ok: false,
      message: `${returnStat.toUpperCase()} 已达下限，无法撤销扩蓝`,
      session,
    };
  }

  const projectedMp = state.mp - undo.netMp;
  const { ok, minMp } = checkMpConstraint(projectedMp, session.level, job);
  if (!ok) {
    return {
      ok: false,
      message: `撤销后 MP 将低于 Min MP（${minMp.toLocaleString('zh-CN')}）`,
      session,
    };
  }
  if (state.apr <= 0) {
    return { ok: false, message: 'APR 计数异常，无法撤销', session };
  }

  state.mp = projectedMp;
  state.apr -= 1;
  state[returnStat] -= 1;

  const apInvested = cloneApInvested(session.apInvested);
  apInvested.mp -= 1;
  apInvested[returnStat] -= 1;

  const apLabel = undo.apSource === 'reset' ? '重置' : '新鲜';
  const netLabel =
    undo.netMp >= 0 ? `-${undo.netMp}` : `+${Math.abs(undo.netMp)}`;
  const message = `撤销扩蓝：净MP${netLabel}，退回 1 ${apLabel} AP + 1 APR`;

  const nextSession = appendLog(
    {
      ...session,
      state,
      freshAp: undo.apSource === 'fresh' ? session.freshAp + 1 : session.freshAp,
      resetAp: undo.apSource === 'reset' ? session.resetAp + 1 : session.resetAp,
      mpApInvestedThisLevel: Math.max(0, (session.mpApInvestedThisLevel ?? 0) - 1),
      apInvested,
      lastUndo: null,
    },
    'undoExpand',
    message,
  );

  return { ok: true, message, session: nextSession };
}

/**
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
export function manualStaleHpWash(session) {
  return manualResetHpWash(session);
}

/**
 * @param {ManualSession} session
 * @param {'str'|'dex'|'int'|'luk'} stat
 * @returns {ManualActionResult}
 */
export function manualAddStat(session, stat) {
  return manualAdjustField(session, stat, 1);
}

/**
 * @param {ManualSession} session
 * @param {'str'|'dex'|'int'|'luk'} stat
 * @returns {ManualActionResult}
 */
export function manualSubtractStat(session, stat) {
  return manualAdjustField(session, stat, -1);
}

/**
 * 手动分配 / 退回四属性（±1）
 * @param {ManualSession} session
 * @param {'str'|'dex'|'int'|'luk'} stat
 * @param {1|-1} delta
 * @returns {ManualActionResult}
 */
export function manualAdjustField(session, stat, delta) {
  const state = cloneState(session.state);
  const { job } = session.config;
  let freshAp = session.freshAp ?? 0;
  let resetAp = session.resetAp ?? 0;
  let message = '';
  const floor = getStatFloor(job, stat, session.level);
  const apInvested = cloneApInvested(session.apInvested);

  if (delta > 0) {
    if (freshAp + resetAp <= 0) {
      return { ok: false, message: '没有可用的 AP', session };
    }
    state[stat] += 1;
    apInvested[stat] += 1;
    if (freshAp > 0) {
      freshAp -= 1;
      message = `分配新鲜 AP：${stat.toUpperCase()}+1（剩余新鲜 ${freshAp} · 重置 ${resetAp}）`;
    } else {
      resetAp -= 1;
      message = `分配重置 AP：${stat.toUpperCase()}+1（剩余新鲜 ${freshAp} · 重置 ${resetAp}）`;
    }
  } else {
    if (state[stat] <= floor) {
      const floorHint =
        session.level >= SECOND_JOB_LEVEL && floor > MIN_STAT
          ? `（二转后 ${stat.toUpperCase()} 不可低于 ${floor}）`
          : '';
      return {
        ok: false,
        message: `${stat.toUpperCase()} 已达下限 ${floor}，无法再减${floorHint}`,
        session,
      };
    }
    state[stat] -= 1;
    apInvested[stat] -= 1;
    if (freshAp + resetAp < FRESH_AP_PER_LEVEL) {
      resetAp += 1;
      message = `退回 AP：${stat.toUpperCase()}-1（收回 1 重置 AP，剩余新鲜 ${freshAp} · 重置 ${resetAp}）`;
    } else {
      state.apr += 1;
      message = `APR 洗点：${stat.toUpperCase()}-1（AP 已满，消耗 1 APR）`;
    }
  }

  const nextSession = appendLog(
    {
      ...session,
      state,
      freshAp,
      resetAp,
      apInvested,
      lastUndo: null,
    },
    'allocate',
    message,
  );

  return { ok: true, message, session: nextSession };
}

/**
 * @param {ManualSession} session
 * @returns {ManualActionResult}
 */
export function manualAutoAllocate(session) {
  const totalAp = getTotalAp(session);
  if (totalAp <= 0) {
    return { ok: false, message: '没有可用的 AP', session };
  }

  const state = cloneState(session.state);
  const allocated = allocateLevelUpAp(
    state,
    session.config.job,
    session.config.targetInt,
    totalAp,
    session.hasGraduated,
    true,
  );
  const used = totalAp - (allocated.overflow ?? 0);
  let freshAp = session.freshAp ?? 0;
  let resetAp = session.resetAp ?? 0;
  let remaining = used;
  const freshUsed = Math.min(freshAp, remaining);
  freshAp -= freshUsed;
  remaining -= freshUsed;
  resetAp -= remaining;

  const message = `智能分配 ${used} AP：${formatApAllocation(allocated)}`;
  const apInvested = applyApAllocationToInvested(
    cloneApInvested(session.apInvested),
    allocated,
  );

  const overflow = allocated.overflow ?? 0;
  if (overflow > 0) {
    freshAp += overflow;
  }

  const nextSession = appendLog(
    {
      ...session,
      state,
      freshAp,
      resetAp,
      apInvested,
      lastUndo: null,
    },
    'allocate',
    message,
  );

  return { ok: true, message, session: nextSession };
}

/**
 * @param {ManualSession} session
 * @param {boolean} [force=false]
 * @returns {ManualActionResult}
 */
export function manualGraduate(session, force = false) {
  const beforeState = cloneState(session.state);
  const state = cloneState(session.state);
  const { job, targetInt, graduationTargetLevel } = session.config;
  const result = tryGraduateToMainStat(
    state,
    job,
    session.level,
    session.baseInt,
    targetInt,
    true,
    session.washTargetHp,
    force || session.level >= graduationTargetLevel,
  );

  if (!result.graduated) {
    return {
      ok: false,
      message: force
        ? '无法出山（INT 未达目标且非强制出山等级）'
        : '未达出山条件：需 INT 达标或到达出山等级',
      session,
    };
  }

  const detail =
    result.count > 0
      ? `洗净副属性转主属性×${result.count}（${result.detail}）`
      : '副属性已在下限，标记为已出山';
  const message = `出山 Lv.${session.level}：${detail}（消耗 ${result.count} APR）`;
  const apInvested =
    result.count > 0
      ? applyGraduateApInvested(session.apInvested, job, beforeState, session.level)
      : cloneApInvested(session.apInvested);

  const nextSession = appendLog(
    {
      ...session,
      state,
      hasGraduated: true,
      apInvested,
      lastUndo: null,
    },
    'graduate',
    message,
  );

  return { ok: true, message, session: nextSession };
}

/**
 * @param {ManualModeConfig} config
 * @returns {ManualSession}
 */
export function resetManualSession(config) {
  return createManualSession(config);
}

/**
 * @param {ManualSimState} state
 * @returns {ManualSimState}
 */
function cloneState(state) {
  return {
    ...state,
    skills: { ...state.skills },
  };
}

/**
 * 直接向 HP 投入 1 AP 时的 HP 增益（不含洗血退 MP）
 * @param {ManualSimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} washTargetHp
 * @returns {{ success: boolean; hpGain?: number; baseHp?: number; skillBonus?: number; reason?: string }}
 */
function rollDirectHpApGain(state, job, level, washTargetHp) {
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

  return { success: true, hpGain, baseHp, skillBonus };
}

/**
 * 直接向 MP 投入 1 AP 时的 MP 增益（不含 APR 退点）
 * @param {ManualSimState} state
 * @param {JobId} job
 * @param {number} level
 * @returns {{ success: boolean; mpGain?: number; intUsed?: number; reason?: string }}
 */
function rollDirectMpApGain(state, job, level) {
  const intUsed = state.int;
  let mpGain = getMpWashGain(job, intUsed, level);

  if (isMagicianClass(job)) {
    mpGain = Math.min(mpGain, Math.max(0, MAX_MP - state.mp));
  } else {
    mpGain = Math.min(mpGain, Math.max(0, MAX_MP - state.mp));
  }

  if (mpGain <= 0) {
    return {
      success: false,
      reason: isMagicianClass(job) ? 'MP 已达上限' : '当前 INT 下无法获得 MP 增益',
    };
  }

  const projectedMp = state.mp + mpGain;
  const { ok, minMp } = checkMpConstraint(projectedMp, level, job);
  if (!ok) {
    return {
      success: false,
      reason: `加点后 MP 将低于 Min MP（需 ≥ ${minMp}，预计 ${projectedMp}）`,
    };
  }

  return { success: true, mpGain, intUsed };
}

/**
 * @param {ManualSimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} washTargetHp
 * @param {number | null} targetInt
 */
function tryFreshHpWash(state, job, level, washTargetHp, targetInt) {
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
  const { ok, minMp } = checkMpConstraint(projectedMp, level, job);
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
  };
}

/**
 * @param {ManualSimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {import('../config/jobConfig.js').MwLevel} mwLevel
 * @param {number} mwStartLevel
 * @param {number | null} targetInt
 */
function tryMpWash(state, job, level, mwLevel, mwStartLevel, targetInt) {
  const intUsed = state.int;
  const mpGain = getMpWashGain(job, intUsed, level, mwLevel, mwStartLevel);
  const mpDeduct = getAprMpDeduction(job, level);
  const netMp = mpGain - mpDeduct;
  const projectedMp = state.mp + netMp;
  const { ok, minMp } = checkMpConstraint(projectedMp, level, job);
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
 * @param {ManualSimState} state
 * @param {JobId} job
 * @param {number} level
 */
function tryMagicianAprMpCycle(state, job, level) {
  const intUsed = state.int;
  const mpGain = randomInt(18, 19) + Math.floor(intUsed / 10);
  const mpDeduct = getAprMpDeduction(job, level);

  if (state.mp + mpGain > MAX_MP) {
    return {
      success: false,
      reason: `扩蓝会触顶亏损（当前 ${state.mp} +${mpGain} > ${MAX_MP}）`,
    };
  }

  const projectedMp = state.mp + mpGain - mpDeduct;
  const { ok, minMp } = checkMpConstraint(projectedMp, level, job);
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
  };
}

/**
 * @param {ManualSimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} washTargetHp
 * @param {number | null} targetInt
 */
function tryStaleHpWash(state, job, level, washTargetHp, targetInt) {
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
  const { ok, minMp } = checkMpConstraint(projectedMp, level, job);
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
  return { success: true, hpGain, mpDeduct, returnStat };
}

/**
 * @param {ManualSimState} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} baseInt
 * @param {number} targetInt
 * @param {boolean} allowEarlyGraduation
 * @param {number} washTargetHp
 * @param {boolean} force
 */
function tryGraduateToMainStat(
  state,
  job,
  level,
  baseInt,
  targetInt,
  allowEarlyGraduation,
  washTargetHp,
  force,
) {
  if (!force && state.int < targetInt) {
    return { count: 0, graduated: false, detail: '' };
  }
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

export { APR_NX_COST };
