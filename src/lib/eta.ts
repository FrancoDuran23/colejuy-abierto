import { ARRIVING_M, estimateMinutes } from "./alerts";
import { angleBetween, distance, formatDistance, locate, type LngLat } from "./geo";
import type { Bus, Path, Stop } from "./santa-ana";

// Average speed of an urban bus including stops. An assumption, not a measurement:
// the source has no timetable, so every arrival is shown as an estimate.
const AVERAGE_KMH = 17;
const OFF_ROUTE_M = 150;
// A bus this far past a stop has gone by it. Inside the margin it is still "at" the stop.
const PASSED_M = 30;

export type Arrival = { bus: Bus; meters: number; minutes: number };

function pathFor(paths: Path[], stop: Stop): Path | null {
  const point: LngLat = [stop.lng, stop.lat];
  const candidates = stop.direction ? paths.filter((p) => p.direction === stop.direction) : paths;
  let best: Path | null = null;
  let bestOffset = Infinity;
  for (const p of candidates.length ? candidates : paths) {
    const at = locate(p.coordinates, point);
    if (at && at.offset < bestOffset) {
      best = p;
      bestOffset = at.offset;
    }
  }
  return best;
}

const meanOffset = (path: Path, stops: Stop[]) =>
  stops.reduce((sum, s) => sum + (locate(path.coordinates, [s.lng, s.lat])?.offset ?? 1e6), 0) / stops.length;

// The source does not say which path is which direction, and the order of the two varies by line.
// Each path takes the direction of the stops that lie on it.
export function labelPaths(paths: Path[], stops: Stop[]): Path[] {
  const ida = stops.filter((s) => s.direction === "ida");
  if (paths.length !== 2 || ida.length === 0) return paths;
  if (meanOffset(paths[0], ida) <= meanOffset(paths[1], ida)) return paths;
  return [
    { ...paths[1], direction: "ida" },
    { ...paths[0], direction: "vuelta" },
  ];
}

// Where one bus sits on one path, or null when it is not traveling that path.
function onThisPath(paths: Path[], path: Path, bus: Bus): ReturnType<typeof locate> {
  const point: LngLat = [bus.lng, bus.lat];
  const at = locate(path.coordinates, point);
  if (!at || at.offset > OFF_ROUTE_M) return null;
  // Heading the other way: not coming along this path.
  if (bus.course !== null && angleBetween(bus.course, at.bearing) > 100) return null;
  // A stopped bus may report an old heading, so it also has to be on this path rather than the other one.
  const unsure = bus.course === null || !bus.moving;
  const others = paths.filter((p) => p !== path);
  if (unsure && others.some((p) => (locate(p.coordinates, point)?.offset ?? Infinity) < at.offset - 30)) return null;
  return at;
}

// The path this bus is actually riding, using the same rules as a stop's arrival list.
function ridingPath(paths: Path[], bus: Bus): Path | null {
  let best: { path: Path; offset: number } | null = null;
  for (const path of paths) {
    const at = onThisPath(paths, path, bus);
    if (!at) continue;
    if (!best || at.offset < best.offset) best = { path, offset: at.offset };
  }
  return best?.path ?? null;
}

export type AlongRoute =
  | { kind: "coming"; meters: number; minutes: number }
  | { kind: "passed"; meters: number };

// Distance along the route from this bus to this stop, in the bus's direction of travel.
// The same measurement the Telegram alert uses: `arrivals` keeps only the buses still coming.
export function alongRoute(paths: Path[], stop: Stop, bus: Bus): AlongRoute | null {
  const path = pathFor(paths, stop);
  if (!path) return null;
  const target = locate(path.coordinates, [stop.lng, stop.lat]);
  if (!target) return null;
  const at = onThisPath(paths, path, bus);
  if (!at) return null;
  const delta = target.along - at.along;
  if (delta < -PASSED_M) return { kind: "passed", meters: -delta };
  const meters = Math.max(0, delta);
  return { kind: "coming", meters, minutes: meters / ((AVERAGE_KMH * 1000) / 60) };
}

