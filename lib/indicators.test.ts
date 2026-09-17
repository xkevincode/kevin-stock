import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateBacktest, replayStock } from "./backtest";
import { maCrossAbove, macd, nearLookbackHigh, sma, troughTurnUp } from "./indicators";
import { dailyToWeekly, weekKey } from "./market";
import { mergePool } from "./pool";
import { defaultBuyStrategy, defaultSellStrategy, evaluateStrategy, parseHandwritten } from "./strategies";
import type { KLine, Strategy } from "./types";

function bar(date: string, close: number, open = close): KLine {
  return { date, open, close, high: Math.max(open, close), low: Math.min(open, close), volume: 1 };
}

describe("indicators", () => {
  it("sma and ma cross above", () => {
    const closes = [3, 3, 3, 3, 1, 1, 5];
    const ma2 = sma(closes, 2);
    assert.equal(ma2[1], 3);
    assert.equal(ma2.at(-1), 3);
    assert.equal(maCrossAbove(closes, 2, 3), true);
  });

  it("macd histogram is DIF minus DEA", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 10 + i * 0.2);
    const series = macd(closes, 12, 26, 9);
    const i = series.hist.length - 1;
    assert.ok(Math.abs(series.hist[i] - (series.dif[i] - series.dea[i])) < 1e-12);
  });

  it("trough turn up from 26-bar low", () => {
    const hist: number[] = Array.from({ length: 26 }, (_, i) =>
      i === 24 ? -5 : i === 25 ? -4 : 0,
    );
    hist[23] = -3;
    assert.equal(troughTurnUp(hist, 26), true);
    hist[25] = -6;
    assert.equal(troughTurnUp(hist, 26), false);
  });

  it("near high uses 90% of lookback peak", () => {
    const hist = Array.from({ length: 26 }, () => 1);
    hist[10] = 10;
    hist[25] = 9;
    assert.equal(nearLookbackHigh(hist, 26, 0.9), true);
    hist[25] = 8;
    assert.equal(nearLookbackHigh(hist, 26, 0.9), false);
  });
});

describe("weekly bars", () => {
  it("groups a Mon-Fri week by calendar Monday", () => {
    assert.equal(weekKey("2026-09-16"), weekKey("2026-09-14"));
    assert.notEqual(weekKey("2026-09-14"), weekKey("2026-09-13"));
    const weekly = dailyToWeekly([
      bar("2026-09-14", 10, 9),
      bar("2026-09-15", 11, 10),
      bar("2026-09-16", 12, 11),
    ]);
    assert.equal(weekly.length, 1);
    assert.equal(weekly[0].open, 9);
    assert.equal(weekly[0].close, 12);
    assert.equal(weekly[0].high, 12);
    assert.equal(weekly[0].low, 9);
  });
});

describe("pool union", () => {
  it("marks leader, range, and both", () => {
    const stocks = mergePool(
      [
        {
          quote: { code: "000001", name: "平安银行", market: 0, price: 10, pctChange: 4 },
          industry: { code: "BK0475", name: "银行" },
        },
        {
          quote: { code: "600000", name: "浦发银行", market: 1, price: 8, pctChange: 1 },
          industry: { code: "BK0475", name: "银行" },
        },
      ],
      [
        { code: "000001", name: "平安银行", market: 0, price: 10, pctChange: 4 },
        { code: "300001", name: "特锐德", market: 0, price: 20, pctChange: 5 },
      ],
    );
    const byCode = Object.fromEntries(stocks.map((s) => [s.code, s.reason]));
    assert.equal(byCode["000001"], "both");
    assert.equal(byCode["600000"], "leader");
    assert.equal(byCode["300001"], "range");
  });
});

describe("backtest", () => {
  it("buys next open after buy signal and marks last close if still held", () => {
    const buy: Strategy = {
      ...defaultBuyStrategy(),
      match: "all",
      conditions: [
        {
          ...defaultBuyStrategy().conditions[1],
          timeframe: "daily",
          indicator: "ma",
          relation: "cross_above",
          fastPeriod: 2,
          slowPeriod: 3,
        },
      ],
    };
    const sell: Strategy = {
      ...defaultSellStrategy(),
      conditions: [
        {
          ...defaultSellStrategy().conditions[0],
          timeframe: "daily",
          indicator: "macd_hist",
          relation: "near_high",
          lookback: 3,
          nearHighRatio: 1.5,
        },
      ],
    };
    const daily: KLine[] = [
      bar("2026-01-05", 10, 10),
      bar("2026-01-06", 10, 10),
      bar("2026-01-07", 10, 10),
      bar("2026-01-08", 16, 10),
      bar("2026-01-09", 16, 12),
      bar("2026-01-10", 20, 13),
    ];
    const result = replayStock({
      code: "000001",
      name: "测试",
      daily,
      buy,
      sell,
      start: "2026-01-05",
      end: "2026-01-10",
    });
    assert.equal(result.tradeCount, 1);
    assert.equal(result.trades[0].open, true);
    assert.equal(result.trades[0].buyPrice, 12);
    assert.equal(result.trades[0].sellPrice, 20);
  });

  it("aggregates average return and win rate", () => {
    const agg = aggregateBacktest(
      "2026-01-01",
      "2026-01-31",
      [
        {
          code: "1",
          name: "a",
          trades: [
            {
              code: "1",
              name: "a",
              buyDate: "2026-01-02",
              buyPrice: 10,
              sellDate: "2026-01-03",
              sellPrice: 11,
              returnPct: 10,
              open: false,
            },
          ],
          tradeCount: 1,
          winCount: 1,
          avgReturnPct: 10,
          winRate: 100,
        },
        {
          code: "2",
          name: "b",
          trades: [
            {
              code: "2",
              name: "b",
              buyDate: "2026-01-02",
              buyPrice: 10,
              sellDate: "2026-01-03",
              sellPrice: 9,
              returnPct: -10,
              open: false,
            },
          ],
          tradeCount: 1,
          winCount: 0,
          avgReturnPct: -10,
          winRate: 0,
        },
      ],
      [],
    );
    assert.equal(agg.tradeCount, 2);
    assert.equal(agg.winRate, 50);
    assert.equal(agg.avgReturnPct, 0);
  });
});

describe("default strategy wiring", () => {
  it("requires both default buy conditions", () => {
    const strategy = defaultBuyStrategy();
    assert.equal(strategy.match, "all");
    assert.equal(strategy.conditions.length, 2);
    const evaled = evaluateStrategy(strategy, [bar("2026-01-01", 1)]);
    assert.equal(evaled.passed, false);
    assert.equal(strategy.conditions.every((c) => c.handwritten.length > 0), true);
  });
});

describe("handwritten conditions", () => {
  it("parses MA cross and weekly MACD trough text", () => {
    const ma = parseHandwritten(
      "日K MA8 上穿 MA21",
      defaultBuyStrategy().conditions[1],
    );
    assert.equal(ma.timeframe, "daily");
    assert.equal(ma.indicator, "ma");
    assert.equal(ma.fastPeriod, 8);
    assert.equal(ma.slowPeriod, 21);

    const macdTurn = parseHandwritten(
      "周K MACD柱 近52根最低点后拐头向上",
      defaultBuyStrategy().conditions[0],
    );
    assert.equal(macdTurn.timeframe, "weekly");
    assert.equal(macdTurn.relation, "trough_turn_up");
    assert.equal(macdTurn.lookback, 52);
  });
});
