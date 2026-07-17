import {
  APR_NX_COST,
  FRESH_AP_PER_LEVEL,
  INITIAL_STATS,
  APR_MP_DEDUCTION,
  FRESH_HP_WASH_RANGE,
  getHpGrowthRange,
  getMpGrowthRange,
  getMinMp,
  getLevelUpIntMpBonus,
  getMpWashGain,
  randomInt,
} from '../config/jobConfig.js';

/**
 * @typedef {import('../config/jobConfig.js').JobId} JobId
 */

/**
 * @typedef {Object} SimulationParams
 * @property {JobId} job
 * @property {number} baseInt
 * @property {number} equipInt
 * @property {number} mpWashStart
 * @property {number} mpWashEnd
 * @property {number} hpWashStart
 * @property {number} hpWashEnd
 * @property {number} targetLevel
 * @property {number} reserveMp
 */

/**
 * @typedef {Object} LevelRecord
 * @property {number} level
 * @property {number} hpGain
 * @property {number} mpGain
 * @property {string} operation
 * @property {boolean} warning
 * @property {string} [warningMessage]
 * @property {number} hp
 * @property {number} mp
 * @property {number} minMp
 * @property {number} totalApr
 * @property {number} totalNx
 */

/**
 * @typedef {Object} SimulationResult
 * @property {LevelRecord[]} records
 * @property {number} finalHp
 * @property {number} finalMp
 * @property {number} finalBaseInt
 * @property {number} totalApr
 * @property {number} totalNx
 * @property {boolean} hasWarning
 * @property {string[]} validationErrors
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
 * 尝试执行一次扩蓝
 * @param {{ hp: number; mp: number; apr: number }} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} baseInt
 * @param {number} reserveMp
 * @returns {{ success: boolean; mpGain?: number; mpDeduct?: number; reason?: string }}
 */
function tryMpWash(state, job, level, baseInt, reserveMp) {
  const mpGain = getMpWashGain(job, baseInt);
  const mpDeduct = APR_MP_DEDUCTION[job];
  const projectedMp = state.mp + mpGain - mpDeduct;
  const { ok, minMp } = checkMpConstraint(projectedMp, level, job, reserveMp);

  if (!ok) {
    return {
      success: false,
      reason: `MP 不足（需 ≥ ${minMp}，预计 ${projectedMp}）`,
    };
  }

  state.mp = projectedMp;
  state.apr += 1;
  return { success: true, mpGain, mpDeduct };
}

/**
 * 尝试执行一次升级洗血
 * @param {{ hp: number; mp: number; apr: number }} state
 * @param {JobId} job
 * @param {number} level
 * @param {number} reserveMp
 * @returns {{ success: boolean; hpGain?: number; mpDeduct?: number; reason?: string }}
 */
function tryFreshHpWash(state, job, level, reserveMp) {
  const [minHp, maxHp] = FRESH_HP_WASH_RANGE[job];
  const hpGain = randomInt(minHp, maxHp);
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
  return { success: true, hpGain, mpDeduct };
}

/**
 * 判断等级是否在区间内（含边界）
 * @param {number} level
 * @param {number} start
 * @param {number} end
 * @returns {boolean}
 */
