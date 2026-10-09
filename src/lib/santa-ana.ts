import { z } from "zod";

const BASE = "https://bus.santaanasrl.com.ar/api";

// Past this age a bus is hidden; the client dims anything older than STALE_SECONDS.
export const HIDE_SECONDS = 15 * 60;
export const STALE_SECONDS = 120;

const VehicleSchema = z.object({
  id: z.number(),
  internalNumber: z.string().nullish(),
  assignedLineId: z.string().nullish(),
  hasRamp: z.boolean().nullish(),
  latitude: z.number(),
  longitude: z.number(),
  speedKmh: z.number().nullish(),
  course: z.number().nullish(),
  fixTime: z.string().nullish(),
  gps: z
    .object({
      fresh: z.boolean().nullish(),
      moving: z.boolean().nullish(),
      ageSeconds: z.number().nullish(),
    })
    .nullish(),
});

const FleetSchema = z.object({
  vehicles: z.array(z.unknown()),
  updatedAt: z.string().nullish(),
});

const RouteSchema = z.object({
  id: z.string(),
  number: z.string().nullish(),
  name: z.string().nullish(),
  color: z.string().nullish(),
  paths: z.array(z.array(z.tuple([z.number(), z.number()]))).default([]),
});

const RoutesSchema = z.object({ routes: z.array(RouteSchema) });

const StopSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  latitude: z.number(),
  longitude: z.number(),
  direction: z.string().nullish(),
  order: z.number().nullish(),
});

const StopsSchema = z.object({ stops: z.array(StopSchema) });

export type Bus = {
  id: number;
  line: string | null;
  number: string | null;
  lat: number;
  lng: number;
  speed: number;
  course: number | null;
  ramp: boolean;
  moving: boolean;
  fresh: boolean;
  age: number;
};

export type Fleet = {
  updatedAt: string;
  buses: Bus[];
  // Set when the source refuses to give positions: it wants a sign-in, or we asked too often.
  unavailable?: "auth" | "rate" | "down";
};

export type Path = { direction: string; coordinates: [number, number][] };

export type Line = {
  id: string;
  number: string;
  name: string;
  color: string | null;
  operator: string;
  live: boolean;
};

export type LineRoute = Line & { paths: Path[] };

export type Stop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  direction: string | null;
  order: number | null;
};

// Names the source leaves empty.
const NAME_FIXES: Record<string, string> = { "49bis": "Linea 49 bis" };

const round = (n: number) => Math.round(n * 1e6) / 1e6;

// Why a request to the source failed, so callers can stop insisting instead of retrying blind.
export class SourceError extends Error {
  constructor(
    path: string,
    readonly status: number,
    // Seconds the source asked us to wait, when it said so.
    readonly retryAfter: number | null,
  ) {
    super(`Santa Ana ${path}: HTTP ${status}`);
  }
}

// Since 8 Oct 2026 the fleet needs a signed-in user. Santa Ana's own app signs in to their Appwrite,
// asks it for a short-lived JWT and sends it as a Bearer token; this does the same with one account.
// SANTA_ANA_SESSION is that account's session secret (it lasts a year); the password is never needed here.
const APPWRITE = "https://appwrite.santaanasrl.com.ar/v1";
const PROJECT = "6aa4501a00048053dc71";
const SESSION = process.env.SANTA_ANA_SESSION?.trim();

export const sourceAuthConfigured = Boolean(SESSION);

let token: { jwt: string; expires: number } | null = null;

// A JWT lives 15 minutes; it is reused until a minute before it expires.
async function bearer(): Promise<string | null> {
  if (!SESSION) return null;
  if (token && token.expires - 60_000 > Date.now()) return token.jwt;
  const res = await fetch(`${APPWRITE}/account/jwts`, {
    method: "POST",
    headers: { "X-Appwrite-Project": PROJECT, "Content-Type": "application/json", Cookie: `a_session_${PROJECT}=${SESSION}` },
    body: "{}",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new SourceError("/account/jwts", res.status, Number(res.headers.get("retry-after")) || null);
  const { jwt } = (await res.json()) as { jwt: string };
  let expires = Date.now() + 10 * 60_000;
  try {
    const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()) as { exp?: number };
    if (claims.exp) expires = claims.exp * 1000;
  } catch {}
  token = { jwt, expires };
  return jwt;
}

async function get(path: string, init?: RequestInit & { next?: { revalidate: number } }, auth = false) {
  const jwt = auth ? await bearer() : null;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { accept: "application/json", ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    signal: AbortSignal.timeout(8000),
  });
  // A rejected token is dropped, so the next request asks for a new one.
  if (res.status === 401) token = null;
  if (!res.ok) throw new SourceError(path, res.status, Number(res.headers.get("retry-after")) || null);
  return res.json();
}

export async function fetchFleet(): Promise<Fleet> {
  const raw = FleetSchema.parse(await get("/fleet", { cache: "no-store" }, true));
  const buses: Bus[] = [];
  for (const item of raw.vehicles) {
    // A unit without a fix is skipped; it must not hide every other bus.
    const parsed = VehicleSchema.safeParse(item);
    if (!parsed.success) continue;
    const v = parsed.data;
    const age = v.gps?.ageSeconds ?? 0;
    if (age > HIDE_SECONDS) continue;
    buses.push({
      id: v.id,
      line: v.assignedLineId ?? null,
      number: v.internalNumber ?? null,
      lat: round(v.latitude),
      lng: round(v.longitude),
      speed: Math.round(v.speedKmh ?? 0),
      course: v.course ?? null,
      ramp: v.hasRamp ?? false,
      moving: v.gps?.moving ?? false,
      fresh: (v.gps?.fresh ?? true) && age <= STALE_SECONDS,
      age,
    });
  }
  return { updatedAt: raw.updatedAt ?? new Date().toISOString(), buses };
}

export async function fetchRoutes(): Promise<LineRoute[]> {
  const raw = RoutesSchema.parse(await get("/line-routes", { next: { revalidate: 86400 } }));
  return raw.routes.map((r) => ({
    id: r.id,
    number: r.number || r.id,
    name: r.name || NAME_FIXES[r.id] || `Linea ${r.number || r.id}`,
    color: r.color ?? null,
    operator: "Santa Ana",
    live: true,
    // The source sends [lat, lng]; GeoJSON and MapLibre want [lng, lat].
    paths: r.paths.map((p, i) => ({
      direction: r.paths.length === 2 ? (i === 0 ? "ida" : "vuelta") : `tramo ${i + 1}`,
      coordinates: p.map(([lat, lng]) => [round(lng), round(lat)] as [number, number]),
    })),
  }));
}

export async function fetchStops(lineId: string): Promise<Stop[]> {
  const raw = StopsSchema.parse(
    await get(`/line-stops?lineId=${encodeURIComponent(lineId)}`, { next: { revalidate: 86400 } }),
  );
  return raw.stops.map((s) => ({
    id: s.id,
    name: s.name ?? "",
    lat: round(s.latitude),
    lng: round(s.longitude),
    direction: s.direction ?? null,
    order: s.order ?? null,
  }));
}
