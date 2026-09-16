const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function fetchText(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {},
): Promise<string> {
  const { timeoutMs = 12000, retries = 2, headers, ...rest } = init;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...rest,
        cache: "no-store",
        headers: {
          "User-Agent": DEFAULT_UA,
          Accept: "application/json,text/plain,*/*",
          ...headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new HttpError(`请求失败 HTTP ${res.status}`, res.status);
      }
      return await res.text();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(300 * (attempt + 1));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit & { timeoutMs?: number; retries?: number },
): Promise<T> {
  const text = await fetchText(url, init);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`接口返回非 JSON：${text.slice(0, 120)}`);
  }
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(limit, 1), Math.max(items.length, 1)) },
    async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        out[index] = await fn(items[index], index);
      }
    },
  );
  if (items.length === 0) return [];
  await Promise.all(workers);
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "-" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
