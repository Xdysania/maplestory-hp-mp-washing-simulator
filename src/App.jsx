import { useState } from 'react';
import {
  getDefaultBaseStats,
  HP_EQUIPMENT_OPTIONS,
  JOB_OPTIONS,
  MAX_HP,
  MAX_MP,
  MW_OPTIONS,
} from './config/jobConfig.js';
import { optimizeTargetInt } from './utils/simulation.js';

/** @typedef {import('./config/jobConfig.js').JobId} JobId */

/**
 * 格式化数字（千分位）
 * @param {number} value
 * @returns {string}
 */
function formatNumber(value) {
  return value.toLocaleString('zh-CN');
}

/**
 * @param {Object} props
 * @param {string} props.label
 * @param {string | number} props.value
 * @param {string} [props.subtitle]
 * @param {boolean} [props.emphasized]
 */
function SummaryMetric({ label, value, subtitle, emphasized = false }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
        {label}
      </p>
      <p
        className={`mt-1 truncate font-bold tabular-nums tracking-tight text-neutral-950 ${
          emphasized ? 'text-3xl sm:text-4xl' : 'text-xl'
        }`}
        title={String(value)}
      >
        {value}
      </p>
      {subtitle ? (
        <p className="mt-1 text-xs leading-4 text-neutral-500">{subtitle}</p>
      ) : null}
    </div>
  );
}

/**
 * @param {Object} props
 * @param {string} props.label
 * @param {string} [props.hint]
 * @param {React.ReactNode} props.children
 */
function FormField({ label, hint, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-neutral-400">{hint}</span> : null}
    </label>
  );
}

const inputClassName =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200';

const selectClassName =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200';

