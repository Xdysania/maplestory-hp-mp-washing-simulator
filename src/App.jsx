import { useMemo, useState } from 'react';
import { JOB_OPTIONS } from './config/jobConfig.js';
import { runSimulation } from './utils/simulation.js';

/** @typedef {import('./config/jobConfig.js').JobId} JobId */

const PAGE_SIZE = 50;

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
 * @param {boolean} [props.danger]
 */
function DashboardCard({ label, value, subtitle, danger = false }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums ${
          danger ? 'text-red-600' : 'text-neutral-900'
        }`}
      >
        {value}
      </p>
      {subtitle ? (
        <p className="mt-1 text-xs text-neutral-400">{subtitle}</p>
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
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-neutral-400">{hint}</span> : null}
    </label>
  );
}

const inputClassName =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200';

const selectClassName =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200';

export default function App() {
  /** @type {[JobId, React.Dispatch<React.SetStateAction<JobId>>]} */
  const [job, setJob] = useState('warrior');
  const [baseInt, setBaseInt] = useState(4);
  const [equipInt, setEquipInt] = useState(0);
  const [mpWashStart, setMpWashStart] = useState(0);
  const [mpWashEnd, setMpWashEnd] = useState(0);
  const [hpWashStart, setHpWashStart] = useState(0);
  const [hpWashEnd, setHpWashEnd] = useState(0);
  const [targetLevel, setTargetLevel] = useState(135);
  const [reserveMp, setReserveMp] = useState(0);
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [isRunning, setIsRunning] = useState(false);

  const totalPages = useMemo(() => {
    if (!result?.records.length) {
      return 1;
    }
    return Math.ceil(result.records.length / PAGE_SIZE);
  }, [result]);

  const pageRecords = useMemo(() => {
    if (!result?.records.length) {
      return [];
    }
    const start = (page - 1) * PAGE_SIZE;
    return result.records.slice(start, start + PAGE_SIZE);
  }, [result, page]);

  /**
   * 执行模拟
   */
  const handleRun = () => {
    setIsRunning(true);
    requestAnimationFrame(() => {
      const simulationResult = runSimulation({
        job,
        baseInt: Number(baseInt),
        equipInt: Number(equipInt),
        mpWashStart: Number(mpWashStart) || 0,
        mpWashEnd: Number(mpWashEnd) || 0,
        hpWashStart: Number(hpWashStart) || 0,
        hpWashEnd: Number(hpWashEnd) || 0,
        targetLevel: Number(targetLevel),
        reserveMp: Number(reserveMp),
      });
      setResult(simulationResult);
      setPage(1);
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

      <main className="mx-auto grid max-w-[1600px] gap-6 px-6 py-6 lg:grid-cols-[320px_1fr]">
        {/* 左侧参数区 */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-neutral-900">基础设置</h2>
            <div className="space-y-4">
              <FormField label="职业">
                <select
                  className={selectClassName}
                  value={job}
                  onChange={(e) => setJob(/** @type {JobId} */ (e.target.value))}
                >
                  {Object.entries(JOB_OPTIONS).map(([id, info]) => (
                    <option key={id} value={id}>
                      {info.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="面板基础智力 (INT)" hint="默认 4，扩蓝加成仅计此项">
                <input
                  className={inputClassName}
                  type="number"
                  min={4}
                  value={baseInt}
                  onChange={(e) => setBaseInt(e.target.value)}
                />
              </FormField>

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

          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-neutral-900">扩蓝策略</h2>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="开始等级">
                <input
                  className={inputClassName}
                  type="number"
                  min={0}
                  placeholder="0 = 关闭"
                  value={mpWashStart || ''}
                  onChange={(e) => setMpWashStart(e.target.value)}
                />
              </FormField>
              <FormField label="结束等级">
                <input
                  className={inputClassName}
                  type="number"
                  min={0}
                  placeholder="0 = 关闭"
                  value={mpWashEnd || ''}
                  onChange={(e) => setMpWashEnd(e.target.value)}
                />
              </FormField>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-neutral-900">洗血策略</h2>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="开始等级">
                <input
                  className={inputClassName}
                  type="number"
                  min={0}
                  placeholder="0 = 关闭"
                  value={hpWashStart || ''}
                  onChange={(e) => setHpWashStart(e.target.value)}
                />
              </FormField>
              <FormField label="结束等级">
                <input
                  className={inputClassName}
                  type="number"
                  min={0}
                  placeholder="0 = 关闭"
                  value={hpWashEnd || ''}
                  onChange={(e) => setHpWashEnd(e.target.value)}
                />
              </FormField>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-neutral-900">全局设定</h2>
            <div className="space-y-4">
              <FormField label="目标模拟等级">
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
                label="预留 MP"
                hint="扣除后 MP 须高于 Min MP 与此预留值"
              >
                <input
                  className={inputClassName}
                  type="number"
                  min={0}
                  value={reserveMp}
                  onChange={(e) => setReserveMp(e.target.value)}
                />
              </FormField>
            </div>
          </section>

          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning}
            className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? '模拟中…' : '开始模拟 (Run Simulation)'}
          </button>
        </aside>

        {/* 右侧结果区 */}
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

          {result && !result.validationErrors.length ? (
            <>
              {result.hasWarning ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  模拟过程中出现 MP 触底警告，部分等级的洗点/扩蓝操作已中断。
                </div>
              ) : null}

              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <DashboardCard label="最终 HP" value={formatNumber(result.finalHp)} />
                <DashboardCard label="最终 MP" value={formatNumber(result.finalMp)} />
                <DashboardCard
                  label="基础 INT"
                  value={result.finalBaseInt}
                  subtitle="面板智力（不含装备）"
                />
                <DashboardCard
                  label="消耗 APR"
                  value={formatNumber(result.totalApr)}
                  subtitle="洗点卡总数"
                />
                <DashboardCard
                  label="总 NX 开销"
                  value={formatNumber(result.totalNx)}
                  subtitle="APR × 3,500"
                  danger
                />
              </section>

              <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-neutral-900">逐级明细</h2>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      共 {result.records.length} 级 · 每页 {PAGE_SIZE} 条
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-md border border-neutral-200 px-3 py-1.5 text-neutral-600 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      上一页
                    </button>
                    <span className="tabular-nums text-neutral-500">
                      {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="rounded-md border border-neutral-200 px-3 py-1.5 text-neutral-600 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      下一页
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-neutral-100 bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
                        <th className="px-4 py-3">等级</th>
                        <th className="px-4 py-3">HP 增长</th>
                        <th className="px-4 py-3">MP 增长</th>
                        <th className="px-4 py-3">操作</th>
                        <th className="px-4 py-3 text-right">当前 HP</th>
                        <th className="px-4 py-3 text-right">当前 MP</th>
                        <th className="px-4 py-3 text-right">Min MP</th>
                        <th className="px-4 py-3 text-right">累计 NX</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {pageRecords.map((row) => (
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
                          <td className="max-w-md px-4 py-2.5 text-xs leading-relaxed text-neutral-600">
                            {row.operation}
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
                在左侧选择职业、设定扩蓝/洗血等级区间，点击「开始模拟」即可查看 HP/MP
                成长曲线与 NX 消耗明细。每次模拟使用随机数，结果会有波动。
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
