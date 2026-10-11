import { describe, expect, it } from "vitest";
import { alongRoute, arrivals, etaText, nearestStopAhead, resolveEta } from "./eta";
import type { Bus, Path, Stop } from "./santa-ana";

// Metres in one degree of latitude on the sphere geo.ts uses (R = 6371 km).
const DEG_LAT_M = 111194.93;
// eta.ts assumes 17 km/h, which is this many metres per minute.
const M_PER_MIN = 17000 / 60;

const LNG = -65.3;
// 0.0006 degrees of longitude is about 61 m at this latitude.
const LNG_BACK = LNG - 0.0006;

// "ida" runs due north, "vuelta" comes back due south on a parallel street ~61 m west.
const IDA: Path = {
  direction: "ida",
  coordinates: [
    [LNG, -24.2],
    [LNG, -24.18],
  ],
};
const VUELTA: Path = {
  direction: "vuelta",
  coordinates: [
    [LNG_BACK, -24.18],
    [LNG_BACK, -24.2],
  ],
};
const PATHS = [IDA, VUELTA];

// Stop in the middle of "ida", about 1112 m from its start.
const STOP: Stop = { id: "s1", name: "Parada", lat: -24.19, lng: LNG, direction: "ida", order: 1 };

let nextId = 1;
function bus(over: Partial<Bus>): Bus {
  return {
    id: nextId++,
    line: "1",
    number: "101",
    lat: -24.195,
    lng: LNG,
    speed: 20,
    course: 0,
    ramp: false,
    moving: true,
    fresh: true,
    age: 5,
    ...over,
  };
}

