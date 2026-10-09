export type LngLat = [number, number];

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distance(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Located = {
  // Metres from the start of the path to the closest point on it.
  along: number;
  // Metres between the point and the path.
  offset: number;
  // Compass bearing of the path at that point, in degrees.
  bearing: number;
  // Which segment of the path the closest point is on, and how far along that segment (0 to 1).
  index: number;
  t: number;
};

// Closest point of a path to p, on a flat projection that is accurate enough at city scale.
export function locate(path: LngLat[], p: LngLat): Located | null {
  if (path.length < 2) return null;
  const kx = R * rad(1) * Math.cos(rad(p[1]));
  const ky = R * rad(1);
  const px = p[0] * kx;
  const py = p[1] * ky;
  let best: Located | null = null;
  let walked = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const ax = path[i][0] * kx;
    const ay = path[i][1] * ky;
    const dx = path[i + 1][0] * kx - ax;
    const dy = path[i + 1][1] * ky - ay;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len * len)));
    const offset = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    if (!best || offset < best.offset) {
      best = { along: walked + len * t, offset, bearing: (Math.atan2(dx, dy) * 180) / Math.PI, index: i, t };
    }
    walked += len;
  }
  return best;
}

export function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// A point `along` metres from the start of a path, in the same flat metres `locate` uses.
// `along` past either end clamps to that end, so a projection cannot leave the route.
export function pointAlong(path: LngLat[], along: number, refLat: number): LngLat | null {
  if (path.length === 0) return null;
  if (path.length === 1 || along <= 0) return path[0];
  const kx = R * rad(1) * Math.cos(rad(refLat));
  const ky = R * rad(1);
  let walked = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const dx = (path[i + 1][0] - path[i][0]) * kx;
    const dy = (path[i + 1][1] - path[i][1]) * ky;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    if (walked + len >= along) {
      const t = (along - walked) / len;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t];
    }
    walked += len;
  }
  return path[path.length - 1];
}

// Compass bearing of the segment that contains `along`, in the path's own direction.
export function bearingAlong(path: LngLat[], along: number, refLat: number): number | null {
  if (path.length < 2) return null;
  const kx = R * rad(1) * Math.cos(rad(refLat));
  const ky = R * rad(1);
  let walked = 0;
  let last: number | null = null;
  for (let i = 0; i < path.length - 1; i++) {
    const dx = (path[i + 1][0] - path[i][0]) * kx;
    const dy = (path[i + 1][1] - path[i][1]) * ky;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    last = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (walked + len >= Math.max(0, along)) return last;
    walked += len;
  }
  return last;
}

export function pathLength(path: LngLat[], refLat: number): number {
  if (path.length < 2) return 0;
  const kx = R * rad(1) * Math.cos(rad(refLat));
  const ky = R * rad(1);
  let walked = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const dx = (path[i + 1][0] - path[i][0]) * kx;
    const dy = (path[i + 1][1] - path[i][1]) * ky;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    walked += len;
  }
  return walked;
}

export function formatDistance(m: number): string {
  const rounded = Math.max(10, Math.round(m / 10) * 10);
  if (rounded < 1000) return `${rounded} m`;
  return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

// The stretch of a path between two points near it, in the path's own direction.
// When the second point is not further along than the first, the two are joined directly.
export function slice(path: LngLat[], from: LngLat, to: LngLat): LngLat[] {
  const a = locate(path, from);
  const b = locate(path, to);
  if (!a || !b || b.along <= a.along) return [from, to];
  const at = (l: Located): LngLat => {
    const p = path[l.index];
    const q = path[l.index + 1];
    return [p[0] + (q[0] - p[0]) * l.t, p[1] + (q[1] - p[1]) * l.t];
  };
  return [at(a), ...path.slice(a.index + 1, b.index + 1), at(b)];
}
