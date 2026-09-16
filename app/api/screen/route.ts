import { NextResponse } from "next/server";
import { fetchDailyKlinesMany } from "@/lib/market";
import { buildCandidatePool } from "@/lib/pool";
import { evaluateStrategy, parseStrategies } from "@/lib/strategies";
import type { StockEval } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      strategies?: unknown;
    };
    const strategies = parseStrategies(body.strategies).filter(
      (s) => s.enabled && s.side === "buy",
    );
    if (strategies.length === 0) {
      return NextResponse.json(
        { ok: false, error: "请至少启用一条买入策略再筛选。" },
        { status: 400 },
      );
    }

    const pool = await buildCandidatePool();
    const { klines, warnings } = await fetchDailyKlinesMany(
      pool.stocks.map((s) => ({ code: s.code, market: s.market })),
      640,
      12,
    );

    const hits: StockEval[] = [];
    for (const stock of pool.stocks) {
      const daily = klines.get(stock.code);
      if (!daily) {
        continue;
      }
      for (const strategy of strategies) {
        const evaled = evaluateStrategy(strategy, daily);
        if (!evaled.passed) continue;
        hits.push({
          code: stock.code,
          name: stock.name,
          market: stock.market,
          price: stock.price,
          pctChange: stock.pctChange,
          reason: stock.reason,
          industries: stock.industries,
          passed: true,
          strategyId: strategy.id,
          strategyName: strategy.name,
          conditions: evaled.conditions,
        });
        break;
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        asOf: new Date().toISOString(),
        tradeDate: pool.tradeDate,
        hits,
        scanned: klines.size,
        warnings: [...pool.warnings, ...warnings],
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "筛选失败";
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }
}
