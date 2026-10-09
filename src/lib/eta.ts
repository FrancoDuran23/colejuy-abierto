import { angleBetween, locate, type LngLat } from "./geo";
import type { Bus, Path, Stop } from "./santa-ana";

// Average speed of an urban bus including stops. An assumption, not a measurement:
// the source has no timetable, so every arrival is shown as an estimate.
const AVERAGE_KMH = 17;
const OFF_ROUTE_M = 150;

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

// Buses of the line that are on the stop's path and have not reached it yet, nearest first.
export function arrivals(paths: Path[], stop: Stop, buses: Bus[]): Arrival[] {
  const path = pathFor(paths, stop);
  if (!path) return [];
  const target = locate(path.coordinates, [stop.lng, stop.lat]);
  if (!target) return [];
  const others = paths.filter((p) => p !== path);
  const out: Arrival[] = [];
  for (const bus of buses) {
    const point: LngLat = [bus.lng, bus.lat];
    const at = locate(path.coordinates, point);
    if (!at || at.offset > OFF_ROUTE_M) continue;
    // Heading the other way: not coming to this stop.
    if (bus.course !== null && angleBetween(bus.course, at.bearing) > 100) continue;
    // A stopped bus may report an old heading, so it also has to be on this path rather than the other one.
    const unsure = bus.course === null || !bus.moving;
    if (unsure && others.some((p) => (locate(p.coordinates, point)?.offset ?? Infinity) < at.offset - 30)) continue;
    const meters = target.along - at.along;
    if (meters < -30) continue;
    out.push({ bus, meters: Math.max(0, meters), minutes: Math.max(0, meters) / ((AVERAGE_KMH * 1000) / 60) });
  }
  return out.sort((a, b) => a.meters - b.meters);
}
