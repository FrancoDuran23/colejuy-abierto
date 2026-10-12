import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { directionHeading, nearestByDirection, type LineFacts } from "./ask";
import { arrivals, busPath } from "./eta";
import { allLines, lineDetail } from "./lines";
import { planWidening, WALK_STEPS_M, type NetLine, type Option } from "./plan";
import { CITY, SITE } from "./site";
import type { Fleet, Stop } from "./santa-ana";
import { briefLine, busOut, fail, fleetProblem, guard, md, ok, stopOut, upstream } from "./mcp/format";
import { ambiguous, detailOf, notFound, resolveLine } from "./mcp/resolve";
import { BusOut, LineInput, LineOut, PlaceInput, PlaceOut, PointOut, readOnly, StopOut } from "./mcp/schemas";

// Read-only MCP surface over the same data the site serves. Live or heavy payloads (fleet,
// network, geocode) go through the deployment's own HTTP routes so agents share the CDN cache and
// Santa Ana still sees one request per window, however many agents are asking.
// Line routes and stops call the libs directly: they are already cached for a day.
// Helpers de respuesta/formato: ./mcp/format. Contratos zod: ./mcp/schemas. Resolver líneas: ./mcp/resolve.

const API_TIMEOUT_MS = 9000;
// Past the longest walk the trip planner accepts, the nearest stop is not really "near".
const FAR_STOP_M = WALK_STEPS_M[1];

// The routes are fetched from the deployment that received the request, so local runs and
// previews read their own data. Only hosts that are this site are trusted: anything else in the
// Host header falls back to SITE instead of making the server fetch an arbitrary origin.
export function apiOrigin(requestUrl?: string): string {
  if (!requestUrl) return SITE;
  const url = new URL(requestUrl);
  const trusted = [new URL(SITE).host, process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL];
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return local || trusted.includes(url.host) ? url.origin : SITE;
}

type Point = { lat: number; lng: number; label: string };

