import { createMcpHandler } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bus, Line, LineRoute, Stop } from "./santa-ana";

// Line A runs east (ida) and back west (vuelta) on two parallel streets about 22 m apart, the case
// where the closest path says nothing and only the bus's heading tells the direction.
const LAT = -24.19;
const GAP = 0.0002;
const LNG0 = -65.32;
const STEP = 0.004;

const stops = (direction: "ida" | "vuelta"): Stop[] =>
  Array.from({ length: 6 }, (_, i) => ({
    id: `A-${direction}-${i + 1}`,
    name: `${direction} ${i + 1}`,
    lat: direction === "ida" ? LAT : LAT + GAP,
    lng: LNG0 + STEP * (direction === "ida" ? i : 5 - i),
    direction,
    order: i + 1,
  }));

const lineA: LineRoute = {
  id: "A",
  number: "A",
  name: "Linea A",
  color: null,
  operator: "Santa Ana",
  live: true,
  paths: [
    { direction: "ida", coordinates: [[LNG0, LAT], [LNG0 + STEP * 5, LAT]] },
    { direction: "vuelta", coordinates: [[LNG0 + STEP * 5, LAT + GAP], [LNG0, LAT + GAP]] },
  ],
};
const stopsA = [...stops("ida"), ...stops("vuelta")];

const LINES: Line[] = [
  { id: "A", number: "A", name: "Linea A", color: null, operator: "Santa Ana", live: true },
  { id: "2-peron", number: "2", name: "Linea 2 x Peron", color: null, operator: "Santa Ana", live: true },
  { id: "2-savio", number: "2", name: "Linea 2 x Savio", color: null, operator: "Santa Ana", live: true },
  { id: "muni-l001", number: "1", name: "Linea 1", color: null, operator: "El Urbano", live: false },
];

vi.mock("./lines", () => ({
  allLines: vi.fn(async () => LINES),
  lineDetail: vi.fn(async (id: string) => (id === "A" ? { line: lineA, stops: stopsA } : null)),
}));

const { apiOrigin, buildServer } = await import("./mcp");
const { SITE } = await import("./site");

const bus = (over: Partial<Bus>): Bus => ({
  id: 1, line: "A", number: "101", lat: LAT, lng: LNG0 + STEP, speed: 20, course: 90, ramp: false, moving: true, fresh: true, age: 10, ...over,
});

let fleet: unknown;
let routes: Record<string, () => Response>;

beforeEach(() => {
  fleet = { updatedAt: "2026-10-09T12:00:00Z", buses: [] };
  routes = {
    "/api/fleet": () => Response.json(fleet),
    "/api/geocode": () => Response.json({ places: [{ name: "Belgrano 900", lat: LAT + 0.001, lng: LNG0 + STEP * 3 }] }),
    "/api/network": () => Response.json({ lines: [{ id: "A", stops: stopsA }] }),
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (routes[new URL(url).pathname] ?? (() => new Response(null, { status: 404 })))()));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const handler = createMcpHandler(() => buildServer("https://colejuy.test"));

async function rpc(method: string, params: unknown) {
  const res = await handler.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const text = await res.text();
  const data = text.split("\n").find((l) => l.startsWith("data: "));
  return JSON.parse(data ? data.slice(6) : text);
}

// The fields the tests read; the output schemas themselves are enforced by the SDK on every call.
type Structured = {
  hint?: string;
  matches: { id: string }[];
  buses: { direction: string | null; nearestStop: { direction: string | null } }[];
  stops: { id: string; direction: string; walkMeters?: number; arrivals: { meters: number }[] }[];
  to: { label: string };
  options: { legs: { line: string }[] }[];
};
type ToolResult = { isError?: boolean; content: { text: string }[]; structuredContent: Structured };

async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const reply = await rpc("tools/call", { name, arguments: args });
  if (reply.error) throw new Error(JSON.stringify(reply.error));
  return reply.result;
}

describe("tools/list", () => {
  it("declares six read-only tools, each with an output schema", async () => {
    const { result } = await rpc("tools/list", {});
    expect(result.tools).toHaveLength(6);
    for (const tool of result.tools) {
      expect(tool.name).toMatch(/^colejuy_/);
      expect(tool.outputSchema).toBeDefined();
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    }
  });
});

