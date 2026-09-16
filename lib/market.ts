import { cacheGet, cacheKey, cacheSet, klineTtlMs, quoteTtlMs, shanghaiDate } from "@/lib/cache";
import { asNumber, fetchJson, fetchText, mapLimit } from "@/lib/http";
import type { IndustryRef, KLine } from "@/lib/types";

const EM_CLIST = "https://push2delay.eastmoney.com/api/qt/clist/get";
const EM_UT = "bd1d9ddb04089700cf9c27f6f7426281";
const EM_HEADERS = {
  Referer: "https://quote.eastmoney.com/",
};

/** 申万/东财一级行业名称（行业板块，不含概念、不含二三三级） */
export const LEVEL1_INDUSTRY_NAMES = new Set([
  "农林牧渔",
  "基础化工",
  "钢铁",
  "有色金属",
  "电子",
  "家用电器",
  "食品饮料",
  "纺织服饰",
  "轻工制造",
  "医药生物",
  "公用事业",
  "交通运输",
  "房地产",
  "商贸零售",
  "社会服务",
  "综合",
  "建筑材料",
  "建筑装饰",
  "电力设备",
  "国防军工",
  "计算机",
  "传媒",
  "通信",
  "银行",
  "非银金融",
  "汽车",
  "机械设备",
  "煤炭",
  "石油石化",
  "环保",
  "美容护理",
]);

export interface QuoteRow {
  code: string;
  name: string;
  market: number;
  price: number;
  pctChange: number;
}

export interface IndustryBoard {
  code: string;
  name: string;
}

interface EmClistResponse {
  rc?: number;
  data?: {
    total?: number;
    diff?: Record<string, unknown>[] | Record<string, Record<string, unknown>>;
  };
}

function diffRows(data: EmClistResponse["data"]): Record<string, unknown>[] {
  const diff = data?.diff;
  if (!diff) return [];
  if (Array.isArray(diff)) return diff;
  return Object.values(diff);
}

function clistUrl(params: Record<string, string | number>): string {
  const search = new URLSearchParams({
    np: "1",
    fltt: "2",
    invt: "2",
    ut: EM_UT,
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ),
  });
  return `${EM_CLIST}?${search.toString()}`;
}

async function fetchClistPage(params: Record<string, string | number>): Promise<{
  total: number;
  rows: Record<string, unknown>[];
}> {
  const json = await fetchJson<EmClistResponse>(clistUrl(params), {
    headers: EM_HEADERS,
    retries: 3,
  });
  if (json.rc && json.rc !== 0) {
    throw new Error(`东财行情接口 rc=${json.rc}`);
  }
  return {
    total: json.data?.total ?? 0,
    rows: diffRows(json.data),
  };
}

async function fetchClistAll(
  params: Record<string, string | number>,
  pageSize = 100,
  maxPages = 80,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let total = Infinity;
  for (let pn = 1; pn <= maxPages && all.length < total; pn++) {
    const page = await fetchClistPage({ ...params, pn, pz: pageSize });
    total = page.total;
    if (page.rows.length === 0) break;
    all.push(...page.rows);
    if (page.rows.length < pageSize) break;
  }
  return all;
}

function parseQuote(row: Record<string, unknown>): QuoteRow | null {
  const code = String(row.f12 ?? "");
  const name = String(row.f14 ?? "");
  const market = asNumber(row.f13) ?? inferMarket(code);
  const price = asNumber(row.f2);
  const pctChange = asNumber(row.f3);
  if (!code || !name || price === null || pctChange === null) return null;
  if (name.includes("退市") || name.includes("退")) return null;
  return { code, name, market, price, pctChange };
}

export function inferMarket(code: string): number {
  if (code.startsWith("6")) return 1;
  if (code.startsWith("8") || code.startsWith("4") || code.startsWith("92")) return 8;
  if (code.startsWith("9")) return 1;
  return 0;
}

export function toTencentSymbol(code: string, market?: number): string {
  if (code.startsWith("6")) return `sh${code}`;
  if (code.startsWith("8") || code.startsWith("4") || code.startsWith("92")) return `bj${code}`;
  const m = market ?? inferMarket(code);
  if (m === 1) return `sh${code}`;
  if (m === 8) return `bj${code}`;
  return `sz${code}`;
}