describe("arrivals", () => {
  it("lists a bus behind the stop on the stop's path with a plausible distance and minutes", () => {
    const b = bus({ lat: -24.195 });
    const out = arrivals(PATHS, STOP, [b]);
    expect(out).toHaveLength(1);
    expect(out[0].bus).toBe(b);
    // 0.005 degrees of latitude: about 556 m, about 2 minutes at 17 km/h.
    expect(out[0].meters).toBeCloseTo(0.005 * DEG_LAT_M, 0);
    expect(out[0].minutes).toBeCloseTo((0.005 * DEG_LAT_M) / M_PER_MIN, 2);
    expect(out[0].minutes).toBeGreaterThan(1.5);
    expect(out[0].minutes).toBeLessThan(2.5);
  });

  it("scales minutes with distance", () => {
    const near = bus({ lat: -24.195 });
    const far = bus({ lat: -24.2 });
    const out = arrivals(PATHS, STOP, [near, far]);
    expect(out).toHaveLength(2);
    expect(out[1].meters / out[0].meters).toBeCloseTo(2, 2);
    expect(out[1].minutes / out[0].minutes).toBeCloseTo(2, 2);
  });

  it("does not list a bus that already passed the stop", () => {
    const passed = bus({ lat: -24.188 }); // ~222 m beyond the stop
    expect(arrivals(PATHS, STOP, [passed])).toEqual([]);
  });

  it("does not list a bus that passed the stop even when it is stationary", () => {
    const passed = bus({ lat: -24.185, moving: false, speed: 0, course: null });
    expect(arrivals(PATHS, STOP, [passed])).toEqual([]);
  });

  it("lists a bus standing at the stop as 0 m and 0 minutes", () => {
    const here = bus({ lat: -24.19 });
    const out = arrivals(PATHS, STOP, [here]);
    expect(out).toHaveLength(1);
    expect(out[0].meters).toBeCloseTo(0, 3);
    expect(out[0].minutes).toBeCloseTo(0, 3);
  });

  it("never reports a negative distance or time", () => {
    // ~11 m beyond the stop: inside the tolerance, so it still shows, clamped to zero.
    const justPast = bus({ lat: -24.1899 });
    const out = arrivals(PATHS, STOP, [justPast]);
    expect(out).toHaveLength(1);
    expect(out[0].meters).toBe(0);
    expect(out[0].minutes).toBe(0);
  });

  it("does not list a moving bus whose course points the opposite way", () => {
    const opposite = bus({ lat: -24.195, course: 180 });
    expect(arrivals(PATHS, STOP, [opposite])).toEqual([]);
  });

  it("lists a moving bus whose course is roughly along the path", () => {
    const a = bus({ lat: -24.195, course: 20 });
    const b = bus({ lat: -24.196, course: 340 });
    expect(arrivals(PATHS, STOP, [a, b])).toHaveLength(2);
  });

  it("does not list a bus more than 150 m off the route", () => {
    const off = bus({ lat: -24.195, lng: LNG + 0.002 }); // ~203 m east
    expect(arrivals(PATHS, STOP, [off])).toEqual([]);
  });

  it("lists a bus slightly off the route, within 150 m", () => {
    const close = bus({ lat: -24.195, lng: LNG + 0.001 }); // ~101 m east
    const out = arrivals(PATHS, STOP, [close]);
    expect(out).toHaveLength(1);
    expect(out[0].meters).toBeCloseTo(0.005 * DEG_LAT_M, 0);
  });

  it("sorts the results nearest first", () => {
    const far = bus({ lat: -24.199 });
    const near = bus({ lat: -24.192 });
    const mid = bus({ lat: -24.196 });
    const out = arrivals(PATHS, STOP, [far, near, mid]);
    expect(out.map((a) => a.bus)).toEqual([near, mid, far]);
    expect(out[0].meters).toBeLessThan(out[1].meters);
    expect(out[1].meters).toBeLessThan(out[2].meters);
  });

  it("resolves a stop with direction null to the nearest path", () => {
    const onIda = bus({ lat: -24.195, lng: LNG, course: 0 });
    const onVuelta = bus({ lat: -24.185, lng: LNG_BACK, course: 180 });

    // A stop on the "vuelta" street: the bus coming south towards it is the one listed.
    const stopBack: Stop = { ...STOP, id: "s2", lng: LNG_BACK, direction: null };
    const back = arrivals(PATHS, stopBack, [onIda, onVuelta]);
    expect(back.map((a) => a.bus)).toEqual([onVuelta]);
    expect(back[0].meters).toBeCloseTo(0.005 * DEG_LAT_M, 0);

    // The same stop on the "ida" street resolves to "ida", whatever the order of the paths.
    const stopOut: Stop = { ...STOP, direction: null };
    const forward = arrivals([VUELTA, IDA], stopOut, [onIda, onVuelta]);
    expect(forward.map((a) => a.bus)).toEqual([onIda]);
  });

  it("uses the stop's direction even when another path is closer", () => {
    // The stop sits on the "vuelta" street but is declared as "ida".
    const stop: Stop = { ...STOP, lng: LNG_BACK, direction: "ida" };
    const onIda = bus({ lat: -24.195, lng: LNG, course: 0 });
    const out = arrivals(PATHS, stop, [onIda]);
    expect(out.map((a) => a.bus)).toEqual([onIda]);
  });

  it("falls back to the nearest path when no path has the stop's direction", () => {
    const stop: Stop = { ...STOP, direction: "circular" };
    const onIda = bus({ lat: -24.195 });
    expect(arrivals(PATHS, stop, [onIda]).map((a) => a.bus)).toEqual([onIda]);
  });

  it("does not list a stationary bus sitting on the opposite-direction path", () => {
    const parked = bus({ lat: -24.195, lng: LNG_BACK, moving: false, speed: 0, course: null });
    expect(arrivals(PATHS, STOP, [parked])).toEqual([]);
  });

  it("does not list a stationary bus on the opposite path that still reports a stale course", () => {
    const parked = bus({ lat: -24.195, lng: LNG_BACK, moving: false, speed: 0, course: 0 });
    expect(arrivals(PATHS, STOP, [parked])).toEqual([]);
  });

  it("lists a stationary bus sitting on the stop's own path", () => {
    const waiting = bus({ lat: -24.195, lng: LNG, moving: false, speed: 0, course: null });
    const out = arrivals(PATHS, STOP, [waiting]);
    expect(out).toHaveLength(1);
    expect(out[0].meters).toBeCloseTo(0.005 * DEG_LAT_M, 0);
  });

  it("does not list a moving bus on the opposite path heading the opposite way", () => {
    const returning = bus({ lat: -24.195, lng: LNG_BACK, course: 180 });
    expect(arrivals(PATHS, STOP, [returning])).toEqual([]);
  });

  it("returns an empty list when there are no buses or no usable path", () => {
    expect(arrivals(PATHS, STOP, [])).toEqual([]);
    expect(arrivals([], STOP, [bus({})])).toEqual([]);
    expect(arrivals([{ direction: "ida", coordinates: [[LNG, -24.2]] }], STOP, [bus({})])).toEqual([]);
  });
});

