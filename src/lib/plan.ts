import { distance, formatDistance, type LngLat } from "./geo";

export type NetStop = { id: string; name: string; lat: number; lng: number; direction: string | null; order: number | null };
// `approx`: the stops were derived from the route, not given by the source. `live`: the line has bus tracking.
export type NetLine = { id: string; stops: NetStop[]; live?: boolean; approx?: boolean };

// One ride on one line.
export type Leg = { line: string; board: NetStop; alight: NetStop; ride: number };

export type Option = {
  // One leg is a direct trip; two legs is a trip with one change of bus.
  legs: Leg[];
  // Metres on foot: to the first stop, between the two buses, and from the last stop.
  walkTo: number;
  walkBetween: number;
  walkFrom: number;
  // Walking, riding and, with a change, an assumed wait for the second bus.
  // The wait for the first bus is not included: it is shown live once the line is open.
  minutes: number;
};

// Assumptions, not measurements: a walking pace, the average speed of an urban bus with stops,
// how far someone accepts walking, and how long the second bus takes to come.
export const WALK_M_PER_MIN = 75;
const BUS_M_PER_MIN = 283;
// How far someone accepts walking to or from a stop. Tried in this order: the usual distance first,
// and longer walks only when the shorter one finds no trip at all.
export const WALK_STEPS_M = [700, 1200, 2000];
const MAX_CHANGE_M = 250;
export const CHANGE_WAIT_MIN = 8;
// Stops are joined by straight segments, which is a little shorter than the street.
const STREET_FACTOR = 1.15;

const point = (s: NetStop): LngLat => [s.lng, s.lat];

// The stops of one line in one direction, in the order the bus visits them, with what the
// trip needs from each: how far it is from the start and the destination, and how far along.
type Sequence = { line: string; stops: NetStop[]; fromStart: number[]; toEnd: number[]; along: number[] };

function sequences(lines: NetLine[], from: LngLat, to: LngLat): Sequence[] {
  const out: Sequence[] = [];
  for (const line of lines) {
    const byDirection = new Map<string, NetStop[]>();
    for (const s of line.stops) {
      if (s.order === null) continue;
      const key = s.direction ?? "";
      byDirection.set(key, [...(byDirection.get(key) ?? []), s]);
    }
    for (const group of byDirection.values()) {
      const stops = group.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const along = [0];
      for (let i = 1; i < stops.length; i++) along.push(along[i - 1] + distance(point(stops[i - 1]), point(stops[i])) * STREET_FACTOR);
      out.push({ line: line.id, stops, fromStart: stops.map((s) => distance(from, point(s))), toEnd: stops.map((s) => distance(point(s), to)), along });
    }
  }
  return out;
}

function direct(seq: Sequence, walk: number): Option | null {
  let best: Option | null = null;
  for (let i = 0; i < seq.stops.length; i++) {
    if (seq.fromStart[i] > walk) continue;
    // Only stops further along the same direction: the bus has to be going that way.
    for (let j = i + 1; j < seq.stops.length; j++) {
      if (seq.toEnd[j] > walk) continue;
      const ride = seq.along[j] - seq.along[i];
      const minutes = (seq.fromStart[i] + seq.toEnd[j]) / WALK_M_PER_MIN + ride / BUS_M_PER_MIN;
      if (!best || minutes < best.minutes) {
        best = { legs: [{ line: seq.line, board: seq.stops[i], alight: seq.stops[j], ride }], walkTo: seq.fromStart[i], walkBetween: 0, walkFrom: seq.toEnd[j], minutes };
      }
    }
  }
  return best;
}

// For every stop of a sequence, the cheapest way to be there having boarded earlier near the start.
function reachFromStart(seq: Sequence, walk: number) {
  const cost: number[] = [];
  const boardAt: number[] = [];
  let best = Infinity;
  let bestIndex = -1;
  for (let k = 0; k < seq.stops.length; k++) {
    // Cost of having boarded at bestIndex, measured at the start of the line so it compares across k.
    cost.push(bestIndex < 0 ? Infinity : best + seq.along[k] / BUS_M_PER_MIN);
    boardAt.push(bestIndex);
    if (seq.fromStart[k] <= walk) {
      const candidate = seq.fromStart[k] / WALK_M_PER_MIN - seq.along[k] / BUS_M_PER_MIN;
      if (candidate < best) {
        best = candidate;
        bestIndex = k;
      }
    }
  }
  return { cost, boardAt };
}

// For every stop of a sequence, the cheapest way to finish the trip having boarded there.
function reachEnd(seq: Sequence, walk: number) {
  const n = seq.stops.length;
  const cost: number[] = new Array(n).fill(Infinity);
  const alightAt: number[] = new Array(n).fill(-1);
  let best = Infinity;
  let bestIndex = -1;
  for (let m = n - 1; m >= 0; m--) {
    cost[m] = bestIndex < 0 ? Infinity : best - seq.along[m] / BUS_M_PER_MIN;
    alightAt[m] = bestIndex;
    if (seq.toEnd[m] <= walk) {
      const candidate = seq.toEnd[m] / WALK_M_PER_MIN + seq.along[m] / BUS_M_PER_MIN;
      if (candidate < best) {
        best = candidate;
        bestIndex = m;
      }
    }
  }
  return { cost, alightAt };
}