export function toSinaSymbol(code: string, market?: number): string {
  return toTencentSymbol(code, market);
}

export async function fetchIndustryBoards(): Promise<IndustryBoard[]> {
  const key = cacheKey("industries", shanghaiDate());
  const cached = cacheGet<IndustryBoard[]>(key);
  if (cached) return cached;

  const rows = await fetchClistAll({
    po: 1,
    fid: "f12",
    fs: "m:90+t:2+f:!50",
    fields: "f12,f13,f14,f104,f105",
  });

  const boards: IndustryBoard[] = [];
  for (const row of rows) {
    const code = String(row.f12 ?? "");
    const name = String(row.f14 ?? "");
    if (!code.startsWith("BK") || !name) continue;
    if (LEVEL1_INDUSTRY_NAMES.has(name)) {
      boards.push({ code, name });
    }
  }

  if (boards.length < 20) {
    for (const row of rows) {
      const code = String(row.f12 ?? "");
      const name = String(row.f14 ?? "");
      if (!code.startsWith("BK") || !name) continue;
      if (/[ⅠⅡⅢ]/.test(name)) continue;
      const size = (asNumber(row.f104) ?? 0) + (asNumber(row.f105) ?? 0);
      if (size >= 80 && !boards.some((b) => b.code === code)) {
        boards.push({ code, name });
      }
    }
  }

  if (boards.length === 0) {
    throw new Error("未获取到东财行业板块（一级）。请稍后重试。");
  }

  cacheSet(key, boards, quoteTtlMs());
  return boards;
}

export async function fetchIndustryTopGainers(
  board: IndustryBoard,
  topN = 20,
): Promise<QuoteRow[]> {
  const key = cacheKey("industry-top", shanghaiDate(), board.code, topN);
  const cached = cacheGet<QuoteRow[]>(key);
  if (cached) return cached;

  const page = await fetchClistPage({
    pn: 1,
    pz: topN,
    po: 1,
    fid: "f3",
    fs: `b:${board.code}+f:!50`,
    fields: "f12,f13,f14,f2,f3",
  });
  const quotes = page.rows
    .map(parseQuote)
    .filter((q): q is QuoteRow => q !== null)
    .slice(0, topN);

  cacheSet(key, quotes, quoteTtlMs());
  return quotes;
}

export async function fetchGainRange(minPct: number, maxPct: number): Promise<QuoteRow[]> {
  const key = cacheKey("gain-range", shanghaiDate(), minPct, maxPct);
  const cached = cacheGet<QuoteRow[]>(key);
  if (cached) return cached;

  const collected: QuoteRow[] = [];
  const pageSize = 100;
  for (let pn = 1; pn <= 40; pn++) {
    const page = await fetchClistPage({
      pn,
      pz: pageSize,
      po: 1,
      fid: "f3",
      fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048",
      fields: "f12,f13,f14,f2,f3",
    });
    if (page.rows.length === 0) break;

    let reachedBelowMin = false;
    for (const row of page.rows) {
      const quote = parseQuote(row);
      if (!quote) continue;
      if (quote.pctChange > maxPct) continue;
      if (quote.pctChange < minPct) {
        reachedBelowMin = true;
        break;
      }
      collected.push(quote);
    }
    if (reachedBelowMin || page.rows.length < pageSize) break;
  }

  cacheSet(key, collected, quoteTtlMs());
  return collected;
}

interface TencentKlineResponse {
  code?: number;
  data?: Record<
    string,
    {
      qfqday?: string[][];
      day?: string[][];
      qfqweek?: string[][];
      week?: string[][];
    }
  >;
}

function parseTencentBars(rows: string[][] | undefined): KLine[] {
  if (!rows) return [];
  const bars: KLine[] = [];
  for (const row of rows) {
    const date = String(row[0] ?? "").slice(0, 10);
    const open = Number(row[1]);
    const close = Number(row[2]);
    const high = Number(row[3]);
    const low = Number(row[4]);
    const volume = Number(row[5]);
    if (!date || ![open, close, high, low].every(Number.isFinite)) continue;
    bars.push({ date, open, close, high, low, volume: Number.isFinite(volume) ? volume : 0 });
  }
  return bars;
}

