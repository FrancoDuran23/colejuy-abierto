import { angleBetween, bearingAlong, distance, locate, pathLength, pointAlong, type LngLat } from "./geo";

// The same urban average the arrival estimate uses. A bus that says it is moving
// but reports no speed still has to keep going, or it looks parked in the street.
export const URBAN_KMH = 17;
// Below this, a reported speed is noise from a bus that is barely rolling.
export const STOP_KMH = 3;
// A fix that never updates must not drive the icon off the neighbourhood.
export const MAX_EXTRAP_S = 60;
export const MAX_EXTRAP_M = 600;
// Same tolerance arrivals use: further than this, the bus is not on this route.
export const SNAP_M = 150;
// A new fix a little behind where we already drew the bus is the fix being late, not a U-turn.
export const SMALL_BACK_M = 50;
export const GLIDE_MS = 1500;
export const JUMP_M = 500;
// A direction drawn as its own polyline can sit a few metres beside the one the bus is on.
const ALIGN_SLACK_M = 40;
const BACK_EPSILON_M = 5;

export type Fix = {
  lng: number;
  lat: number;
  speed: number;
  course: number | null;
  moving: boolean;
  // Seconds the fix was already old when it reached the phone.
  age: number;
};

// A bus whose signal is old is drawn where it last reported and is not moved: where it is now is not known.
export function heldWithoutSignal(fix: Fix, fresh: boolean): Fix {
  return fresh ? fix : { ...fix, moving: false };
}

export type RouteLine = { line: string; direction: string; coordinates: LngLat[] };

export type Projected = {
  at: LngLat;
  along: number | null;
  pathKey: string | null;
  path: LngLat[] | null;
  // Travel direction, degrees clockwise from north. Null when it cannot be known.
  bearing: number | null;
};

export type MotionState = {
  fix: Fix;
  movedAtMs: number;
  budgetS: number;
  budgetM: number;
  shown: Projected;
  glideFrom: Projected | null;
  glideStartMs: number | null;
};

type Picked = { route: RouteLine; at: NonNullable<ReturnType<typeof locate>>; forward: boolean };

const rad = (d: number) => (d * Math.PI) / 180;
const R = 6371000;
const normBearing = (b: number) => ((b % 360) + 360) % 360;

export function travelSpeedKmh(speed: number, moving: boolean): number {
  if (!moving) return 0;
  if (speed <= STOP_KMH) return URBAN_KMH;
  return speed;
}

function clean(fix: Fix): Fix {
  return { ...fix, speed: Math.max(0, fix.speed), age: Math.max(0, fix.age) };
}

function pathKey(route: RouteLine): string {
  const c = route.coordinates;
  const a = c[0];
  const b = c[c.length - 1];
  return `${route.line}:${route.direction}:${c.length}:${a?.[0]},${a?.[1]}:${b?.[0]},${b?.[1]}`;
}

// Nearest route within SNAP_M. The course picks which way to travel it.
// Another polyline that faces the course and is almost as close wins, so ida/vuelta
// drawn as two lines still follow the heading instead of the nearer opposite trace.
export function pickRoute(routes: RouteLine[], fix: Fix): Picked | null {
  const here: LngLat = [fix.lng, fix.lat];
  const hits: Picked[] = [];
  for (const route of routes) {
    const at = locate(route.coordinates, here);
    if (!at || at.offset > SNAP_M) continue;
    const turn = fix.course === null ? 0 : angleBetween(fix.course, at.bearing);
    hits.push({ route, at, forward: fix.course === null || turn <= 90 });
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.at.offset - b.at.offset);
  const nearest = hits[0];
  if (nearest.forward || fix.course === null) return nearest;
  const aligned = hits
    .filter((h) => h.forward && h.at.offset <= nearest.at.offset + ALIGN_SLACK_M)
    .sort((a, b) => a.at.offset - b.at.offset);
  if (aligned.length > 0) return aligned[0];
  return { ...nearest, forward: false };
}

