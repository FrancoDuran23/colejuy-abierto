import { describe, expect, it } from "vitest";
import { ridePath, routeStroke } from "./route";
import { snapshotStops } from "./santa-ana";
import snapshot from "../data/santa-ana-stops.json";

// An L-shaped route going north then east, and its way back.
const IDA: [number, number][] = [[-65.3, -24.2], [-65.3, -24.19], [-65.3, -24.18], [-65.29, -24.18], [-65.28, -24.18]];
const VUELTA: [number, number][] = [...IDA].reverse().map(([x, y]) => [x + 0.0005, y - 0.0005]);
const paths = [{ direction: "ida", coordinates: IDA }, { direction: "vuelta", coordinates: VUELTA }];

describe("ridePath", () => {
  it("follows the corner of the route instead of cutting across", () => {
    const out = ridePath(paths, [-65.3, -24.195], [-65.285, -24.18]);
    expect(out).toContainEqual([-65.3, -24.18]);
    expect(out.length).toBeGreaterThan(2);
  });

  it("picks the path the trip runs along even when its direction label is missing or wrong", () => {
    const out = ridePath(paths, [-65.2795, -24.1805], [-65.2995, -24.1995], "ida");
    expect(out).toContainEqual(VUELTA[2]);
  });

  it("starts at the boarding stop and ends at the alighting stop, even when they sit off the route", () => {
    const board: [number, number] = [-65.2998, -24.195];
    const alight: [number, number] = [-65.285, -24.1798];
    const out = ridePath(paths, board, alight);
    expect(out[0]).toEqual(board);
    expect(out[out.length - 1]).toEqual(alight);
  });

  it("joins the stops directly when the stretch is far longer than the trip expects", () => {
    const out = ridePath(paths, [-65.3, -24.2], [-65.28, -24.18], null, 100);
    expect(out).toEqual([[-65.3, -24.2], [-65.28, -24.18]]);
  });

  it("falls back to a straight line when no path fits", () => {
    expect(ridePath([], [1, 2], [3, 4])).toEqual([[1, 2], [3, 4]]);
  });
});

describe("walking legs", () => {
  it("are drawn dashed", () => {
    expect(routeStroke("walk0")).toBe("dashed");
    expect(routeStroke("leg0")).toBe("solid");
  });
});

describe("snapshot stops", () => {
  it("holds real stops for every Santa Ana line", () => {
    const ids = Object.keys(snapshot);
    expect(ids.length).toBe(38);
    const total = ids.reduce((n, id) => n + snapshotStops(id)!.length, 0);
    expect(total).toBe(2733);
    expect(snapshotStops("20")![0]).toMatchObject({ name: expect.any(String), direction: expect.stringMatching(/ida|vuelta/) });
  });
  it("is null for a line without snapshot", () => {
    expect(snapshotStops("muni-l001")).toBeNull();
  });
});