function withChange(first: Sequence, second: Sequence, walk: number): Option | null {
  const start = reachFromStart(first, walk);
  const end = reachEnd(second, walk);
  let best: Option | null = null;
  for (let k = 0; k < first.stops.length; k++) {
    if (start.cost[k] === Infinity) continue;
    for (let m = 0; m < second.stops.length; m++) {
      if (end.cost[m] === Infinity) continue;
      // A quick reject before the exact distance: 250 m is about 0.0025 degrees.
      if (Math.abs(first.stops[k].lat - second.stops[m].lat) > 0.003 || Math.abs(first.stops[k].lng - second.stops[m].lng) > 0.003) continue;
      const between = distance(point(first.stops[k]), point(second.stops[m]));
      if (between > MAX_CHANGE_M) continue;
      const minutes = start.cost[k] + between / WALK_M_PER_MIN + CHANGE_WAIT_MIN + end.cost[m];
      if (best && minutes >= best.minutes) continue;
      const i = start.boardAt[k];
      const j = end.alightAt[m];
      best = {
        legs: [
          { line: first.line, board: first.stops[i], alight: first.stops[k], ride: first.along[k] - first.along[i] },
          { line: second.line, board: second.stops[m], alight: second.stops[j], ride: second.along[j] - second.along[m] },
        ],
        walkTo: first.fromStart[i],
        walkBetween: between,
        walkFrom: second.toEnd[j],
        minutes,
      };
    }
  }
  return best;
}

const key = (o: Option) => o.legs.map((l) => l.line).join(">");

// How to get from one point to the other: on one line when there is one, and with one change
// of bus when that is clearly quicker or the only way. Quickest first.
export function plan(lines: NetLine[], from: LngLat, to: LngLat, limit = 5, walk = WALK_STEPS_M[0]): Option[] {
  const all = sequences(lines, from, to);
  const best = new Map<string, Option>();
  const keep = (o: Option | null) => {
    if (o && (!best.has(key(o)) || o.minutes < best.get(key(o))!.minutes)) best.set(key(o), o);
  };

  for (const seq of all) keep(direct(seq, walk));
  const directs = [...best.values()].sort((a, b) => a.minutes - b.minutes);

  const starts = all.filter((s) => s.fromStart.some((d) => d <= walk));
  const ends = all.filter((s) => s.toEnd.some((d) => d <= walk));
  const changes = new Map<string, Option>();
  for (const first of starts) {
    for (const second of ends) {
      if (first.line === second.line) continue;
      const option = withChange(first, second, walk);
      if (option && (!changes.has(key(option)) || option.minutes < changes.get(key(option))!.minutes)) changes.set(key(option), option);
    }
  }
  // A change is worth showing only if it beats the best direct trip by a real margin.
  const quickest = directs[0]?.minutes ?? Infinity;
  const worth = [...changes.values()].filter((o) => o.minutes < quickest - 5).sort((a, b) => a.minutes - b.minutes);

  return [...directs, ...worth.slice(0, 3)].sort((a, b) => a.minutes - b.minutes).slice(0, limit);
}

export const walkMinutes = (from: LngLat, to: LngLat) => (distance(from, to) * STREET_FACTOR) / WALK_M_PER_MIN;

// The trip with the shortest walk that works: the usual walking distance first, then longer ones.
export function planWidening(lines: NetLine[], from: LngLat, to: LngLat): { options: Option[]; walk: number } {
  for (const walk of WALK_STEPS_M) {
    const options = plan(lines, from, to, 5, walk);
    if (options.length) return { options, walk };
  }
  return { options: [], walk: WALK_STEPS_M[WALK_STEPS_M.length - 1] };
}

// Metres from a point to the closest stop a trip could use, to say why a trip was not found.
export function nearestStopMeters(lines: NetLine[], p: LngLat): number {
  let best = Infinity;
  for (const line of lines) for (const s of line.stops) if (s.order !== null) best = Math.min(best, distance(p, point(s)));
  return best;
}

// Why no trip was found, in words. Never shows a missing distance as a number.
export function whyNoTrip(lines: NetLine[], start: LngLat, destination: LngLat, fromMe: boolean): string {
  if (lines.every((l) => l.stops.length === 0)) return "No hay datos de paradas por ahora. Prueba de nuevo en unos minutos.";
  const limit = WALK_STEPS_M[WALK_STEPS_M.length - 1];
  const fromStop = nearestStopMeters(lines, start);
  const toStop = nearestStopMeters(lines, destination);
  const far = (m: number) => (Number.isFinite(m) ? `la parada más cercana está a ${formatDistance(m)}` : "no hay datos de paradas");
  if (fromStop > limit && toStop > limit) return `Ninguno de los dos puntos tiene paradas cerca: desde la salida ${far(fromStop)}, y desde el destino ${Number.isFinite(toStop) ? `a ${formatDistance(toStop)}` : "no hay datos"}.`;
  if (fromStop > limit) return `${fromMe ? "Tu ubicación" : "La salida"} queda lejos de los recorridos: ${far(fromStop)}. Marca otra salida en el mapa.`;
  if (toStop > limit) return `El destino queda lejos de los recorridos: ${far(toStop)}. Marca otro destino en el mapa.`;
  return "Hay paradas cerca de los dos puntos, pero ningún viaje de una o dos líneas los une. Prueba con un punto cercano.";
}
