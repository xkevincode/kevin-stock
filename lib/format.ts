import type { PoolReason } from "@/lib/types";

export function formatPct(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value >= 1000 ? value.toFixed(2) : value.toFixed(3);
}

export function pctClass(value: number): string {
  if (value > 0) return "text-[#c62828]";
  if (value < 0) return "text-[#2e7d32]";
  return "text-muted-foreground";
}

export function poolReasonLabel(reason: PoolReason): string {
  switch (reason) {
    case "leader":
      return "龙头";
    case "range":
      return "涨幅区间";
    case "both":
      return "两者";
  }
}

export function formatDateInput(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function daysAgo(days: number): string {
  const ms = Date.now() - days * 86400000;
  return formatDateInput(new Date(ms));
}