const M_PER_DEG_LNG = 6371000 * (Math.PI / 180) * Math.cos((-24.2 * Math.PI) / 180);

describe("alongRoute", () => {
  it("measures the polyline, not the straight line, and turns that into minutes", () => {
    // East, then north. The corner is longer than the chord between the ends.
    const bent: Path = {
      direction: "ida",
      coordinates: [
        [LNG, -24.2],
        [LNG + 0.01, -24.2],
        [LNG + 0.01, -24.19],
      ],
    };
    const stop: Stop = { id: "bend", name: "Esquina", lat: -24.19, lng: LNG + 0.01, direction: "ida", order: 2 };
    const b = bus({ lat: -24.2, lng: LNG, course: 90 });
    const along = 0.01 * M_PER_DEG_LNG + 0.01 * DEG_LAT_M;
    const route = alongRoute([bent], stop, b);
    expect(route?.kind).toBe("coming");
    if (route?.kind !== "coming") return;
    expect(route.meters).toBeCloseTo(along, 0);
    expect(route.meters).toBeGreaterThan(Math.hypot(0.01 * M_PER_DEG_LNG, 0.01 * DEG_LAT_M) + 50);
    expect(route.minutes).toBeCloseTo(route.meters / M_PER_MIN, 5);
  });

  it("says the bus passed once it is beyond the stop in its direction of travel", () => {
    const passed = bus({ lat: -24.185, course: 0 });
    const route = alongRoute(PATHS, STOP, passed);
    expect(route?.kind).toBe("passed");
    if (route?.kind !== "passed") return;
    expect(route.meters).toBeCloseTo(0.005 * DEG_LAT_M, 0);
  });

  it("keeps a bus a few metres past the stop as arriving, same as the alert list", () => {
    const justPast = bus({ lat: -24.1899 });
    const route = alongRoute(PATHS, STOP, justPast);
    expect(route).toEqual({ kind: "coming", meters: 0, minutes: 0 });
    expect(arrivals(PATHS, STOP, [justPast])).toHaveLength(1);
  });

  it("does not measure a bus going the other way or off the route", () => {
    expect(alongRoute(PATHS, STOP, bus({ lat: -24.195, course: 180 }))).toBeNull();
    expect(alongRoute(PATHS, STOP, bus({ lat: -24.195, lng: LNG + 0.002 }))).toBeNull();
  });
});

