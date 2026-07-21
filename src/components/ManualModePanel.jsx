import { useMemo, useState } from 'react';
import {
  APR_NX_COST,
  FRESH_AP_PER_LEVEL,
  JOB_OPTIONS,
  MAX_GAME_LEVEL,
  MAX_HP,
  getMinMp,
  isMagicianClass,
} from '../config/jobConfig.js';
import {
  LIFE_ENHANCEMENT_MAX,
  MAGIC_BOOST_MAX,
  hasLifeEnhancement,
  hasMagicBoost,
} from '../config/skillConfig.js';
import {
  createManualSession,
  canManualHpMinus,
  canManualHpPlus,
  canManualFreshHpWash,
  canManualMpExpand,
  canManualMpMinus,
  canManualMpPlus,
  getManualApInvested,
  getManualApPools,
  getManualPanelHp,
  hasWashTrackInvestment,
  manualAddStat,
  manualAutoAllocate,
  manualFreshHpWash,
  manualGraduate,
  manualHpApMinus,
  manualHpApPlus,
  manualLevelUp,
  manualMagicianAprExpand,
  manualMpApPlus,
  manualMpApMinus,
  manualMpExpand,
  manualResetHpWash,
  manualStaleHpWash,
  manualSubtractStat,
  resetManualSession,
} from '../utils/manualMode.js';

/**
 * @typedef {import('../utils/manualMode.js').ManualModeConfig} ManualModeConfig
 * @typedef {import('../utils/manualMode.js').ManualSession} ManualSession
 */

/**
 * @param {number} value
 * @returns {string}
 */
function formatNumber(value) {
  return value.toLocaleString('zh-CN');
}

/**
 * @param {Object} props
 * @param {string} props.children
 * @param {() => void} props.onClick
 * @param {boolean} [props.disabled]
 * @param {'default' | 'primary' | 'danger' | 'ghost'} [props.variant]
 * @param {string} [props.title]
 * @param {string} [props.className]
 */
