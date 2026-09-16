import { ScreenerApp } from "@/components/screener-app";
import { buildCandidatePool } from "@/lib/pool";

export default async function Page() {
  let initialPool = null;
  let initialError: string | null = null;
  try {
    initialPool = await buildCandidatePool();
  } catch (err) {
    initialError = err instanceof Error ? err.message : "候选池加载失败";
  }
  return <ScreenerApp initialPool={initialPool} initialError={initialError} />;
}
