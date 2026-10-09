import type { Alert } from "./alerts";

// Pending alerts live in one Redis hash, read and written over Upstash's REST API.
// Vercel's Upstash integration names the variables KV_REST_API_*; Upstash itself, UPSTASH_REDIS_REST_*.
const URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "alerts";

export const storeKind = URL && TOKEN ? "redis" : "memory";

// Without Redis the alerts sit in this process's memory. That is only good for trying the bot on
// one machine: on Vercel every request may land on a different instance. It says so when used.
const memory: Map<string, string> = ((globalThis as { __alerts?: Map<string, string> }).__alerts ??= new Map());
let warned = false;
function warnMemory() {
  if (!warned) console.warn("[alerts] No Redis configured: alerts and saved places are kept in memory and are lost on restart.");
  warned = true;
}
function inMemory() {
  warnMemory();
  return memory;
}

async function redis<T>(...command: (string | number)[]): Promise<T> {
  const res = await fetch(URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Redis ${command[0]}: HTTP ${res.status}`);
  return ((await res.json()) as { result: T }).result;
}

const field = (chat: number, stop: string) => `${chat}:${stop}`;

export async function listAlerts(): Promise<Alert[]> {
  const values = storeKind === "redis" ? await redis<string[]>("HVALS", KEY) : [...inMemory().values()];
  return values.map((v) => JSON.parse(v) as Alert);
}

export async function putAlert(alert: Alert) {
  const value = JSON.stringify(alert);
  if (storeKind === "redis") await redis("HSET", KEY, field(alert.chat, alert.stop), value);
  else inMemory().set(field(alert.chat, alert.stop), value);
}

export async function removeAlert(chat: number, stop: string) {
  if (storeKind === "redis") await redis("HDEL", KEY, field(chat, stop));
  else inMemory().delete(field(chat, stop));
}

// Sessions and saved places use their own keys so each one can expire on its own.
// The alerts hash cannot: a hash field has no TTL, and the whole hash is every chat's alerts.
type KvHit = { value: string; expires: number };
const kv: Map<string, KvHit> = ((globalThis as { __botkv?: Map<string, KvHit> }).__botkv ??= new Map());

function memoryGet(key: string): string | null {
  warnMemory();
  const hit = kv.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    kv.delete(key);
    return null;
  }
  return hit.value;
}

export async function readJson<T>(key: string): Promise<T | null> {
  const raw = storeKind === "redis" ? await redis<string | null>("GET", key) : memoryGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown, ttlSeconds: number) {
  const raw = JSON.stringify(value);
  if (storeKind === "redis") await redis("SET", key, raw, "EX", ttlSeconds);
  else {
    warnMemory();
    kv.set(key, { value: raw, expires: Date.now() + ttlSeconds * 1000 });
  }
}

export async function deleteKey(key: string) {
  if (storeKind === "redis") await redis("DEL", key);
  else {
    warnMemory();
    kv.delete(key);
  }
}
