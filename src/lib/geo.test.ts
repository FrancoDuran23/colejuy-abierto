import { describe, expect, it } from "vitest";
import { angleBetween, distance, formatDistance, locate, type LngLat } from "./geo";

// Metres in one degree of latitude on the sphere geo.ts uses (R = 6371 km).
const DEG_LAT_M = 111194.93;
// Metres in one degree of longitude at the latitude of the city.
const degLngM = (lat: number) => DEG_LAT_M * Math.cos((lat * Math.PI) / 180);

const LNG = -65.3;

// Straight path heading due north, 0.02 degrees of latitude long (about 2224 m).
const NORTH: LngLat[] = [
  [LNG, -24.2],
  [LNG, -24.18],
];

describe("distance", () => {
  it("measures one degree of latitude as about 111.2 km", () => {
    const d = distance([LNG, -24.69], [LNG, -23.69]);
    expect(d / 1000).toBeCloseTo(111.2, 1);
  });

  it("is zero for the same point", () => {
    expect(distance([LNG, -24.19], [LNG, -24.19])).toBe(0);
  });

  it("is symmetric", () => {
    const a: LngLat = [-65.3, -24.19];
    const b: LngLat = [-65.31, -24.2];
    expect(distance(a, b)).toBeCloseTo(distance(b, a), 6);
  });

  it("shrinks a degree of longitude by the cosine of the latitude", () => {
    const d = distance([-65.3, -24.19], [-64.3, -24.19]);
    expect(d).toBeGreaterThan(degLngM(-24.19) * 0.999);
    expect(d).toBeLessThan(degLngM(-24.19) * 1.001);
    // About 101.4 km at this latitude, clearly less than 111.2 km.
    expect(d / 1000).toBeCloseTo(101.4, 0);
  });
});

describe("locate on a straight path", () => {
  it("returns null for a path with fewer than 2 points", () => {
    expect(locate([], [LNG, -24.19])).toBeNull();
    expect(locate([[LNG, -24.19]], [LNG, -24.19])).toBeNull();
  });

  it("places a point on the path at its distance from the start, with no offset", () => {
    const at = locate(NORTH, [LNG, -24.19]);
    expect(at).not.toBeNull();
    expect(at!.along).toBeCloseTo(0.01 * DEG_LAT_M, 0); // ~1112 m
    expect(at!.offset).toBeCloseTo(0, 3);
    expect(at!.bearing).toBeCloseTo(0, 6);
  });

  it("agrees with the haversine distance along the path", () => {
    const at = locate(NORTH, [LNG, -24.185]);
    expect(at!.along).toBeCloseTo(distance(NORTH[0], [LNG, -24.185]), 0);
  });

  it("clamps a point before the start to along 0 and reports the gap as offset", () => {
    const at = locate(NORTH, [LNG, -24.21]);
    expect(at!.along).toBe(0);
    expect(at!.offset).toBeCloseTo(0.01 * DEG_LAT_M, 0);
    expect(at!.bearing).toBeCloseTo(0, 6);
  });

  it("clamps a point past the end to the path length and reports the gap as offset", () => {
    const at = locate(NORTH, [LNG, -24.17]);
    expect(at!.along).toBeCloseTo(0.02 * DEG_LAT_M, 0); // ~2224 m
    expect(at!.offset).toBeCloseTo(0.01 * DEG_LAT_M, 0);
    expect(at!.bearing).toBeCloseTo(0, 6);
  });

  it("reports the perpendicular distance for a point beside the path", () => {
    const at = locate(NORTH, [LNG + 0.001, -24.19]);
    expect(at!.along).toBeCloseTo(0.01 * DEG_LAT_M, 0);
    expect(at!.offset).toBeCloseTo(0.001 * degLngM(-24.19), 0); // ~101 m
    expect(at!.bearing).toBeCloseTo(0, 6);
  });

  it("gives the same offset on either side of the path", () => {
    const east = locate(NORTH, [LNG + 0.001, -24.19]);
    const west = locate(NORTH, [LNG - 0.001, -24.19]);
    expect(east!.offset).toBeCloseTo(west!.offset, 3);
  });

  it("reports compass bearings for east, south and west", () => {
    const east = locate([[-65.31, -24.19], [-65.29, -24.19]], [-65.3, -24.19]);
    const south = locate([[LNG, -24.18], [LNG, -24.2]], [LNG, -24.19]);
    const west = locate([[-65.29, -24.19], [-65.31, -24.19]], [-65.3, -24.19]);
    expect(east!.bearing).toBeCloseTo(90, 6);
    expect(angleBetween(south!.bearing, 180)).toBeCloseTo(0, 6);
    expect(angleBetween(west!.bearing, 270)).toBeCloseTo(0, 6);
  });

  it("measures along from the start of the path, so a reversed path mirrors it", () => {
    const reversed: LngLat[] = [NORTH[1], NORTH[0]];
    const p: LngLat = [LNG, -24.195];
    const fwd = locate(NORTH, p);
    const back = locate(reversed, p);
    expect(fwd!.along).toBeCloseTo(0.005 * DEG_LAT_M, 0);
    expect(back!.along).toBeCloseTo(0.015 * DEG_LAT_M, 0);
  });
});

