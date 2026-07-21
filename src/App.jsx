import { Fragment, useRef, useState } from 'react';
import {
  getDefaultBaseStats,
  getDefaultTargetInt,
  getDefaultExpandStartInt,
  getEquipIntAtLevel,
  HP_EQUIPMENT_OPTIONS,
  JOB_OPTIONS,
  MAX_HP,
  MAX_MP,
  MAX_GAME_LEVEL,
  MW_OPTIONS,
  APR_NX_COST,
  isDefaultAllIntStrategy,
  isExpandThenWashJob,
  canUseExpandStartInt,
} from './config/jobConfig.js';
import {
  hasLifeEnhancement,
  hasMagicBoost,
  LIFE_ENHANCEMENT_MAX,
  MAGIC_BOOST_MAX,
  projectSkillsToLevel,
} from './config/skillConfig.js';
import {
  optimizeTargetInt,
  runFixedTargetInt,
} from './utils/simulation.js';
import ManualModePanel from './components/ManualModePanel.jsx';

/** @typedef {import('./config/jobConfig.js').JobId} JobId */

/** 手动操作模式入口（暂隐藏） */
const MANUAL_MODE_ENABLED = false;

/**
 * 职业切换时的目标 INT / 扩蓝启动 INT 表单默认值
 * @param {JobId} nextJob
 * @returns {{ targetInt: string; expandStartInt: string }}
 */
function getIntStrategyDefaults(nextJob) {
  if (isDefaultAllIntStrategy(nextJob)) {
    return {
      targetInt: '',
      expandStartInt: String(getDefaultExpandStartInt(nextJob) ?? 130),
    };
  }
  const target = getDefaultTargetInt(nextJob) ?? 100;
  const expand = getDefaultExpandStartInt(nextJob) ?? target;
  return {
    targetInt: String(target),
    expandStartInt: String(expand),
  };
}

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
          className="pointer-events-none fixed z-50 max-w-md rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-[11px] leading-5 text-neutral-700 shadow-lg"
          style={{ left: pos.x, top: pos.y }}
        >
          <span className="mb-1 block font-semibold text-neutral-900">
            逐次明细
          </span>
          <span className="mb-1.5 block text-[10px] leading-4 text-neutral-500">
            物理扩蓝净蓝 = ⌊基础INT/10⌋−2（−2 为公式常数；退点为职业固定扣蓝）
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
 * 逐级模拟明细表
 * @param {Object} props
 * @param {import('./utils/simulation.js').LevelRecord[]} props.rows
 * @param {number} props.equipmentHp
 * @param {'wash' | 'natural'} [props.variant]
 */