function inRange(level, start, end) {
  if (start <= 0 || end <= 0) {
    return false;
  }
  return level >= start && level <= end;
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
  if (params.baseInt < 4) {
    errors.push('面板基础智力不能低于 4');
  }
  if (params.equipInt < 0) {
    errors.push('装备智力不能为负数');
  }
  if (params.reserveMp < 0) {
    errors.push('预留 MP 不能为负数');
  }

  const mpValid = params.mpWashStart > 0 && params.mpWashEnd > 0;
  const hpValid = params.hpWashStart > 0 && params.hpWashEnd > 0;

  if (mpValid && params.mpWashStart > params.mpWashEnd) {
    errors.push('扩蓝开始等级不能大于结束等级');
  }
  if (hpValid && params.hpWashStart > params.hpWashEnd) {
    errors.push('洗血开始等级不能大于结束等级');
  }
  if (
    mpValid &&
    hpValid &&
    params.mpWashStart <= params.hpWashEnd &&
    params.hpWashStart <= params.hpWashEnd
  ) {
    const mpRange = [params.mpWashStart, params.mpWashEnd];
    const hpRange = [params.hpWashStart, params.hpWashEnd];
    const overlap = mpRange[0] <= hpRange[1] && hpRange[0] <= mpRange[1];
    if (overlap) {
      errors.push('扩蓝与洗血等级区间不能重叠（每级仅 5 点新鲜 AP）');
    }
  }

  return errors;
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
      finalMp: 0,
      finalBaseInt: params.baseInt,
      totalApr: 0,
      totalNx: 0,
      hasWarning: false,
      validationErrors,
    };
  }

  const { job, baseInt, equipInt, targetLevel, reserveMp } = params;
  const initial = INITIAL_STATS[job];

  /** @type {{ hp: number; mp: number; apr: number }} */
  const state = {
    hp: initial.hp,
    mp: initial.mp,
    apr: 0,
  };

  /** @type {LevelRecord[]} */
  const records = [];

  records.push({
    level: 1,
    hpGain: 0,
    mpGain: 0,
    operation: '初始状态',
    warning: false,
    hp: state.hp,
    mp: state.mp,
    minMp: getMinMp(job, 1),
    totalApr: 0,
    totalNx: 0,
  });

  let hasWarning = false;

  for (let level = 2; level <= targetLevel; level += 1) {
    const [hpMin, hpMax] = getHpGrowthRange(job, level);
    const [mpMin, mpMax] = getMpGrowthRange(job);
    const hpGain = randomInt(hpMin, hpMax);
    const mpGain =
      randomInt(mpMin, mpMax) + getLevelUpIntMpBonus(baseInt, equipInt);

    state.hp += hpGain;
    state.mp += mpGain;

    const operationParts = [`自然成长 HP+${hpGain} MP+${mpGain}`];
    let warning = false;
    let warningMessage = '';

    const doMpWash = inRange(level, params.mpWashStart, params.mpWashEnd);
    const doHpWash = inRange(level, params.hpWashStart, params.hpWashEnd);

    if (doMpWash) {
      let washCount = 0;
      const washDetails = [];

      for (let i = 0; i < FRESH_AP_PER_LEVEL; i += 1) {
        const result = tryMpWash(state, job, level, baseInt, reserveMp);
        if (!result.success) {
          warning = true;
          hasWarning = true;
          warningMessage = result.reason ?? '扩蓝中断';
          break;
        }
        washCount += 1;
        washDetails.push(`+${result.mpGain}/-${result.mpDeduct}`);
      }

      operationParts.push(
        washCount > 0
          ? `扩蓝×${washCount}${warning ? '（中断）' : ''} [${washDetails.join(', ')}]`
          : '扩蓝失败',
      );
    } else if (doHpWash) {
      let washCount = 0;
      const washDetails = [];
      let totalHpFromWash = 0;

      for (let i = 0; i < FRESH_AP_PER_LEVEL; i += 1) {
        const result = tryFreshHpWash(state, job, level, reserveMp);
        if (!result.success) {
          warning = true;
          hasWarning = true;
          warningMessage = result.reason ?? '洗血中断';
          break;
        }
        washCount += 1;
        totalHpFromWash += result.hpGain ?? 0;
        washDetails.push(`HP+${result.hpGain}`);
      }

      operationParts.push(
        washCount > 0
          ? `升级洗血×${washCount}${warning ? '（中断）' : ''} [合计+${totalHpFromWash}HP]`
          : '洗血失败',
      );
    } else {
      operationParts.push(`正常升级 (+${FRESH_AP_PER_LEVEL} 主属性)`);
    }

    records.push({
      level,
      hpGain,
      mpGain,
      operation: operationParts.join(' → '),
      warning,
      warningMessage: warning ? warningMessage : undefined,
      hp: state.hp,
      mp: state.mp,
      minMp: Math.max(getMinMp(job, level), reserveMp),
      totalApr: state.apr,
      totalNx: state.apr * APR_NX_COST,
    });
  }

  return {
    records,
    finalHp: state.hp,
    finalMp: state.mp,
    finalBaseInt: baseInt,
    totalApr: state.apr,
    totalNx: state.apr * APR_NX_COST,
    hasWarning,
    validationErrors: [],
  };
}
