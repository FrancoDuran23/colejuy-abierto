import { describe, expect, it } from "vitest";
import { HOLD_MS, holdFleet, liveText, noDataStatus } from "./fleet-hold";
import type { Bus, Fleet } from "./santa-ana";

const bus = { id: "1", line: "20" } as unknown as Bus;
const good: Fleet = { updatedAt: "x", buses: [bus] };
const empty: Fleet = { updatedAt: "x", buses: [] };
const rate: Fleet = { updatedAt: "x", buses: [], unavailable: "rate" };

describe("holdFleet", () => {
  it("keeps a good answer", () => expect(holdFleet(null, good, 5)).toEqual({ fleet: good, at: 5 }));
  it("holds the last good one when the next is empty or unavailable", () => {
    const g = { fleet: good, at: 0 };
    expect(holdFleet(g, empty, 1000)).toBe(g);
    expect(holdFleet(g, rate, HOLD_MS)).toBe(g);
  });
  it("drops it after 3 minutes", () => expect(holdFleet({ fleet: good, at: 0 }, rate, HOLD_MS + 1)).toBeNull());
  it("nothing to hold", () => expect(holdFleet(null, empty, 1)).toBeNull());
});

describe("noDataStatus", () => {
  it("updating within 3 min for empty, rate, down", () => {
    for (const f of [empty, rate, { ...rate, unavailable: "down" as const }]) expect(noDataStatus(f, 0, 60000)).toBe("updating");
  });
  it("none after 3 min", () => expect(noDataStatus(rate, 0, HOLD_MS + 1)).toBe("none"));
  it("auth is always none", () => expect(noDataStatus({ ...rate, unavailable: "auth" }, 0, 1000)).toBe("none"));
});

describe("liveText", () => {
  it("pluralises", () => {
    expect(liveText(1)).toBe("1 colectivo en vivo");
    expect(liveText(12)).toBe("12 colectivos en vivo");
  });
});
