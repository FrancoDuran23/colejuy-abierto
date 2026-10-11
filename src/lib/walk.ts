// Walking routes that follow the streets, from the public OSRM server.
// Anything that goes wrong is an error the caller answers with a straight line.

import type { LngLat } from "./geo";

export type Walk = { coordinates: LngLat[]; meters: number; seconds: number };

const OSRM = "https://router.project-osrm.org/route/v1/foot";

// "lng,lat" -> [lng, lat], or null when it is not a place on Earth.
export function parsePoint(raw: string | null): LngLat | null {
  if (!raw) return null;
  const m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,2}(?:\.\d+)?)\s*$/.exec(raw);
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  return Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? [lng, lat] : null;
}

export function walkUrl(from: LngLat, to: LngLat): string {
  return `${OSRM}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
}

export function parseWalk(body: unknown): Walk | null {
  const route = (body as { code?: string; routes?: { geometry?: { coordinates?: unknown }; distance?: number; duration?: number }[] })?.routes?.[0];
  const coords = route?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const coordinates = coords.filter((c): c is LngLat => Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number").map((c) => [c[0], c[1]] as LngLat);
  if (coordinates.length < 2) return null;
  return { coordinates, meters: Number(route?.distance) || 0, seconds: Number(route?.duration) || 0 };
}

export async function fetchWalk(from: LngLat, to: LngLat, doFetch: typeof fetch = fetch): Promise<Walk> {
  const res = await doFetch(walkUrl(from, to), { signal: AbortSignal.timeout(6000), headers: { "User-Agent": "colejuy (colectivos-jujuy.vercel.app)" } });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const walk = parseWalk(await res.json());
  if (!walk) throw new Error("OSRM sin ruta");
  return walk;
}
