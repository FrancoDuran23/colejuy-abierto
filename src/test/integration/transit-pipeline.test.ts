import { describe, expect, it } from "vitest";
import {
  alongRoute,
  arrivals,
  labelPaths,
  nearestStopAhead,
  resolveEta,
} from "@/lib/eta";
import { plan, WALK_M_PER_MIN, type NetLine } from "@/lib/plan";
import {
  fetchRoutes,
  fetchStops,
  type Bus,
  type Stop,
} from "@/lib/santa-ana";
import { fetchWalk } from "@/lib/walk";
import { parseAsk, matchLines, chooseNearest, type GeoPoint } from "@/lib/ask";

describe("Transit Pipeline - End-to-End Route & Stops Loading", () => {
  it("loads actual snapshot transit lines with paths in San Salvador de Jujuy", async () => {
    const routes = await fetchRoutes();
    expect(routes.length).toBeGreaterThan(0);

    const line2 = routes.find((r) => r.id === "2-peron");
    expect(line2).toBeDefined();
    expect(line2?.name).toBeTruthy();
    expect(line2?.paths.length).toBeGreaterThanOrEqual(1);

    // Coordinates should be in San Salvador de Jujuy bbox:
    // Longitude roughly -65.40 to -65.20, Latitude roughly -24.30 to -24.10
    const firstCoord = line2!.paths[0].coordinates[0];
    expect(firstCoord[0]).toBeLessThan(-65.1);
    expect(firstCoord[0]).toBeGreaterThan(-65.45);
    expect(firstCoord[1]).toBeLessThan(-24.1);
    expect(firstCoord[1]).toBeGreaterThan(-24.35);
  });

  it("loads and validates stops for active transit lines", async () => {
    const stops = await fetchStops("2-peron");
    expect(stops.length).toBeGreaterThan(5);

    for (const stop of stops) {
      expect(stop.id).toBeTruthy();
      expect(stop.name).toBeTruthy();
      expect(stop.lat).toBeLessThan(-24.1);
      expect(stop.lat).toBeGreaterThan(-24.35);
      expect(stop.lng).toBeLessThan(-65.1);
      expect(stop.lng).toBeGreaterThan(-65.45);
    }

    // Direction labeling
    const idaStops = stops.filter((s) => s.direction === "ida");
    const vueltaStops = stops.filter((s) => s.direction === "vuelta");
    expect(idaStops.length + vueltaStops.length).toBeGreaterThan(0);
  });
});

