import { describe, expect, it } from "vitest";
import { directionEnds, hasBothDirections, orderStops, routeStroke } from "./route";

const stop = (name: string, direction: string | null, order: number | null) => ({ name, direction, order });

describe("routeStroke", () => {
  it("draws the return dashed and the outbound solid, whatever order the paths arrived in", () => {
    const paths = [{ direction: "vuelta" }, { direction: "ida" }];
    expect(paths.map((p) => routeStroke(p.direction))).toEqual(["dashed", "solid"]);
  });

  it("keeps an unlabelled path solid", () => {
    expect(routeStroke("tramo 1")).toBe("solid");
  });
});

describe("hasBothDirections", () => {
  it("is true when ida and vuelta both exist, even as several pieces", () => {
    expect(hasBothDirections([{ direction: "vuelta" }, { direction: "vuelta" }, { direction: "ida" }])).toBe(true);
  });

  it("is false for a one-way route", () => {
    expect(hasBothDirections([{ direction: "ida" }, { direction: "ida" }])).toBe(false);
  });
});

describe("directionEnds", () => {
  it("names the first and last stop of the direction on screen", () => {
    const stops = [
      stop("Centro", "ida", 2),
      stop("Alto Comedero", "ida", 0),
      stop("Hospital", "ida", 1),
      stop("Centro", "vuelta", 0),
      stop("Alto Comedero", "vuelta", 1),
    ];
    expect(directionEnds(stops, "ida")).toBe("Alto Comedero → Centro");
    expect(directionEnds(stops, "vuelta")).toBe("Centro → Alto Comedero");
  });

  it("uses the only direction when none is selected", () => {
    expect(directionEnds([stop("Norte", "vuelta", 0), stop("Sur", "vuelta", 1)], null)).toBe("Norte → Sur");
  });

  it("keeps source order when the stops have no order number", () => {
    expect(directionEnds([stop("A", null, null), stop("B", null, null)], null)).toBe("A → B");
  });

  it("says nothing when the two ends are the same stop or there is only one", () => {
    expect(directionEnds([stop("Centro", "ida", 0)], "ida")).toBeNull();
    expect(directionEnds([stop("Centro", "ida", 0), stop("  Centro  ", "ida", 1)], "ida")).toBeNull();
  });
});

describe("orderStops", () => {
  // A street running east, about 100 m per step, and the same street back, one block north.
  const LAT = -24.19;
  const STEP = 0.001;
  const ida = { direction: "ida", coordinates: [0, 1, 2, 3, 4, 5].map((i): [number, number] => [-65.3 + STEP * i, LAT]) };
  const vuelta = { direction: "vuelta", coordinates: [5, 4, 3, 2, 1, 0].map((i): [number, number] => [-65.3 + STEP * i, LAT + 0.0009]) };
  const at = (name: string, direction: string | null, step: number, order: number | null, north = 0) => ({
    name,
    direction,
    order,
    lng: -65.3 + STEP * step,
    lat: (direction === "vuelta" ? LAT + 0.0009 : LAT) + north,
  });
  const names = (stops: { name: string }[]) => stops.map((s) => s.name);

  it("puts the stops in the order the bus reaches them, whatever number the source gave", () => {
    // The source numbers this direction backwards, as it does on line 15.
    const stops = [at("A", "ida", 0, 4), at("B", "ida", 1, 3), at("C", "ida", 3, 2), at("D", "ida", 5, 1)];
    expect(names(orderStops(stops, [ida, vuelta]))).toEqual(["A", "B", "C", "D"]);
  });

  it("gives a stop without a number its place on the route, not the end of the list", () => {
    const stops = [at("A", "ida", 0, 1), at("sin orden", "ida", 2, null), at("C", "ida", 3, 2), at("D", "ida", 5, 3)];
    expect(names(orderStops(stops, [ida, vuelta]))).toEqual(["A", "sin orden", "C", "D"]);
  });

  it("starts the vuelta where the ida ends, and numbers the whole line from 1", () => {
    const stops = [at("V lejos", "vuelta", 0, 9), at("I fin", "ida", 5, 2), at("V inicio", "vuelta", 5, 8), at("I inicio", "ida", 0, 1)];
    const ordered = orderStops(stops, [ida, vuelta]);
    expect(names(ordered)).toEqual(["I inicio", "I fin", "V inicio", "V lejos"]);
    expect(ordered.map((s) => s.order)).toEqual([1, 2, 3, 4]);
    expect(directionEnds(ordered, "ida")).toBe("I inicio → I fin");
    expect(directionEnds(ordered, "vuelta")).toBe("V inicio → V lejos");
  });

  it("never lets a stop that is off the route become the first or the last", () => {
    // 400 m north of the street, beyond its eastern end: its nearest point is the end of the route.
    const stops = [at("A", "ida", 0, 1), at("B", "ida", 3, 2), at("D", "ida", 5, 3), at("fuera", "ida", 6, 4, 0.0036)];
    const ordered = orderStops(stops, [ida, vuelta]);
    expect(names(ordered)[0]).toBe("A");
    expect(names(ordered)[3]).toBe("D");
    expect(names(ordered)).toContain("fuera");
  });

  it("falls back to the source's order when there is no route to measure against", () => {
    const stops = [at("segunda", "ida", 0, 2), at("primera", "ida", 5, 1), at("sin orden", "ida", 3, null)];
    expect(names(orderStops(stops, []))).toEqual(["primera", "segunda", "sin orden"]);
  });

  it("keeps every stop and does not change the ones it was given", () => {
    const stops = [at("A", "ida", 0, 7), at("B", "vuelta", 2, null), at("C", null, 1, 3)];
    const ordered = orderStops(stops, [ida, vuelta]);
    expect(ordered).toHaveLength(3);
    expect(stops.map((s) => s.order)).toEqual([7, null, 3]);
  });
});
