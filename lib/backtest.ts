import { signalOnDate } from "@/lib/strategies";
import type {
  BacktestResult,
  BacktestTrade,
  KLine,
  StockBacktest,
  Strategy,
} from "@/lib/types";

export function replayStock(options: {
  code: string;
  name: string;
  daily: KLine[];
  buy: Strategy;
  sell: Strategy;
  start: string;
  end: string;
}): StockBacktest {
  const { code, name, buy, sell, start, end } = options;
  const daily = [...options.daily]
    .filter((bar) => bar.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));

  const trades: BacktestTrade[] = [];
  const firstInRange = daily.findIndex((bar) => bar.date >= start && bar.date <= end);
  if (firstInRange < 0) {
    return summarizeStock(code, name, trades, "回测区间内无 K 线");
  }

  let holding = false;
  let buyDate = "";
  let buyPrice = 0;
  let pending: "buy" | "sell" | null = null;

  for (let i = firstInRange; i < daily.length; i++) {
    const bar = daily[i];
    if (bar.date > end) break;

    if (pending === "buy" && !holding) {
      holding = true;
      buyDate = bar.date;
      buyPrice = bar.open;
      pending = null;
    } else if (pending === "sell" && holding) {
      trades.push({
        code,
        name,
        buyDate,
        buyPrice,
        sellDate: bar.date,
        sellPrice: bar.open,
        returnPct: pctReturn(buyPrice, bar.open),
        open: false,
      });
      holding = false;
      buyDate = "";
      buyPrice = 0;
      pending = null;
    } else {
      pending = null;
    }

    const history = daily.slice(0, i + 1);
    if (!holding) {
      if (signalOnDate(buy, history, bar.date)) pending = "buy";
    } else if (signalOnDate(sell, history, bar.date)) {
      pending = "sell";
    }
  }

  if (holding) {
    const last = daily.filter((bar) => bar.date <= end).at(-1);
    if (last) {
      trades.push({
        code,
        name,
        buyDate,
        buyPrice,
        sellDate: last.date,
        sellPrice: last.close,
        returnPct: pctReturn(buyPrice, last.close),
        open: true,
      });
    }
  }

  return summarizeStock(code, name, trades);
}

function pctReturn(buy: number, sell: number): number {
  if (!Number.isFinite(buy) || buy === 0) return 0;
  return ((sell - buy) / buy) * 100;
}

function summarizeStock(
  code: string,
  name: string,
  trades: BacktestTrade[],
  error?: string,
): StockBacktest {
  const tradeCount = trades.length;
  const winCount = trades.filter((t) => t.returnPct > 0).length;
  const avgReturnPct =
    tradeCount === 0
      ? 0
      : trades.reduce((sum, t) => sum + t.returnPct, 0) / tradeCount;
  return {
    code,
    name,
    trades,
    tradeCount,
    winCount,
    avgReturnPct,
    winRate: tradeCount === 0 ? 0 : (winCount / tradeCount) * 100,
    error,
  };
}

export function aggregateBacktest(
  start: string,
  end: string,
  stocks: StockBacktest[],
  warnings: string[],
): BacktestResult {
  const trades = stocks.flatMap((s) => s.trades);
  const tradeCount = trades.length;
  const winCount = trades.filter((t) => t.returnPct > 0).length;
  const avgReturnPct =
    tradeCount === 0
      ? 0
      : trades.reduce((sum, t) => sum + t.returnPct, 0) / tradeCount;
  return {
    start,
    end,
    stocks,
    trades,
    tradeCount,
    winCount,
    avgReturnPct,
    winRate: tradeCount === 0 ? 0 : (winCount / tradeCount) * 100,
    warnings,
  };
}
