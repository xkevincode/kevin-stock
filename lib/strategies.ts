import { dailyToWeekly } from "@/lib/market";
import {
  maCrossAbove,
  macd,
  nearLookbackHigh,
  sma,
  troughTurnUp,
} from "@/lib/indicators";
import type {
  ConditionEval,
  KLine,
  Strategy,
  StrategyCondition,
} from "@/lib/types";

export function newConditionId(): string {
  return crypto.randomUUID();
}

export function defaultCondition(
  partial?: Partial<StrategyCondition>,
): StrategyCondition {
  return {
    id: newConditionId(),
    timeframe: "daily",
    indicator: "ma",
    relation: "cross_above",
    fastPeriod: 5,
    slowPeriod: 10,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    lookback: 26,
    nearHighRatio: 0.9,
    ...partial,
  };
}

export function defaultBuyStrategy(): Strategy {
  return {
    id: "default-buy",
    name: "默认可买入",
    enabled: true,
    side: "buy",
    match: "all",
    conditions: [
      defaultCondition({
        id: "default-buy-macd",
        timeframe: "weekly",
        indicator: "macd_hist",
        relation: "trough_turn_up",
        macdFast: 12,
        macdSlow: 26,
        macdSignal: 9,
        lookback: 26,
      }),
      defaultCondition({
        id: "default-buy-ma",
        timeframe: "daily",
        indicator: "ma",
        relation: "cross_above",
        fastPeriod: 5,
        slowPeriod: 10,
      }),
    ],
  };
}

export function defaultSellStrategy(): Strategy {
  return {
    id: "default-sell",
    name: "默认可卖出",
    enabled: true,
    side: "sell",
    match: "all",
    conditions: [
      defaultCondition({
        id: "default-sell-macd",
        timeframe: "weekly",
        indicator: "macd_hist",
        relation: "near_high",
        macdFast: 12,
        macdSlow: 26,
        macdSignal: 9,
        lookback: 26,
        nearHighRatio: 0.9,
      }),
    ],
  };
}

export function defaultStrategies(): Strategy[] {
  return [defaultBuyStrategy(), defaultSellStrategy()];
}

export function conditionLabel(condition: StrategyCondition): string {
  const tf = condition.timeframe === "weekly" ? "周K" : "日K";
  if (condition.indicator === "ma" && condition.relation === "cross_above") {
    return `${tf} MA${condition.fastPeriod} 上穿 MA${condition.slowPeriod}`;
  }
  if (
    condition.indicator === "macd_hist" &&
    condition.relation === "trough_turn_up"
  ) {
    return `${tf} MACD柱 近${condition.lookback}根最低点后拐头向上`;
  }
  if (condition.indicator === "macd_hist" && condition.relation === "near_high") {
    return `${tf} MACD柱 处于近${condition.lookback}根高点附近（≥${Math.round(condition.nearHighRatio * 100)}%）`;
  }
  return `${tf} ${condition.indicator} ${condition.relation}`;
}

function barsFor(condition: StrategyCondition, daily: KLine[]): KLine[] {
  return condition.timeframe === "weekly" ? dailyToWeekly(daily) : daily;
}