function ActionButton({
  children,
  onClick,
  disabled = false,
  variant = 'default',
  title,
  className = '',
}) {
  const variantClass =
    variant === 'primary'
      ? 'border-transparent bg-neutral-900 text-white hover:bg-neutral-800'
      : variant === 'danger'
        ? 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100'
        : variant === 'ghost'
          ? 'border-transparent bg-transparent text-neutral-600 hover:bg-neutral-100'
          : 'border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50';

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${variantClass} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * 紧凑 stepper 按钮
 * @param {Object} props
 * @param {() => void} props.onDec
 * @param {() => void} props.onInc
 * @param {boolean} [props.incDisabled]
 * @param {boolean} [props.decDisabled]
 * @param {string} [props.incTitle]
 * @param {string} [props.decTitle]
 */
function Stepper({ onDec, onInc, incDisabled, decDisabled, incTitle, decTitle }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-neutral-200 bg-white">
      <button
        type="button"
        disabled={decDisabled}
        title={decTitle}
        onClick={onDec}
        className="flex h-8 w-8 items-center justify-center text-sm text-neutral-600 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        −
      </button>
      <div className="w-px bg-neutral-200" />
      <button
        type="button"
        disabled={incDisabled}
        title={incTitle}
        onClick={onInc}
        className="flex h-8 w-8 items-center justify-center text-sm text-neutral-600 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

/**
 * 属性/血量 stepper 行
 * @param {Object} props
 * @param {string} props.label
 * @param {string | number} props.value
 * @param {number} [props.invested] 累计投入 AP
 * @param {string} [props.sub]
 * @param {string} [props.tag]
 * @param {() => void} props.onDec
 * @param {() => void} props.onInc
 * @param {boolean} [props.incDisabled]
 * @param {boolean} [props.decDisabled]
 * @param {string} [props.incTitle]
 * @param {string} [props.decTitle]
 */
function StatRow({
  label,
  value,
  invested = 0,
  sub,
  tag,
  onDec,
  onInc,
  incDisabled,
  decDisabled,
  incTitle,
  decTitle,
}) {
  return (
    <tr className="border-b border-neutral-100 last:border-0">
      <td className="w-[26%] py-3 pl-5 pr-4">
        <div className="flex items-center gap-2.5">
          <span className="min-w-[2.5rem] text-xs font-semibold text-neutral-700">
            {label}
          </span>
          {tag ? (
            <span className="shrink-0 rounded bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500">
              {tag}
            </span>
          ) : null}
        </div>
      </td>
      <td className="w-[24%] px-4 py-3 tabular-nums text-sm text-neutral-900">
        {value}
        {sub ? (
          <span className="ml-2 text-[11px] font-normal text-neutral-400">{sub}</span>
        ) : null}
      </td>
      <td className="w-[18%] px-4 py-3 tabular-nums text-sm text-sky-700">
        {formatNumber(invested)}
      </td>
      <td className="w-[32%] py-3 pl-4 pr-5 text-right">
        <Stepper
          onDec={onDec}
          onInc={onInc}
          incDisabled={incDisabled}
          decDisabled={decDisabled}
          incTitle={incTitle}
          decTitle={decTitle}
        />
      </td>
    </tr>
  );
}

/**
 * 手动操作面板
 * @param {Object} props
 * @param {import('../utils/manualMode.js').ManualModeConfig} props.config
 * @param {() => void} [props.onBack]
 */
export default function ManualModePanel({ config, onBack }) {
  const [session, setSession] = useState(() => createManualSession(config));
  const [feedback, setFeedback] = useState(
    /** @type {{ type: 'ok' | 'err'; text: string } | null} */ (null),
  );

  const job = config.job;
  const isMage = isMagicianClass(job);
  const panelHp = getManualPanelHp(session.state.hp, session.equipmentHp);
  const minMp = getMinMp(job, Math.max(1, session.level));
  const totalNx = session.state.apr * APR_NX_COST;
  const mainStat = JOB_OPTIONS[job].mainStat;

  const apPools = useMemo(() => getManualApPools(session), [session]);
  const canLevelUp = apPools.totalAp === 0 && session.level < MAX_GAME_LEVEL;
  const hasPendingAp = apPools.totalAp > 0;
  const hasFreshAp = apPools.freshAp > 0;
  const hasResetAp = apPools.resetAp > 0;
  const hpPlusGate = canManualHpPlus(session);
  const hpMinusGate = canManualHpMinus(session);
  const hpWashGate = canManualFreshHpWash(session);
  const mpPlusGate = canManualMpPlus(session);
  const mpMinusGate = canManualMpMinus(session);
  const mpExpandGate = canManualMpExpand(session);
  const canResetHpWash =
    hasResetAp && hasWashTrackInvestment(session);
  const apInvested = useMemo(() => getManualApInvested(session), [session]);

  /**
   * @param {(current: ManualSession) => { ok: boolean; message: string; session: ManualSession }} action
   */
  const runAction = (action) => {
    const result = action(session);
    setSession(result.session);
    setFeedback({
      type: result.ok ? 'ok' : 'err',
      text: result.message,
    });
  };

  const handleReset = () => {
    setSession(resetManualSession(config));
    setFeedback({ type: 'ok', text: '已重置手动会话' });
  };

  const skillHint = useMemo(() => {
    const parts = /** @type {string[]} */ ([]);
    if (hasLifeEnhancement(job) && session.state.skills.lifeEnhancement > 0) {
      parts.push(`生命强化 Lv.${session.state.skills.lifeEnhancement}`);
    }
    if (hasMagicBoost(job) && (session.state.skills.magicBoost ?? 0) > 0) {
      parts.push(`魔力强化 Lv.${session.state.skills.magicBoost}`);
    }
    return parts.join(' · ');
  }, [job, session.state.skills]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-950">手动操作</h2>
          <p className="mt-1 text-xs text-neutral-500">
            {JOB_OPTIONS[job].label} · 升级 → 分配 AP → 洗血/扩蓝，规则与自动模拟一致
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onBack ? <ActionButton onClick={onBack}>返回自动模拟</ActionButton> : null}
          <ActionButton onClick={handleReset} variant="danger">
            重置
          </ActionButton>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        {/* 状态条 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-100 bg-gradient-to-r from-neutral-50 to-white px-4 py-3">
          <span className="text-sm font-semibold text-neutral-900">Lv.{session.level}</span>
          <span className="text-xs text-neutral-400">|</span>
          <span
            className={`text-xs font-medium ${hasPendingAp ? 'text-sky-700' : 'text-neutral-500'}`}
          >
            新鲜 AP {apPools.freshAp}
            <span className="text-neutral-400"> · </span>
            重置 AP {apPools.resetAp}
          </span>
          <span className="text-xs text-neutral-400">|</span>
          <span className="text-xs text-neutral-600">
            APR {formatNumber(session.state.apr)} · NX {formatNumber(totalNx)}
          </span>
          <span className="text-xs text-neutral-400">|</span>
          <span className="text-xs text-neutral-600">
            洗血目标 {formatNumber(session.washTargetHp)}
            {session.equipmentHp > 0 ? `（面板 ${formatNumber(MAX_HP)}）` : ''}
          </span>
          <span
            className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
              session.hasGraduated
                ? 'bg-violet-100 text-violet-800'
                : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {session.hasGraduated ? '已出山' : `未出山 · Lv.${config.graduationTargetLevel}`}
          </span>
        </div>

        {/* 属性表格 + 快捷操作 */}
        <div className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-900">属性 / 血量</h3>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                variant="primary"
                disabled={!canLevelUp}
                onClick={() => runAction((c) => manualLevelUp(c))}
                title={hasPendingAp ? '请先分配完本级 AP' : '升级 + 自然成长 + 5 AP'}
              >
                升 1 级
              </ActionButton>
              <ActionButton
                disabled={!hasPendingAp}
                onClick={() => runAction((c) => manualAutoAllocate(c))}
                title="按职业规则分配剩余 AP"
              >
                智能分配 AP
              </ActionButton>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[560px] table-fixed text-left">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  <th className="w-[26%] py-2.5 pl-5 pr-4 text-left">项目</th>
                  <th className="w-[24%] px-4 py-2.5 text-left">当前</th>
                  <th className="w-[18%] px-4 py-2.5 text-left">投入 AP</th>
                  <th className="w-[32%] py-2.5 pl-4 pr-5 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {(['str', 'dex', 'int', 'luk']).map((stat) => {
                  const upper = stat.toUpperCase();
                  const isMain = upper === mainStat;
                  return (
                    <StatRow
                      key={stat}
                      label={upper}
                      value={session.state[stat]}
                      invested={apInvested[stat]}
                      tag={isMain ? '主' : stat === 'int' ? '洗血' : undefined}
                      incDisabled={!hasPendingAp}
                      incTitle={
                        hasPendingAp
                          ? '优先消耗新鲜 AP，否则消耗重置 AP'
                          : '无可用 AP'
                      }
                      decTitle="−1：30级前可洗至4；二转后受转职属性下限约束"
                      onInc={() =>
                        runAction((c) =>
                          manualAddStat(c, /** @type {'str'|'dex'|'int'|'luk'} */ (stat)),
                        )
                      }
                      onDec={() =>
                        runAction((c) =>
                          manualSubtractStat(c, /** @type {'str'|'dex'|'int'|'luk'} */ (stat)),
                        )
                      }
                    />
                  );
                })}
                <StatRow
                  label="HP"
                  value={formatNumber(session.state.hp)}
                  invested={apInvested.hp}
                  sub={
                    session.equipmentHp > 0
                      ? `面板 ${formatNumber(panelHp)}`
                      : undefined
                  }
                  tag="加点"
                  incDisabled={!hpPlusGate.ok}
                  decDisabled={!hpMinusGate.ok}
                  incTitle={
                    hpPlusGate.ok
                      ? '消耗 1 AP，按规则 +HP（不含洗血）'
                      : hpPlusGate.reason ?? '无法操作'
                  }
                  decTitle={hpMinusGate.reason ?? '撤销上一步 HP 加点'}
                  onInc={() => runAction((c) => manualHpApPlus(c))}
                  onDec={() => runAction((c) => manualHpApMinus(c))}
                />
                <StatRow
                  label="MP"
                  value={formatNumber(session.state.mp)}
                  invested={apInvested.mp}
                  sub={`Min ${formatNumber(minMp)}`}
                  tag="加点"
                  incDisabled={!mpPlusGate.ok}
                  decDisabled={!mpMinusGate.ok}
                  incTitle={
                    mpPlusGate.ok
                      ? '消耗 1 AP，按规则 +MP（不含扩蓝洗点）'
                      : mpPlusGate.reason ?? '无法操作'
                  }
                  decTitle={mpMinusGate.reason ?? '撤销上一步 MP 加点'}
                  onInc={() => runAction((c) => manualMpApPlus(c))}
                  onDec={() => runAction((c) => manualMpApMinus(c))}
                />
              </tbody>
            </table>
          </div>

          {skillHint ? (
            <p className="mt-2 text-[11px] text-neutral-400">{skillHint}</p>
          ) : null}
          <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
            四属性 30 级前均可洗至 4；二转（30 级）后转职属性不可再洗低。升 30 级时若未达转职要求则无法升级。HP/MP 行 ± 为直接加点；下方「洗血 / 扩蓝」才消耗 APR 进行洗点。
          </p>
        </div>

        {/* 洗血 / 扩蓝 / 出山 — 合并为一行快捷区 */}
        <div className="border-t border-neutral-100 bg-neutral-50/50 px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-900">洗血 / 扩蓝</h3>
            <span className="text-[11px] text-neutral-400">
              新鲜/重置操作均消耗 1 AP + 1 APR（{formatNumber(APR_NX_COST)} NX）
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              disabled={!hpWashGate.ok}
              onClick={() => runAction((c) => manualFreshHpWash(c))}
              title={hpWashGate.reason ?? '+HP，APR 退 MP，AP 回 INT/主属性'}
            >
              新鲜洗血
            </ActionButton>
            <ActionButton
              disabled={!mpExpandGate.ok}
              onClick={() =>
                runAction((c) =>
                  isMage ? manualMagicianAprExpand(c) : manualMpExpand(c),
                )
              }
              title={mpExpandGate.reason ?? (isMage ? '法师 APR 扩蓝' : '物理扩蓝')}
            >
              {isMage ? 'APR 扩蓝' : '扩蓝'}
            </ActionButton>
            <ActionButton
              disabled={!canResetHpWash}
              onClick={() => runAction((c) => manualResetHpWash(c))}
              title={
                canResetHpWash
                  ? '消耗 1 重置 AP + 1 APR'
                  : hasResetAp
                    ? '须先在 HP/MP 轨道投入至少 1 点 AP'
                    : '无重置 AP'
              }
            >
              重置洗血
            </ActionButton>
            <span className="mx-1 hidden h-6 w-px bg-neutral-200 sm:inline-block" />
            <ActionButton
              onClick={() => runAction((c) => manualGraduate(c, false))}
              title="洗净副属性转主属性"
            >
              出山
            </ActionButton>
            {!session.hasGraduated &&
            session.level >= config.graduationTargetLevel ? (
              <ActionButton
                onClick={() => runAction((c) => manualGraduate(c, true))}
                title="到达出山等级时强制出山"
              >
                强制出山
              </ActionButton>
            ) : null}
          </div>
        </div>
      </section>

      {feedback ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-neutral-900">操作记录</h3>
        </div>
        <div className="max-h-72 overflow-y-auto px-4 py-3">
          {session.log.length === 0 ? (
            <p className="text-sm text-neutral-400">暂无操作</p>
          ) : (
            <ul className="space-y-1.5">
              {session.log.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-md border border-neutral-100 bg-neutral-50/60 px-3 py-2 text-xs leading-relaxed text-neutral-700"
                >
                  <span className="font-medium text-neutral-500">Lv.{entry.level}</span>
                  <span className="text-neutral-300"> · </span>
                  <span>{entry.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
