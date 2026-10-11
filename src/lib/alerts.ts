import { formatDistance } from "./geo";

// One alert: tell this chat when a bus of the line is about to reach the stop. It fires once.
export type Alert = {
  chat: number;
  line: string;
  stop: string;
  lineName: string;
  stopName: string;
  // Warn when the nearest bus is this many minutes away, or fewer.
  minutes: number;
  created: number;
};

export const DEFAULT_MINUTES = 5;
export const MINUTE_CHOICES = [3, 5, 10];
export const MAX_PER_CHAT = 3;
// An alert nobody answered is dropped, so a forgotten one does not ring tomorrow.
export const EXPIRES_MS = 90 * 60 * 1000;

// A start link can also name just the line: "l_2-savio". Stop ids never contain "_", so the two
// cannot be confused. The bot then asks where the person is and picks the stop itself.
export function parseLine(payload: string): string | null {
  const match = /^l_([a-z0-9-]{1,40})$/.exec(payload);
  return match ? match[1] : null;
}

// The stop comes in the bot's start link. Telegram only allows letters, digits, "_" and "-" there.
// A stop id is its line id plus an eight-digit hash: "2-savio-903182a2".
export function parseStop(payload: string): { line: string; stop: string } | null {
  if (!/^[a-z0-9-]{1,40}-[0-9a-f]{8}$/.test(payload)) return null;
  return { line: payload.slice(0, -9), stop: payload };
}

// How fast buses really cover their routes, stops and lights included: the slow and the fast end.
// Measured on the live fleet (120 buses over six minutes, a Friday at 11:21): one in ten advanced
// under 11.8 km/h and one in ten over 31.3. Checked against 257 simulated alerts the same morning:
// a single figure of "5 minutes" was right within a minute for about half of them; a quarter of
// the buses arrived in under 3 minutes and a quarter took 6 or more.
const SLOW_KMH = 12;
const FAST_KMH = 31;
// Closer than this the bus is at the stop, whatever its speed.
export const ARRIVING_M = 150;

// The minutes a bus that far away may take, as whole minutes: [soonest, latest].
export function arrivalRange(meters: number): [number, number] {
  const soonest = Math.max(1, Math.round(meters / ((FAST_KMH * 1000) / 60)));
  const latest = Math.max(soonest, Math.round(meters / ((SLOW_KMH * 1000) / 60)));
  return [soonest, latest];
}

// The figure to say out loud, kept inside the measured range. `minutes` is the 17 km/h estimate.
export function estimateMinutes(meters: number, minutes: number): { best: number; soonest: number; latest: number } {
  const [soonest, latest] = arrivalRange(meters);
  const best = Math.min(latest, Math.max(soonest, Math.round(minutes)));
  return { best, soonest, latest };
}

export type Decision = "notify" | "expire" | "wait";

// minutesAway is null when no bus of the line is on its way to the stop.
export function decide(alert: Alert, now: number, minutesAway: number | null): Decision {
  if (minutesAway !== null && minutesAway <= alert.minutes) return "notify";
  if (now - alert.created > EXPIRES_MS) return "expire";
  return "wait";
}

export const texts = {
  welcome: (site: string) =>
    `Te aviso cuando tu colectivo esté por llegar.\n\nEscríbeme la línea, por ejemplo: avisame cuando pase el 41. Te pido tu ubicación, busco la parada más cercana y te aviso cuando falten unos 5 minutos (puedes elegir 3, 5 o 10).\n\nTambién puedes abrir ${site}, buscar tu línea, tocar la parada y elegir “Avisarme por Telegram”.\n\n/avisos muestra los pendientes y /cancelar los borra. Con /casa guardo tu ubicación 90 días.`,
  created: (a: Alert) => `Listo. Te aviso cuando falten ${a.minutes} min para que pase ${a.lineName} por ${a.stopName}.`,
  changed: (a: Alert) => `Cambiado: te aviso cuando falten ${a.minutes} min para ${a.lineName} en ${a.stopName}.`,
  // The distance is a fact. The minutes are the best guess and how far off it can be,
  // because one figure alone was wrong by more than a minute half the time.
  notify: (a: Alert, meters: number, minutes: number, bus: string | null) => {
    const coche = bus ? ` (coche ${bus})` : "";
    if (meters <= ARRIVING_M) return `Está llegando ${a.lineName} a ${a.stopName}${coche}.`;
    const { best, soonest, latest } = estimateMinutes(meters, minutes);
    const spread = soonest === latest ? "" : `; puede ser entre ${soonest} y ${latest}`;
    return `${a.lineName} está a ${formatDistance(meters)} de ${a.stopName}${coche}. Llega en ${best === 1 ? "1 min" : `unos ${best} min`}${spread}.`;
  },
  expired: (a: Alert) => `Pasaron 90 minutos sin un coche de ${a.lineName} en camino a ${a.stopName}. Cancelé el aviso.`,
  cancelled: (n: number) => (n === 0 ? "No tenías avisos pendientes." : n === 1 ? "Cancelé tu aviso." : `Cancelé tus ${n} avisos.`),
  tooMany: `Ya tienes ${MAX_PER_CHAT} avisos pendientes. Escribe /cancelar para borrarlos.`,
  unknownStop: "No encontré esa parada. Vuelve al mapa y toca “Avisarme por Telegram”, o escríbeme la línea: avisame cuando pase el 41.",
  gone: "Ese aviso ya no está pendiente.",
  help: "Escríbeme “avisame cuando pase el 41” o /avisame 41. Te pido dónde estás y te aviso cuando falten 5 min (también 3 o 10).\n\n/avisos muestra tus avisos, /cancelar los borra y /casa guarda tu ubicación 90 días.",
};
