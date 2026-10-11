import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getLines } from "@/app/api/lines/route";
import { GET as getLineDetail } from "@/app/api/lines/[id]/route";
import { GET as getFleet } from "@/app/api/fleet/route";
import { GET as getGeocode } from "@/app/api/geocode/route";
import { GET as getWalk } from "@/app/api/walk/route";
import { GET as getNetwork } from "@/app/api/network/route";
import { OPTIONS as optionsFeedback, POST as postFeedback } from "@/app/api/feedback/route";
import { POST as postTelegramWebhook } from "@/app/api/telegram/webhook/route";
import { SourceError } from "@/lib/santa-ana";

describe("API Integration - Lines & Network", () => {
  it("GET /api/lines returns list of available transit lines", async () => {
    const res = await getLines();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("lines");
    expect(Array.isArray(data.lines)).toBe(true);
    expect(data.lines.length).toBeGreaterThan(0);

    // Validate schema of returned lines
    const sample = data.lines[0];
    expect(sample).toHaveProperty("id");
    expect(sample).toHaveProperty("name");
    expect(sample).toHaveProperty("operator");
    expect(sample).toHaveProperty("live");
    expect(typeof sample.id).toBe("string");
    expect(typeof sample.live).toBe("boolean");

    // Both tracked and municipal lines should be present
    const hasLive = data.lines.some((l: { live: boolean }) => l.live === true);
    const hasMunicipal = data.lines.some((l: { live: boolean }) => l.live === false);
    expect(hasLive).toBe(true);
    expect(hasMunicipal).toBe(true);
  });

  it("GET /api/lines/[id] returns line detail with stops and paths for valid line", async () => {
    const req = new Request("http://localhost:3000/api/lines/2-peron");
    const params = Promise.resolve({ id: "2-peron" });
    const res = await getLineDetail(req, { params });

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("public");

    const data = await res.json();
    expect(data).toHaveProperty("line");
    expect(data).toHaveProperty("stops");
    expect(data.line.id).toBe("2-peron");
    expect(Array.isArray(data.line.paths)).toBe(true);
    expect(Array.isArray(data.stops)).toBe(true);
    expect(data.stops.length).toBeGreaterThan(0);

    const firstStop = data.stops[0];
    expect(firstStop).toHaveProperty("id");
    expect(firstStop).toHaveProperty("name");
    expect(typeof firstStop.lat).toBe("number");
    expect(typeof firstStop.lng).toBe("number");
  });

  it("GET /api/lines/[id] returns 404 for unknown line", async () => {
    const req = new Request("http://localhost:3000/api/lines/inexistente-999");
    const params = Promise.resolve({ id: "inexistente-999" });
    const res = await getLineDetail(req, { params });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("line_not_found");
  });

  it("GET /api/network aggregates routes with stops for trip planning", async () => {
    const res = await getNetwork();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("lines");
    expect(Array.isArray(data.lines)).toBe(true);
    expect(data.lines.length).toBeGreaterThan(0);

    const netLine = data.lines[0];
    expect(netLine).toHaveProperty("id");
    expect(netLine).toHaveProperty("stops");
    expect(Array.isArray(netLine.stops)).toBe(true);
  });
});