// How far `to` is ahead of `from` along a compass course. Negative means behind.
function aheadMeters(from: LngLat, to: LngLat, course: number): number {
  const kx = R * rad(1) * Math.cos(rad(from[1]));
  const ky = R * rad(1);
  const east = (to[0] - from[0]) * kx;
  const north = (to[1] - from[1]) * ky;
  const θ = rad(course);
  return east * Math.sin(θ) + north * Math.cos(θ);
}

export function projectFix(fix: Fix, routes: RouteLine[], elapsedS: number, limitM = MAX_EXTRAP_M): Projected {
  const speed = travelSpeedKmh(fix.speed, fix.moving);
  const seconds = Math.min(MAX_EXTRAP_S, Math.max(0, elapsedS));
  const meters = Math.min(Math.max(0, limitM), (speed * 1000) / 3600 * seconds);
  const picked = pickRoute(routes, fix);
  const courseBearing = fix.course === null ? null : normBearing(fix.course);
  // With no route to follow the bus stays where it last reported. Pushing it ahead along its
  // compass course drew buses cutting straight across blocks, on streets no bus takes.
  if (!picked) return { at: [fix.lng, fix.lat], along: null, pathKey: null, path: null, bearing: courseBearing };
  const length = pathLength(picked.route.coordinates, fix.lat);
  const raw = picked.forward ? picked.at.along + meters : picked.at.along - meters;
  const along = Math.max(0, Math.min(length, raw));
  const at = pointAlong(picked.route.coordinates, along, fix.lat) ?? [fix.lng, fix.lat];
  const dir = bearingAlong(picked.route.coordinates, along, fix.lat);
  const bearing = dir === null ? courseBearing : normBearing(picked.forward ? dir : dir + 180);
  return { at, along, pathKey: pathKey(picked.route), path: picked.route.coordinates, bearing };
}

// Every bus with a known heading shows an arrow. A stopped one is a little softer, a stale one dimmer.
// The arrow is hidden only when the heading itself is unknown.
export function arrowOpacity(rolling: boolean, fresh: boolean, bearing: number | null): number {
  if (bearing === null) return 0;
  if (!fresh) return 0.4;
  return rolling ? 1 : 0.7;
}

function copyAt(p: Projected): Projected {
  return { at: [p.at[0], p.at[1]], along: p.along, pathKey: p.pathKey, path: p.path, bearing: p.bearing };
}

function lerpBearing(a: number | null, b: number | null, t: number): number | null {
  if (a === null || b === null) return b ?? a;
  const d = ((b - a + 540) % 360) - 180;
  return normBearing(a + d * t);
}

export function isSmallBack(shown: Projected, next: Projected, moving: boolean, course: number | null): boolean {
  if (!moving) return false;
  if (shown.pathKey && shown.pathKey === next.pathKey && shown.along !== null && next.along !== null) {
    const back = shown.along - next.along;
    return back > BACK_EPSILON_M && back <= SMALL_BACK_M;
  }
  if (!shown.pathKey && !next.pathKey && course !== null) {
    const ahead = aheadMeters(next.at, shown.at, course);
    return ahead > BACK_EPSILON_M && ahead <= SMALL_BACK_M;
  }
  return false;
}

function courseTurn(a: number | null, b: number | null): number {
  if (a === null || b === null) return a === b ? 0 : 180;
  return angleBetween(a, b);
}

function rebase(state: MotionState, nowMs: number, fix: Fix): MotionState {
  const usedS = Math.min(state.budgetS, Math.max(0, state.fix.age + (nowMs - state.movedAtMs) / 1000));
  const traveled = distance([state.fix.lng, state.fix.lat], state.shown.at);
  return {
    fix: { ...clean(fix), lng: state.shown.at[0], lat: state.shown.at[1], age: 0 },
    movedAtMs: nowMs,
    budgetS: Math.max(0, state.budgetS - usedS),
    budgetM: Math.max(0, state.budgetM - traveled),
    shown: copyAt(state.shown),
    glideFrom: null,
    glideStartMs: null,
  };
}

function projectState(state: MotionState, routes: RouteLine[], nowMs: number): Projected {
  const elapsed = Math.min(state.budgetS, Math.max(0, state.fix.age + (nowMs - state.movedAtMs) / 1000));
  return projectFix(state.fix, routes, elapsed, state.budgetM);
}

