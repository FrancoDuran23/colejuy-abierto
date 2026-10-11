import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFleet, fetchRoutes, parseLines } from "./santa-ana";
import { setFleetProvider } from "./fleet-provider";

afterEach(() => {
  setFleetProvider(null);
  vi.unstubAllEnvs();
});

describe("fleet provider", () => {
  it("default is empty and flagged unavailable", async () => {
    const f = await fetchFleet();
    expect(f.buses).toEqual([]);
    expect(f.unavailable).toBe("down");
  });
  it("FLEET_MOCK=1 returns mock buses for the requested lines", async () => {
    vi.stubEnv("FLEET_MOCK", "1");
    const f = await fetchFleet(["20", "21"]);
    expect(f.buses.map((b) => b.line)).toEqual(["20", "21"]);
  });
  it("a registered provider wins", async () => {
    setFleetProvider({ fetchFleet: async () => ({ updatedAt: "x", buses: [] }) });
    expect((await fetchFleet()).updatedAt).toBe("x");
  });
});

describe("static data", () => {
  it("parseLines accepts line and lines, dedupes, drops junk", () => {
    expect(parseLines(new URLSearchParams("line=20&lines=20,21,../x"))).toEqual(["20", "21"]);
  });
  it("routes come from the snapshot as [lng, lat]", async () => {
    const routes = await fetchRoutes();
    expect(routes.length).toBeGreaterThan(30);
    expect(routes[0].paths[0].coordinates[0][0]).toBeLessThan(-60);
  });
});
