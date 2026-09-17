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
    pctThreshold: 5,
    handwritten: "",
    ...partial,
  };
}

export function structuredLabel(condition: StrategyCondition): string {
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
  if (condition.indicator === "unparsed") {
    return "未能识别手写内容";
  }
  if (condition.indicator === "price_pct") {
    const pct = Number.isFinite(condition.pctThreshold)
      ? condition.pctThreshold
      : 0;
    if (condition.relation === "stop_loss") return `亏损 ${pct}% 卖出`;
    if (condition.relation === "take_profit") return `盈利 ${pct}% 卖出`;
    return `收益或损失达到 ${pct}% 卖出`;
  }
  return `${tf} ${condition.indicator} ${condition.relation}`;
}

export function applyHandwritten(condition: StrategyCondition): StrategyCondition {
  const text = condition.handwritten?.trim();
  return {
    ...condition,
    handwritten: text || structuredLabel(condition),
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
        handwritten: "周K MACD柱 近26根最低点后拐头向上",
      }),
      defaultCondition({
        id: "default-buy-ma",
        timeframe: "daily",
        indicator: "ma",
        relation: "cross_above",
        fastPeriod: 5,
        slowPeriod: 10,
        handwritten: "日K MA5 上穿 MA10",
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
    match: "any",
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
        handwritten: "周K MACD柱 处于近26根高点附近（≥90%）",
      }),
      defaultCondition({
        id: "default-sell-pct",
        timeframe: "daily",
        indicator: "price_pct",
        relation: "pct_band",
        pctThreshold: 5,
        handwritten: "收益损失5%卖出",
      }),
    ],
  };
}

export function defaultStrategies(): Strategy[] {
  return [defaultBuyStrategy(), defaultSellStrategy()];
}

export function conditionLabel(condition: StrategyCondition): string {
  const text = condition.handwritten?.trim();
  return text || structuredLabel(condition);
}

export function parseHandwritten(
  text: string,
  prev: StrategyCondition,
): StrategyCondition {
  const handwritten = text.trim();
  const next: StrategyCondition = { ...prev, handwritten };
  if (!handwritten) {
    return {
      ...applyHandwritten({ ...next, handwritten: "" }),
      indicator: "unparsed",
    };
  }

  const pctMatch = handwritten.match(/(\d+(?:\.\d+)?)\s*%/);
  const pct = pctMatch ? Number(pctMatch[1]) : NaN;
  if (
    Number.isFinite(pct) &&
    /收益\s*损失|盈亏|涨跌幅|涨跌达/.test(handwritten)
  ) {
    return {
      ...next,
      timeframe: "daily",
      indicator: "price_pct",
      relation: "pct_band",
      pctThreshold: pct,
    };
  }
  if (Number.isFinite(pct) && /(止损|亏损|跌幅)/.test(handwritten)) {
    return {
      ...next,
      timeframe: "daily",
      indicator: "price_pct",
      relation: "stop_loss",
      pctThreshold: pct,
    };
  }
  if (Number.isFinite(pct) && /(止盈|盈利|获利|涨幅)/.test(handwritten)) {
    return {
      ...next,
      timeframe: "daily",
      indicator: "price_pct",
      relation: "take_profit",
      pctThreshold: pct,
    };
  }
  if (Number.isFinite(pct) && /损失/.test(handwritten)) {
    return {
      ...next,
      timeframe: "daily",
      indicator: "price_pct",
      relation: "stop_loss",
      pctThreshold: pct,
    };
  }

  if (/周[Kk线]/.test(handwritten) || /周线/.test(handwritten)) {
    next.timeframe = "weekly";
  } else if (/日[Kk线]/.test(handwritten) || /日线/.test(handwritten)) {
    next.timeframe = "daily";
  }

  const ma =
    handwritten.match(/MA\s*(\d+)\s*(?:向上)?(?:上穿|突破)\s*MA\s*(\d+)/i) ||
    handwritten.match(/(\d+)\s*日均线?\s*(?:向上)?(?:突破|上穿)\s*(\d+)\s*日?(?:均线)?/) ||
    handwritten.match(/(\d+)\s*[/／]\s*(\d+)\s*均线/) ||
    handwritten.match(/MA\s*(\d+)\s*(?:向上)?(?:上穿|突破)\s*(\d+)/i);
  if (ma) {
    next.indicator = "ma";
    next.relation = "cross_above";
    next.fastPeriod = Number(ma[1]);
    next.slowPeriod = Number(ma[2]);
    return next;
  }

  const lookback =
    handwritten.match(/近\s*(\d+)\s*根/) ||
    handwritten.match(/(\d+)\s*根/) ||
    handwritten.match(/回看\s*(\d+)/);
  const macdParams = handwritten.match(
    /(?:MACD|macd)\s*(\d+)\s*[,/／]\s*(\d+)\s*[,/／]\s*(\d+)/i,
  );
  if (macdParams) {
    next.macdFast = Number(macdParams[1]);
    next.macdSlow = Number(macdParams[2]);
    next.macdSignal = Number(macdParams[3]);
  }

  if (/高点/.test(handwritten)) {
    next.indicator = "macd_hist";
    next.relation = "near_high";
    if (lookback) next.lookback = Number(lookback[1]);
    const highPct = handwritten.match(/(\d+(?:\.\d+)?)\s*%/);
    if (highPct) next.nearHighRatio = Number(highPct[1]) / 100;
    return next;
  }
  if (/拐头|最低点|MACD/i.test(handwritten)) {
    next.indicator = "macd_hist";
    next.relation = "trough_turn_up";
    if (lookback) next.lookback = Number(lookback[1]);
    return next;
  }

  return {
    ...next,
    indicator: "unparsed",
    relation: prev.relation,
  };
}