export default function App() {
  /** @type {[JobId, React.Dispatch<React.SetStateAction<JobId>>]} */
  const [job, setJob] = useState('warrior');
  const warriorDefaults = getDefaultBaseStats('warrior');
  const [baseStr, setBaseStr] = useState(warriorDefaults.str);
  const [baseDex, setBaseDex] = useState(warriorDefaults.dex);
  const [baseInt, setBaseInt] = useState(warriorDefaults.int);
  const [baseLuk, setBaseLuk] = useState(warriorDefaults.luk);
  const [equipInt, setEquipInt] = useState(0);
  const [targetLevel, setTargetLevel] = useState(135);
  const [targetMpAt200, setTargetMpAt200] = useState(1000);
  const [mwStartLevel, setMwStartLevel] = useState(10);
  /** @type {[import('./config/jobConfig.js').MwLevel, React.Dispatch<React.SetStateAction<import('./config/jobConfig.js').MwLevel>>]} */
  const [mwLevel, setMwLevel] = useState(20);
  const [equipT10Ring, setEquipT10Ring] = useState(false);
  const [equipButterflyRing, setEquipButterflyRing] = useState(false);
  const [equipMonNecklace, setEquipMonNecklace] = useState(false);
  const [result, setResult] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  /**
   * 切换职业并重置初始四属性
   * @param {JobId} nextJob
   */
  const handleJobChange = (nextJob) => {
    const defaults = getDefaultBaseStats(nextJob);
    setJob(nextJob);
    setBaseStr(defaults.str);
    setBaseDex(defaults.dex);
    setBaseInt(defaults.int);
    setBaseLuk(defaults.luk);
  };

  /**
   * 执行模拟
   */
  const handleRun = () => {
    setResult(null);
    setIsDetailsOpen(false);
    setIsRunning(true);
    requestAnimationFrame(() => {
      const simulationResult = optimizeTargetInt({
        job,
        baseStats: {
          str: Number(baseStr),
          dex: Number(baseDex),
          int: Number(baseInt),
          luk: Number(baseLuk),
        },
        equipInt: Number(equipInt),
        targetLevel: Number(targetLevel),
        mwStartLevel: Number(mwStartLevel),
        mwLevel: /** @type {import('./config/jobConfig.js').MwLevel} */ (Number(mwLevel)),
        hpEquipment: {
          t10Ring: equipT10Ring,
          butterflyRing: equipButterflyRing,
          monNecklace: equipMonNecklace,
        },
      }, Number(targetMpAt200));
      setResult(simulationResult);
      setIsRunning(false);
    });
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900">
              冒险岛 · 洗血/扩蓝模拟器
            </h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              MapleStory HP/MP Washing Simulator · 怀旧服数值推演
            </p>
          </div>
          <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-600">
            APR = 3,500 NX
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-6 px-6 py-6 lg:grid-cols-[minmax(300px,320px)_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:flex lg:h-[calc(100dvh-7.5rem)] lg:min-h-[360px] lg:flex-col lg:self-start lg:overflow-hidden">
          <div className="space-y-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">基础设置</h2>
            <div className="space-y-3">
              <FormField label="职业">
                <select
                  className={selectClassName}
                  value={job}
                  onChange={(e) => handleJobChange(/** @type {JobId} */ (e.target.value))}
                >
                  {Object.entries(JOB_OPTIONS).map(([id, info]) => (
                    <option key={id} value={id}>
                      {info.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <div>
                <p className="mb-2 text-sm font-medium text-neutral-700">初始四属性</p>
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="力量 STR">
                    <input
                      className={inputClassName}
                      type="number"
                      min={4}
                      value={baseStr}
                      onChange={(e) => setBaseStr(e.target.value)}
                    />
                  </FormField>
                  <FormField label="敏捷 DEX">
                    <input
                      className={inputClassName}
                      type="number"
                      min={4}
                      value={baseDex}
                      onChange={(e) => setBaseDex(e.target.value)}
                    />
                  </FormField>
                  <FormField label="智力 INT">
                    <input
                      className={inputClassName}
                      type="number"
                      min={4}
                      value={baseInt}
                      onChange={(e) => setBaseInt(e.target.value)}
                    />
                  </FormField>
                  <FormField label="运气 LUK">
                    <input
                      className={inputClassName}
                      type="number"
                      min={4}
                      value={baseLuk}
                      onChange={(e) => setBaseLuk(e.target.value)}
                    />
                  </FormField>
                </div>
              </div>

              <FormField label="装备附加总智力" hint="仅影响升级自然 MP 增长">
                <input
                  className={inputClassName}
                  type="number"
                  min={0}
                  value={equipInt}
                  onChange={(e) => setEquipInt(e.target.value)}
                />
              </FormField>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">全局设定</h2>
            <div className="space-y-3">
              <FormField
                label="目标等级"
                hint="同时作为模拟终点和洗血目标；若预计仅靠自然成长即可达到洗血目标 HP，则提前出山"
              >
                <input
                  className={inputClassName}
                  type="number"
                  min={1}
                  max={200}
                  value={targetLevel}
                  onChange={(e) => setTargetLevel(e.target.value)}
                />
              </FormField>
              <FormField
                label="200级目标 MP"
                hint={
                  job === 'magician'
                    ? '法师不计 NX：前期 AP 全加 INT；当“加 MP−退 30 MP”净收益转正后开始扩蓝，峰值达到 3 万后持续洗血'
                    : '系统自动寻找满足此 MP 目标且总 NX 最低的面板 INT；按停止洗血后自然成长上限预测'
                }
              >
                <input
                  className={inputClassName}
                  type="number"
                  min={0}
                  value={targetMpAt200}
                  onChange={(e) => setTargetMpAt200(e.target.value)}
                />
              </FormField>
              <div>
                <p className="mb-2 text-sm font-medium text-neutral-700">加血装备</p>
                <p className="mb-2 text-xs text-neutral-400">
                  勾选后洗血目标变为 {MAX_HP.toLocaleString('zh-CN')} − 装备加血，可更早出山节约 NX
                </p>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-neutral-300"
                      checked={equipT10Ring}
                      onChange={(e) => setEquipT10Ring(e.target.checked)}
                    />
                    {HP_EQUIPMENT_OPTIONS.t10Ring.label}
                    <span className="text-neutral-400">
                      +{HP_EQUIPMENT_OPTIONS.t10Ring.hp.toLocaleString('zh-CN')} HP
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-neutral-300"
                      checked={equipButterflyRing}
                      onChange={(e) => setEquipButterflyRing(e.target.checked)}
                    />
                    {HP_EQUIPMENT_OPTIONS.butterflyRing.label}
                    <span className="text-neutral-400">
                      +{HP_EQUIPMENT_OPTIONS.butterflyRing.hp.toLocaleString('zh-CN')} HP
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-neutral-300"
                      checked={equipMonNecklace}
                      onChange={(e) => setEquipMonNecklace(e.target.checked)}
                    />
                    {HP_EQUIPMENT_OPTIONS.monNecklace.label}
                    <span className="text-neutral-400">
                      +{HP_EQUIPMENT_OPTIONS.monNecklace.hp.toLocaleString('zh-CN')} HP
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">Maple Warrior (MW)</h2>
            <div className="space-y-3">
              <FormField
                label="MW 技能等级"
                hint="Lv.10 +5% · Lv.20 +10% · Lv.30 +13% 面板 INT（不含装备）"
              >
                <select
                  className={selectClassName}
                  value={mwLevel}
                  onChange={(e) =>
                    setMwLevel(
                      /** @type {import('./config/jobConfig.js').MwLevel} */ (
                        Number(e.target.value)
                      ),
                    )
                  }
                >
                  {MW_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="MW 生效等级"
                hint="从该等级起享受 MW 加成（7~199，如有人 7 级吃 MW、有人 30 级才吃）"
              >
                <input
                  className={inputClassName}
                  type="number"
                  min={7}
                  max={199}
                  value={mwStartLevel}
                  onChange={(e) => setMwStartLevel(e.target.value)}
                  disabled={mwLevel === 0}
                />
              </FormField>
            </div>
          </section>
          </div>

          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning}
            className="mt-3 w-full shrink-0 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? '模拟中…' : '开始模拟 (Run Simulation)'}
          </button>
        </aside>

        <div className="min-w-0 space-y-6">
          {result?.validationErrors.length ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-medium">参数校验失败</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {result.validationErrors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {isRunning ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white p-12 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
              <p className="mt-4 text-sm text-neutral-500">模拟计算中…</p>
            </div>
          ) : result && !result.validationErrors.length ? (
            <>
              {result.hasWarning ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  模拟过程中出现 MP 触底警告，部分等级的洗点/扩蓝操作已中断。
                </div>
              ) : null}
              {result.optimizationFeasible === false ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {job === 'magician'
                    ? `当前未能让峰值 MP 达到 ${MAX_MP.toLocaleString('zh-CN')} 并出山，已展示峰值蓝/最终血尽量高的方案。`
                    : '当前等级与属性点范围内无法满足 200 级目标 MP，已展示可达到 MP 最高的方案。'}
                </div>
              ) : null}

              <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <div className="border-b border-neutral-100 bg-gradient-to-br from-blue-50/80 via-white to-amber-50/50 p-6">
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-neutral-950">最优洗血方案</h2>
                      <p className="mt-1 text-xs text-neutral-500">
                        系统已按目标 MP 与最低 NX 开销完成路径规划
                      </p>
                    </div>
                    {result.graduationLevel ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Lv.{result.graduationLevel} 出山
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryMetric
                      label="最终 HP"
                      value={formatNumber(result.finalHp)}
                      emphasized
                      subtitle={
                        result.equipmentHp > 0
                          ? `基础 ${formatNumber(result.finalBaseHp)} + 装备 ${formatNumber(result.equipmentHp)}`
                          : `洗血目标 ${formatNumber(result.washTargetHp)} · 已达成`
                      }
                    />
                    <SummaryMetric
                      label={job === 'magician' ? '峰值 MP' : 'Lv.200 预测 MP'}
                      value={formatNumber(
                        job === 'magician'
                          ? (result.peakMp ?? result.finalMp)
                          : result.projectedMpAt200,
                      )}
                      emphasized
                      subtitle={
                        job === 'magician'
                          ? result.mpCapLevel
                            ? `首次满蓝 Lv.${result.mpCapLevel} · 上限 ${formatNumber(MAX_MP)}`
                            : `目标满蓝 ${formatNumber(MAX_MP)}`
                          : `目标 ${formatNumber(Number(targetMpAt200))}`
                      }
                    />
                    <SummaryMetric
                      label={job === 'magician' ? '扩蓝启动 INT' : '推荐目标 INT'}
                      value={result.optimalTargetInt}
                      emphasized
                      subtitle={
                        job === 'magician'
                          ? '扩蓝净收益严格大于 0'
                          : '满足目标时 NX 最低'
                      }
                    />
                    <SummaryMetric
                      label="总 NX 开销"
                      value={formatNumber(result.totalNx)}
                      emphasized
                      subtitle={`${formatNumber(result.totalApr)} 张 APR × 3,500`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-y divide-neutral-100 sm:grid-cols-4 xl:grid-cols-8">
                  <div className="p-4">
                    <SummaryMetric
                      label={`Lv.${targetLevel} MP`}
                      value={formatNumber(result.finalMp)}
                    />
                  </div>
                  <div className="p-4">
                    <SummaryMetric label="最终 STR" value={result.finalStats.str} />
                  </div>
                  <div className="p-4">
                    <SummaryMetric label="最终 DEX" value={result.finalStats.dex} />
                  </div>
                  <div className="p-4">
                    <SummaryMetric label="最终 INT" value={result.finalStats.int} />
                  </div>
                  <div className="p-4">
                    <SummaryMetric label="最终 LUK" value={result.finalStats.luk} />
                  </div>
                  <div className="p-4">
                    <SummaryMetric
                      label="出山等级"
                      value={result.graduationLevel ? `Lv.${result.graduationLevel}` : '—'}
                    />
                  </div>
                  <div className="p-4">
                    <SummaryMetric
                      label={result.finalMagicBoost > 0 ? '魔力强化' : '生命强化'}
                      value={
                        result.finalMagicBoost > 0
                          ? `Lv.${result.finalMagicBoost}`
                          : result.finalLifeEnhancement > 0
                            ? `Lv.${result.finalLifeEnhancement}`
                            : '—'
                      }
                    />
                  </div>
                  <div className="p-4">
                    <SummaryMetric label="消耗 APR" value={formatNumber(result.totalApr)} />
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
                <button
                  type="button"
                  aria-expanded={isDetailsOpen}
                  onClick={() => setIsDetailsOpen((open) => !open)}
                  className={`flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-neutral-50 ${
                    isDetailsOpen ? 'border-b border-neutral-200' : ''
                  }`}
                >
                  <div>
                    <h2 className="text-sm font-semibold text-neutral-900">逐级模拟明细</h2>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      共 {result.records.length} 条记录 · 展开后显示全部
                    </p>
                  </div>
                  <span className="ml-4 flex shrink-0 items-center gap-2 text-sm font-medium text-neutral-600">
                    {isDetailsOpen ? '收起' : '展开'}
                    <svg
                      className={`h-4 w-4 transition-transform ${
                        isDetailsOpen ? 'rotate-180' : ''
                      }`}
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>

                {isDetailsOpen ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-neutral-100 bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
                        <th className="px-4 py-3">等级</th>
                        <th className="px-4 py-3">HP 增长</th>
                        <th className="px-4 py-3">MP 增长</th>
                        <th className="px-4 py-3">操作</th>
                        <th className="px-4 py-3 text-right">属性</th>
                        <th className="px-4 py-3 text-right">强化</th>
                        <th className="px-4 py-3 text-right">当前 HP</th>
                        <th className="px-4 py-3 text-right">当前 MP</th>
                        <th className="px-4 py-3 text-right">Min MP</th>
                        <th className="px-4 py-3 text-right">累计 NX</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {result.records.map((row) => (
                        <tr
                          key={row.level}
                          className={
                            row.warning
                              ? 'bg-amber-50/80'
                              : 'hover:bg-neutral-50/80'
                          }
                        >
                          <td className="px-4 py-2.5 font-medium tabular-nums text-neutral-900">
                            Lv.{row.level}
                            {row.warning ? (
                              <span
                                className="ml-1.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                                title={row.warningMessage}
                              >
                                ⚠
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-neutral-600">
                            {row.hpGain > 0 ? `+${row.hpGain}` : '—'}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-neutral-600">
                            {row.mpGain > 0 ? `+${row.mpGain}` : '—'}
                          </td>
                          <td className="max-w-sm px-4 py-2.5 text-xs leading-relaxed text-neutral-600">
                            {row.operation}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs tabular-nums text-neutral-500">
                            {row.str}/{row.dex}/{row.int}/{row.luk}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs tabular-nums text-neutral-500">
                            {row.magicBoost > 0
                              ? `魔${row.magicBoost}`
                              : row.lifeEnhancement > 0
                                ? `Lv.${row.lifeEnhancement}`
                                : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-neutral-900">
                            {formatNumber(row.hp)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-neutral-900">
                            {formatNumber(row.mp)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-neutral-500">
                            {formatNumber(row.minMp)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium text-red-600">
                            {formatNumber(row.totalNx)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                ) : null}
              </section>
            </>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white p-12 text-center">
              <div className="rounded-full bg-neutral-100 p-4">
                <svg
                  className="h-8 w-8 text-neutral-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                  />
                </svg>
              </div>
              <h2 className="mt-4 text-base font-medium text-neutral-900">
                配置参数后开始模拟
              </h2>
              <p className="mt-2 max-w-md text-sm text-neutral-500">
                设置目标等级与 200 级目标 MP 后点击「开始模拟」。系统会自动选择最优
                INT，并智能决定何时洗血、扩蓝与出山。
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