export function buildServer(origin: string = SITE): McpServer {
  // Previews behind Vercel's deployment protection answer 401 to their own fetch without this.
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const api = <T>(path: string): Promise<T> =>
    upstream(async () => {
      const res = await fetch(`${origin}${path}`, {
        headers: bypass ? { "x-vercel-protection-bypass": bypass } : {},
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      return res.json() as Promise<T>;
    });
  const getFleet = () => api<Fleet>("/api/fleet");
  const geocode = (q: string) => api<{ places: { name: string; lat: number; lng: number }[] }>(`/api/geocode?q=${encodeURIComponent(q)}`);

  // "lat,lng" passes through; anything else is an address the geocoder resolves.
  async function resolvePoint(input: string): Promise<Point | { error: string }> {
    const coords = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (coords) return { lat: Number(coords[1]), lng: Number(coords[2]), label: input.trim() };
    const { places } = await geocode(input.trim());
    if (!places.length) return { error: `No encontré "${input}". Probá con calle y altura, o con "lat,lng".` };
    return { lat: places[0].lat, lng: places[0].lng, label: places[0].name };
  }

  const server = new McpServer(
    { name: "colejuy", version: "1.0.0" },
    {
      instructions: `Colectivos urbanos de ${CITY}, Argentina. Todo es de solo lectura.
- "¿Dónde está la línea N?" → colejuy_bus_positions con line=N.
- "¿Cuándo pasa?" → colejuy_next_arrivals con la línea y una parada (stop_id de colejuy_line_detail) o un punto (lat,lng o dirección).
- "¿Cómo llego de A a B?" → colejuy_plan_trip; from y to aceptan "lat,lng" o una dirección en texto.
- Solo Santa Ana publica posiciones en vivo: El Urbano y la línea 26 tienen recorrido pero no llegadas.
- Los minutos son estimaciones (la fuente no publica horarios).`,
    },
  );

  server.registerTool(
    "colejuy_list_lines",
    {
      title: "Listar líneas",
      description: `Lista las líneas de colectivo de ${CITY}: número, nombre, empresa y si tienen posición en vivo (solo las de Santa Ana la tienen).`,
      outputSchema: z.object({ city: z.string(), lines: z.array(LineOut) }),
      annotations: readOnly,
    },
    () =>
      guard(async () => {
        const lines = await upstream(allLines);
        return ok(
          { city: CITY, lines: lines.map(briefLine) },
          `${lines.length} líneas en ${CITY}:\n${lines.map((l) => `- ${l.id} — ${md.line(l)}`).join("\n")}`,
        );
      }),
  );

  server.registerTool(
    "colejuy_line_detail",
    {
      title: "Detalle de una línea",
      description:
        "Recorrido y paradas de una línea, en el orden en que el colectivo las pasa. `line` acepta número (\"44\"), nombre o id. Las paradas llevan su sentido (ida/vuelta). `include_path` agrega la geometría completa del recorrido.",
      inputSchema: z.object({
        line: LineInput,
        include_path: z.boolean().optional().describe("Si es true, incluye las coordenadas del recorrido por sentido (puede ser largo)."),
      }),
      outputSchema: z.object({
        line: LineOut.optional(),
        directions: z.array(z.object({ direction: z.string(), points: z.number() })).optional(),
        stops: z.array(StopOut).optional(),
        paths: z.array(z.object({ direction: z.string(), coordinates: z.array(z.tuple([z.number(), z.number()])) })).optional(),
        error: z.string().optional(),
        hint: z.string().optional(),
        matches: z.array(LineOut).optional(),
      }),
      annotations: readOnly,
    },
    ({ line: query, include_path }) =>
      guard(async () => {
        const resolved = await resolveLine(query);
        if ("notFound" in resolved) return notFound(resolved.notFound);
        if ("matches" in resolved) return ambiguous(resolved.matches);
        const detail = await detailOf(resolved.line.id);
        if (!detail) return fail(`La línea ${resolved.line.id} no tiene detalle cargado.`);
        const stopsByDir = new Map<string | null, Stop[]>();
        for (const s of detail.stops) stopsByDir.set(s.direction, [...(stopsByDir.get(s.direction) ?? []), s]);
        const text = [
          `${md.line(resolved.line)} — ${detail.stops.length} paradas`,
          ...[...stopsByDir.entries()].map(
            ([dir, stops]) => `\n**${dir ?? "sin sentido"}** (hacia ${directionHeading(detail.stops, dir)}):\n${stops.map((s) => `- ${s.name} (\`${s.id}\`)`).join("\n")}`,
          ),
        ].join("\n");
        return ok(
          {
            line: briefLine(resolved.line),
            directions: detail.line.paths.map((p) => ({ direction: p.direction, points: p.coordinates.length })),
            stops: detail.stops.map(stopOut),
            ...(include_path ? { paths: detail.line.paths } : {}),
          },
          text,
        );
      }),
  );

  server.registerTool(
    "colejuy_bus_positions",
    {
      title: "Posiciones en vivo",
      description:
        "Dónde está cada colectivo con señal ahora. Sin `line` devuelve toda la flota; con `line` filtra por línea y anota el sentido en que va cada coche (según su rumbo) y la parada más cercana de ese sentido. La edad del reporte está en `ageSeconds`.",
      inputSchema: z.object({
        line: LineInput.optional().describe("Número, nombre o id de la línea. Ej: \"44\". Si se omite, devuelve toda la flota."),
      }),
      outputSchema: z.object({
        updatedAt: z.string().optional(),
        unavailable: z.enum(["auth", "rate", "down"]).optional(),
        hint: z.string().optional(),
        line: LineOut.optional(),
        error: z.string().optional(),
        matches: z.array(LineOut).optional(),
        buses: z
          .array(
            BusOut.extend({
              direction: z.string().nullable().optional(),
              nearestStop: z.object({ id: z.string(), name: z.string(), meters: z.number(), direction: z.string().nullable() }).optional(),
            }),
          )
          .optional(),
      }),
      annotations: readOnly,
    },
    ({ line: query }) =>
      guard(async () => {
        const fleet = await getFleet();
        const problem = fleetProblem(fleet);
        if (problem) return ok({ updatedAt: fleet.updatedAt, unavailable: fleet.unavailable, hint: problem, buses: [] }, problem);

        let line: LineFacts | null = null;
        let detail: Awaited<ReturnType<typeof lineDetail>> = null;
        if (query) {
          const resolved = await resolveLine(query);
          if ("notFound" in resolved) return notFound(resolved.notFound);
          if ("matches" in resolved) return ambiguous(resolved.matches);
          line = resolved.line;
          if (!line.live) return ok({ line: briefLine(line), buses: [], hint: "Esta línea no tiene posición en vivo." }, `${md.line(line)} no tiene posición en vivo.`);
          detail = await detailOf(line.id);
        }

        const buses = fleet.buses
          .filter((b) => !line || b.line === line.id)
          .map((b) => {
            if (!detail) return busOut(b);
            // The stop is looked up among the stops of the direction the bus is going: the nearest
            // stop of the other direction is across the street and says nothing about where it is.
            const path = busPath(detail.line.paths, b);
            const own = path ? detail.stops.filter((s) => s.direction === path.direction) : [];
            const [near] = nearestByDirection(own.length ? own : detail.stops, { lat: b.lat, lng: b.lng });
            return {
              ...busOut(b),
              direction: path?.direction ?? null,
              ...(near ? { nearestStop: { id: near.stop.id, name: near.stop.name, meters: Math.round(near.meters), direction: near.stop.direction } } : {}),
            };
          });
        const text = buses.length
          ? buses
              .map((b) => {
                const extra = "direction" in b ? `${b.direction ? ` · sentido ${b.direction}` : " · fuera del recorrido"}${b.nearestStop ? ` · a ${b.nearestStop.meters} m de ${b.nearestStop.name}` : ""}` : "";
                return `- ${md.bus(b)}${extra}`;
              })
              .join("\n")
          : "No hay coches con señal ahora.";
        return ok({ updatedAt: fleet.updatedAt, ...(line ? { line: briefLine(line) } : {}), buses }, `${line ? `${md.line(line)} — ` : ""}${buses.length} en circulación:\n${text}`);
      }),
  );

  server.registerTool(
    "colejuy_next_arrivals",
    {
      title: "Cuándo pasa el próximo",
      description:
        "Colectivos de una línea que vienen hacia una parada y en cuántos minutos (estimación). La parada se da por `stop_id` (de colejuy_line_detail) o por un punto (`lat`+`lng`, o `place` con una dirección): en ese caso se toma la parada más cercana de cada sentido y se informa a cuántos metros queda.",
      inputSchema: z.object({
        line: LineInput,
        stop_id: z.string().max(80).optional().describe("Id de la parada, de colejuy_line_detail."),
        lat: z.number().min(-90).max(90).optional().describe("Latitud para buscar la parada más cercana."),
        lng: z.number().min(-180).max(180).optional().describe("Longitud para buscar la parada más cercana."),
        place: PlaceInput.optional().describe("Dirección a buscar (calle y altura) si no hay stop_id ni lat/lng."),
      }),
      outputSchema: z.object({
        line: LineOut.optional(),
        from: PointOut.optional(),
        updatedAt: z.string().optional(),
        hint: z.string().optional(),
        error: z.string().optional(),
        matches: z.array(LineOut).optional(),
        stops: z
          .array(
            StopOut.extend({
              heading: z.string(),
              walkMeters: z.number().optional(),
              arrivals: z.array(z.object({ minutes: z.number(), meters: z.number(), bus: BusOut })),
            }),
          )
          .optional(),
      }),
      annotations: readOnly,
    },
    ({ line: query, stop_id, lat, lng, place }) =>
      guard(async () => {
        const resolved = await resolveLine(query);
        if ("notFound" in resolved) return notFound(resolved.notFound);
        if ("matches" in resolved) return ambiguous(resolved.matches);
        const line = resolved.line;
        if (!line.live) return ok({ line: briefLine(line), hint: "Esta línea no tiene posición en vivo, no hay llegadas estimadas.", stops: [] }, `${md.line(line)} no tiene posición en vivo.`);

        const detail = await detailOf(line.id);
        if (!detail || !detail.stops.length) return ok({ line: briefLine(line), hint: "Esta línea no tiene paradas cargadas.", stops: [] }, `${md.line(line)} no tiene paradas cargadas.`);

        // The stop can be named directly or found from a point.
        let candidates: { stop: Stop; meters?: number }[];
        let from: Point | null = null;
        if (stop_id) {
          const stop = detail.stops.find((s) => s.id === stop_id);
          if (!stop) return fail(`La parada "${stop_id}" no es de la línea ${line.number}.`);
          candidates = [{ stop }];
        } else {
          const point = place !== undefined ? await resolvePoint(place) : lat !== undefined && lng !== undefined ? { lat, lng, label: `${lat},${lng}` } : null;
          if (!point) return fail("Falta la parada: pasá `stop_id`, `lat`+`lng` o `place`.");
          if ("error" in point) return fail(point.error);
          from = point;
          candidates = nearestByDirection(detail.stops, point);
        }
        const nearest = candidates[0]?.meters;
        const far = nearest !== undefined && nearest > FAR_STOP_M ? `La parada más cercana de la línea ${line.number} queda a ${Math.round(nearest)} m: esta línea no pasa cerca de ese punto.` : null;

        const fleet = await getFleet();
        const problem = fleetProblem(fleet);
        const hint = [far, problem].filter(Boolean).join(" ") || undefined;
        const buses = fleet.buses.filter((b) => b.line === line.id);
        const stops = candidates.map(({ stop, meters }) => ({
          ...stopOut(stop),
          heading: directionHeading(detail.stops, stop.direction),
          ...(meters !== undefined ? { walkMeters: Math.round(meters) } : {}),
          arrivals: problem ? [] : arrivals(detail.line.paths, stop, buses).map((a) => ({
            minutes: Math.round(a.minutes),
            meters: Math.round(a.meters),
            bus: busOut(a.bus),
          })),
        }));
        const text = stops
          .map((s) => {
            const arr = s.arrivals.length ? s.arrivals.map((a) => `~${a.minutes} min (coche ${a.bus.number ?? a.bus.id}, a ${a.meters} m)`).join(", ") : "sin coches en camino";
            return `- ${s.name || s.id} (hacia ${s.heading})${s.walkMeters !== undefined ? `, a ${s.walkMeters} m del punto` : ""}: ${arr}`;
          })
          .join("\n");
        return ok(
          { line: briefLine(line), ...(from ? { from } : {}), updatedAt: fleet.updatedAt, ...(hint ? { hint } : {}), stops },
          `${md.line(line)}${from ? ` cerca de ${from.label}` : ""}:\n${hint ? `${hint}\n` : ""}${text}`,
        );
      }),
  );

  server.registerTool(
    "colejuy_search_place",
    {
      title: "Buscar dirección",
      description: `Busca una dirección o lugar en ${CITY} y alrededores y devuelve candidatos con coordenadas.`,
      inputSchema: z.object({
        q: PlaceInput.describe("Dirección o lugar a buscar. Ej: \"Belgrano 900\"."),
      }),
      outputSchema: z.object({ places: z.array(PlaceOut) }),
      annotations: readOnly,
    },
    ({ q }) =>
      guard(async () => {
        const { places } = await geocode(q.trim());
        return ok({ places }, places.length ? places.map((p) => `- ${md.place(p)}`).join("\n") : `Sin resultados para "${q}".`);
      }),
  );

  server.registerTool(
    "colejuy_plan_trip",
    {
      title: "Cómo llegar",
      description:
        "Qué línea tomar de un punto a otro: viaje directo o con un cambio, con la parada donde subir, donde bajar y cuánto se camina. `from` y `to` aceptan \"lat,lng\" o una dirección que se geocodifica. Los minutos son estimados.",
      inputSchema: z.object({
        from: PlaceInput.describe("Origen: \"lat,lng\" o dirección. Ej: \"-24.185,-65.299\" o \"Belgrano 900\"."),
        to: PlaceInput.describe("Destino: \"lat,lng\" o dirección."),
      }),
      outputSchema: z.object({
        from: PointOut.optional(),
        to: PointOut.optional(),
        walkMetersUsed: z.number().optional(),
        options: z
          .array(
            z.object({
              minutes: z.number(),
              walkToMeters: z.number(),
              walkBetweenMeters: z.number(),
              walkFromMeters: z.number(),
              legs: z.array(z.object({ line: z.string(), board: z.object({ name: z.string(), id: z.string() }), alight: z.object({ name: z.string(), id: z.string() }), rideMeters: z.number() })),
            }),
          )
          .optional(),
        hint: z.string().optional(),
      }),
      annotations: readOnly,
    },
    ({ from, to }) =>
      guard(async () => {
        // One after the other: Nominatim's policy is one request per second.
        const a = await resolvePoint(from);
        if ("error" in a) return fail(a.error);
        const b = await resolvePoint(to);
        if ("error" in b) return fail(b.error);

        const { lines } = await api<{ lines: NetLine[] }>("/api/network");
        const { options, walk } = planWidening(lines, [a.lng, a.lat], [b.lng, b.lat]);
        const legs = (o: Option) =>
          o.legs.map((l) => ({ line: l.line, board: { name: l.board.name, id: l.board.id }, alight: { name: l.alight.name, id: l.alight.id }, rideMeters: Math.round(l.ride) }));
        const text = options.length
          ? options
              .map((o) => {
                const ride = o.legs.map((l) => `línea ${l.line}: ${l.board.name} → ${l.alight.name}`).join("; cambio en ");
                const walkBits = [o.walkTo, o.walkBetween, o.walkFrom].map((m) => Math.round(m)).filter((m) => m > 0).join(" + ");
                return `- ~${Math.round(o.minutes)} min · ${ride} · ${walkBits} m a pie`;
              })
              .join("\n")
          : "No hay viaje con hasta 2 km de caminata.";
        return ok(
          {
            from: a,
            to: b,
            walkMetersUsed: walk,
            options: options.map((o) => ({
              minutes: Math.round(o.minutes),
              walkToMeters: Math.round(o.walkTo),
              walkBetweenMeters: Math.round(o.walkBetween),
              walkFromMeters: Math.round(o.walkFrom),
              legs: legs(o),
            })),
            ...(options.length ? {} : { hint: "No hay viaje con hasta 2 km de caminata." }),
          },
          `De ${a.label} a ${b.label}:\n${text}`,
        );
      }),
  );

  return server;
}
