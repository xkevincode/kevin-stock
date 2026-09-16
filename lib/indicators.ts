export function ema(values: number[], period: number): number[] {
  if (period < 1) throw new Error("EMA 周期必须 >= 1");
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function sma(values: number[], period: number): Array<number | null> {
  if (period < 1) throw new Error("MA 周期必须 >= 1");
  const out: Array<number | null> = new Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out[i] = i >= period - 1 ? sum / period : null;
  }
  return out;
}

export interface MacdSeries {
  dif: number[];
  dea: number[];
  hist: number[];
}

/** MACD 柱 = DIF − DEA，参数默认 12/26/9 */
export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): MacdSeries {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const dif = emaFast.map((v, i) => v - emaSlow[i]);
  const dea = ema(dif, signal);
  const hist = dif.map((v, i) => v - dea[i]);
  return { dif, dea, hist };
}

export function maCrossAbove(
  closes: number[],
  fastPeriod: number,
  slowPeriod: number,
): boolean {
  const fast = sma(closes, fastPeriod);
  const slow = sma(closes, slowPeriod);
  const i = closes.length - 1;
  if (i < 1) return false;
  const f0 = fast[i];
  const s0 = slow[i];
  const f1 = fast[i - 1];
  const s1 = slow[i - 1];
  if (f0 === null || s0 === null || f1 === null || s1 === null) return false;
  return f1 <= s1 && f0 > s0;
}

/**
 * 近 lookback 根内出现最低点，且上一根就是该最低点，本根柱值相对上一根拐头向上。
 */
export function troughTurnUp(hist: number[], lookback: number): boolean {
  const i = hist.length - 1;
  if (i < 2 || lookback < 3) return false;
  const start = Math.max(0, hist.length - lookback);
  const window = hist.slice(start);
  if (window.some((v) => !Number.isFinite(v))) return false;
  const trough = Math.min(...window);
  const prev = hist[i - 1];
  const last = hist[i];
  const prev2 = hist[i - 2];
  const prevIsTrough = prev === trough;
  const turnedUp = last > prev;
  const wasNotAlreadyRising = prev <= prev2;
  return prevIsTrough && turnedUp && wasNotAlreadyRising;
}

export function nearLookbackHigh(
  hist: number[],
  lookback: number,
  ratio: number,
): boolean {
  const i = hist.length - 1;
  if (i < 0 || lookback < 1) return false;
  const start = Math.max(0, hist.length - lookback);
  const window = hist.slice(start);
  if (window.some((v) => !Number.isFinite(v))) return false;
  const peak = Math.max(...window);
  if (peak > 0) return hist[i] >= peak * ratio;
  return hist[i] >= peak;
}

export function lastFinite(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) return v;
  }
  return null;
}
