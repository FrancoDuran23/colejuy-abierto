import type { Fleet } from "./santa-ana";

// A good answer is kept and shown for this long when the next ones come back empty or refused.
export const HOLD_MS = 3 * 60 * 1000;
// While nothing is live, ask again this often (ms).
export const RETRY_MS = 15000;

export type Good = { fleet: Fleet; at: number };

export function hasBuses(f: Fleet | undefined): f is Fleet {
  return Boolean(f && !f.unavailable && f.buses.length > 0);
}

// Last good answer, or null once it is older than HOLD_MS.
export function holdFleet(prev: Good | null, next: Fleet | undefined, now: number): Good | null {
  if (hasBuses(next)) return { fleet: next, at: now };
  return prev && now - prev.at <= HOLD_MS ? prev : null;
}

export type NoDataStatus = "updating" | "none";

// Text for the overview when no coach is known. `since` is when the last data came, or when we began waiting.
export function noDataStatus(fleet: Fleet | undefined, since: number, now: number): NoDataStatus {
  if (fleet?.unavailable === "auth") return "none";
  return now - since > HOLD_MS ? "none" : "updating";
}

export const STATUS_TEXT = {
  updating: "Actualizando posiciones…",
  none: "Sin datos en vivo por ahora, reintentando",
} as const;

export function liveText(n: number): string {
  return `${n} ${n === 1 ? "colectivo" : "colectivos"} en vivo`;
}
