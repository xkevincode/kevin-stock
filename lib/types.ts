export type PoolReason = "leader" | "range" | "both";

export interface IndustryRef {
  code: string;
  name: string;
}

export interface CandidateStock {
  code: string;
  name: string;
  market: number;
  price: number;
  pctChange: number;
  reason: PoolReason;
  industries: IndustryRef[];
}

export interface PoolResult {
  asOf: string;
  tradeDate: string;
  stocks: CandidateStock[];
  industryCount: number;
  leaderCount: number;
  rangeCount: number;
  bothCount: number;
  warnings: string[];
}

export interface KLine {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

export type Timeframe = "daily" | "weekly";
export type IndicatorKind = "ma" | "macd_hist";
export type RelationKind = "cross_above" | "trough_turn_up" | "near_high";
export type StrategySide = "buy" | "sell";
export type MatchMode = "all" | "any";

export interface StrategyCondition {
  id: string;
  timeframe: Timeframe;
  indicator: IndicatorKind;
  relation: RelationKind;
  fastPeriod: number;
  slowPeriod: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  lookback: number;
  nearHighRatio: number;
}

export interface Strategy {
  id: string;
  name: string;
  enabled: boolean;
  side: StrategySide;
  match: MatchMode;
  conditions: StrategyCondition[];
}

export interface ConditionEval {
  conditionId: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface StockEval {
  code: string;
  name: string;
  market: number;
  price: number;
  pctChange: number;
  reason: PoolReason;
  industries: IndustryRef[];
  passed: boolean;
  strategyId: string;
  strategyName: string;
  conditions: ConditionEval[];
  error?: string;
}

export interface ScreenResult {
  asOf: string;
  tradeDate: string;
  hits: StockEval[];
  scanned: number;
  warnings: string[];
}

export interface BacktestTrade {
  code: string;
  name: string;
  buyDate: string;
  buyPrice: number;
  sellDate: string;
  sellPrice: number;
  returnPct: number;
  open: boolean;
}

export interface StockBacktest {
  code: string;
  name: string;
  trades: BacktestTrade[];
  tradeCount: number;
  winCount: number;
  avgReturnPct: number;
  winRate: number;
  error?: string;
}

export interface BacktestResult {
  start: string;
  end: string;
  stocks: StockBacktest[];
  trades: BacktestTrade[];
  tradeCount: number;
  winCount: number;
  avgReturnPct: number;
  winRate: number;
  warnings: string[];
}

export interface ApiErrorBody {
  ok: false;
  error: string;
}

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export type ApiResponse<T> = ApiOk<T> | ApiErrorBody;
