// How a selected line is drawn and named. The direction comes from the stops
// (or, for the municipal routes, from the file), never from the order of the paths.

import { locate, pathLength, slice, type LngLat } from "./geo";

export type NamedStop = { name: string; direction: string | null; order: number | null };

const tidy = (name: string) => name.trim().replace(/\s+/g, " ");

// The return is dashed. Anything else, including a path whose direction is still unknown, is solid.
export function routeStroke(direction: string): "solid" | "dashed" {
  return direction === "vuelta" || direction.startsWith("walk") ? "dashed" : "solid";
}

export function hasBothDirections(paths: { direction: string }[]): boolean {
  return paths.some((p) => p.direction === "ida") && paths.some((p) => p.direction === "vuelta");
}

// First and last stop of one direction: "Alto Comedero → Centro".
// Pass the direction on screen. With null, a line that only runs one way still gets its ends.
export function directionEnds(stops: NamedStop[], direction: string | null): string | null {
  const dirs = [...new Set(stops.map((s) => s.direction).filter((d): d is string => Boolean(d)))];
  const wanted = direction ?? (dirs.length === 1 ? dirs[0] : dirs.includes("ida") ? "ida" : null);
  const mine = stops.filter((s) => (wanted ? s.direction === wanted : !s.direction));
  const named = mine
    .map((s, i) => ({ name: tidy(s.name), order: s.order, i }))
    .filter((s) => s.name)
    .sort((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) || a.i - b.i);
  if (named.length < 2) return null;
  const from = named[0].name;
  const to = named[named.length - 1].name;
  if (from === to) return null;
  return `${from} → ${to}`;
}

type PlacedStop = { lat: number; lng: number; direction: string | null; order: number | null };
type DirectedPath = { direction: string; coordinates: LngLat[] };

// A stop further than this from its direction's route is not on it: its place along the route is a guess.
const ON_ROUTE_M = 150;

// The stops of a line in the order a bus reaches them, numbered from 1: the whole ida, then the vuelta.
//
// The source's own `order` cannot be trusted for this. Some stops come without one, and on three
// lines (15 and both 2s) it runs against the route. The route itself is drawn in the direction of
// travel, which the headings of moving buses confirm, so each stop takes its place along it.
export function orderStops<T extends PlacedStop>(stops: T[], paths: DirectedPath[]): T[] {
  const bySource = (a: T, b: T) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY);
  const directions = [...new Set(stops.map((s) => s.direction))].sort((a, b) => rank(a) - rank(b));
  const out: T[] = [];
  for (const direction of directions) {
    const mine = stops.filter((s) => s.direction === direction);
    const path = direction ? paths.find((p) => p.direction === direction) : undefined;
    const placed = path ? mine.map((stop) => ({ stop, at: locate(path.coordinates, [stop.lng, stop.lat]) })) : [];
    const onRoute = placed.filter((p) => p.at && p.at.offset <= ON_ROUTE_M);
    if (onRoute.length < 2) {
      // No route to measure against: the source's order is all there is. Stops without one keep their place.
      out.push(...[...mine].sort(bySource));
      continue;
    }
    const first = Math.min(...onRoute.map((p) => p.at!.along));
    const last = Math.max(...onRoute.map((p) => p.at!.along));
    // A stop off the route still gets a place, but never before the first real stop or after the last one:
    // the two ends of a direction are always stops that are on it.
    const key = (p: (typeof placed)[number]) => {
      if (!p.at) return (first + last) / 2;
      return p.at.offset <= ON_ROUTE_M ? p.at.along : Math.min(last - 0.001, Math.max(first + 0.001, p.at.along));
    };
    out.push(...placed.map((p) => ({ p, k: key(p) })).sort((a, b) => a.k - b.k).map((x) => x.p.stop));
  }
  return out.map((stop, i) => ({ ...stop, order: i + 1 }));
}

const rank = (direction: string | null) => (direction === "ida" ? 0 : direction === "vuelta" ? 1 : 2);

// The stretch a trip rides on one line: the real route between the boarding and the alighting stop.
// Of all the paths of the line, the one both stops lie on (alighting after boarding) is used;
// a path that matches the stop's direction wins a tie. With no such path the two stops are
// joined by a straight line, which is only a last resort.
export function ridePath(paths: DirectedPath[], board: LngLat, alight: LngLat, direction: string | null = null, expected: number | null = null): LngLat[] {
  let best: { score: number; path: DirectedPath } | null = null;
  for (const path of paths) {
    const a = locate(path.coordinates, board);
    const b = locate(path.coordinates, alight);
    if (!a || !b || b.along <= a.along) continue;
    const score = a.offset + b.offset - (direction && path.direction === direction ? 25 : 0);
    if (!best || score < best.score) best = { score, path };
  }
  if (!best) return [board, alight];
  // The stops can sit a block away from the drawn route: the ends are joined to it, so the stretch never floats apart from its stops.
  const ride = slice(best.path.coordinates, board, alight);
  // A looping route can place two neighbouring stops at opposite ends of its drawing. When the stretch is far longer
  // than the trip's own estimate, it is the wrong way round the loop: the two stops are joined directly instead.
  if (expected !== null && pathLength(ride, board[1]) > expected * 2.5 + 600) return [board, alight];
  const same = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1];
  return [...(same(ride[0], board) ? [] : [board]), ...ride, ...(same(ride[ride.length - 1], alight) ? [] : [alight])];
}
