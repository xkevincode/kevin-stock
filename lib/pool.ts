import {
  fetchGainRange,
  fetchIndustryBoards,
  fetchIndustryTopGainers,
  industryRefs,
  type QuoteRow,
} from "@/lib/market";
import { cacheGet, cacheKey, cacheSet, quoteTtlMs, shanghaiDate } from "@/lib/cache";
import { mapLimit } from "@/lib/http";
import type { CandidateStock, IndustryRef, PoolReason, PoolResult } from "@/lib/types";

const RANGE_MIN = 3;
const RANGE_MAX = 8;
const LEADER_TOP_N = 20;

interface Accumulator {
  code: string;
  name: string;
  market: number;
  price: number;
  pctChange: number;
  leader: boolean;
  range: boolean;
  industries: IndustryRef[];
}

function reasonOf(leader: boolean, range: boolean): PoolReason {
  if (leader && range) return "both";
  if (leader) return "leader";
  return "range";
}

export function mergePool(
  leaders: { quote: QuoteRow; industry: IndustryRef }[],
  range: QuoteRow[],
): CandidateStock[] {
  const map = new Map<string, Accumulator>();

  const upsert = (quote: QuoteRow) => {
    const existing = map.get(quote.code);
    if (!existing) {
      map.set(quote.code, {
        code: quote.code,
        name: quote.name,
        market: quote.market,
        price: quote.price,
        pctChange: quote.pctChange,
        leader: false,
        range: false,
        industries: [],
      });
    } else {
      existing.name = quote.name;
      existing.price = quote.price;
      existing.pctChange = quote.pctChange;
      existing.market = quote.market;
    }
    return map.get(quote.code)!;
  };

  for (const item of leaders) {
    const acc = upsert(item.quote);
    acc.leader = true;
    if (!acc.industries.some((ind) => ind.code === item.industry.code)) {
      acc.industries.push(item.industry);
    }
  }
  for (const quote of range) {
    upsert(quote).range = true;
  }

  return [...map.values()]
    .map((acc) => ({
      code: acc.code,
      name: acc.name,
      market: acc.market,
      price: acc.price,
      pctChange: acc.pctChange,
      reason: reasonOf(acc.leader, acc.range),
      industries: acc.industries,
    }))
    .sort((a, b) => b.pctChange - a.pctChange);
}

export async function buildCandidatePool(): Promise<PoolResult> {
  const day = shanghaiDate();
  const key = cacheKey("pool", day);
  const cached = cacheGet<PoolResult>(key);
  if (cached) return cached;

  const warnings: string[] = [];
  const boards = await fetchIndustryBoards();

  const leaderPairs: { quote: QuoteRow; industry: IndustryRef }[] = [];
  const boardResults = await mapLimit(boards, 8, async (board) => {
    try {
      const quotes = await fetchIndustryTopGainers(board, LEADER_TOP_N);
      return quotes.map((quote) => ({ quote, industry: industryRefs(board) }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`行业 ${board.name}（${board.code}）成分获取失败：${msg}`);
      return [] as { quote: QuoteRow; industry: IndustryRef }[];
    }
  });
  for (const batch of boardResults) leaderPairs.push(...batch);

  let range: QuoteRow[] = [];
  try {
    range = await fetchGainRange(RANGE_MIN, RANGE_MAX);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`涨幅 3%–8% 扫描失败：${msg}`);
  }

  if (leaderPairs.length === 0 && range.length === 0) {
    throw new Error(
      warnings[0] ?? "候选池为空：行业龙头与涨幅区间均未取到数据。",
    );
  }

  const stocks = mergePool(leaderPairs, range);
  const leaderOnly = stocks.filter((s) => s.reason === "leader").length;
  const rangeOnly = stocks.filter((s) => s.reason === "range").length;
  const both = stocks.filter((s) => s.reason === "both").length;

  const result: PoolResult = {
    asOf: new Date().toISOString(),
    tradeDate: day,
    stocks,
    industryCount: boards.length,
    leaderCount: leaderOnly + both,
    rangeCount: rangeOnly + both,
    bothCount: both,
    warnings,
  };
  cacheSet(key, result, quoteTtlMs());
  return result;
}
