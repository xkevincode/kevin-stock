"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  Loader2Icon,
  PlusIcon,
  PencilIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { StrategyEditor } from "@/components/strategy-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { daysAgo, formatDateInput, formatPct, formatPrice, pctClass, poolReasonLabel } from "@/lib/format";
import { defaultBuyStrategy, defaultSellStrategy, parseHandwritten, structuredLabel } from "@/lib/strategies";
import { getStrategiesServerSnapshot, getStrategiesSnapshot, saveStrategies, subscribeStrategies } from "@/lib/storage";
import type {
  ApiResponse,
  BacktestResult,
  CandidateStock,
  PoolReason,
  PoolResult,
  ScreenResult,
  Strategy,
} from "@/lib/types";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

export function ScreenerApp({
  initialPool = null,
  initialError = null,
}: {
  initialPool?: PoolResult | null;
  initialError?: string | null;
}) {
  const strategies = useSyncExternalStore(
    subscribeStrategies,
    getStrategiesSnapshot,
    getStrategiesServerSnapshot,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Strategy | null>(null);

  const [pool, setPool] = useState<PoolResult | null>(initialPool);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(initialError);
  const [poolQuery, setPoolQuery] = useState("");

  const [screen, setScreen] = useState<ScreenResult | null>(null);
  const [screenLoading, setScreenLoading] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  const [start, setStart] = useState(daysAgo(90));
  const [end, setEnd] = useState(formatDateInput());
  const [universe, setUniverse] = useState<"hits" | "pool">("hits");
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  const refreshPool = useCallback(async () => {
    setPoolLoading(true);
    setPoolError(null);
    try {
      const data = await getJson<PoolResult>("/api/pool");
      setPool(data);
    } catch (err) {
      setPoolError(err instanceof Error ? err.message : "候选池刷新失败");
    } finally {
      setPoolLoading(false);
    }
  }, []);

  const enabledBuy = strategies.filter((s) => s.enabled && s.side === "buy");
  const buyStrategy = enabledBuy[0] ?? strategies.find((s) => s.side === "buy") ?? defaultBuyStrategy();
  const sellStrategy =
    strategies.find((s) => s.enabled && s.side === "sell") ??
    strategies.find((s) => s.side === "sell") ??
    defaultSellStrategy();

  async function runScreen() {
    setScreenLoading(true);
    setScreenError(null);
    try {
      const data = await postJson<ScreenResult>("/api/screen", { strategies });
      setScreen(data);
    } catch (err) {
      setScreenError(err instanceof Error ? err.message : "筛选失败");
    } finally {
      setScreenLoading(false);
    }
  }

  async function runBacktest() {
    setBacktestLoading(true);
    setBacktestError(null);
    try {
      const stocks =
        universe === "hits"
          ? (screen?.hits ?? []).map((h) => ({
              code: h.code,
              name: h.name,
              market: h.market,
            }))
          : (pool?.stocks ?? []).map((s) => ({
              code: s.code,
              name: s.name,
              market: s.market,
            }));
      const data = await postJson<BacktestResult>("/api/backtest", {
        buyStrategy,
        sellStrategy,
        start,
        end,
        universe,
        stocks,
      });
      setBacktest(data);
    } catch (err) {
      setBacktestError(err instanceof Error ? err.message : "回测失败");
    } finally {
      setBacktestLoading(false);
    }
  }

  function openCreate() {
    setEditing({
      ...defaultBuyStrategy(),
      id: `new-${crypto.randomUUID()}`,
      name: "",
      enabled: true,
    });
    setEditorOpen(true);
  }

  function saveStrategy(next: Strategy) {
    const index = strategies.findIndex((s) => s.id === next.id);
    if (index === -1) saveStrategies([...strategies, next]);
    else saveStrategies(strategies.map((s) => (s.id === next.id ? next : s)));
  }

  const filteredPool = useMemo(() => {
    if (!pool) return [];
    const q = poolQuery.trim().toLowerCase();
    if (!q) return pool.stocks;
    return pool.stocks.filter(
      (s) => s.code.includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [pool, poolQuery]);

  return (
    <div className="min-h-full bg-zinc-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground">
              A 股 · 东财行业 · 无 Token
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">kevin-stock</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Kevin 的候选池、策略筛选与回测。龙头取各行业当日涨幅前 20，再并上日涨 3%–8%；指标只打候选池，不扫全市场。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void refreshPool()} disabled={poolLoading}>
              {poolLoading ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              刷新候选池
            </Button>
            <Button onClick={() => void runScreen()} disabled={screenLoading}>
              {screenLoading ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
              开始筛选
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4">
        <SummaryRow pool={pool} screen={screen} backtest={backtest} loading={poolLoading} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <StrategyPanel
            strategies={strategies}
            onToggle={(id, enabled) =>
              saveStrategies(strategies.map((s) => (s.id === id ? { ...s, enabled } : s)))
            }
            onEdit={(s) => {
              setEditing(s);
              setEditorOpen(true);
            }}
            onDelete={(id) => saveStrategies(strategies.filter((s) => s.id !== id))}
            onCreate={openCreate}
          />
          <BacktestPanel
            start={start}
            end={end}
            universe={universe}
            loading={backtestLoading}
            error={backtestError}
            result={backtest}
            buyName={buyStrategy.name}
            sellName={sellStrategy.name}
            hitCount={screen?.hits.length ?? 0}
            poolCount={pool?.stocks.length ?? 0}
            onStart={setStart}
            onEnd={setEnd}
            onUniverse={setUniverse}
            onRun={() => void runBacktest()}
          />
        </div>

        <Tabs defaultValue="pool">
          <TabsList className="w-full justify-start sm:w-fit">
            <TabsTrigger value="pool">候选池</TabsTrigger>
            <TabsTrigger value="hits">筛选结果</TabsTrigger>
            <TabsTrigger value="trades">回测明细</TabsTrigger>
          </TabsList>
          <TabsContent value="pool" className="mt-3">
            <PoolPanel
              pool={pool}
              loading={poolLoading}
              error={poolError}
              query={poolQuery}
              onQuery={setPoolQuery}
              rows={filteredPool}
              onRetry={() => void refreshPool()}
            />
          </TabsContent>
          <TabsContent value="hits" className="mt-3">
            <HitsPanel
              result={screen}
              loading={screenLoading}
              error={screenError}
              onRetry={() => void runScreen()}
            />
          </TabsContent>
          <TabsContent value="trades" className="mt-3">
            <TradesPanel result={backtest} loading={backtestLoading} error={backtestError} />
          </TabsContent>
        </Tabs>
      </main>

      <StrategyEditor
        key={editing?.id ?? "closed"}
        open={editorOpen}
        strategy={editing}
        onOpenChange={setEditorOpen}
        onSave={saveStrategy}
      />
    </div>
  );
}

function SummaryRow({
  pool,
  screen,
  backtest,
  loading,
}: {
  pool: PoolResult | null;
  screen: ScreenResult | null;
  backtest: BacktestResult | null;
  loading: boolean;
}) {
  const items = [
    { label: "候选池", value: pool ? String(pool.stocks.length) : loading ? "…" : "—" },
    { label: "行业龙头", value: pool ? String(pool.leaderCount) : "—" },
    { label: "涨幅 3%–8%", value: pool ? String(pool.rangeCount) : "—" },
    { label: "两者都是", value: pool ? String(pool.bothCount) : "—" },
    { label: "策略命中", value: screen ? String(screen.hits.length) : "—" },
    { label: "回测交易", value: backtest ? String(backtest.tradeCount) : "—" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <Card key={item.label} size="sm" className="bg-white">
          <CardHeader className="gap-1">
            <CardDescription>{item.label}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{item.value}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function StrategyPanel({
  strategies,
  onToggle,
  onEdit,
  onDelete,
  onCreate,
}: {
  strategies: Strategy[];
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (strategy: Strategy) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <Card className="bg-white">
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>策略</CardTitle>
            <CardDescription>
              买入、卖出各有默认可改条件。手写会切换下面的槽位（均线 / MACD / 涨跌幅）。
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={onCreate}>
            <PlusIcon />
            新增
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {strategies.length === 0 ? (
          <Empty text="还没有策略，请新增一条。" />
        ) : (
          strategies.map((strategy) => (
            <div
              key={strategy.id}
              className="rounded-xl border p-3 has-[[data-state=unchecked]]:opacity-70"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{strategy.name}</p>
                    <Badge variant="secondary">{strategy.side === "buy" ? "买入" : "卖出"}</Badge>
                    <Badge variant="outline">
                      {strategy.match === "all" ? "全部满足" : "任一满足"}
                    </Badge>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {strategy.conditions.map((c, index) => (
                      <li key={c.id} className="grid gap-1">
                        <span className="text-xs text-muted-foreground">
                          条件 {index + 1}
                        </span>
                        <Input
                          value={c.handwritten}
                          onChange={(e) => {
                            const parsed = parseHandwritten(e.target.value, c);
                            saveStrategies(
                              strategies.map((s) =>
                                s.id !== strategy.id
                                  ? s
                                  : {
                                      ...s,
                                      conditions: s.conditions.map((item) =>
                                        item.id === c.id ? parsed : item,
                                      ),
                                    },
                              ),
                            );
                          }}
                          aria-label={`${strategy.name}条件${index + 1}`}
                        />
                        <p className="text-xs text-muted-foreground">槽位：{structuredLabel(c)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={strategy.enabled}
                    onCheckedChange={(enabled) => onToggle(strategy.id, enabled)}
                    aria-label={`启用${strategy.name}`}
                  />
                  <Button variant="ghost" size="icon-sm" onClick={() => onEdit(strategy)}>
                    <PencilIcon />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => onDelete(strategy.id)}>
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function BacktestPanel({
  start,
  end,
  universe,
  loading,
  error,
  result,
  buyName,
  sellName,
  hitCount,
  poolCount,
  onStart,
  onEnd,
  onUniverse,
  onRun,
}: {
  start: string;
  end: string;
  universe: "hits" | "pool";
  loading: boolean;
  error: string | null;
  result: BacktestResult | null;
  buyName: string;
  sellName: string;
  hitCount: number;
  poolCount: number;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onUniverse: (value: "hits" | "pool") => void;
  onRun: () => void;
}) {
  return (
    <Card className="bg-white">
      <CardHeader className="border-b">
        <CardTitle>回测</CardTitle>
        <CardDescription>
          信号确认后次日开盘买卖；区间结束仍持仓按末日收盘结算。买入：{buyName}；卖出：{sellName}。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="bt-start">开始日期</Label>
            <Input id="bt-start" type="date" value={start} onChange={(e) => onStart(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bt-end">结束日期</Label>
            <Input id="bt-end" type="date" value={end} onChange={(e) => onEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={universe === "hits" ? "default" : "outline"}
            size="sm"
            onClick={() => onUniverse("hits")}
          >
            命中标的（{hitCount}）
          </Button>
          <Button
            variant={universe === "pool" ? "default" : "outline"}
            size="sm"
            onClick={() => onUniverse("pool")}
          >
            整份候选池（{poolCount}）
          </Button>
        </div>
        <Button onClick={onRun} disabled={loading}>
          {loading ? <Loader2Icon className="animate-spin" /> : null}
          开始回测
        </Button>
        {error ? <ErrorBox title="回测失败" message={error} /> : null}
        {loading ? <Skeleton className="h-24" /> : null}
        {!loading && !error && !result ? (
          <Empty text="选好区间后回测。可对筛选命中或整份候选池回放买卖点。" />
        ) : null}
        {result ? (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="平均收益" value={formatPct(result.avgReturnPct)} tone={result.avgReturnPct} />
            <Stat label="胜率" value={formatPct(result.winRate, 1)} />
            <Stat label="交易次数" value={String(result.tradeCount)} />
          </div>
        ) : null}
        {result?.warnings.length ? (
          <Alert>
            <AlertTitle>部分行情失败</AlertTitle>
            <AlertDescription className="max-h-24 overflow-auto text-xs">
              {result.warnings.slice(0, 8).join("；")}
              {result.warnings.length > 8 ? ` 等 ${result.warnings.length} 条` : ""}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PoolPanel({
  pool,
  loading,
  error,
  query,
  onQuery,
  rows,
  onRetry,
}: {
  pool: PoolResult | null;
  loading: boolean;
  error: string | null;
  query: string;
  onQuery: (value: string) => void;
  rows: CandidateStock[];
  onRetry: () => void;
}) {
  return (
    <Card className="bg-white">
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>候选池</CardTitle>
            <CardDescription>
              {pool
                ? `${pool.tradeDate} · ${pool.industryCount} 个东财一级行业 · 龙头=板块内涨幅前 20`
                : "行业龙头 ∪ 日涨 3%–8%"}
            </CardDescription>
          </div>
          <Input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="搜索代码或名称"
            className="sm:max-w-56"
          />
        </div>
      </CardHeader>
      <CardContent>
        {error ? <ErrorBox title="候选池失败" message={error} onRetry={onRetry} /> : null}
        {loading && !pool ? <TableSkeleton /> : null}
        {!loading && !error && pool && rows.length === 0 ? (
          <Empty text={query ? "没有匹配的股票。" : "今天候选池是空的。"} />
        ) : null}
        {pool?.warnings.length ? (
          <Alert className="mb-3">
            <AlertTitle>部分行业未取到</AlertTitle>
            <AlertDescription className="text-xs">
              {pool.warnings.slice(0, 5).join("；")}
            </AlertDescription>
          </Alert>
        ) : null}
        {rows.length > 0 ? (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              显示 {rows.length} / {pool?.stocks.length ?? rows.length} 只
            </p>
            <div className="hidden max-h-[70vh] overflow-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>代码</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead className="text-right">现价</TableHead>
                    <TableHead className="text-right">涨跌幅</TableHead>
                    <TableHead>进池原因</TableHead>
                    <TableHead>所属行业</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.code}>
                      <TableCell className="font-mono">{row.code}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(row.price)}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${pctClass(row.pctChange)}`}>
                        {formatPct(row.pctChange)}
                      </TableCell>
                      <TableCell>
                        <ReasonBadge reason={row.reason} />
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-muted-foreground">
                        {row.industries.map((i) => i.name).join("、") || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="grid max-h-[70vh] gap-2 overflow-auto md:hidden">
              {rows.map((row) => (
                <div key={row.code} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">
                        {row.name}{" "}
                        <span className="font-mono text-xs text-muted-foreground">{row.code}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.industries.map((i) => i.name).join("、") || "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums">{formatPrice(row.price)}</p>
                      <p className={`text-sm tabular-nums ${pctClass(row.pctChange)}`}>
                        {formatPct(row.pctChange)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <ReasonBadge reason={row.reason} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function HitsPanel({
  result,
  loading,
  error,
  onRetry,
}: {
  result: ScreenResult | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <Card className="bg-white">
      <CardHeader className="border-b">
        <CardTitle>筛选结果</CardTitle>
        <CardDescription>
          只展示当前启用买入策略命中的标的，并写清进池原因与哪条条件过了。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? <ErrorBox title="筛选失败" message={error} onRetry={onRetry} /> : null}
        {loading ? (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">正在拉取候选池 K 线并计算 MACD / 均线…</p>
            <TableSkeleton />
          </div>
        ) : null}
        {!loading && !error && !result ? (
          <Empty text="点「开始筛选」，用启用中的买入策略扫描候选池。" />
        ) : null}
        {!loading && result && result.hits.length === 0 ? (
          <Empty text="没有命中。可以放宽条件，或等行情走出拐头与均线金叉。" />
        ) : null}
        {result?.warnings.length && !loading ? (
          <Alert className="mb-3">
            <AlertTitle>部分股票无 K 线</AlertTitle>
            <AlertDescription className="max-h-24 overflow-auto text-xs">
              已扫描 {result.scanned} 只。{result.warnings.slice(0, 6).join("；")}
            </AlertDescription>
          </Alert>
        ) : null}
        {result && result.hits.length > 0 && !loading ? (
          <>
            <div className="hidden max-h-[70vh] overflow-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>代码</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>策略</TableHead>
                    <TableHead>进池</TableHead>
                    <TableHead>命中原因</TableHead>
                    <TableHead className="text-right">涨跌幅</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.hits.map((hit) => (
                    <TableRow key={`${hit.strategyId}-${hit.code}`}>
                      <TableCell className="font-mono">{hit.code}</TableCell>
                      <TableCell>{hit.name}</TableCell>
                      <TableCell>{hit.strategyName}</TableCell>
                      <TableCell>
                        <ReasonBadge reason={hit.reason} />
                      </TableCell>
                      <TableCell className="max-w-xl text-xs text-muted-foreground">
                        {hit.conditions
                          .filter((c) => c.passed)
                          .map((c) => c.detail)
                          .join("；")}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${pctClass(hit.pctChange)}`}>
                        {formatPct(hit.pctChange)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="grid gap-2 md:hidden">
              {result.hits.map((hit) => (
                <div key={`${hit.strategyId}-${hit.code}`} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">
                        {hit.name}{" "}
                        <span className="font-mono text-xs text-muted-foreground">{hit.code}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{hit.strategyName}</p>
                    </div>
                    <p className={`text-sm tabular-nums ${pctClass(hit.pctChange)}`}>
                      {formatPct(hit.pctChange)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <ReasonBadge reason={hit.reason} />
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {hit.conditions
                      .filter((c) => c.passed)
                      .map((c) => (
                        <li key={c.conditionId}>· {c.detail}</li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TradesPanel({
  result,
  loading,
  error,
}: {
  result: BacktestResult | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <Card className="bg-white">
      <CardHeader className="border-b">
        <CardTitle>回测明细</CardTitle>
        <CardDescription>每只股票的买入日、卖出日、收益率，以及是否仍持仓。</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? <ErrorBox title="回测失败" message={error} /> : null}
        {loading ? <TableSkeleton /> : null}
        {!loading && !error && !result ? <Empty text="还没有回测结果。" /> : null}
        {!loading && result && result.trades.length === 0 ? (
          <Empty text="区间内没有成交。可能没有买入信号，或次日开盘已超出结束日。" />
        ) : null}
        {result && result.trades.length > 0 && !loading ? (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>代码</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>买入</TableHead>
                    <TableHead>卖出</TableHead>
                    <TableHead className="text-right">收益率</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.trades.map((t) => (
                    <TableRow key={`${t.code}-${t.buyDate}-${t.sellDate}`}>
                      <TableCell className="font-mono">{t.code}</TableCell>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>
                        {t.buyDate} / {formatPrice(t.buyPrice)}
                      </TableCell>
                      <TableCell>
                        {t.sellDate} / {formatPrice(t.sellPrice)}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${pctClass(t.returnPct)}`}>
                        {formatPct(t.returnPct)}
                      </TableCell>
                      <TableCell>{t.open ? "仍持仓（收盘结算）" : "已平仓"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="grid gap-2 md:hidden">
              {result.trades.map((t) => (
                <div key={`${t.code}-${t.buyDate}-${t.sellDate}`} className="rounded-xl border p-3">
                  <div className="flex justify-between">
                    <p className="font-medium">
                      {t.name} <span className="font-mono text-xs text-muted-foreground">{t.code}</span>
                    </p>
                    <p className={`tabular-nums ${pctClass(t.returnPct)}`}>{formatPct(t.returnPct)}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    买 {t.buyDate} {formatPrice(t.buyPrice)} → 卖 {t.sellDate} {formatPrice(t.sellPrice)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.open ? "仍持仓，按区间末日收盘结算" : "已平仓"}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ReasonBadge({ reason }: { reason: PoolReason }) {
  const label = poolReasonLabel(reason);
  const variant = reason === "both" ? "default" : reason === "leader" ? "secondary" : "outline";
  return <Badge variant={variant}>{label}</Badge>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-medium tabular-nums ${tone !== undefined ? pctClass(tone) : ""}`}>
        {value}
      </p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function ErrorBox({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Alert variant="destructive" className="mb-3">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>{message}</span>
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            重试
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function TableSkeleton() {
  return (
    <div className="grid gap-2">
      <Skeleton className="h-8" />
      <Skeleton className="h-8" />
      <Skeleton className="h-8" />
      <Skeleton className="h-8" />
    </div>
  );
}