describe("API Integration - Fleet & Live Positions", () => {
  const originalEnv = process.env.FLEET_MOCK;

  afterEach(() => {
    process.env.FLEET_MOCK = originalEnv;
    vi.restoreAllMocks();
  });

  it("GET /api/fleet returns live fleet payload with cache headers", async () => {
    const req = new Request("http://localhost:3000/api/fleet");
    const res = await getFleet(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("public");

    const data = await res.json();
    expect(data).toHaveProperty("updatedAt");
    expect(data).toHaveProperty("buses");
    expect(Array.isArray(data.buses)).toBe(true);
  });

  it("GET /api/fleet with FLEET_MOCK=1 generates mock buses along lines", async () => {
    process.env.FLEET_MOCK = "1";

    const req = new Request("http://localhost:3000/api/fleet");
    const res = await getFleet(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.buses.length).toBeGreaterThan(0);

    const bus = data.buses[0];
    expect(bus).toHaveProperty("id");
    expect(bus).toHaveProperty("line");
    expect(typeof bus.lat).toBe("number");
    expect(typeof bus.lng).toBe("number");
    expect(typeof bus.speed).toBe("number");
    expect(typeof bus.ramp).toBe("boolean");
    expect(typeof bus.fresh).toBe("boolean");
  });

  it("GET /api/fleet filters by requested lines", async () => {
    process.env.FLEET_MOCK = "1";

    const req = new Request("http://localhost:3000/api/fleet?line=2-peron");
    const res = await getFleet(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.buses.length).toBeGreaterThan(0);
    for (const b of data.buses) {
      expect(b.line).toBe("2-peron");
    }
  });

  it("GET /api/fleet handles source rate limits resiliently with cached refusal", async () => {
    const santaAna = await import("@/lib/santa-ana");
    vi.spyOn(santaAna, "fetchFleet").mockRejectedValueOnce(new SourceError("/positions", 429, 30));

    const req = new Request("http://localhost:3000/api/fleet");
    const res = await getFleet(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("public");

    const data = await res.json();
    expect(data.unavailable).toBe("rate");
    expect(data.buses).toEqual([]);
  });
});

describe("API Integration - Geocode & Walking Routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /api/geocode validates query length", async () => {
    const shortReq = new Request("http://localhost:3000/api/geocode?q=ab");
    const shortRes = await getGeocode(shortReq);
    expect(shortRes.status).toBe(400);
    expect((await shortRes.json()).error).toBe("bad_query");

    const emptyReq = new Request("http://localhost:3000/api/geocode");
    const emptyRes = await getGeocode(emptyReq);
    expect(emptyRes.status).toBe(400);

    const longReq = new Request(`http://localhost:3000/api/geocode?q=${"a".repeat(85)}`);
    const longRes = await getGeocode(longReq);
    expect(longRes.status).toBe(400);
  });

  it("GET /api/geocode returns formatted places from search service", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { lat: "-24.185", lon: "-65.299", display_name: "Plaza Belgrano, San Salvador de Jujuy, Jujuy, Argentina" },
          { lat: "-24.190", lon: "-65.305", display_name: "Terminal de Omnibus, General Savio, Jujuy, Argentina" },
        ]),
        { status: 200 },
      ),
    );

    const req = new Request("http://localhost:3000/api/geocode?q=Belgrano");
    const res = await getGeocode(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.places)).toBe(true);
    expect(data.places.length).toBe(2);
    expect(data.places[0].name).toContain("Plaza Belgrano");
    expect(data.places[0].lat).toBeCloseTo(-24.185);
    expect(data.places[0].lng).toBeCloseTo(-65.299);
  });

  it("GET /api/walk validates coordinates and returns routing geometry", async () => {
    // Missing coordinates
    const badReq = new Request("http://localhost:3000/api/walk?from=not-coords");
    const badRes = await getWalk(badReq);
    expect(badRes.status).toBe(400);

    // Mock OSRM route response
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "Ok",
          routes: [
            {
              distance: 350,
              duration: 270,
              geometry: {
                coordinates: [
                  [-65.305, -24.190],
                  [-65.302, -24.188],
                  [-65.299, -24.185],
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const req = new Request("http://localhost:3000/api/walk?from=-65.305,-24.190&to=-65.299,-24.185");
    const res = await getWalk(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.meters).toBe(350);
    expect(data.seconds).toBe(270);
    expect(data.coordinates.length).toBe(3);
  });
});

describe("API Integration - Feedback & Security Controls", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("OPTIONS /api/feedback handles CORS preflight correctly", async () => {
    const validReq = new Request("http://localhost:3000/api/feedback", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000", Host: "localhost:3000" },
    });
    const validRes = await optionsFeedback(validReq);
    expect(validRes.status).toBe(204);
    expect(validRes.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");

    const invalidReq = new Request("http://localhost:3000/api/feedback", {
      method: "OPTIONS",
      headers: { Origin: "https://sitio-malicioso.com", Host: "localhost:3000" },
    });
    const invalidRes = await optionsFeedback(invalidReq);
    expect(invalidRes.status).toBe(403);
  });

  it("POST /api/feedback enforces same-origin protection", async () => {
    const crossReq = new Request("http://localhost:3000/api/feedback", {
      method: "POST",
      headers: {
        Origin: "https://sitio-malicioso.com",
        Host: "localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ topic: "problem", message: "Probando feedback" }),
    });

    const crossRes = await postFeedback(crossReq);
    expect(crossRes.status).toBe(403);
    const data = await crossRes.json();
    expect(data.error).toBe("same_origin_required");
  });

  it("POST /api/feedback validates input schema and honeypot field", async () => {
    // Message too short
    const shortReq = new Request("http://localhost:3000/api/feedback", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        Host: "localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ topic: "problem", message: "abc" }),
    });
    const shortRes = await postFeedback(shortReq);
    expect(shortRes.status).toBe(400);
    expect((await shortRes.json()).error).toBe("invalid_feedback");

    // Honeypot filled by bot
    const botReq = new Request("http://localhost:3000/api/feedback", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        Host: "localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ topic: "problem", message: "Mensaje válido pero con honeypot", website: "spam.com" }),
    });
    const botRes = await postFeedback(botReq);
    expect(botRes.status).toBe(400);
  });

  it("POST /api/feedback delivers feedback via webhook when configured", async () => {
    const originalWebhook = process.env.FEEDBACK_WEBHOOK_URL;
    process.env.FEEDBACK_WEBHOOK_URL = "https://webhook.site/test-feedback";

    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const req = new Request("http://localhost:3000/api/feedback", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        Host: "localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: "suggestion",
        message: "Agregar una parada en la esquina del hospital.",
        lineId: "2-peron",
        stopId: "123",
        page: "/",
      }),
    });

    const res = await postFeedback(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    process.env.FEEDBACK_WEBHOOK_URL = originalWebhook;
  });
});

describe("API Integration - Telegram Webhook", () => {
  const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  afterEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret;
  });

  it("POST /api/telegram/webhook validates secret token header", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "super-secret-token";

    const badReq = new Request("http://localhost:3000/api/telegram/webhook", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "wrong-token" },
      body: JSON.stringify({ update_id: 1 }),
    });
    const badRes = await postTelegramWebhook(badReq);
    expect(badRes.status).toBe(403);

    const goodReq = new Request("http://localhost:3000/api/telegram/webhook", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "super-secret-token" },
      body: JSON.stringify({ update_id: 1, message: { chat: { id: 123 }, text: "/start" } }),
    });
    const goodRes = await postTelegramWebhook(goodReq);
    expect(goodRes.status).toBe(200);
    expect((await goodRes.json()).ok).toBe(true);
  });
});