describe("Transit Pipeline - Real-time Bus Tracking & ETA Predictions", () => {
  it("predicts bus arrival time and remaining distance to stop along the path", async () => {
    const routes = await fetchRoutes();
    const line = routes.find((r) => r.id === "2-peron")!;
    const stops = await fetchStops("2-peron");
    const labeledPaths = labelPaths(line.paths, stops);

    // Find a stop on the first path
    const targetPath = labeledPaths[0];
    const midIdx = Math.floor(targetPath.coordinates.length / 2);
    const targetCoord = targetPath.coordinates[midIdx];

    const targetStop: Stop = {
      id: "stop-test-target",
      name: "Parada Test",
      lat: targetCoord[1],
      lng: targetCoord[0],
      direction: targetPath.direction,
      order: 10,
    };

    // Place a bus earlier along the same path (e.g. at index midIdx - 10)
    const upstreamIdx = Math.max(0, midIdx - 10);
    const busCoord = targetPath.coordinates[upstreamIdx];

    const bus: Bus = {
      id: "bus-test-1",
      line: "2-peron",
      lat: busCoord[1],
      lng: busCoord[0],
      speed: 25,
      course: null,
      ramp: true,
      moving: true,
      fresh: true,
      age: 5,
    };

    const eta = alongRoute(labeledPaths, targetStop, bus);
    expect(eta).not.toBeNull();
    if (eta?.kind === "coming") {
      expect(eta.meters).toBeGreaterThan(0);
      expect(eta.minutes).toBeGreaterThan(0);
    }
  });

  it("ranks arrivals chronologically by arrival distance", async () => {
    const routes = await fetchRoutes();
    const line = routes.find((r) => r.id === "2-peron")!;
    const stops = await fetchStops("2-peron");
    const labeledPaths = labelPaths(line.paths, stops);
    const targetPath = labeledPaths[0];

    const targetIdx = Math.min(targetPath.coordinates.length - 1, 30);
    const stopCoord = targetPath.coordinates[targetIdx];

    const testStop: Stop = {
      id: "test-stop",
      name: "Parada Central",
      lat: stopCoord[1],
      lng: stopCoord[0],
      direction: targetPath.direction,
      order: 15,
    };

    // Bus A: closer (targetIdx - 5)
    const busA: Bus = {
      id: "bus-a",
      line: "2-peron",
      lat: targetPath.coordinates[Math.max(0, targetIdx - 5)][1],
      lng: targetPath.coordinates[Math.max(0, targetIdx - 5)][0],
      speed: 20,
      course: null,
      ramp: false,
      moving: true,
      fresh: true,
      age: 2,
    };

    // Bus B: further away (targetIdx - 15)
    const busB: Bus = {
      id: "bus-b",
      line: "2-peron",
      lat: targetPath.coordinates[Math.max(0, targetIdx - 15)][1],
      lng: targetPath.coordinates[Math.max(0, targetIdx - 15)][0],
      speed: 20,
      course: null,
      ramp: true,
      moving: true,
      fresh: true,
      age: 2,
    };

    const result = arrivals(labeledPaths, testStop, [busB, busA]);
    expect(result.length).toBe(2);
    // Bus A must arrive before Bus B
    expect(result[0].bus.id).toBe("bus-a");
    expect(result[1].bus.id).toBe("bus-b");
    expect(result[0].meters).toBeLessThan(result[1].meters);
  });

  it("handles bus that has already passed the stop", async () => {
    const routes = await fetchRoutes();
    const line = routes.find((r) => r.id === "2-peron")!;
    const stops = await fetchStops("2-peron");
    const labeledPaths = labelPaths(line.paths, stops);
    const targetPath = labeledPaths[0];

    const stopCoord = targetPath.coordinates[10];
    const testStop: Stop = {
      id: "passed-stop",
      name: "Parada Atrás",
      lat: stopCoord[1],
      lng: stopCoord[0],
      direction: targetPath.direction,
      order: 5,
    };

    // Place bus further ahead on route (index 20)
    const aheadBus: Bus = {
      id: "bus-ahead",
      line: "2-peron",
      lat: targetPath.coordinates[20][1],
      lng: targetPath.coordinates[20][0],
      speed: 20,
      course: null,
      ramp: false,
      moving: true,
      fresh: true,
      age: 3,
    };

    const status = alongRoute(labeledPaths, testStop, aheadBus);
    expect(status?.kind).toBe("passed");
  });

  it("resolves ETA for user selection vs automatic location-based stop", async () => {
    const routes = await fetchRoutes();
    const line = routes.find((r) => r.id === "2-peron")!;
    const stops = await fetchStops("2-peron");
    const labeledPaths = labelPaths(line.paths, stops);

    const bus: Bus = {
      id: "bus-loc",
      line: "2-peron",
      lat: labeledPaths[0].coordinates[5][1],
      lng: labeledPaths[0].coordinates[5][0],
      speed: 20,
      course: null,
      ramp: false,
      moving: true,
      fresh: true,
      age: 1,
    };

    // Case 1: user selected stop
    const chosenStop = stops[0];
    const resChosen = resolveEta(labeledPaths, stops, bus, chosenStop, null);
    expect(resChosen.kind).toBeDefined();

    // Case 2: no chosen stop, infer from user coordinates
    const userLocation: [number, number] = [stops[0].lng, stops[0].lat];
    const resInferred = resolveEta(labeledPaths, stops, bus, null, userLocation);
    expect(["ready", "pick", "off-route"]).toContain(resInferred.kind);

    const ahead = nearestStopAhead(labeledPaths, stops, bus, userLocation);
    expect(ahead).toBeDefined();
  });
});