describe("nearestStopAhead", () => {
  const near: Stop = { id: "near", name: "Cerca", lat: -24.192, lng: LNG, direction: "ida", order: 1 };
  const far: Stop = { id: "far", name: "Lejos", lat: -24.185, lng: LNG, direction: "ida", order: 2 };
  const behind: Stop = { id: "behind", name: "Atrás", lat: -24.198, lng: LNG, direction: "ida", order: 0 };
  const otherWay: Stop = { id: "back", name: "Vuelta", lat: -24.192, lng: LNG_BACK, direction: "vuelta", order: 1 };

  it("picks the stop ahead of the bus that is closest to the person", () => {
    const b = bus({ lat: -24.195, course: 0 });
    const atFar: [number, number] = [LNG, -24.185];
    expect(nearestStopAhead(PATHS, [behind, near, far, otherWay], b, atFar)?.stop).toBe(far);
    const atNear: [number, number] = [LNG, -24.192];
    expect(nearestStopAhead(PATHS, [behind, near, far, otherWay], b, atNear)?.stop).toBe(near);
  });

  it("skips a closer stop the bus has already passed and uses the next one ahead", () => {
    const b = bus({ lat: -24.193, course: 0 });
    const standingAtPassed: [number, number] = [LNG, -24.198];
    const found = nearestStopAhead(PATHS, [behind, near, far], b, standingAtPassed);
    expect(found?.stop).toBe(near);
    expect(found?.route.kind).toBe("coming");
  });

  it("reports ya pasó when the bus is past every stop of its direction", () => {
    const b = bus({ lat: -24.184, course: 0 });
    const found = nearestStopAhead(PATHS, [behind, near], b, [LNG, -24.198]);
    expect(found?.stop).toBe(behind);
    expect(found?.route.kind).toBe("passed");
  });

  it("ignores the other direction and a bus that is not on the route", () => {
    const south = bus({ lat: -24.185, lng: LNG_BACK, course: 180 });
    expect(nearestStopAhead(PATHS, [near, far], south, [LNG, -24.19])).toBeNull();
    expect(nearestStopAhead(PATHS, [near], bus({ lat: -24.195, lng: LNG + 0.002 }), [LNG, -24.192])).toBeNull();
  });
});

describe("resolveEta", () => {
  const chosen: Stop = { ...STOP, name: "Elegida" };

  it("uses the stop the person chose, including when the bus already passed it", () => {
    const coming = resolveEta(PATHS, [STOP], bus({ lat: -24.195 }), chosen, null);
    expect(coming.kind).toBe("ready");
    if (coming.kind !== "ready") return;
    expect(coming.source).toBe("chosen");
    expect(coming.route.kind).toBe("coming");

    const passed = resolveEta(PATHS, [STOP], bus({ lat: -24.185 }), chosen, [LNG, -24.195]);
    expect(passed.kind).toBe("ready");
    if (passed.kind !== "ready") return;
    expect(passed.route.kind).toBe("passed");
    expect(passed.stop).toBe(chosen);
  });

  it("asks for a stop when there is no choice and no position", () => {
    expect(resolveEta(PATHS, [STOP], bus({}), null, null)).toEqual({ kind: "pick" });
  });

  it("falls back to the nearest stop ahead of the bus from the person's position", () => {
    const found = resolveEta(PATHS, [STOP], bus({ lat: -24.195 }), null, [LNG, -24.19]);
    expect(found.kind).toBe("ready");
    if (found.kind !== "ready") return;
    expect(found.source).toBe("location");
    expect(found.stop.id).toBe(STOP.id);
  });
});

describe("etaText", () => {
  it("says the range once, and the distance", () => {
    const minutes = 1417 / M_PER_MIN;
    expect(etaText({ kind: "coming", meters: 1417, minutes })).toEqual({
      kind: "coming",
      title: "3 a 7 min",
      distance: "1,4 km",
    });
  });

  it("uses a single estimate when both ends are the same minute", () => {
    expect(etaText({ kind: "coming", meters: 160, minutes: 160 / M_PER_MIN })).toEqual({
      kind: "coming",
      title: "≈ 1 min",
      distance: "160 m",
    });
  });

  it("says it is arriving when the bus is already at the stop", () => {
    expect(etaText({ kind: "coming", meters: 90, minutes: 0.3 }).title).toBe("Está llegando");
  });

  it("says the bus already passed, with how far", () => {
    expect(etaText({ kind: "passed", meters: 400 })).toEqual({
      kind: "passed",
      title: "Ya pasó",
      distance: "hace 400 m",
    });
  });
});