// Buses of the line that are on the stop's path and have not reached it yet, nearest first.
export function arrivals(paths: Path[], stop: Stop, buses: Bus[]): Arrival[] {
  const out: Arrival[] = [];
  for (const bus of buses) {
    const route = alongRoute(paths, stop, bus);
    if (route?.kind !== "coming") continue;
    out.push({ bus, meters: route.meters, minutes: route.minutes });
  }
  return out.sort((a, b) => a.meters - b.meters);
}

function stopsOnCourse(path: Path, stops: Stop[]): Stop[] {
  const directed = stops.filter((s) => s.direction === path.direction);
  if (directed.length > 0) return directed;
  return stops.filter((s) => {
    if (s.direction && s.direction !== path.direction) return false;
    const at = locate(path.coordinates, [s.lng, s.lat]);
    return Boolean(at && at.offset <= OFF_ROUTE_M);
  });
}

// The stop of this bus's direction closest to `at` that the bus has not passed yet.
// When every stop of that direction is already behind the bus, the closest one, marked passed.
export function nearestStopAhead(paths: Path[], stops: Stop[], bus: Bus, at: LngLat): { stop: Stop; route: AlongRoute } | null {
  const path = ridingPath(paths, bus);
  if (!path) return null;
  const candidates = stopsOnCourse(path, stops);
  let ahead: { stop: Stop; route: AlongRoute; toRider: number } | null = null;
  let behind: { stop: Stop; route: AlongRoute; toRider: number } | null = null;
  for (const stop of candidates) {
    const route = alongRoute(paths, stop, bus);
    if (!route) continue;
    const toRider = distance(at, [stop.lng, stop.lat]);
    if (route.kind === "coming") {
      if (!ahead || toRider < ahead.toRider) ahead = { stop, route, toRider };
    } else if (!behind || toRider < behind.toRider) behind = { stop, route, toRider };
  }
  const picked = ahead ?? behind;
  return picked ? { stop: picked.stop, route: picked.route } : null;
}

export type EtaSource = "chosen" | "location";

export type EtaResolved =
  | { kind: "pick" }
  | { kind: "off-route"; stop: Stop | null }
  | { kind: "ready"; stop: Stop; route: AlongRoute; source: EtaSource };

// A chosen stop wins. Otherwise the nearest stop ahead of the bus, from where the person is.
export function resolveEta(paths: Path[], stops: Stop[], bus: Bus, chosen: Stop | null, at: LngLat | null): EtaResolved {
  if (chosen) {
    const route = alongRoute(paths, chosen, bus);
    if (!route) return { kind: "off-route", stop: chosen };
    return { kind: "ready", stop: chosen, route, source: "chosen" };
  }
  if (!at) return { kind: "pick" };
  const found = nearestStopAhead(paths, stops, bus, at);
  if (!found) return { kind: "off-route", stop: null };
  return { kind: "ready", stop: found.stop, route: found.route, source: "location" };
}

export type EtaText = {
  kind: "coming" | "passed";
  // The big line, said once: "1 a 2 min", "≈ 1 min", "Está llegando" or "Ya pasó".
  title: string;
  distance: string;
};

// What the card says. The minutes are the alert's estimate and its measured range, not a new guess.
export function etaText(route: AlongRoute): EtaText {
  if (route.kind === "passed") {
    return { kind: "passed", title: "Ya pasó", distance: `hace ${formatDistance(route.meters)}` };
  }
  if (route.meters <= ARRIVING_M) {
    return { kind: "coming", title: "Está llegando", distance: formatDistance(route.meters) };
  }
  const { best, soonest, latest } = estimateMinutes(route.meters, route.minutes);
  return {
    kind: "coming",
    title: soonest === latest ? `≈ ${best} min` : `${soonest} a ${latest} min`,
    distance: formatDistance(route.meters),
  };
}