describe("Transit Pipeline - Multimodal Trip Planning & Walking Geometry", () => {
  it("calculates realistic trip plans with walking and transit legs", async () => {
    const routes = await fetchRoutes();
    // Build network
    const netLines: NetLine[] = [];
    for (const r of routes.slice(0, 8)) {
      const stops = await fetchStops(r.id);
      netLines.push({
        id: r.id,
        stops: stops.map((s) => ({
          id: s.id,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          direction: s.direction,
          order: s.order,
        })),
        live: r.live,
      });
    }

    // Pick two stops from the first line that are separated
    const firstLineStops = netLines[0].stops.filter((s) => s.order !== null);
    expect(firstLineStops.length).toBeGreaterThan(5);

    const originStop = firstLineStops[1];
    const destStop = firstLineStops[Math.min(firstLineStops.length - 1, 6)];

    const origin: [number, number] = [originStop.lng, originStop.lat];
    const dest: [number, number] = [destStop.lng, destStop.lat];

    const options = plan(netLines, origin, dest);
    expect(options.length).toBeGreaterThan(0);

    const best = options[0];
    expect(best.legs.length).toBeGreaterThanOrEqual(1);
    expect(best.minutes).toBeGreaterThan(0);
    expect(best.walkTo).toBeGreaterThanOrEqual(0);
    expect(best.walkFrom).toBeGreaterThanOrEqual(0);

    // Verify walking leg route resolution via walk client
    const walk = await fetchWalk(origin, [best.legs[0].board.lng, best.legs[0].board.lat], async () =>
      Response.json({
        code: "Ok",
        routes: [
          {
            distance: best.walkTo,
            duration: Math.round((best.walkTo / WALK_M_PER_MIN) * 60),
            geometry: {
              coordinates: [
                origin,
                [best.legs[0].board.lng, best.legs[0].board.lat],
              ],
            },
          },
        ],
      })
    );
    expect(walk.coordinates.length).toBe(2);
    expect(walk.meters).toBe(best.walkTo);
  });
});

describe("Transit Pipeline - Natural Language Query & Stop Matching", () => {
  it("parses user natural language intent for bus numbers and stops", () => {
    const parsed1 = parseAsk("avisame cuando pase el 2");
    expect(parsed1?.query).toBe("2");
    expect(parsed1?.minutes).toBe(5);

    const parsed2 = parseAsk("cuando viene la linea 49 bis");
    expect(parsed2?.query).toBe("49 bis");

    const parsed3 = parseAsk("avisame a los 10 min cuando pase el 41");
    expect(parsed3?.minutes).toBe(10);
    expect(parsed3?.query).toBe("41");

    const matched = matchLines(
      [
        { id: "2-peron", number: "2", name: "Línea 2", live: true, operator: "Santa Ana" },
        { id: "49", number: "49", name: "Línea 49", live: false, operator: "El Urbano" },
      ],
      "2"
    );
    expect(matched.length).toBe(1);
    expect(matched[0].id).toBe("2-peron");
  });

  it("finds closest stop given user GPS coordinates", () => {
    const stops: Stop[] = [
      { id: "s1", name: "Parada Plaza", lat: -24.185, lng: -65.301, direction: "ida", order: 1 },
      { id: "s2", name: "Parada Belgrano", lat: -24.188, lng: -65.304, direction: "ida", order: 2 },
      { id: "s3", name: "Parada Terminal", lat: -24.195, lng: -65.310, direction: "ida", order: 3 },
    ];

    const userLoc: GeoPoint = { lat: -24.1851, lng: -65.3012 };
    const choice = chooseNearest(stops, userLoc, new Set());

    expect(choice.kind).toBe("one");
    if (choice.kind === "one") {
      expect(choice.near.stop.id).toBe("s1");
      expect(choice.near.meters).toBeLessThan(50);
    }
  });
});