function barsFor(condition: StrategyCondition, daily: KLine[]): KLine[] {
  return condition.timeframe === "weekly" ? dailyToWeekly(daily) : daily;
}

export function evaluateCondition(
  condition: StrategyCondition,
  daily: KLine[],
  ctx?: { entryPrice?: number },
): ConditionEval {
  const label = conditionLabel(condition);
  const bars = barsFor(condition, daily);
  const closes = bars.map((b) => b.close);
  const lastDate = bars.at(-1)?.date ?? "—";

  if (condition.indicator === "unparsed") {
    return {
      conditionId: condition.id,
      label,
      passed: false,
      detail: "手写内容未能识别，槽位未套用均线或 MACD",
    };
  }

  if (condition.indicator === "price_pct") {
    const th = condition.pctThreshold;
    if (ctx?.entryPrice == null || ctx.entryPrice === 0) {
      return {
        conditionId: condition.id,
        label,
        passed: false,
        detail: "按买入价计算涨跌幅，需持仓后才判断",
      };
    }
    const last = bars.at(-1);
    if (!last) {
      return { conditionId: condition.id, label, passed: false, detail: "无 K 线" };
    }
    const move = ((last.close - ctx.entryPrice) / ctx.entryPrice) * 100;
    let passed = false;
    if (condition.relation === "stop_loss") passed = move <= -Math.abs(th);
    else if (condition.relation === "take_profit") passed = move >= Math.abs(th);
    else passed = Math.abs(move) >= Math.abs(th);
    return {
      conditionId: condition.id,
      label,
      passed,
      detail: `${lastDate} 相对买入价 ${move.toFixed(2)}%，阈值 ${th}%`,
    };
  }

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
  ctx?: { entryPrice?: number },
): { passed: boolean; conditions: ConditionEval[] } {
  const conditions = strategy.conditions.map((c) =>
    evaluateCondition(c, daily, ctx),
  );
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
  ctx?: { entryPrice?: number },
): boolean {
  const sliced = daily.filter((bar) => bar.date <= asOf);
  return evaluateStrategy(strategy, sliced, ctx).passed;
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
  const indicator =
    raw.indicator === "macd_hist" ||
    raw.indicator === "price_pct" ||
    raw.indicator === "unparsed"
      ? raw.indicator
      : "ma";
  const relation = parseRelation(raw.relation, indicator);
  const parsed: StrategyCondition = {
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
    pctThreshold: num(raw.pctThreshold, base.pctThreshold, 0.1, 100),
    handwritten: typeof raw.handwritten === "string" ? raw.handwritten : "",
  };
  return applyHandwritten(parsed);
}

function parseRelation(
  value: unknown,
  indicator: StrategyCondition["indicator"],
): StrategyCondition["relation"] {
  if (
    value === "cross_above" ||
    value === "trough_turn_up" ||
    value === "near_high" ||
    value === "stop_loss" ||
    value === "take_profit" ||
    value === "pct_band"
  ) {
    return value;
  }
  if (indicator === "macd_hist") return "trough_turn_up";
  if (indicator === "price_pct") return "pct_band";
  return "cross_above";
}

function num(value: unknown, fallback: number, min: number, max = 500): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