async function fetchTencentKlines(symbol: string, count: number): Promise<KLine[]> {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${count},qfq`;
  const json = await fetchJson<TencentKlineResponse>(url, {
    headers: { Referer: "https://gu.qq.com/" },
    retries: 2,
  });
  const pack = json.data?.[symbol];
  const rows =
    pack?.qfqday && pack.qfqday.length > 0
      ? pack.qfqday
      : pack?.day && pack.day.length > 0
        ? pack.day
        : pack?.qfqweek;
  const bars = parseTencentBars(rows);
  if (bars.length === 0) {
    throw new Error("腾讯行情无 K 线");
  }
  return bars;
}

interface SinaBar {
  day?: string;
  open?: string;
  close?: string;
  high?: string;
  low?: string;
  volume?: string;
}

async function fetchSinaKlines(symbol: string, count: number): Promise<KLine[]> {
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=${count}`;
  const text = await fetchText(url, {
    headers: { Referer: "https://finance.sina.com.cn/" },
    retries: 2,
  });
  const rows = JSON.parse(text) as SinaBar[];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("新浪行情无 K 线");
  }
  return rows
    .map((row) => {
      const date = String(row.day ?? "").slice(0, 10);
      const open = Number(row.open);
      const close = Number(row.close);
      const high = Number(row.high);
      const low = Number(row.low);
      const volume = Number(row.volume);
      return { date, open, close, high, low, volume: Number.isFinite(volume) ? volume : 0 };
    })
    .filter(
      (bar) => bar.date && [bar.open, bar.close, bar.high, bar.low].every(Number.isFinite),
    );
}

export async function fetchDailyKlines(
  code: string,
  market?: number,
  count = 640,
): Promise<KLine[]> {
  const symbol = toTencentSymbol(code, market);
  const key = cacheKey("kline", shanghaiDate(), symbol, count);
  const cached = cacheGet<KLine[]>(key);
  if (cached) return cached;

  let bars: KLine[] = [];
  let lastError: unknown;
  try {
    bars = await fetchTencentKlines(symbol, count);
  } catch (err) {
    lastError = err;
    try {
      bars = await fetchSinaKlines(toSinaSymbol(code, market), count);
    } catch (err2) {
      lastError = err2;
    }
  }

  if (bars.length === 0) {
    const msg = lastError instanceof Error ? lastError.message : "未知错误";
    throw new Error(`${code} K 线获取失败：${msg}`);
  }

  bars.sort((a, b) => a.date.localeCompare(b.date));
  cacheSet(key, bars, klineTtlMs());
  return bars;
}

export async function fetchDailyKlinesMany(
  stocks: { code: string; market?: number }[],
  count = 640,
  concurrency = 12,
): Promise<{
  klines: Map<string, KLine[]>;
  warnings: string[];
}> {
  const klines = new Map<string, KLine[]>();
  const warnings: string[] = [];
  await mapLimit(stocks, concurrency, async (stock) => {
    try {
      const bars = await fetchDailyKlines(stock.code, stock.market, count);
      klines.set(stock.code, bars);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(msg);
    }
  });
  return { klines, warnings };
}

export function weekKey(dateStr: string): string {
  const [year, month, dayNum] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, dayNum));
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dailyToWeekly(dailies: KLine[]): KLine[] {
  const weeks: KLine[] = [];
  let current: KLine | null = null;
  let key = "";
  for (const bar of dailies) {
    const wk = weekKey(bar.date);
    if (!current || wk !== key) {
      if (current) weeks.push(current);
      current = { ...bar };
      key = wk;
    } else {
      current.high = Math.max(current.high, bar.high);
      current.low = Math.min(current.low, bar.low);
      current.close = bar.close;
      current.volume += bar.volume;
      current.date = bar.date;
    }
  }
  if (current) weeks.push(current);
  return weeks;
}

export function barsUntil(bars: KLine[], asOf: string): KLine[] {
  return bars.filter((bar) => bar.date <= asOf);
}

export function industryRefs(board: IndustryBoard): IndustryRef {
  return { code: board.code, name: board.name };
}
