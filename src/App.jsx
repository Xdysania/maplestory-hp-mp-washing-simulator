import { Fragment, useState } from 'react';
import {
  getDefaultBaseStats,
  getDefaultTargetInt,
  getEquipIntAtLevel,
  HP_EQUIPMENT_OPTIONS,
  JOB_OPTIONS,
  MAX_HP,
  MAX_MP,
  MW_OPTIONS,
  isDefaultAllIntStrategy,
  isExpandThenWashJob,
} from './config/jobConfig.js';
import { optimizeTargetInt } from './utils/simulation.js';

/** @typedef {import('./config/jobConfig.js').JobId} JobId */

/**
 * @typedef {Object} OperationSegment
 * @property {string} text
 * @property {string[]} [details]
 */

/**
 * 格式化数字（千分位）
 * @param {number} value
 * @returns {string}
 */
function formatNumber(value) {
  return value.toLocaleString('zh-CN');
}

/**
 * 可悬浮查看逐次明细的操作文案
 * @param {Object} props
 * @param {string} props.operation
 * @param {OperationSegment[]} [props.segments]
 */
function OperationText({ operation, segments }) {
  const items =
    Array.isArray(segments) && segments.length > 0
      ? segments
      : [{ text: operation }];

  return (
    <span className="inline leading-relaxed">
      {items.map((segment, index) => (
        <Fragment key={`${segment.text}-${index}`}>
          {index > 0 ? <span className="text-neutral-400"> → </span> : null}
          {segment.details?.length ? (
            <HoverDetail text={segment.text} details={segment.details} />
          ) : (
            <span>{segment.text}</span>
          )}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * 悬浮展示逐次洗血/扩蓝数值
 * @param {Object} props
 * @param {string} props.text
 * @param {string[]} props.details
 */
function HoverDetail({ text, details }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  /**
   * @param {import('react').MouseEvent<HTMLSpanElement>} event
   */
  const handleEnter = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPos({
      x: Math.min(rect.left, window.innerWidth - 320),
      y: rect.bottom + 8,
    });
    setOpen(true);
  };

  return (
    <span
      className="cursor-help border-b border-dotted border-sky-500/70 text-sky-800"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setOpen(false)}
    >
      {text}
      {open ? (
        <span
          className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-[11px] leading-5 text-neutral-700 shadow-lg"
          style={{ left: pos.x, top: pos.y }}
        >
          <span className="mb-1 block font-semibold text-neutral-900">
            逐次明细
          </span>
          {details.map((line) => (
            <span key={line} className="block tabular-nums">
              {line}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
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
  const [job, setJob] = useState('warriorHero');
  const warriorDefaults = getDefaultBaseStats('warriorHero');
  const [baseStr, setBaseStr] = useState(warriorDefaults.str);
  const [baseDex, setBaseDex] = useState(warriorDefaults.dex);
  const [baseInt, setBaseInt] = useState(warriorDefaults.int);
  const [baseLuk, setBaseLuk] = useState(warriorDefaults.luk);
  const [equipIntBonuses, setEquipIntBonuses] = useState(
    /** @type {{ id: string; level: string; int: string }[]} */ ([]),
  );
  const [noActiveMpExpand, setNoActiveMpExpand] = useState(false);
  const [targetLevel, setTargetLevel] = useState(135);
  const [targetMpAt200, setTargetMpAt200] = useState('');
  const [mwStartLevel, setMwStartLevel] = useState(10);
  /** @type {[import('./config/jobConfig.js').MwLevel, React.Dispatch<React.SetStateAction<import('./config/jobConfig.js').MwLevel>>]} */
  const [mwLevel, setMwLevel] = useState(20);
  const [equipT10Ring, setEquipT10Ring] = useState(false);
  const [equipButterflyRing, setEquipButterflyRing] = useState(false);
  const [equipMonNecklace, setEquipMonNecklace] = useState(false);
  const [result, setResult] = useState(null);
  /** @type {['optimal' | 'default', React.Dispatch<React.SetStateAction<'optimal' | 'default'>>]} */
  const [planView, setPlanView] = useState('optimal');
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [runProgressMessage, setRunProgressMessage] = useState('');

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
   * 执行模拟（异步 + 进度反馈）
   */
  const handleRun = async () => {
    setResult(null);
    setIsDetailsOpen(false);
    setPlanView('optimal');
    setIsRunning(true);
    setRunProgress(0);
    setRunProgressMessage('准备中…');

    // 先让 React 画出进度条，再开始重计算
    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve(undefined));
    });

    try {
      const rawTargetMp = String(targetMpAt200).trim();
      const parsedTargetMp =
        rawTargetMp === '' ? null : Number(rawTargetMp);
      const simulationResult = await optimizeTargetInt(
        {
          job,
          baseStats: {
            str: Number(baseStr),
            dex: Number(baseDex),
            int: Number(baseInt),
            luk: Number(baseLuk),
          },
          equipIntBonuses: equipIntBonuses
            .map((row) => ({
              level: Number(row.level),
              int: Number(row.int),
            }))
            .filter(
              (row) =>
                Number.isFinite(row.level) &&
                row.level >= 1 &&
                Number.isFinite(row.int) &&
                row.int > 0,
            ),
          targetLevel: Number(targetLevel),
          mwStartLevel: Number(mwStartLevel),
          mwLevel: /** @type {import('./config/jobConfig.js').MwLevel} */ (
            Number(mwLevel)
          ),
          noActiveMpExpand,
          hpEquipment: {
            t10Ring: equipT10Ring,
            butterflyRing: equipButterflyRing,
            monNecklace: equipMonNecklace,
          },
        },
        parsedTargetMp !== null && Number.isFinite(parsedTargetMp)
          ? parsedTargetMp
          : null,
        ({ percent, message }) => {
          setRunProgress(percent);
          setRunProgressMessage(message);
        },
      );
      setResult(simulationResult);
    } finally {
      setIsRunning(false);
      setRunProgress(100);
    }
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

              <div>
                <p className="mb-1 text-sm font-medium text-neutral-700">
                  装备附加智力
                </p>
                <p className="mb-2 text-xs text-neutral-400">
                  按等级叠加生效。例：7 级 +20，50 级再 +17 → 50 级起共 37
                </p>
                <div className="space-y-2">
                  {equipIntBonuses.map((row, index) => {
                    const levelNum = Number(row.level);
                    const runningTotal = getEquipIntAtLevel(
                      equipIntBonuses.map((item) => ({
                        level: Number(item.level),
                        int: Number(item.int),
                      })),
                      Number.isFinite(levelNum) ? levelNum : 1,
                    );
                    return (
                      <div key={row.id} className="flex items-center gap-2">
                        <input
                          className={inputClassName}
                          type="number"
                          min={1}
                          max={200}
                          placeholder="等级"
                          value={row.level}
                          onChange={(e) => {
                            const value = e.target.value;
                            setEquipIntBonuses((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, level: value } : item,
                              ),
                            );
                          }}
                        />
                        <span className="shrink-0 text-xs text-neutral-400">级 +</span>
                        <input
                          className={inputClassName}
                          type="number"
                          min={0}
                          placeholder="INT"
                          value={row.int}
                          onChange={(e) => {
                            const value = e.target.value;
                            setEquipIntBonuses((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, int: value } : item,
                              ),
                            );
                          }}
                        />
                        <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                          合计 {Number.isFinite(runningTotal) ? runningTotal : 0}
                        </span>
                        <button
                          type="button"
                          aria-label="删除"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 text-sm leading-none text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800"
                          onClick={() =>
                            setEquipIntBonuses((prev) =>
                              prev.filter((_, i) => i !== index),
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="w-full rounded-lg border border-dashed border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50"
                    onClick={() =>
                      setEquipIntBonuses((prev) => [
                        ...prev,
                        {
                          id: `${Date.now()}-${prev.length}`,
                          level: prev.length === 0 ? '7' : '',
                          int: '',
                        },
                      ])
                    }
                  >
                    + 添加装备智力
                  </button>
                </div>
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-neutral-300"
                  checked={noActiveMpExpand}
                  onChange={(e) => setNoActiveMpExpand(e.target.checked)}
                />
                <span>
                  <span className="font-medium">不主动扩蓝</span>
                  <span className="mt-0.5 block text-xs text-neutral-400">
                    默认关闭；开启后蓝量不足时等待自然增长，不再主动扩蓝
                  </span>
                </span>
              </label>
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
                    ? '法师不计 NX：前期 AP 全加 INT；净收益转正后扩蓝。近 3 万蓝时只洗到不亏损极限（给自然成长/扩蓝留空间），绝不一次洗到最低蓝'
                    : '可留空：不强制目标蓝，按默认推演结果；填写后系统寻找满足该 MP 且总 NX 最低的面板 INT'
                }
              >
                <input
                  className={inputClassName}
                  type="number"
                  min={0}
                  placeholder="留空 = 不设目标"
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
          {isRunning ? (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                <span className="truncate">{runProgressMessage || '计算中…'}</span>
                <span className="shrink-0 tabular-nums">
                  {Math.round(runProgress)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200">
                <div
                  className="h-full rounded-full bg-neutral-900 transition-[width] duration-150 ease-out"
                  style={{ width: `${Math.max(2, runProgress)}%` }}
                />
              </div>
            </div>
          ) : null}
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
              <div className="w-full max-w-md space-y-4">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
                <div>
                  <p className="text-sm font-medium text-neutral-800">
                    {runProgressMessage || '模拟计算中…'}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    正在搜索最优 INT，界面会持续更新进度
                  </p>
                </div>
                <div>
                  <div className="mb-1.5 flex justify-between text-xs text-neutral-500">
                    <span>进度</span>
                    <span className="tabular-nums">{Math.round(runProgress)}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className="h-full rounded-full bg-neutral-900 transition-[width] duration-150 ease-out"
                      style={{ width: `${Math.max(2, runProgress)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : result && !result.validationErrors.length ? (
            <>
              {(() => {
                const isMageDefaultAllInt =
                  job === 'magician' ||
                  result.defaultAllInt ||
                  isDefaultAllIntStrategy(job);
                const activePlan =
                  !isMageDefaultAllInt &&
                  planView === 'default' &&
                  result.defaultPlan
                    ? result.defaultPlan
                    : result;
                const defaultInt =
                  result.defaultTargetInt ?? getDefaultTargetInt(job);
                return (
            <>
              {activePlan.hasWarning ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  模拟过程中出现 MP 触底警告，部分等级的洗点/扩蓝操作已中断。
                </div>
              ) : null}
              {planView === 'optimal' && result.optimizationFeasible === false ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {job === 'magician'
                    ? `当前未能让峰值 MP 达到 ${MAX_MP.toLocaleString('zh-CN')} 并出山，已展示峰值蓝/最终血尽量高的方案。`
                    : String(targetMpAt200).trim() === ''
                      ? '当前等级与属性点范围内未能完成洗血出山，已展示最终血量尽量高的方案。'
                      : '当前等级与属性点范围内无法满足 200 级目标 MP，已展示可达到 MP 最高的方案。'}
                </div>
              ) : null}

              <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <div className="border-b border-neutral-100 bg-gradient-to-br from-blue-50/80 via-white to-amber-50/50 p-6">
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-neutral-950">洗血方案</h2>
                      <p className="mt-1 text-xs text-neutral-500">
                        {isMageDefaultAllInt
                          ? '法师默认：AP 全加 INT；近蓝上限时只洗到不亏损极限，扩蓝不触顶'
                          : planView === 'default'
                            ? `按职业默认 INT ${defaultInt} 推演`
                            : String(targetMpAt200).trim() === ''
                              ? '未设目标蓝：按洗血完成且 NX 最低规划，蓝量有多少算多少'
                              : '系统已按目标 MP 与最低 NX 开销完成路径规划'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!isMageDefaultAllInt ? (
                        <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5 text-xs">
                          <button
                            type="button"
                            className={`rounded-md px-2.5 py-1 font-medium transition ${
                              planView === 'optimal'
                                ? 'bg-neutral-900 text-white'
                                : 'text-neutral-600 hover:bg-neutral-50'
                            }`}
                            onClick={() => setPlanView('optimal')}
                          >
                            最省 NX
                          </button>
                          <button
                            type="button"
                            className={`rounded-md px-2.5 py-1 font-medium transition ${
                              planView === 'default'
                                ? 'bg-neutral-900 text-white'
                                : 'text-neutral-600 hover:bg-neutral-50'
                            }`}
                            onClick={() => setPlanView('default')}
                          >
                            默认 INT {defaultInt}
                          </button>
                        </div>
                      ) : null}
                      {activePlan.graduationLevel ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          Lv.{activePlan.graduationLevel} 出山
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div
                    className={`grid gap-6 sm:grid-cols-2 ${
                      isExpandThenWashJob(job)
                        ? 'xl:grid-cols-6'
                        : 'xl:grid-cols-5'
                    }`}
                  >
                    <SummaryMetric
                      label="最终 HP"
                      value={formatNumber(activePlan.finalHp)}
                      emphasized
                      subtitle={
                        activePlan.equipmentHp > 0
                          ? `基础 ${formatNumber(activePlan.finalBaseHp)} + 装备 ${formatNumber(activePlan.equipmentHp)}`
                          : `洗血目标 ${formatNumber(activePlan.washTargetHp)} · 已达成`
                      }
                    />
                    <SummaryMetric
                      label={job === 'magician' ? '峰值 MP' : 'Lv.200 预测 MP'}
                      value={formatNumber(
                        job === 'magician'
                          ? (activePlan.peakMp ?? activePlan.finalMp)
                          : activePlan.projectedMpAt200,
                      )}
                      emphasized
                      subtitle={
                        job === 'magician'
                          ? activePlan.mpCapLevel
                            ? `首次满蓝 Lv.${activePlan.mpCapLevel} · 上限 ${formatNumber(MAX_MP)}`
                            : `目标满蓝 ${formatNumber(MAX_MP)}`
                          : String(targetMpAt200).trim() === ''
                            ? '未设目标 · 按推演结果'
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
                    {isExpandThenWashJob(job) ? (
                      <SummaryMetric
                        label="扩蓝启动 INT"
                        value={
                          result.optimalExpandStartInt ??
                          result.optimalTargetInt
                        }
                        emphasized
                        subtitle="平衡扩蓝收益与 NX，启动后边扩蓝边洗血"
                      />
                    ) : null}
                    <SummaryMetric
                      label="默认策略"
                      value={isMageDefaultAllInt ? '全加 INT' : defaultInt}
                      emphasized
                      subtitle={
                        isMageDefaultAllInt
                          ? '不设固定 INT 目标'
                          : JOB_OPTIONS[job].label
                      }
                    />
                    <SummaryMetric
                      label="总 NX 开销"
                      value={formatNumber(activePlan.totalNx)}
                      emphasized
                      subtitle={`${formatNumber(activePlan.totalApr)} 张 APR × 3,500`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-y divide-neutral-100 sm:grid-cols-4 xl:grid-cols-8">
                  <div className="p-4">
                    <SummaryMetric
                      label={`Lv.${targetLevel} MP`}
                      value={formatNumber(activePlan.finalMp)}
                    />
                  </div>
                  <div className="p-4">
                    <SummaryMetric label="最终 STR" value={activePlan.finalStats.str} />
                  </div>
                  <div className="p-4">
                    <SummaryMetric label="最终 DEX" value={activePlan.finalStats.dex} />
                  </div>
                  <div className="p-4">
                    <SummaryMetric label="最终 INT" value={activePlan.finalStats.int} />
                  </div>
                  <div className="p-4">
                    <SummaryMetric label="最终 LUK" value={activePlan.finalStats.luk} />
                  </div>
                  <div className="p-4">
                    <SummaryMetric
                      label="出山等级"
                      value={activePlan.graduationLevel ? `Lv.${activePlan.graduationLevel}` : '—'}
                    />
                  </div>
                  <div className="p-4">
                    <SummaryMetric
                      label={activePlan.finalMagicBoost > 0 ? '魔力强化' : '生命强化'}
                      value={
                        activePlan.finalMagicBoost > 0
                          ? `Lv.${activePlan.finalMagicBoost}`
                          : activePlan.finalLifeEnhancement > 0
                            ? `Lv.${activePlan.finalLifeEnhancement}`
                            : '—'
                      }
                    />
                  </div>
                  <div className="p-4">
                    <SummaryMetric
                      label="洗血目标 HP"
                      value={formatNumber(activePlan.washTargetHp)}
                    />
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-neutral-50"
                  onClick={() => setIsDetailsOpen((open) => !open)}
                >
                  <div>
                    <h2 className="text-sm font-semibold text-neutral-900">逐级模拟明细</h2>
                    <p className="mt-0.5 text-xs text-neutral-400">
                      共 {activePlan.records.length} 条记录 · 展开后显示全部
                      {isMageDefaultAllInt
                        ? ' · 全加 INT'
                        : planView === 'default'
                          ? ` · 默认 INT ${defaultInt}`
                          : ' · 最省 NX'}
                    </p>
                  </div>
                  <span className="text-neutral-400">
                    <svg
                      className={`h-5 w-5 transition ${isDetailsOpen ? 'rotate-180' : ''}`}
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
                      {activePlan.records.map((row) => (
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
                            <OperationText
                              operation={row.operation}
                              segments={row.operationSegments}
                            />
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
                );
              })()}
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
                设置目标等级后点击「开始模拟」。200 级目标 MP 可留空。系统会自动选择最优
                INT，并智能决定何时洗血、扩蓝与出山。
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
