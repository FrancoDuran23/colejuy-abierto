import { describe, expect, it } from "vitest";
import { angleBetween, distance, pointAlong, type LngLat } from "./geo";
import {
  arrowOpacity,
  createMotion,
  heldWithoutSignal,
  MAX_EXTRAP_M,
  projectFix,
  pushFix,
  sameReading,
  stepMotion,
  URBAN_KMH,
  type Fix,
  type RouteLine,
} from "./motion";

const LNG = -65.3;
const M_PER_DEG = (6371000 * Math.PI) / 180;
// Northbound, about 2.2 km, longer than the extrapolation cap.
const NORTH: LngLat[] = [
  [LNG, -24.2],
  [LNG, -24.18],
];
const north: RouteLine = { line: "41", direction: "ida", coordinates: NORTH };

const fix = (over: Partial<Fix> = {}): Fix => ({
  lng: LNG,
  lat: -24.2,
  speed: 36,
  course: 0,
  moving: true,
  age: 0,
  ...over,
});

describe("projectFix", () => {
  it("moves a bus north along its route at the reported speed", () => {
    const at = projectFix(fix(), [north], 10);
    expect(distance([LNG, -24.2], at.at)).toBeCloseTo(100, 0);
    expect(at.at[1]).toBeGreaterThan(-24.2);
    expect(angleBetween(at.bearing ?? 999, 0)).toBeLessThan(1);
  });

  it("counts the age of the fix, which is already old when it arrives", () => {
    const at = projectFix(fix({ age: 10 }), [north], 10);
    expect(distance([LNG, -24.2], at.at)).toBeCloseTo(100, 0);
  });

  it("uses a typical urban speed when the bus is moving but reports none", () => {
    const at = projectFix(fix({ speed: 0 }), [north], 10);
    expect(distance([LNG, -24.2], at.at)).toBeCloseTo((URBAN_KMH * 1000) / 3600 * 10, 0);
  });

  it("does not move a stopped bus, even if a stale speed is still set", () => {
    const at = projectFix(fix({ moving: false, speed: 40 }), [north], 30);
    expect(distance([LNG, -24.2], at.at)).toBeLessThan(1);
  });

  it("caps a fast bus at 600 m and a slow one at 60 s", () => {
    const fast = projectFix(fix({ speed: 72 }), [north], 60);
    expect(distance([LNG, -24.2], fast.at)).toBeCloseTo(MAX_EXTRAP_M, 0);
    const slow = projectFix(fix({ speed: URBAN_KMH }), [north], 120);
    expect(distance([LNG, -24.2], slow.at)).toBeCloseTo(((URBAN_KMH * 1000) / 3600) * 60, 0);
  });

  it("stops at the end of a short route instead of leaving it", () => {
    const endLat = -24.2 + 80 / M_PER_DEG;
    const short: RouteLine = { line: "41", direction: "ida", coordinates: [[LNG, -24.2], [LNG, endLat]] };
    const at = projectFix(fix(), [short], 10);
    expect(distance([LNG, -24.2], at.at)).toBeGreaterThan(75);
    expect(distance([LNG, -24.2], at.at)).toBeLessThan(85);
  });

  it("follows the route backwards when the course opposes the only trace", () => {
    const start: LngLat = [LNG, -24.19];
    const at = projectFix(fix({ ...startTo(start), course: 180 }), [north], 10);
    expect(distance(start, at.at)).toBeCloseTo(100, 0);
    expect(at.at[1]).toBeLessThan(start[1]);
    expect(angleBetween(at.bearing ?? 0, 180)).toBeLessThan(1);
  });

  it("picks the trace whose direction matches the course when both are close", () => {
    const southLng = LNG + 0.00045;
    const vuelta: RouteLine = { line: "41", direction: "vuelta", coordinates: [[southLng, -24.18], [southLng, -24.2]] };
    const at = projectFix(fix({ lng: southLng, lat: -24.19, course: 180 }), [north, vuelta], 10);
    expect(at.at[0]).toBeCloseTo(southLng, 4);
    expect(at.at[1]).toBeLessThan(-24.19);
    expect(angleBetween(at.bearing ?? 0, 180)).toBeLessThan(1);
  });

  it("turns with the route, so the heading is the road and not the old course", () => {
    const lat1 = -24.2 + 200 / M_PER_DEG;
    const lng1 = LNG + 400 / (M_PER_DEG * Math.cos((-24.2 * Math.PI) / 180));
    const bent: RouteLine = { line: "41", direction: "ida", coordinates: [[LNG, -24.2], [LNG, lat1], [lng1, lat1]] };
    const at = projectFix(fix(), [bent], 25);
    expect(at.at[0]).toBeGreaterThan(LNG + 0.0002);
    expect(angleBetween(at.bearing ?? 0, 90)).toBeLessThan(8);
  });

  it("holds a bus at its fix when the line has no geometry, and still knows its heading", () => {
    for (const seconds of [10, 60, 600]) {
      const at = projectFix(fix({ course: 90 }), [], seconds);
      expect(distance([LNG, -24.2], at.at)).toBeLessThan(1);
      expect(angleBetween(at.bearing ?? 0, 90)).toBeLessThan(1);
    }
  });

  it("stays put off the route when there is a speed but no course and no trace", () => {
    const at = projectFix(fix({ lng: LNG + 0.003, course: null }), [north], 10);
    expect(distance([LNG + 0.003, -24.2], at.at)).toBeLessThan(1);
    expect(at.bearing).toBeNull();
  });

  it("does not snap a bus that is far from every trace, and does not send it off along its course", () => {
    const at = projectFix(fix({ lng: LNG + 0.003, course: 90 }), [north], 10);
    expect(at.pathKey).toBeNull();
    expect(distance([LNG + 0.003, -24.2], at.at)).toBeLessThan(1);
  });

  it("never leaves the route it is following, however long the wait", () => {
    // A route that turns east after 300 m: a bus going north must take the corner, not carry straight on.
    const corner: RouteLine = { line: "41", direction: "ida", coordinates: [[LNG, -24.2], [LNG, -24.1973], [LNG + 0.01, -24.1973]] };
    for (const seconds of [5, 20, 40, 60, 300]) {
      const at = projectFix(fix(), [corner], seconds);
      const north = at.at[1] - -24.2;
      expect(north).toBeLessThanOrEqual(0.0027 + 1e-6);
      expect(at.pathKey).not.toBeNull();
    }
  });
});

