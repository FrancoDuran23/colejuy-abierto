import { describe, expect, it } from "vitest";
import { CHANGE_WAIT_MIN, nearestStopMeters, plan, planWidening, walkMinutes, type NetLine, type NetStop } from "./plan";

// About 400 m between consecutive stops along a parallel, in the city's latitude.
const STEP = 0.004;
const LAT = -24.19;

function sequence(prefix: string, direction: string, lat: number, count: number, reversed = false): NetStop[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${direction}-${i + 1}`,
    name: `${prefix} ${i + 1}`,
    lat,
    lng: -65.3 + STEP * (reversed ? count - 1 - i : i),
    direction,
    order: i + 1,
  }));
}

const eastWest: NetLine = { id: "A", stops: [...sequence("A", "ida", LAT, 10), ...sequence("A", "vuelta", LAT, 10, true)] };

describe("plan", () => {
  it("boards at the stop nearest the start and gets off nearest the destination", () => {
    const [option] = plan([eastWest], [-65.3 + STEP * 1, LAT + 0.0005], [-65.3 + STEP * 7, LAT - 0.0005]);
    expect(option.legs).toHaveLength(1);
    expect(option.legs[0].line).toBe("A");
    expect(option.legs[0].board.id).toBe("A-ida-2");
    expect(option.legs[0].alight.id).toBe("A-ida-8");
    expect(option.walkTo).toBeLessThan(80);
    expect(option.legs[0].ride).toBeGreaterThan(2400);
    expect(option.legs[0].ride).toBeLessThan(3000);
  });

  it("uses the opposite direction for the trip back", () => {
    const [option] = plan([eastWest], [-65.3 + STEP * 7, LAT], [-65.3 + STEP * 1, LAT]);
    expect(option.legs[0].board.direction).toBe("vuelta");
    expect(option.legs[0].board.lng).toBeCloseTo(-65.3 + STEP * 7, 5);
    expect(option.legs[0].alight.lng).toBeCloseTo(-65.3 + STEP * 1, 5);
  });

  it("never rides against the order of the stops", () => {
    const oneWay: NetLine = { id: "B", stops: sequence("B", "ida", LAT, 10) };
    expect(plan([oneWay], [-65.3 + STEP * 7, LAT], [-65.3 + STEP * 1, LAT])).toEqual([]);
  });

  it("offers nothing when a stop is too far to walk", () => {
    expect(plan([eastWest], [-65.3, LAT + 0.02], [-65.3 + STEP * 7, LAT])).toEqual([]);
  });

  it("puts the line with less walking first and lists one option per line", () => {
    const farther: NetLine = { id: "C", stops: sequence("C", "ida", LAT + 0.004, 10) };
    const options = plan([farther, eastWest], [-65.3 + STEP * 1, LAT], [-65.3 + STEP * 7, LAT]);
    expect(options.map((o) => o.legs.map((l) => l.line).join(">"))).toEqual(["A", "C"]);
    expect(options[0].minutes).toBeLessThan(options[1].minutes);
  });

  it("ignores stops without an order", () => {
    const broken: NetLine = { id: "D", stops: sequence("D", "ida", LAT, 10).map((s) => ({ ...s, order: null })) };
    expect(plan([broken], [-65.3 + STEP * 1, LAT], [-65.3 + STEP * 7, LAT])).toEqual([]);
  });

  it("counts walking and riding, in minutes", () => {
    const [option] = plan([eastWest], [-65.3 + STEP * 1, LAT], [-65.3 + STEP * 7, LAT]);
    // About 2.8 km on the bus at 17 km/h is close to ten minutes.
    expect(option.minutes).toBeGreaterThan(8);
    expect(option.minutes).toBeLessThan(13);
  });
});

// A line running north from the eastern end of line A: the two meet at A's stop 8.
function northSouth(id: string, lng: number, count: number): NetLine {
  return {
    id,
    stops: Array.from({ length: count }, (_, i) => ({ id: `${id}-ida-${i + 1}`, name: `${id} ${i + 1}`, lat: LAT + STEP * i, lng, direction: "ida", order: i + 1 })),
  };
}

describe("plan with one change of bus", () => {
  const north = northSouth("N", -65.3 + STEP * 7, 10);
  const start: [number, number] = [-65.3 + STEP * 1, LAT];
  const end: [number, number] = [-65.3 + STEP * 7, LAT + STEP * 8];

  it("joins two lines when no single line makes the trip", () => {
    const options = plan([eastWest, north], start, end);
    expect(options).toHaveLength(1);
    const [option] = options;
    expect(option.legs.map((l) => l.line)).toEqual(["A", "N"]);
    expect(option.legs[0].board.id).toBe("A-ida-2");
    expect(option.legs[0].alight.id).toBe("A-ida-8");
    expect(option.legs[1].board.id).toBe("N-ida-1");
    expect(option.legs[1].alight.id).toBe("N-ida-9");
    expect(option.walkBetween).toBeLessThan(50);
  });

  it("adds the assumed wait for the second bus", () => {
    const [option] = plan([eastWest, north], start, end);
    const riding = (option.legs[0].ride + option.legs[1].ride) / 283;
    expect(option.minutes).toBeGreaterThan(riding + CHANGE_WAIT_MIN);
    expect(option.minutes).toBeLessThan(riding + CHANGE_WAIT_MIN + 3);
  });

  it("does not change where the two lines are too far apart to walk", () => {
    // Same street as N, but its first stop is 400 m north of line A: further than anyone changes on foot.
    const farNorth: NetLine = { id: "F", stops: north.stops.slice(1).map((s, i) => ({ ...s, id: `F-ida-${i + 1}`, order: i + 1 })) };
    expect(plan([eastWest, farNorth], start, end)).toEqual([]);
  });

  it("does not offer a change that is not clearly quicker than a direct line", () => {
    const options = plan([eastWest, north], start, [-65.3 + STEP * 7, LAT]);
    expect(options.map((o) => o.legs.length)).toEqual([1]);
  });

  it("never rides the second line against its order", () => {
    // The destination is south of where the lines meet, and N only runs north.
    expect(plan([eastWest, north], start, [-65.3 + STEP * 7, LAT - STEP * 6])).toEqual([]);
  });
});

describe("planWidening", () => {
  // About 1 km north of line A's stop 2.
  const farStart: [number, number] = [-65.3 + STEP * 1, LAT + 0.009];
  const end: [number, number] = [-65.3 + STEP * 7, LAT];

  it("keeps the usual walking distance when it is enough", () => {
    const found = planWidening([eastWest], [-65.3 + STEP * 1, LAT], end);
    expect(found.walk).toBe(700);
    expect(found.options).toHaveLength(1);
  });

  it("accepts a longer walk when the usual one finds nothing", () => {
    expect(plan([eastWest], farStart, end)).toEqual([]);
    const found = planWidening([eastWest], farStart, end);
    expect(found.walk).toBe(1200);
    expect(found.options[0].walkTo).toBeGreaterThan(900);
    expect(found.options[0].walkTo).toBeLessThan(1200);
  });

  it("gives up beyond two kilometres", () => {
    expect(planWidening([eastWest], [-65.3, LAT + 0.05], end).options).toEqual([]);
  });
});

describe("nearestStopMeters", () => {
  it("measures to the closest stop that has an order", () => {
    expect(nearestStopMeters([eastWest], [-65.3 + STEP * 1, LAT + 0.009])).toBeGreaterThan(950);
    expect(nearestStopMeters([eastWest], [-65.3 + STEP * 1, LAT + 0.009])).toBeLessThan(1050);
    const unordered: NetLine = { id: "U", stops: sequence("U", "ida", LAT + 0.009, 3).map((s) => ({ ...s, order: null })) };
    expect(nearestStopMeters([unordered], [-65.3, LAT + 0.009])).toBe(Infinity);
  });
});

describe("walkMinutes", () => {
  it("is about a quarter of an hour per kilometre", () => {
    const minutes = walkMinutes([-65.3, LAT], [-65.3, LAT + 0.009]);
    expect(minutes).toBeGreaterThan(13);
    expect(minutes).toBeLessThan(17);
  });
});