export function evaluateCondition(
  condition: StrategyCondition,
  daily: KLine[],
): ConditionEval {
  const label = conditionLabel(condition);
  const bars = barsFor(condition, daily);
  const closes = bars.map((b) => b.close);
  const lastDate = bars.at(-1)?.date ?? "—";

  if (condition.indicator === "ma") {
    if (condition.relation !== "cross_above") {
      return {
        conditionId: condition.id,
        label,
        passed: false,
        detail: "均线只支持「上穿」关系",
      };
    }
    const passed = maCrossAbove(
      closes,
      condition.fastPeriod,
      condition.slowPeriod,
    );
    const fast = sma(closes, condition.fastPeriod);
    const slow = sma(closes, condition.slowPeriod);
    const f = fast.at(-1);
    const s = slow.at(-1);
    return {
      conditionId: condition.id,
      label,
      passed,
      detail: passed
        ? `${lastDate} MA${condition.fastPeriod}=${fmt(f)} 上穿 MA${condition.slowPeriod}=${fmt(s)}`
        : `${lastDate} 未上穿（MA${condition.fastPeriod}=${fmt(f)}，MA${condition.slowPeriod}=${fmt(s)}）`,
    };
  }

  const series = macd(
    closes,
    condition.macdFast,
    condition.macdSlow,
    condition.macdSignal,
  );
  const hist = series.hist;
  const last = hist.at(-1);
  const prev = hist.at(-2);

  if (condition.relation === "trough_turn_up") {
    const passed = troughTurnUp(hist, condition.lookback);
    return {
      conditionId: condition.id,
      label,
      passed,
      detail: passed
        ? `${lastDate} 柱值从最低点拐头 ${fmt(prev)} → ${fmt(last)}`
        : `${lastDate} 未从近${condition.lookback}根最低点拐头（本根 ${fmt(last)}，上根 ${fmt(prev)}）`,
    };
  }

  if (condition.relation === "near_high") {
    const passed = nearLookbackHigh(
      hist,
      condition.lookback,
      condition.nearHighRatio,
    );
    const start = Math.max(0, hist.length - condition.lookback);
    const peak = hist.slice(start).reduce((m, v) => (v > m ? v : m), -Infinity);
    return {
      conditionId: condition.id,
      label,
      passed,
      detail: passed
        ? `${lastDate} 柱值 ${fmt(last)} ≥ 高点 ${fmt(peak)} 的 ${Math.round(condition.nearHighRatio * 100)}%`
        : `${lastDate} 柱值 ${fmt(last)} 未达高点 ${fmt(peak)} 的 ${Math.round(condition.nearHighRatio * 100)}%`,
    };
  }

  return {
    conditionId: condition.id,
    label,
    passed: false,
    detail: "均线与 MACD 柱的关系不匹配",
  };
}

export function evaluateStrategy(
  strategy: Strategy,
  daily: KLine[],
): { passed: boolean; conditions: ConditionEval[] } {
  const conditions = strategy.conditions.map((c) => evaluateCondition(c, daily));
  if (conditions.length === 0) {
    return { passed: false, conditions };
  }
  const passed =
    strategy.match === "all"
      ? conditions.every((c) => c.passed)
      : conditions.some((c) => c.passed);
  return { passed, conditions };
}

export function signalOnDate(
  strategy: Strategy,
  daily: KLine[],
  asOf: string,
): boolean {
  const sliced = daily.filter((bar) => bar.date <= asOf);
  return evaluateStrategy(strategy, sliced).passed;
}

function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(4);
}

export function parseStrategies(input: unknown): Strategy[] {
  if (!Array.isArray(input)) throw new Error("策略列表格式无效");
  return input.map(parseStrategy);
}

export function parseStrategy(input: unknown): Strategy {
  if (!input || typeof input !== "object") throw new Error("策略格式无效");
  const raw = input as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.name !== "string") {
    throw new Error("策略缺少名称");
  }
  if (raw.side !== "buy" && raw.side !== "sell") {
    throw new Error("策略方向必须是买入或卖出");
  }
  if (raw.match !== "all" && raw.match !== "any") {
    throw new Error("策略匹配方式无效");
  }
  if (!Array.isArray(raw.conditions) || raw.conditions.length === 0) {
    throw new Error(`策略「${raw.name}」至少需要一条条件`);
  }
  return {
    id: raw.id,
    name: raw.name,
    enabled: Boolean(raw.enabled),
    side: raw.side,
    match: raw.match,
    conditions: raw.conditions.map(parseCondition),
  };
}

function parseCondition(input: unknown): StrategyCondition {
  if (!input || typeof input !== "object") throw new Error("条件格式无效");
  const raw = input as Record<string, unknown>;
  const base = defaultCondition({
    id: typeof raw.id === "string" ? raw.id : newConditionId(),
  });
  const timeframe = raw.timeframe === "weekly" ? "weekly" : "daily";
  const indicator = raw.indicator === "macd_hist" ? "macd_hist" : "ma";
  const relation =
    raw.relation === "trough_turn_up" || raw.relation === "near_high"
      ? raw.relation
      : "cross_above";
  return {
    ...base,
    timeframe,
    indicator,
    relation,
    fastPeriod: num(raw.fastPeriod, base.fastPeriod, 1),
    slowPeriod: num(raw.slowPeriod, base.slowPeriod, 1),
    macdFast: num(raw.macdFast, base.macdFast, 1),
    macdSlow: num(raw.macdSlow, base.macdSlow, 1),
    macdSignal: num(raw.macdSignal, base.macdSignal, 1),
    lookback: num(raw.lookback, base.lookback, 3),
    nearHighRatio: num(raw.nearHighRatio, base.nearHighRatio, 0.1, 1),
  };
}

function num(value: unknown, fallback: number, min: number, max = 500): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
