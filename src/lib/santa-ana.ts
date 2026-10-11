import { z } from "zod";
import snapshot from "../data/santa-ana-stops.json";
import routesSnapshot from "../data/santa-ana-routes.json";
import { getFleetProvider } from "./fleet-provider";

// Tipos y datos estáticos de la red. La parte EN VIVO vive detrás de `fleet-provider.ts`:
// este repositorio no trae la conexión con los servidores de Santa Ana.

// Past this age a bus is hidden; the client dims anything older than STALE_SECONDS.
export const HIDE_SECONDS = 15 * 60;
export const STALE_SECONDS = 120;

const RouteSchema = z.object({
  id: z.string(),
  number: z.string().nullish(),
  name: z.string().nullish(),
  color: z.string().nullish(),
  paths: z.array(z.array(z.tuple([z.number(), z.number()]))).default([]),
});

const RoutesSchema = z.object({ routes: z.array(RouteSchema) });

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
    super(`Source ${path}: HTTP ${status}`);
  }
}

// Sin credenciales en este repo: quien enchufe una fuente en vivo decide cómo se autentica.
export const sourceAuthConfigured = false;

// Without `lines` it is the whole fleet; with them, only those lines. Delegates to the provider.
export async function fetchFleet(lines?: string[]): Promise<Fleet> {
  return getFleetProvider().fetchFleet(lines);
}

type RawRoute = z.infer<typeof RouteSchema>;

function toLineRoute(r: RawRoute): LineRoute {
  return {
    id: r.id,
    number: r.number || r.id,
    name: r.name || NAME_FIXES[r.id] || `Linea ${r.number || r.id}`,
    color: r.color ?? null,
    operator: "Santa Ana",
    live: true,
    // The snapshot stores [lat, lng]; GeoJSON and MapLibre want [lng, lat].
    paths: r.paths.map((p, i) => ({
      direction: r.paths.length === 2 ? (i === 0 ? "ida" : "vuelta") : `tramo ${i + 1}`,
      coordinates: p.map(([lat, lng]) => [round(lng), round(lat)] as [number, number]),
    })),
  };
}

// The committed copy of the line routes.
export function snapshotRoutes(): LineRoute[] {
  return RoutesSchema.parse(routesSnapshot).routes.map(toLineRoute);
}

export async function fetchRoutes(): Promise<LineRoute[]> {
  return snapshotRoutes();
}

type SnapshotStop = [string, string, number, number, string | null, number | null];

export function snapshotStops(lineId: string): Stop[] | null {
  const rows = (snapshot as unknown as Record<string, SnapshotStop[]>)[lineId];
  if (!rows?.length) return null;
  return rows.map(([id, name, lat, lng, direction, order]) => ({ id, name, lat, lng, direction, order }));
}

export async function fetchStops(lineId: string): Promise<Stop[]> {
  return snapshotStops(lineId) ?? [];
}

// ?line=20 or ?lines=20,21 -> ['20','21'] (sanitised, at most 10).
export function parseLines(q: URLSearchParams): string[] {
  const raw = [...q.getAll("line"), ...q.getAll("lines")].flatMap((v) => v.split(","));
  return [...new Set(raw.map((v) => v.trim()).filter((v) => /^[\w-]{1,12}$/.test(v)))].slice(0, 10);
}
