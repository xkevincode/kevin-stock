export default function Loading() {
  return (
    <div className="min-h-full bg-zinc-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            A 股 · 东财行业 · 无 Token
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">kevin-stock</h1>
          <p className="mt-2 text-sm text-muted-foreground">正在从东财拉取行业龙头与涨幅区间…</p>
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white ring-1 ring-foreground/10" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-xl bg-white ring-1 ring-foreground/10" />
      </main>
    </div>
  );
}
