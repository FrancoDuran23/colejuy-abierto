import { z } from "zod";

// OpenStreetMap's public search. It is a shared free service: one request per search the person
// submits (never per keystroke), identified, and cached for a day at the CDN by the route.
const SEARCH = "https://nominatim.openstreetmap.org/search";
const AGENT = "ColectivosJujuy/0.1 (https://jujuy.dev.ar)";
// San Salvador de Jujuy and Palpalá.
const VIEWBOX = "-65.45,-24.05,-65.15,-24.35";

const ResultSchema = z.array(z.object({ lat: z.string(), lon: z.string(), display_name: z.string() }));

export type Place = { name: string; lat: number; lng: number };

// Throws when Nominatim is unreachable. The caller decides what to tell the person.
export async function searchPlaces(q: string): Promise<Place[]> {
  const params = new URLSearchParams({ format: "jsonv2", q, countrycodes: "ar", viewbox: VIEWBOX, bounded: "1", limit: "5", "accept-language": "es" });
  const res = await fetch(`${SEARCH}?${params}`, { headers: { "User-Agent": AGENT }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Nominatim: HTTP ${res.status}`);
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const r of ResultSchema.parse(await res.json())) {
    // "Hospital Pablo Soria, General Paz, Centro, Municipio de…" is enough up to the third part.
    const name = r.display_name.split(",").slice(0, 3).join(",").trim();
    if (seen.has(name)) continue;
    seen.add(name);
    places.push({ name, lat: Number(r.lat), lng: Number(r.lon) });
  }
  return places;
}