describe("heldWithoutSignal", () => {
  it("leaves a bus with a fresh signal as it is", () => {
    expect(heldWithoutSignal(fix(), true)).toEqual(fix());
  });

  it("does not move a bus whose signal is old, with or without a route", () => {
    const stale = heldWithoutSignal(fix({ age: 300 }), false);
    expect(stale.moving).toBe(false);
    for (const routes of [[north], []]) {
      const at = projectFix(stale, routes, 60);
      expect(distance([LNG, -24.2], at.at)).toBeLessThan(1);
    }
  });

  it("keeps a stale bus still across later frames", () => {
    let state = createMotion(heldWithoutSignal(fix({ age: 300 }), false), [north], 0);
    state = stepMotion(state, [north], 30_000);
    expect(distance([LNG, -24.2], state.shown.at)).toBeLessThan(1);
  });
});

describe("corrections", () => {
  it("glides toward a new fix instead of jumping, and arrives within 2 s", () => {
    let state = createMotion(fix({ moving: false, speed: 0 }), [north], 0);
    const there = pointAlong(NORTH, 100, -24.2)!;
    state = pushFix(state, fix({ lng: there[0], lat: there[1], moving: false, speed: 0 }), [north], 1000, true);
    expect(state.shown.at[1]).toBeCloseTo(-24.2, 4);
    state = stepMotion(state, [north], 1000 + 750, true);
    expect(state.shown.at[1]).toBeGreaterThan(-24.2);
    expect(state.shown.at[1]).toBeLessThan(there[1]);
    state = stepMotion(state, [north], 1000 + 1500, true);
    expect(distance(there, state.shown.at)).toBeLessThan(2);
  });

  it("does not roll backwards when the new fix is only a little behind", () => {
    let state = createMotion(fix(), [north], 0);
    state = stepMotion(state, [north], 10_000);
    const ahead = state.shown.at[1];
    const behind = pointAlong(NORTH, 60, -24.2)!;
    state = pushFix(state, fix({ lng: behind[0], lat: behind[1] }), [north], 10_000, true);
    expect(state.shown.at[1]).toBeCloseTo(ahead, 5);
    const held = state.shown.at[1];
    state = stepMotion(state, [north], 12_000);
    expect(state.shown.at[1]).toBeGreaterThan(held);
  });

  it("does stop extrapolating once the cap is spent, even if the same fix keeps arriving", () => {
    let state = createMotion(fix(), [north], 0);
    state = stepMotion(state, [north], 60_000);
    const capped = state.shown.at[1];
    state = stepMotion(state, [north], 120_000);
    expect(state.shown.at[1]).toBeCloseTo(capped, 6);
    // The same place arriving again, even with an older age, is not a new reading.
    // Treating it as new would refill the budget and the bus would never stop.
    expect(sameReading(state.fix, fix({ age: 80 }))).toBe(true);
    expect(sameReading(fix(), fix({ age: 40 }))).toBe(true);
  });
});

describe("arrowOpacity", () => {
  it("shows every bus with a heading, softer when stopped and dim when stale", () => {
    expect(arrowOpacity(true, true, 20)).toBe(1);
    expect(arrowOpacity(false, true, 20)).toBe(0.7);
    expect(arrowOpacity(true, false, 20)).toBe(0.4);
    expect(arrowOpacity(false, false, 20)).toBe(0.4);
    expect(arrowOpacity(true, true, null)).toBe(0);
    expect(arrowOpacity(false, true, null)).toBe(0);
  });
});

function startTo(at: LngLat): Partial<Fix> {
  return { lng: at[0], lat: at[1] };
}
