import { distance, type LngLat } from "./geo";
import type { NetStop } from "./plan";

// Where the source gives no stops, a line is still plannable from its route: a stop is assumed
// about every SPACING_M along each path, in the path's own direction. These are approximate
// (the real stop may be a block away), which the planner says out loud.
export const SPACING_M = 300;

type PathLike = { direction: string; coordinates: [number, number][] };

export function stopsFromPaths(lineId: string, paths: PathLike[]): NetStop[] {
  const out: NetStop[] = [];
  paths.forEach((path, p) => {
    const pts = path.coordinates;
    if (pts.length < 2) return;
    const direction = path.direction || `tramo ${p + 1}`;
    let order = 1;
    const push = (c: LngLat) =>
      out.push({ id: `approx-${lineId}-${p}-${order}`, name: "Parada aproximada", lat: c[1], lng: c[0], direction, order: order++ });
    push(pts[0]);
    let since = 0;
    for (let i = 1; i < pts.length; i++) {
      since += distance(pts[i - 1], pts[i]);
      if (since >= SPACING_M) {
        push(pts[i]);
        since = 0;
      }
    }
    // The end of the path is always a stop.
    const last = pts[pts.length - 1];
    const prev = out[out.length - 1];
    if (prev.lat !== last[1] || prev.lng !== last[0]) push(last);
  });
  return out;
}
