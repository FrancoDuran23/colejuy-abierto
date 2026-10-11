import { describe, expect, it } from "vitest";
import { fetchWalk, parsePoint, parseWalk, walkUrl } from "./walk";

const ok = { code: "Ok", routes: [{ distance: 120, duration: 90, geometry: { coordinates: [[-65.3, -24.18], [-65.301, -24.181], [-65.302, -24.182]] } }] };

describe("walk", () => {
  it("parses lng,lat and rejects the rest", () => {
    expect(parsePoint("-65.3,-24.18")).toEqual([-65.3, -24.18]);
    expect(parsePoint("x,1")).toBeNull();
    expect(parsePoint("200,1")).toBeNull();
    expect(parsePoint(null)).toBeNull();
  });
  it("builds the OSRM url", () => {
    expect(walkUrl([1, 2], [3, 4])).toBe("https://router.project-osrm.org/route/v1/foot/1,2;3,4?overview=full&geometries=geojson");
  });
  it("reads a route", () => {
    expect(parseWalk(ok)?.coordinates).toHaveLength(3);
    expect(parseWalk({ code: "NoRoute", routes: [] })).toBeNull();
  });
  it("fails so the caller can draw a straight line", async () => {
    await expect(fetchWalk([1, 2], [3, 4], (async () => new Response("", { status: 429 })) as typeof fetch)).rejects.toThrow();
    await expect(fetchWalk([1, 2], [3, 4], (async () => Response.json(ok)) as typeof fetch)).resolves.toMatchObject({ meters: 120 });
  });
});
