import { NextResponse } from "next/server";
import { aggregateBacktest, replayStock } from "@/lib/backtest";
import { fetchDailyKlinesMany } from "@/lib/market";
import { buildCandidatePool } from "@/lib/pool";
import { parseStrategy } from "@/lib/strategies";
import type { CandidateStock } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function neededBars(start: string, end: string): number {
  const t0 = Date.parse(`${start}T00:00:00+08:00`);
  const t1 = Date.parse(`${end}T00:00:00+08:00`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return 640;
  const days = Math.round((t1 - t0) / 86400000) + 280;
  return Math.min(2000, Math.max(400, days));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      buyStrategy?: unknown;
      sellStrategy?: unknown;
      start?: string;
      end?: string;
      universe?: "pool" | "hits";
      stocks?: Pick<CandidateStock, "code" | "name" | "market">[];
    };

    const start = String(body.start ?? "");
    const end = String(body.end ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return NextResponse.json(
        { ok: false, error: "请选择有效的回测起止日期。" },
        { status: 400 },
      );
    }
    if (start > end) {
      return NextResponse.json(
        { ok: false, error: "开始日期不能晚于结束日期。" },
        { status: 400 },
      );
    }

    const buy = parseStrategy(body.buyStrategy);
    const sell = parseStrategy(body.sellStrategy);
    if (buy.side !== "buy") {
      return NextResponse.json(
        { ok: false, error: "买入策略方向不正确。" },
        { status: 400 },
      );
    }
    if (sell.side !== "sell") {
      return NextResponse.json(
        { ok: false, error: "卖出策略方向不正确。" },
        { status: 400 },
      );
    }

    let stocks = body.stocks ?? [];
    const extraWarnings: string[] = [];
    if (body.universe === "pool" || stocks.length === 0) {
      const pool = await buildCandidatePool();
      extraWarnings.push(...pool.warnings);
      stocks =
        body.universe === "hits" && body.stocks && body.stocks.length > 0
          ? body.stocks
          : pool.stocks.map((s) => ({
              code: s.code,
              name: s.name,
              market: s.market,
            }));
    }

    if (stocks.length === 0) {
      return NextResponse.json(
        { ok: false, error: "回测标的为空。请先刷新候选池或筛选命中。" },
        { status: 400 },
      );
    }

    const { klines, warnings } = await fetchDailyKlinesMany(
      stocks,
      neededBars(start, end),
      12,
    );

    const results = stocks.map((stock) => {
      const daily = klines.get(stock.code);
      if (!daily) {
        return {
          code: stock.code,
          name: stock.name,
          trades: [],
          tradeCount: 0,
          winCount: 0,
          avgReturnPct: 0,
          winRate: 0,
          error: "无 K 线",
        };
      }
      return replayStock({
        code: stock.code,
        name: stock.name,
        daily,
        buy,
        sell,
        start,
        end,
      });
    });

    return NextResponse.json({
      ok: true,
      data: aggregateBacktest(start, end, results, [
        ...extraWarnings,
        ...warnings,
      ]),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "回测失败";
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }
}
