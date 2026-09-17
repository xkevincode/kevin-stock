import { defaultStrategies } from "@/lib/strategies";
import type { Strategy } from "@/lib/types";

export const STRATEGIES_KEY = "kevin-stock.strategies.v3";
const CHANGE_EVENT = "kevin-stock-strategies";

const serverSnapshot = defaultStrategies();
let clientSnapshot: Strategy[] | null = null;
let clientRaw: string | null = null;

export function loadStrategies(): Strategy[] {
  if (typeof window === "undefined") return serverSnapshot;
  try {
    const raw = window.localStorage.getItem(STRATEGIES_KEY);
    if (raw === clientRaw && clientSnapshot) return clientSnapshot;
    clientRaw = raw;
    if (!raw) {
      clientSnapshot = serverSnapshot;
      return clientSnapshot;
    }
    const parsed = JSON.parse(raw) as Strategy[];
    clientSnapshot = Array.isArray(parsed) && parsed.length > 0 ? parsed : serverSnapshot;
    return clientSnapshot;
  } catch {
    clientSnapshot = serverSnapshot;
    return clientSnapshot;
  }
}

export function saveStrategies(strategies: Strategy[]): void {
  clientSnapshot = strategies;
  clientRaw = JSON.stringify(strategies);
  window.localStorage.setItem(STRATEGIES_KEY, clientRaw);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeStrategies(onStoreChange: () => void): () => void {
  const handler = () => onStoreChange();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function getStrategiesSnapshot(): Strategy[] {
  return loadStrategies();
}

export function getStrategiesServerSnapshot(): Strategy[] {
  return serverSnapshot;
}
