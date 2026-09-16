type Entry<T> = {
  expiresAt: number;
  value: T;
};

const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheKey(...parts: (string | number)[]): string {
  return parts.join(":");
}

/** Shanghai calendar date YYYY-MM-DD */
export function shanghaiDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isLikelyAfterClose(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour > 15 || (hour === 15 && minute >= 10);
}

export function quoteTtlMs(now = new Date()): number {
  return isLikelyAfterClose(now) ? 12 * 60 * 60 * 1000 : 8 * 60 * 1000;
}

export function klineTtlMs(now = new Date()): number {
  return isLikelyAfterClose(now) ? 12 * 60 * 60 * 1000 : 10 * 60 * 1000;
}