describe("colejuy_bus_positions", () => {
  it("takes the direction from the heading, not the closest street", async () => {
    // Closer to the vuelta street, but heading east like the ida.
    fleet = { updatedAt: "now", buses: [bus({ lat: LAT + GAP * 0.75, course: 90, moving: true })] };
    const r = await call("colejuy_bus_positions", { line: "A" });
    expect(r.isError).toBeFalsy();
    const [b] = r.structuredContent.buses;
    expect(b.direction).toBe("ida");
    expect(b.nearestStop.direction).toBe("ida");
  });

  it("puts a stopped bus on the closest street, since its heading may be stale", async () => {
    fleet = { updatedAt: "now", buses: [bus({ lat: LAT + GAP * 0.75, course: 90, moving: false })] };
    const r = await call("colejuy_bus_positions", { line: "A" });
    expect(r.structuredContent.buses[0].direction).toBe("vuelta");
  });

  it("returns the options for an ambiguous line instead of failing", async () => {
    const r = await call("colejuy_bus_positions", { line: "2" });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.matches.map((m: { id: string }) => m.id)).toEqual(["2-peron", "2-savio"]);
  });

  it("says a line has no live positions rather than listing none", async () => {
    const r = await call("colejuy_bus_positions", { line: "muni-l001" });
    expect(r.structuredContent.hint).toMatch(/no tiene posición en vivo/);
  });
});

describe("colejuy_next_arrivals", () => {
  it("reports how far the stop is and the buses coming to it", async () => {
    fleet = { updatedAt: "now", buses: [bus({ lng: LNG0 + STEP * 0.5 })] };
    const r = await call("colejuy_next_arrivals", { line: "A", lat: LAT - 0.0005, lng: LNG0 + STEP * 3 });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.hint).toBeUndefined();
    const ida = r.structuredContent.stops.find((s) => s.direction === "ida")!;
    expect(ida.id).toBe("A-ida-4");
    expect(ida.walkMeters).toBeLessThan(100);
    expect(ida.arrivals).toHaveLength(1);
    expect(ida.arrivals[0].meters).toBeGreaterThan(900);
  });

  it("warns when the line does not pass near the point", async () => {
    const r = await call("colejuy_next_arrivals", { line: "A", lat: LAT - 0.05, lng: LNG0 });
    expect(r.structuredContent.hint).toMatch(/no pasa cerca/);
  });

  it("asks for a stop when it gets neither a stop nor a point", async () => {
    const r = await call("colejuy_next_arrivals", { line: "A" });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/stop_id/);
  });
});

describe("colejuy_plan_trip", () => {
  it("geocodes an address and returns options that match the output schema", async () => {
    const r = await call("colejuy_plan_trip", { from: `${LAT - 0.0003},${LNG0 + STEP * 0.2}`, to: "Belgrano 900" });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.to.label).toBe("Belgrano 900");
    expect(r.structuredContent.options[0].legs[0].line).toBe("A");
  });
});

describe("errors", () => {
  it("rejects an address longer than the geocoder accepts as bad input", async () => {
    const r = await call("colejuy_search_place", { q: "x".repeat(81) });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/validation/i);
  });

  it("blames the source when an upstream route fails", async () => {
    routes["/api/fleet"] = () => new Response(null, { status: 502 });
    const r = await call("colejuy_bus_positions", {});
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/fuente/);
  });

  it("does not blame the source for a bug of its own", async () => {
    fleet = { updatedAt: "now" };
    const r = await call("colejuy_bus_positions", {});
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/Error interno/);
  });
});

describe("apiOrigin", () => {
  it("reads from the deployment that got the request when it is this site", () => {
    expect(apiOrigin("http://localhost:3000/mcp")).toBe("http://localhost:3000");
    expect(apiOrigin(`${SITE}/mcp`)).toBe(SITE);
  });

  it("never fetches an origin taken from an untrusted Host header", () => {
    expect(apiOrigin("https://evil.example/mcp")).toBe(SITE);
    expect(apiOrigin(undefined)).toBe(SITE);
  });
});
