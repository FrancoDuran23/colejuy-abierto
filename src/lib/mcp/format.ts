import type { LineFacts } from "../ask";
import type { Bus, Fleet, Stop } from "../santa-ana";
import { properName } from "../site";

// How tool answers are shaped: structuredContent for machines, markdown text for people.
// Also the error boundary: upstream failures get a "retry later" answer, bugs get reported as such.

// A failure of something outside this code: the source, the geocoder, or the network.
// Anything else reaching `guard` is a bug here, and the agent is told so instead of "retry".
export class UpstreamError extends Error {}

export async function upstream<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new UpstreamError(err instanceof Error ? err.message : String(err), { cause: err });
  }
}

// Machines read structuredContent; the text content is the human-readable answer, per the
// response-format guidance (markdown for readability, not a JSON dump).
export const ok = (data: Record<string, unknown>, text: string) => ({
  content: [{ type: "text" as const, text }],
  structuredContent: data,
});

export const fail = (message: string) => ({
  isError: true as const,
  content: [{ type: "text" as const, text: message }],
});

export async function guard<T>(fn: () => Promise<T>): Promise<T | ReturnType<typeof fail>> {
  try {
    return await fn();
  } catch (err) {
    console.error("mcp tool", err);
    return err instanceof UpstreamError
      ? fail("No pude consultar los datos ahora. Reintentá en un minuto; si sigue, la fuente puede estar caída.")
      : fail("Error interno al armar la respuesta; no es un problema de la fuente y reintentar no va a cambiarlo.");
  }
}

export const briefLine = (l: LineFacts) => ({ id: l.id, number: l.number, name: l.name, live: l.live, operator: l.operator });

export const busOut = (b: Bus) => ({
  id: b.id,
  number: b.number,
  line: b.line,
  lat: b.lat,
  lng: b.lng,
  speedKmh: b.speed,
  bearing: b.course,
  ramp: b.ramp,
  moving: b.moving,
  fresh: b.fresh,
  ageSeconds: b.age,
});

export const stopOut = (s: Stop) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, direction: s.direction, order: s.order });

// The fleet's own wording for a dead source: sign-in required, rate limited, or down.
export const fleetProblem = (fleet: Fleet) =>
  fleet.unavailable
    ? {
        auth: "La fuente pide sesión: falta SANTA_ANA_SESSION en el despliegue.",
        rate: "La fuente limitó los pedidos: conviene reintentar en unos minutos.",
        down: "La fuente no responde en este momento.",
      }[fleet.unavailable]
    : null;

export const md = {
  line: (l: { number: string; name: string; live: boolean; operator: string | null }) =>
    `${properName(l.name)}${l.live ? "" : ` (sin posición en vivo${l.operator ? `, ${l.operator}` : ""})`}`,
  bus: (b: { id: number; number: string | null; lat: number; lng: number; speedKmh: number; ageSeconds: number }) =>
    `coche ${b.number ?? b.id}: ${b.lat},${b.lng} · ${b.speedKmh} km/h · reporte de hace ${b.ageSeconds}s`,
  place: (p: { name: string; lat: number; lng: number }) => `${p.name} (${p.lat},${p.lng})`,
};