function SimulationDetailTable({ rows, equipmentHp, variant = 'wash' }) {
  const isNatural = variant === 'natural';
  const headBg = isNatural ? 'bg-sky-50' : 'bg-neutral-50';

  return (
    <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-left text-sm">
      <thead>
        <tr className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          <th className={`sticky top-0 z-30 border-b border-neutral-200 ${headBg} px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]`}>等级</th>
          <th className={`sticky top-0 z-30 border-b border-neutral-200 ${headBg} px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]`}>HP 增长</th>
          <th className={`sticky top-0 z-30 border-b border-neutral-200 ${headBg} px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]`}>MP 增长</th>
          <th className={`sticky top-0 z-30 border-b border-neutral-200 ${headBg} px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]`}>操作</th>
          <th className={`sticky top-0 z-30 border-b border-neutral-200 ${headBg} px-4 py-3 text-right shadow-[0_1px_3px_rgba(0,0,0,0.06)]`}>属性</th>
          <th className={`sticky top-0 z-30 border-b border-neutral-200 ${headBg} px-4 py-3 text-right shadow-[0_1px_3px_rgba(0,0,0,0.06)]`}>强化</th>
          <th className={`sticky top-0 z-30 border-b border-neutral-200 ${headBg} px-4 py-3 text-right shadow-[0_1px_3px_rgba(0,0,0,0.06)]`}>
            {equipmentHp > 0 ? '面板 HP' : '当前 HP'}
          </th>
          <th className={`sticky top-0 z-30 border-b border-neutral-200 ${headBg} px-4 py-3 text-right shadow-[0_1px_3px_rgba(0,0,0,0.06)]`}>当前 MP</th>
          <th className={`sticky top-0 z-30 border-b border-neutral-200 ${headBg} px-4 py-3 text-right shadow-[0_1px_3px_rgba(0,0,0,0.06)]`}>Min MP</th>
          <th className={`sticky top-0 z-30 border-b border-neutral-200 ${headBg} px-4 py-3 text-right shadow-[0_1px_3px_rgba(0,0,0,0.06)]`}>累计 NX</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {rows.map((row) => (
          <tr
            key={row.level}
            className={
              row.warning
                ? 'bg-amber-50/80'
                : isNatural
                  ? 'bg-sky-50/40 hover:bg-sky-50/70'
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
              <OperationText operation={row.operation} segments={row.operationSegments} />
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
              {formatNumber(row.panelHp ?? row.hp)}
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
  const warriorIntDefaults = getIntStrategyDefaults('warriorHero');
  const [baseStr, setBaseStr] = useState(warriorDefaults.str);
  const [baseDex, setBaseDex] = useState(warriorDefaults.dex);
  const [baseInt, setBaseInt] = useState(warriorDefaults.int);
  const [baseLuk, setBaseLuk] = useState(warriorDefaults.luk);
  const [equipIntBonuses, setEquipIntBonuses] = useState(
    /** @type {{ id: string; level: string; int: string }[]} */ ([]),
  );
  const [noActiveMpExpand, setNoActiveMpExpand] = useState(false);
  /** 智能匹配 INT：开启后自动寻优；关闭后按下方设定 INT 推演 */
  const [smartIntMatch, setSmartIntMatch] = useState(true);
  const [strategyTargetInt, setStrategyTargetInt] = useState(
    warriorIntDefaults.targetInt,
  );
  const [strategyExpandStartInt, setStrategyExpandStartInt] = useState(
    warriorIntDefaults.expandStartInt,
  );
  /** @type {['fresh' | 'mid', React.Dispatch<React.SetStateAction<'fresh' | 'mid'>>]} */
  const [startMode, setStartMode] = useState('fresh');
  const [startLevel, setStartLevel] = useState('120');
  const [startHp, setStartHp] = useState('8000');
  const [startMp, setStartMp] = useState('3000');
  const [startLifeEnhancement, setStartLifeEnhancement] = useState('');
  const [startMagicBoost, setStartMagicBoost] = useState('');
  const [hpGoalLevel, setHpGoalLevel] = useState(180);
  const [graduationTargetLevel, setGraduationTargetLevel] = useState(160);
  const [graduationHpTarget, setGraduationHpTarget] = useState('');
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
  const [isNaturalDetailsOpen, setIsNaturalDetailsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [runProgressMessage, setRunProgressMessage] = useState('');
  /** @type {['sim' | 'manual', React.Dispatch<React.SetStateAction<'sim' | 'manual'>>]} */
  const [viewMode, setViewMode] = useState('sim');
  /** @type {React.RefObject<HTMLElement | null>} */
  const resultsSectionRef = useRef(null);

  /**
   * 平滑滚动回洗血方案结果区
   */
  const scrollToResults = () => {
    resultsSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  /**
   * 切换职业并重置初始四属性与 INT 策略默认值
   * @param {JobId} nextJob
   */
  const handleJobChange = (nextJob) => {
    const defaults = getDefaultBaseStats(nextJob);
    const intDefaults = getIntStrategyDefaults(nextJob);
    setJob(nextJob);
    setBaseStr(defaults.str);
    setBaseDex(defaults.dex);
    setBaseInt(defaults.int);
    setBaseLuk(defaults.luk);
    setStrategyTargetInt(intDefaults.targetInt);
    setStrategyExpandStartInt(intDefaults.expandStartInt);
  };

  /**
   * 构建手动模式配置（与左侧表单参数一致）
   * @returns {import('./utils/manualMode.js').ManualModeConfig}
   */
  const buildManualConfig = () => {
    const preferredTargetInt = Number(strategyTargetInt);
    const targetInt = isDefaultAllIntStrategy(job)
      ? Math.max(Number(baseInt) || 10, 9999)
      : Number.isFinite(preferredTargetInt) && preferredTargetInt > 0
        ? preferredTargetInt
        : (getDefaultTargetInt(job) ?? (Number(baseInt) || 10));

    /** @type {import('./config/skillConfig.js').SkillState | undefined} */
    let startSkills;
    if (startMode === 'mid') {
      const leRaw = String(startLifeEnhancement).trim();
      const mbRaw = String(startMagicBoost).trim();
      startSkills = {
        lifeRecovery: 0,
        lifeEnhancement:
          leRaw !== '' && Number.isFinite(Number(leRaw))
            ? Number(leRaw)
            : projectSkillsToLevel(job, Number(startLevel) || 120)
                .lifeEnhancement,
        magicBoost:
          mbRaw !== '' && Number.isFinite(Number(mbRaw))
            ? Number(mbRaw)
            : projectSkillsToLevel(job, Number(startLevel) || 120).magicBoost ??
              0,
      };
    }

    return {
      job,
      baseStats: {
        str: Number(baseStr) || 4,
        dex: Number(baseDex) || 4,
        int: Number(baseInt) || 4,
        luk: Number(baseLuk) || 4,
      },
      targetInt,
      graduationTargetLevel: Number(graduationTargetLevel) || 160,
      hpEquipment: {
        t10Ring: equipT10Ring,
        butterflyRing: equipButterflyRing,
        monNecklace: equipMonNecklace,
      },
      equipIntBonuses: equipIntBonuses
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
        ),
      mwLevel,
      mwStartLevel: Number(mwStartLevel) || 7,
      ...(startMode === 'mid'
        ? {
            startLevel: Number(startLevel) || 120,
            startHp: Number(startHp) || 1,
            startMp: Number(startMp) || 0,
            startSkills,
          }
        : {}),
    };
  };

  /**
   * 进入手动操作模式
   */
  const handleOpenManual = () => {
    setViewMode('manual');
    setResult(null);
    setIsDetailsOpen(false);
    setIsNaturalDetailsOpen(false);
  };

  /**
   * 执行模拟（异步 + 进度反馈）
   */
  const handleRun = async () => {
    setViewMode('sim');
    setResult(null);
    setIsDetailsOpen(false);
    setIsNaturalDetailsOpen(false);
    setPlanView(smartIntMatch ? 'optimal' : 'default');
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
      const rawGradHp = String(graduationHpTarget).trim();
      const parsedGradHp =
        rawGradHp === '' ? undefined : Number(rawGradHp);
      const preferredTargetRaw = String(strategyTargetInt).trim();
      const preferredExpandRaw = String(strategyExpandStartInt).trim();
      const preferredTargetInt =
        preferredTargetRaw === '' ? undefined : Number(preferredTargetRaw);
      const preferredExpandStartInt =
        preferredExpandRaw === '' ? undefined : Number(preferredExpandRaw);

      const parsedStartLevel = Number(startLevel);
      const isMidStart = startMode === 'mid';
      const midLevel =
        Number.isFinite(parsedStartLevel) && parsedStartLevel > 1
          ? Math.floor(parsedStartLevel)
          : 120;
      const leTrim = String(startLifeEnhancement).trim();
      const mbTrim = String(startMagicBoost).trim();
      const projectedSkills = isMidStart
        ? projectSkillsToLevel(job, midLevel)
        : null;
      /** @type {import('./config/skillConfig.js').SkillState | undefined} */
      const startSkills =
        isMidStart && (leTrim !== '' || mbTrim !== '')
          ? {
              lifeRecovery: projectedSkills?.lifeRecovery ?? 0,
              lifeEnhancement:
                leTrim === ''
                  ? (projectedSkills?.lifeEnhancement ?? 0)
                  : Number(leTrim),
              magicBoost:
                mbTrim === ''
                  ? (projectedSkills?.magicBoost ?? 0)
                  : Number(mbTrim),
            }
          : undefined;

      const baseParams = {
        job,
        baseStats: {
          str: Number(baseStr),
          dex: Number(baseDex),
          int: Number(baseInt),
          luk: Number(baseLuk),
        },
        ...(isMidStart
          ? {
              startLevel: midLevel,
              startHp: Number(startHp),
              startMp: Number(startMp),
              startSkills,
            }
          : {}),
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
        preferredTargetInt: Number.isFinite(preferredTargetInt)
          ? preferredTargetInt
          : undefined,
        preferredExpandStartInt: Number.isFinite(preferredExpandStartInt)
          ? preferredExpandStartInt
          : undefined,
        hpGoalLevel: Number(hpGoalLevel),
        graduationTargetLevel: Number(graduationTargetLevel),
        graduationHpTarget: parsedGradHp,
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
      };

      /**
       * @param {{ percent: number; message: string }} progress
       */
      const onProgress = ({ percent, message }) => {
        setRunProgress(percent);
        setRunProgressMessage(message);
      };

      const mpTarget =
        parsedTargetMp !== null && Number.isFinite(parsedTargetMp)
          ? parsedTargetMp
          : null;

      let simulationResult;
      if (smartIntMatch) {
        simulationResult = await optimizeTargetInt(
          baseParams,
          mpTarget,
          onProgress,
        );
      } else {
        const isMage = isDefaultAllIntStrategy(job);
        const fixedTarget = isMage
          ? Math.max(
              Number(baseInt) || 10,
              Number.isFinite(preferredExpandStartInt)
                ? /** @type {number} */ (preferredExpandStartInt)
                : 130,
            )
          : Number.isFinite(preferredTargetInt)
            ? /** @type {number} */ (preferredTargetInt)
            : (getDefaultTargetInt(job) ?? (Number(baseInt) || 10));
        const fixedExpand = Number.isFinite(preferredExpandStartInt)
          ? /** @type {number} */ (preferredExpandStartInt)
          : (getDefaultExpandStartInt(job) ?? fixedTarget);
        simulationResult = await runFixedTargetInt(
          {
            ...baseParams,
            targetInt: fixedTarget,
            expandStartInt: Math.min(fixedTarget, Math.max(30, fixedExpand)),
          },
          mpTarget,
          onProgress,
        );
      }
      setResult(simulationResult);
      setPlanView(smartIntMatch ? 'optimal' : 'default');
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
            APR = {APR_NX_COST.toLocaleString('zh-CN')} NX
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
                <p className="mb-2 text-sm font-medium text-neutral-700">模拟起点</p>
                <div className="mb-3 inline-flex w-full rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-xs">
                  <button
                    type="button"
                    className={`flex-1 rounded-md px-2 py-1.5 font-medium transition ${
                      startMode === 'fresh'
                        ? 'bg-white text-neutral-900 shadow-sm'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                    onClick={() => setStartMode('fresh')}
                  >
                    从 1 级
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-md px-2 py-1.5 font-medium transition ${
                      startMode === 'mid'
                        ? 'bg-white text-neutral-900 shadow-sm'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                    onClick={() => setStartMode('mid')}
                  >
                    中途洗
                  </button>
                </div>
                {startMode === 'mid' ? (
                  <div className="space-y-2 rounded-lg border border-neutral-100 bg-neutral-50/80 p-3">
                    <FormField
                      label="当前等级"
                      hint="从该等级的下一级开始推演洗血/扩蓝"
                    >
                      <input
                        className={inputClassName}
                        type="number"
                        min={2}
                        max={199}
                        value={startLevel}
                        onChange={(e) => setStartLevel(e.target.value)}
                      />
                    </FormField>
                    <div className="grid grid-cols-2 gap-2">
                      <FormField label="当前 HP">
                        <input
                          className={inputClassName}
                          type="number"
                          min={1}
                          value={startHp}
                          onChange={(e) => setStartHp(e.target.value)}
                        />
                      </FormField>
                      <FormField label="当前 MP">
                        <input
                          className={inputClassName}
                          type="number"
                          min={0}
                          value={startMp}
                          onChange={(e) => setStartMp(e.target.value)}
                        />
                      </FormField>
                    </div>
                    {hasLifeEnhancement(job) ? (
                      <FormField
                        label="生命强化等级"
                        hint={`留空按 Lv.${startLevel || '?'} 自动推算（满级 ${LIFE_ENHANCEMENT_MAX}）`}
                      >
                        <input
                          className={inputClassName}
                          type="number"
                          min={0}
                          max={LIFE_ENHANCEMENT_MAX}
                          placeholder={
                            Number.isFinite(Number(startLevel)) &&
                            Number(startLevel) > 1
                              ? String(
                                  projectSkillsToLevel(
                                    job,
                                    Number(startLevel),
                                  ).lifeEnhancement,
                                )
                              : '自动'
                          }
                          value={startLifeEnhancement}
                          onChange={(e) =>
                            setStartLifeEnhancement(e.target.value)
                          }
                        />
                      </FormField>
                    ) : null}
                    {hasMagicBoost(job) ? (
                      <FormField
                        label="魔力强化等级"
                        hint={`留空按 Lv.${startLevel || '?'} 自动推算（满级 ${MAGIC_BOOST_MAX}）`}
                      >
                        <input
                          className={inputClassName}
                          type="number"
                          min={0}
                          max={MAGIC_BOOST_MAX}
                          placeholder={
                            Number.isFinite(Number(startLevel)) &&
                            Number(startLevel) > 1
                              ? String(
                                  projectSkillsToLevel(
                                    job,
                                    Number(startLevel),
                                  ).magicBoost ?? 0,
                                )
                              : '自动'
                          }
                          value={startMagicBoost}
                          onChange={(e) => setStartMagicBoost(e.target.value)}
                        />
                      </FormField>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-neutral-700">
                  {startMode === 'mid' ? '当前四属性' : '初始四属性'}
                </p>
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

              <div className="rounded-lg border border-neutral-100 bg-neutral-50/80 p-3 space-y-3">
                <div>
                  <p className="mb-2 text-sm font-medium text-neutral-700">INT 策略</p>
                  <div className="inline-flex w-full rounded-lg border border-neutral-200 bg-white p-0.5 text-xs">
                    <button
                      type="button"
                      className={`flex-1 rounded-md px-2 py-1.5 font-medium transition ${
                        smartIntMatch
                          ? 'bg-neutral-900 text-white shadow-sm'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                      onClick={() => setSmartIntMatch(true)}
                    >
                      智能匹配
                    </button>
                    <button
                      type="button"
                      className={`flex-1 rounded-md px-2 py-1.5 font-medium transition ${
                        !smartIntMatch
                          ? 'bg-neutral-900 text-white shadow-sm'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                      onClick={() => setSmartIntMatch(false)}
                    >
                      手动设定
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-neutral-400">
                    {smartIntMatch
                      ? '自动寻优目标 INT（及扩蓝启动），在满足目标时选 NX 较低方案'
                      : '按下方填写的 INT 推演，不再自动寻优'}
                  </p>
                </div>
                {!smartIntMatch ? (
                  job === 'magician' ? (
                    <FormField
                      label="扩蓝启动 INT"
                      hint="从此 INT 起开始 APR 扩蓝（默认 130）"
                    >
                      <input
                        className={inputClassName}
                        type="number"
                        min={4}
                        max={999}
                        value={strategyExpandStartInt}
                        onChange={(e) =>
                          setStrategyExpandStartInt(e.target.value)
                        }
                      />
                    </FormField>
                  ) : (
                    <>
                      <FormField
                        label="目标 INT"
                        hint="按此 INT 推演；切换职业会重置为该职业默认值"
                      >
                        <input
                          className={inputClassName}
                          type="number"
                          min={4}
                          max={999}
                          value={strategyTargetInt}
                          onChange={(e) => setStrategyTargetInt(e.target.value)}
                        />
                      </FormField>
                      {canUseExpandStartInt(job) || isExpandThenWashJob(job) ? (
                        <FormField
                          label="扩蓝启动 INT"
                          hint="达到此 INT 后开始边扩蓝边洗血（须 ≤ 目标 INT）"
                        >
                          <input
                            className={inputClassName}
                            type="number"
                            min={4}
                            max={999}
                            value={strategyExpandStartInt}
                            onChange={(e) =>
                              setStrategyExpandStartInt(e.target.value)
                            }
                          />
                        </FormField>
                      ) : null}
                    </>
                  )
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">全局设定</h2>
            <div className="space-y-3">
              <FormField
                label="目标 3w 血等级"
                hint="尽量在此等级前洗满目标 HP（含装备时为面板 3w）。勾选装备后只需洗到「30,000 − 装备加血」的基础 HP；超过该等级若自然成长足够则不再花 NX 洗血"
              >
                <input
                  className={inputClassName}
                  type="number"
                  min={1}
                  max={200}
                  value={hpGoalLevel}
                  onChange={(e) => setHpGoalLevel(e.target.value)}
                />
              </FormField>
              <FormField
                label="目标出山等级"
                hint="此等级把智力洗回主属性恢复战力；可低于 3w 血目标。出山前先洗到「出山目标血量」，出山后再冲满血"
              >
                <input
                  className={inputClassName}
                  type="number"
                  min={1}
                  max={200}
                  value={graduationTargetLevel}
                  onChange={(e) => setGraduationTargetLevel(e.target.value)}
                />
              </FormField>
              <FormField
                label="出山目标血量"
                hint="可留空：不单独设出山血量，出山前按正常洗血目标推进；填写后出山前先洗到该血量，出山后再冲满血（3w − 装备）"
              >
                <input
                  className={inputClassName}
                  type="number"
                  min={1}
                  max={30000}
                  placeholder="不设则按正常目标"
                  value={graduationHpTarget}
                  onChange={(e) => setGraduationHpTarget(e.target.value)}
                />
              </FormField>
              <FormField
                label="200级目标 MP"
                hint={
                  job === 'magician'
                    ? '法师不计 NX：前期 AP 全加 INT；净收益转正后扩蓝。近 3 万蓝时只洗到不亏损极限（给自然成长/扩蓝留空间），绝不一次洗到最低蓝'
                    : '可留空：不强制目标蓝，按默认推演结果；填写后系统优先提前扩蓝以满足目标 MP，并在够蓝方案中选 NX 较低者'
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
                  勾选后洗血目标变为 {MAX_HP.toLocaleString('zh-CN')} − 装备加血（只需洗更少基础 HP）；面板 HP 达标后或预计自然成长可达面板 3w 时，不再花费 NX 洗血
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
            {isRunning ? '模拟中…' : '开始模拟'}
          </button>
          {MANUAL_MODE_ENABLED ? (
            <button
              type="button"
              onClick={handleOpenManual}
              disabled={isRunning}
              className="mt-2 w-full shrink-0 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 shadow-sm transition hover:border-neutral-400 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              手动操作
            </button>
          ) : null}
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
          {MANUAL_MODE_ENABLED && viewMode === 'manual' ? (
            <ManualModePanel
              config={buildManualConfig()}
              onBack={() => setViewMode('sim')}
            />
          ) : null}

          {viewMode === 'sim' && result?.validationErrors.length ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-medium">参数校验失败</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {result.validationErrors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {viewMode === 'sim' && isRunning ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white p-12 text-center">
              <div className="w-full max-w-md space-y-4">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
                <div>
                  <p className="text-sm font-medium text-neutral-800">
                    {runProgressMessage || '模拟计算中…'}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    正在计算 INT 方案，界面会持续更新进度
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
          ) : viewMode === 'sim' && result && !result.validationErrors.length ? (
            <>
              {(() => {
                const isMageDefaultAllInt =
                  job === 'magician' ||
                  result.defaultAllInt ||
                  isDefaultAllIntStrategy(job);
                const activePlan =
                  smartIntMatch &&
                  !isMageDefaultAllInt &&
                  planView === 'default' &&
                  result.defaultPlan
                    ? result.defaultPlan
                    : result;
                const defaultInt =
                  result.defaultTargetInt ?? getDefaultTargetInt(job);
                const showExpandStart =
                  isExpandThenWashJob(job) ||
                  (canUseExpandStartInt(job) &&
                    result.optimalExpandStartInt != null);
                const washGoalLevel =
                  activePlan.washGoalLevel ?? (Number(hpGoalLevel) || 180);
                const washPlanRecords = activePlan.records.filter(
                  (row) => !row.naturalPreview,
                );
                const naturalPreviewRecords = activePlan.records.filter(
                  (row) => row.naturalPreview,
                );
                const washDetailEndLevel =
                  washPlanRecords.length > 0
                    ? Math.max(...washPlanRecords.map((row) => row.level))
                    : washGoalLevel;
                const naturalPreviewStartLevel =
                  naturalPreviewRecords.length > 0
                    ? Math.min(...naturalPreviewRecords.map((row) => row.level))
                    : washGoalLevel + 1;
                return (
            <>
              {activePlan.hasWarning ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {(() => {
                    const messages = [
                      ...new Set(
                        (activePlan.records ?? [])
                          .filter((row) => row.warning && row.warningMessage)
                          .map((row) => row.warningMessage),
                      ),
                    ];
                    if (messages.length === 0) {
                      return '模拟过程中出现警告，请查看标 ⚠ 的等级（悬停可看原因）。';
                    }
                    return (
                      <>
                        模拟过程中出现警告：
                        <ul className="mt-1 list-disc pl-5">
                          {messages.map((msg) => (
                            <li key={msg}>{msg}</li>
                          ))}
                        </ul>
                      </>
                    );
                  })()}
                </div>
              ) : null}
              {planView === 'optimal' && result.optimizationFeasible === false ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {job === 'magician'
                    ? `当前未能让峰值 MP 达到 ${MAX_MP.toLocaleString('zh-CN')} 并出山，已展示峰值蓝/最终血尽量高的方案。`
                    : String(targetMpAt200).trim() === ''
                      ? '当前参数下无法在 200 级前洗满目标 HP，已展示最终血量尽量高的方案。'
                      : '当前等级与属性点范围内无法满足 200 级目标 MP，已展示可达到 MP 最高的方案。'}
                </div>
              ) : null}

              <section
                ref={resultsSectionRef}
                className="scroll-mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
              >
                <div className="border-b border-neutral-100 bg-gradient-to-br from-blue-50/80 via-white to-amber-50/50 p-6">
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-neutral-950">洗血方案</h2>
                      <p className="mt-1 text-xs text-neutral-500">
                        {isMageDefaultAllInt
                          ? smartIntMatch
                            ? '法师智能匹配：寻优扩蓝启动；近蓝上限时只洗到不亏损极限'
                            : '法师按设定扩蓝启动 INT 推演；近蓝上限时只洗到不亏损极限'
                          : !smartIntMatch || planView === 'default'
                            ? `按设定 INT ${defaultInt ?? strategyTargetInt} 推演`
                            : String(targetMpAt200).trim() === ''
                              ? '智能匹配：按洗血完成且 NX 最低规划，蓝量有多少算多少'
                              : '智能匹配：优先提前扩蓝以满足 MP，再兼顾最低 NX'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {smartIntMatch && !isMageDefaultAllInt && result.defaultPlan ? (
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
                            智能推荐
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
                            设定 INT {defaultInt}
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
                      showExpandStart
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
                            ? `含 Lv.${naturalPreviewStartLevel}~${MAX_GAME_LEVEL} 自然成长预览`
                            : `目标 ${formatNumber(Number(targetMpAt200))}`
                      }
                    />
                    <SummaryMetric
                      label={
                        job === 'magician'
                          ? '扩蓝启动 INT'
                          : smartIntMatch && planView === 'optimal'
                            ? '推荐目标 INT'
                            : '设定目标 INT'
                      }
                      value={
                        planView === 'default' && result.defaultPlan
                          ? (result.defaultTargetInt ??
                            result.optimalTargetInt)
                          : result.optimalTargetInt
                      }
                      emphasized
                      subtitle={
                        job === 'magician'
                          ? '扩蓝净收益严格大于 0'
                          : smartIntMatch && planView === 'optimal'
                            ? '满足目标时 NX 最低'
                            : '按左侧设定推演'
                      }
                    />
                    {showExpandStart ? (
                      <SummaryMetric
                        label="扩蓝启动 INT"
                        value={
                          planView === 'default' && result.defaultPlan
                            ? (result.defaultPlan.optimalExpandStartInt ??
                              result.defaultTargetInt ??
                              result.optimalExpandStartInt ??
                              result.optimalTargetInt)
                            : (result.optimalExpandStartInt ??
                              result.optimalTargetInt)
                        }
                        emphasized
                        subtitle={
                          smartIntMatch && planView === 'optimal'
                            ? String(targetMpAt200).trim() === ''
                              ? '平衡扩蓝收益与 NX，启动后边扩蓝边洗血'
                              : '目标蓝模式下偏向提前扩蓝以多攒蓝'
                            : '按左侧设定'
                        }
                      />
                    ) : null}
                    <SummaryMetric
                      label="INT 策略"
                      value={
                        smartIntMatch
                          ? planView === 'optimal'
                            ? '智能匹配'
                            : `设定 ${defaultInt ?? '—'}`
                          : isMageDefaultAllInt
                            ? '扩蓝启动设定'
                            : `设定 ${defaultInt ?? strategyTargetInt}`
                      }
                      emphasized
                      subtitle={JOB_OPTIONS[job].label}
                    />
                    <SummaryMetric
                      label="总 NX 开销"
                      value={formatNumber(activePlan.totalNx)}
                      emphasized
                      subtitle={`${formatNumber(activePlan.totalApr)} 张 APR × ${formatNumber(APR_NX_COST)}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-y divide-neutral-100 sm:grid-cols-4 xl:grid-cols-8">
                  <div className="p-4">
                    <SummaryMetric
                      label={`Lv.${washGoalLevel} MP`}
                      value={formatNumber(
                        washPlanRecords.length > 0
                          ? washPlanRecords[washPlanRecords.length - 1].mp
                          : activePlan.finalMp,
                      )}
                      subtitle={
                        naturalPreviewRecords.length > 0
                          ? `洗血阶段终点 · Lv.${MAX_GAME_LEVEL} 预览 ${formatNumber(activePlan.finalMp)}`
                          : undefined
                      }
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
                      subtitle={
                        activePlan.graduationHp != null
                          ? `当时 HP ${formatNumber(activePlan.graduationHp)}${
                              activePlan.graduationHpTarget
                                ? ` / 目标 ${formatNumber(activePlan.graduationHpTarget)}`
                                : ''
                            }`
                          : undefined
                      }
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

              <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-neutral-50"
                  onClick={() => setIsDetailsOpen((open) => !open)}
                >
                  <div>
                    <h2 className="text-sm font-semibold text-neutral-900">
                      洗血模拟明细（至 Lv.{washDetailEndLevel}）
                    </h2>
                    <p className="mt-0.5 text-xs text-neutral-400">
                      共 {washPlanRecords.length} 条记录 · 含扩蓝/洗血/出山等操作
                      {isMageDefaultAllInt
                        ? smartIntMatch
                          ? ' · 法师智能匹配'
                          : ' · 法师设定扩蓝启动'
                        : !smartIntMatch || planView === 'default'
                          ? ` · 设定 INT ${defaultInt}`
                          : ' · 智能推荐'}
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
                  <SimulationDetailTable
                    rows={washPlanRecords}
                    equipmentHp={activePlan.equipmentHp}
                    variant="wash"
                  />
                ) : null}
              </section>

              {naturalPreviewRecords.length > 0 ? (
                <section className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50/80 via-white to-white shadow-sm">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-sky-50/60"
                    onClick={() => setIsNaturalDetailsOpen((open) => !open)}
                  >
                    <div>
                      <h2 className="text-sm font-semibold text-sky-950">
                        自然成长预览（Lv.{naturalPreviewStartLevel} ~ {MAX_GAME_LEVEL}）
                      </h2>
                      <p className="mt-0.5 text-xs text-sky-700/80">
                        共 {naturalPreviewRecords.length} 条 · 仅自然 HP/MP 成长，AP 全加主属性，不计洗血 NX
                      </p>
                    </div>
                    <span className="text-sky-500">
                      <svg
                        className={`h-5 w-5 transition ${isNaturalDetailsOpen ? 'rotate-180' : ''}`}
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

                  {isNaturalDetailsOpen ? (
                    <SimulationDetailTable
                      rows={naturalPreviewRecords}
                      equipmentHp={activePlan.equipmentHp}
                      variant="natural"
                    />
                  ) : null}
                </section>
              ) : null}

              {isDetailsOpen || isNaturalDetailsOpen ? (
                <button
                  type="button"
                  className="fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-lg transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                  onClick={scrollToResults}
                  aria-label="回到洗血方案结果"
                  title="回到洗血方案结果"
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      d="M10 15V5M10 5l-4 4M10 5l4 4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ) : null}
            </>
                );
              })()}
            </>
          ) : viewMode === 'sim' ? (
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
                设置目标 3w 血等级、出山等级与出山血量后点击「开始模拟」。
              </p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