describe("locate on a path with several segments", () => {
  // North for ~1112 m, then east for ~1014 m.
  const BENT: LngLat[] = [
    [LNG, -24.2],
    [LNG, -24.19],
    [LNG + 0.01, -24.19],
  ];

  it("accumulates the length of earlier segments", () => {
    const at = locate(BENT, [LNG + 0.005, -24.19]);
    expect(at!.along).toBeCloseTo(0.01 * DEG_LAT_M + 0.005 * degLngM(-24.19), 0);
    expect(at!.offset).toBeCloseTo(0, 3);
    expect(at!.bearing).toBeCloseTo(90, 6);
  });

  it("uses the bearing of the segment the point is closest to", () => {
    const at = locate(BENT, [LNG, -24.195]);
    expect(at!.bearing).toBeCloseTo(0, 6);
    expect(at!.along).toBeCloseTo(0.005 * DEG_LAT_M, 0);
  });

  it("ignores a repeated point instead of producing NaN", () => {
    const dup: LngLat[] = [NORTH[0], NORTH[0], NORTH[1]];
    const at = locate(dup, [LNG, -24.19]);
    expect(at!.along).toBeCloseTo(0.01 * DEG_LAT_M, 0);
    expect(Number.isNaN(at!.bearing)).toBe(false);
  });

  it("returns null when every point is the same", () => {
    expect(locate([NORTH[0], NORTH[0]], [LNG, -24.19])).toBeNull();
  });
});

describe("angleBetween", () => {
  it("wraps around north: 350 vs 10 is 20", () => {
    expect(angleBetween(350, 10)).toBe(20);
    expect(angleBetween(10, 350)).toBe(20);
  });

  it("is 0 for equal angles and 180 for opposite ones", () => {
    expect(angleBetween(90, 90)).toBe(0);
    expect(angleBetween(0, 180)).toBe(180);
    expect(angleBetween(270, 90)).toBe(180);
  });

  it("handles negative bearings as atan2 returns them", () => {
    expect(angleBetween(-90, 270)).toBe(0);
    expect(angleBetween(-170, 170)).toBe(20);
  });

  it("never exceeds 180", () => {
    for (let a = -360; a <= 720; a += 37) {
      for (let b = -360; b <= 720; b += 41) {
        const d = angleBetween(a, b);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe("formatDistance", () => {
  it("rounds to 10 m under 1 km", () => {
    expect(formatDistance(234)).toBe("230 m");
    expect(formatDistance(236)).toBe("240 m");
    expect(formatDistance(550)).toBe("550 m");
  });

  it("never shows less than 10 m", () => {
    expect(formatDistance(0)).toBe("10 m");
    expect(formatDistance(3)).toBe("10 m");
  });

  it("uses a comma decimal and km from 1 km up", () => {
    expect(formatDistance(1000)).toBe("1,0 km");
    expect(formatDistance(1234)).toBe("1,2 km");
    expect(formatDistance(12860)).toBe("12,9 km");
  });

  it("does not show 1000 m just below the kilometre", () => {
    // 995-999 m rounds to the nearest 10 m, which is 1000: it should read as 1,0 km.
    expect(formatDistance(996)).toBe("1,0 km");
    expect(formatDistance(999.6)).toBe("1,0 km");
  });
});