export function blend(from: Projected, to: Projected, t: number): Projected {
  const u = Math.max(0, Math.min(1, t));
  if (from.path && from.path === to.path && from.along !== null && to.along !== null) {
    const along = from.along + (to.along - from.along) * u;
    const at = pointAlong(from.path, along, from.at[1]) ?? to.at;
    const dir = bearingAlong(from.path, along, from.at[1]);
    const reversed = dir !== null && to.bearing !== null && angleBetween(dir, to.bearing) > 90;
    const bearing = dir === null ? lerpBearing(from.bearing, to.bearing, u) : normBearing(reversed ? dir + 180 : dir);
    return { at, along, pathKey: to.pathKey, path: to.path, bearing };
  }
  return {
    at: [from.at[0] + (to.at[0] - from.at[0]) * u, from.at[1] + (to.at[1] - from.at[1]) * u],
    along: null,
    pathKey: to.pathKey,
    path: to.path,
    bearing: lerpBearing(from.bearing, to.bearing, u),
  };
}

export function createMotion(fix: Fix, routes: RouteLine[], nowMs: number): MotionState {
  const next = clean(fix);
  return {
    fix: next,
    movedAtMs: nowMs,
    budgetS: MAX_EXTRAP_S,
    budgetM: MAX_EXTRAP_M,
    shown: projectFix(next, routes, Math.min(MAX_EXTRAP_S, next.age), MAX_EXTRAP_M),
    glideFrom: null,
    glideStartMs: null,
  };
}

export function stepMotion(state: MotionState, routes: RouteLine[], nowMs: number, allowGlide = true): MotionState {
  const projected = projectState(state, routes, nowMs);
  if (isSmallBack(state.shown, projected, state.fix.moving, state.fix.course)) return rebase(state, nowMs, state.fix);

  let glideFrom = state.glideFrom;
  let glideStartMs = state.glideStartMs;
  const gap = distance(state.shown.at, projected.at);
  const pathAppeared = state.shown.pathKey !== projected.pathKey && projected.pathKey !== null;
  if (allowGlide && !glideFrom && pathAppeared && gap >= 8 && gap <= JUMP_M) {
    glideFrom = copyAt(state.shown);
    glideStartMs = nowMs;
  }
  if (glideFrom && glideStartMs !== null) {
    const t = (nowMs - glideStartMs) / GLIDE_MS;
    if (t < 1) return { ...state, shown: blend(glideFrom, projected, t), glideFrom, glideStartMs };
    return { ...state, shown: projected, glideFrom: null, glideStartMs: null };
  }
  return { ...state, shown: projected, glideFrom: null, glideStartMs: null };
}

export function pushFix(state: MotionState, fix: Fix, routes: RouteLine[], nowMs: number, allowGlide = true): MotionState {
  const next = clean(fix);
  const projected = projectFix(next, routes, Math.min(MAX_EXTRAP_S, next.age), MAX_EXTRAP_M);
  const turned = courseTurn(state.fix.course, next.course) > 90;
  if (!turned && isSmallBack(state.shown, projected, next.moving, next.course)) return rebase(state, nowMs, next);
  const gap = distance(state.shown.at, projected.at);
  const glide = allowGlide && gap >= 8 && gap <= JUMP_M;
  return {
    fix: next,
    movedAtMs: nowMs,
    budgetS: MAX_EXTRAP_S,
    budgetM: MAX_EXTRAP_M,
    shown: glide ? copyAt(state.shown) : projected,
    glideFrom: glide ? copyAt(state.shown) : null,
    glideStartMs: glide ? nowMs : null,
  };
}

// A poll that repeats the same place must not restart the extrapolation budget.
export function sameReading(a: Fix, b: Fix): boolean {
  return (
    distance([a.lng, a.lat], [b.lng, b.lat]) < 12 &&
    a.moving === b.moving &&
    Math.abs(a.speed - b.speed) <= STOP_KMH &&
    a.course === b.course
  );
}
