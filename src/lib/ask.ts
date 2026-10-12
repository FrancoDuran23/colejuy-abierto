import { DEFAULT_MINUTES, MAX_PER_CHAT, MINUTE_CHOICES, texts, type Alert } from "./alerts";
import { distance, formatDistance } from "./geo";
import type { Stop } from "./santa-ana";

// A place the person shared, typed, or saved with /casa.
export type GeoPoint = { lat: number; lng: number; label?: string };

// What the bot still needs before it can create the alert. Kept for the session, not as an alert.
export type Pending = {
  query: string;
  minutes: number;
  // They asked for a lead time other than 3, 5 or 10. Said once, on the confirmation.
  minutesNote: boolean;
  lineId?: string;
  wait: "line" | "place" | "direction" | "address";
  lineIds?: string[];
  stopIds?: string[];
  places?: GeoPoint[];
  at?: GeoPoint;
  // The point came from the saved home, not from a location they just sent.
  fromCasa?: boolean;
};

export type Session = {
  updated: number;
  recent?: GeoPoint;
  // /casa arrived before the location: the next point is saved as home.
  armCasa?: boolean;
  // A place to save once the reply is ready. Survives the pause while stops are loaded.
  heldSave?: GeoPoint;
  pending?: Pending;
};

export type ParsedAsk = { query: string; minutes: number; minutesNote: boolean };

export type Classified =
  | { type: "command"; name: string; rest: string }
  | ({ type: "ask" } & ParsedAsk)
  | { type: "address" }
  | { type: "help" };

export type LineFacts = {
  id: string;
  number: string;
  name: string;
  live: boolean;
  operator: string | null;
};

export type DetailFacts = {
  line: LineFacts;
  stops: Stop[];
  // Stop ids that currently have a bus of this line approaching.
  approaching: string[];
  eta: Record<string, number | null>;
  fleetKnown: boolean;
};

export type AlertBrief = { stop: string; lineName: string; stopName: string; minutes: number };

export type AskFacts = {
  lines: LineFacts[];
  saved: GeoPoint | null;
  alerts: AlertBrief[];
  detail?: DetailFacts | null;
  now: number;
};

export type AskInput =
  | ({ kind: "ask" } & ParsedAsk)
  | { kind: "location"; lat: number; lng: number; label?: string }
  | { kind: "places"; places: GeoPoint[] }
  | { kind: "pick-line"; lineId: string }
  | { kind: "start-line"; lineId: string }
  | { kind: "pick-stop"; stopId: string }
  | { kind: "pick-place"; index: number }
  | { kind: "casa" }
  | { kind: "avisos" }
  | { kind: "continue" };

export type AskReply = {
  text: string;
  rows?: { text: string; data: string }[][];
  locationKeyboard?: boolean;
  clearKeyboard?: boolean;
};

export type AskResult = {
  session: Session | null;
  replies: AskReply[];
  create?: Pick<Alert, "line" | "stop" | "lineName" | "stopName" | "minutes">;
  savePlace?: GeoPoint;
  // The line is chosen and the point is known, but stops and ETAs are not loaded yet.
  needDetail?: string;
};

// How long /casa remembers a point. Long enough to be useful, short enough that a moved house
// does not keep sending the person to the old corner.
export const PLACE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const PLACE_TTL_S = 90 * 24 * 60 * 60;
// The conversation itself is forgotten after half an hour. The saved place outlives it.
export const SESSION_TTL_MS = 30 * 60 * 1000;
export const SESSION_TTL_S = 30 * 60;

// Opposite-direction stops of one corridor usually sit a few dozen metres apart. A gap larger
// than this means the person is clearly on one side. Inside the gap, direction is still unknown:
// paths' order does not say which way the bus goes, so the stop's own `direction` is what splits them.
export const AMBIGUOUS_GAP_M = 150;

const FILLER = new Set([
  "avisame", "avisar", "avisa", "avises", "avise", "avisas", "decime", "decirme", "dime",
  "por", "favor", "porfa", "cuando", "pase", "pasa", "pasen", "venga", "viene", "vengan",
  "llegue", "llega", "lleguen", "el", "la", "los", "las", "un", "una", "colectivo", "bondi",
  "linea", "cerca", "mio", "mi", "de", "que", "me", "a", "al", "del", "para", "este", "esta",
  "quiero", "quisiera", "donde", "estoy", "aca", "aqui", "hacia", "sobre", "en", "min",
  "minutos", "falten", "faltan", "dentro", "unos", "unas", "porfa",
]);

export const askTexts = {
  usage: "Dime la línea. Por ejemplo: /avisame 41 o “avisame cuando pase el 10”. Puedes agregar 3, 5 o 10: /avisame 41 5.",
  needPlace: "Para avisarte necesito saber dónde estás. Comparte tu ubicación con el botón, o escribe una dirección con calle y altura.",
  gotLocation: "Recibí tu ubicación. Escribe /casa para guardarla 90 días, o dime la línea: avisame cuando pase el 41.",
  savedCasa: "Guardé tu ubicación como casa por 90 días. La próxima vez que pidas un aviso la uso sola.",
  casaNeed: "Comparte tu ubicación con el botón y la guardo como casa por 90 días.",
  casaKeep: "Tu casa sigue guardada. Para cambiarla, comparte una ubicación nueva y la reemplazo. También dura 90 días.",
  addressMiss: "No encontré esa dirección. Prueba con calle y altura, o comparte tu ubicación.",
  addressMany: "Encontré varias direcciones. Elige una.",
  searchDown: "No pude buscar esa dirección. Comparte tu ubicación, o prueba de nuevo en un minuto.",
  linesDown: "No pude consultar las líneas en este momento. Prueba de nuevo en un minuto.",
  stopsDown: "No pude consultar las paradas en este momento. Prueba de nuevo en un minuto.",
  noStops: "Esta línea no tiene paradas cargadas, así que no puedo armar el aviso.",
  expired: "Ese paso ya venció. Vuelve a pedir el aviso.",
  none: "No tienes avisos pendientes.",
  unknownLine: (query: string) => `No encontré una línea “${query}”. Prueba con el número, por ejemplo /avisame 41.`,
};

function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function compact(s: string): string {
  return fold(s).replace(/[^a-z0-9]+/g, "");
}

function clip(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trimEnd()}…`;
}

// A message is a command, an ask, an address (only while we are waiting for one), or help.
export function classify(text: string, waitingPlace: boolean): Classified {
  const trimmed = text.trim();
  if (!trimmed) return { type: "help" };
  const [head, ...tail] = trimmed.split(/\s+/);
  const name = head.split("@")[0].toLowerCase();
  if (name.startsWith("/")) return { type: "command", name, rest: tail.join(" ") };
  const ask = parseAsk(trimmed);
  if (ask) return { type: "ask", ...ask };
  if (waitingPlace) return { type: "address" };
  return { type: "help" };
}

// /avisame <línea> [3|5|10], and sentences like "avisame cuando pase el 41" or "41 a 5 min".
// Anything that is not an ask returns null so the caller can show help instead of guessing.
export function parseAsk(text: string): ParsedAsk | null {
  const trimmed = text.trim();
  const cmd = trimmed.match(/^\/avisame(?:@\w+)?\s*([\s\S]*)$/i);
  if (cmd) return parseCommandQuery(cmd[1] ?? "");
  return parseSentence(trimmed);
}

function parseCommandQuery(rest: string): ParsedAsk | null {
  const normalized = fold(rest).replace(/[^a-z0-9\s-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^linea\s+/, "");
  if (!normalized) return null;
  const parts = normalized.split(" ");
  let minutes: number = DEFAULT_MINUTES;
  let minutesNote = false;
  if (parts.length >= 2 && /^\d{1,2}$/.test(parts[parts.length - 1])) {
    const n = Number(parts.pop());
    if ((MINUTE_CHOICES as readonly number[]).includes(n)) minutes = n;
    else minutesNote = true;
  }
  const query = parts.join(" ").trim();
  if (!query) return null;
  return { query, minutes, minutesNote };
}

function parseSentence(text: string): ParsedAsk | null {
  const norm = fold(text).replace(/[^a-z0-9\s-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!norm) return null;
  const intent = /\b(avisame|avisar|avisa|avises|avise|avisas|decime|decirme|dime|cuando)\b/.test(norm);
  const minutePhrase = /(?:^|\s)(\d{1,2})\s*min(?:utos)?(?:\s|$)/.test(norm);
  if (!intent && !minutePhrase) return null;
  let minutes: number = DEFAULT_MINUTES;
  let minutesNote = false;
  let sawMinutes = false;
  const rest = norm.replace(/(?:^|\s)(\d{1,2})\s*min(?:utos)?(?=\s|$)/g, (_, n: string) => {
    const v = Number(n);
    sawMinutes = true;
    if ((MINUTE_CHOICES as readonly number[]).includes(v)) minutes = v;
    else minutesNote = true;
    return " ";
  });
  const words = rest.split(/\s+/).filter((w) => w && !FILLER.has(w));
  if (!sawMinutes && words.length >= 2 && /^(3|5|10)$/.test(words[words.length - 1])) {
    minutes = Number(words.pop());
  }
  const query = words.join(" ").replace(/^linea\s+/, "").trim();
  if (!query || query.split(" ").length > 6) return null;
  return { query, minutes, minutesNote };
}

// Match a typed line against Santa Ana ids and the municipal lines.
// A bare number stays ambiguous on purpose: "2" is both "2" and "2-savio", "49" is "49" and "49bis".
export function matchLines(lines: LineFacts[], query: string): LineFacts[] {
  const q = fold(query).replace(/[^a-z0-9\s-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^linea\s+/, "");
  const qc = q.replace(/[\s-]+/g, "");
  if (!q || !qc) return [];
  const sort = (list: LineFacts[]) =>
    [...new Map(list.map((l) => [l.id, l])).values()].sort((a, b) => Number(b.live) - Number(a.live) || a.id.localeCompare(b.id));

  if (/^\d+$/.test(qc)) {
    const re = new RegExp(`^${qc}(?!\\d)`);
    return sort(lines.filter((l) => [compact(l.id), compact(l.number)].some((v) => re.test(v))));
  }

  const exact = lines.filter((l) => [l.id, l.number, l.name].some((v) => compact(v) === qc));
  if (exact.length > 0) return sort(exact);
  const words = q.split(" ").filter(Boolean);
  const hits = lines.filter((l) => {
    const set = new Set(fold(`${l.id} ${l.number} ${l.name}`).replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean));
    return words.every((w) => set.has(w));
  });
  return sort(hits);
}

export type NearStop = { stop: Stop; meters: number; heading: string };

export type StopChoice =
  | { kind: "none" }
  | { kind: "ask"; options: NearStop[] }
  | { kind: "one"; near: NearStop; reason: "only" | "closer" | "approaching"; other?: NearStop };

// The last stop of a direction, in the order the source numbers them, is the end the bus is going toward.
export function directionHeading(stops: Stop[], direction: string | null): string {
  const group = stops.filter((s) => (s.direction ?? null) === direction);
  const named = group.filter((s) => s.name.trim());
  const pool = named.length ? named : group;
  if (pool.length === 0) return direction === "vuelta" ? "vuelta" : direction === "ida" ? "ida" : "ese sentido";
  const end = [...pool].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).at(-1)!;
  return end.name.trim() || (direction ?? "ese sentido");
}

export function nearestByDirection(stops: Stop[], at: GeoPoint): { stop: Stop; meters: number }[] {
  const best = new Map<string, { stop: Stop; meters: number }>();
  for (const stop of stops) {
    const meters = distance([at.lng, at.lat], [stop.lng, stop.lat]);
    const key = stop.direction ?? "";
    const prev = best.get(key);
    if (!prev || meters < prev.meters) best.set(key, { stop, meters });
  }
  return [...best.values()].sort((a, b) => a.meters - b.meters);
}

function withHeadings(nearest: { stop: Stop; meters: number }[], stops: Stop[]): NearStop[] {
  const headings = nearest.map((n) => directionHeading(stops, n.stop.direction));
  return nearest.map((n, i) => {
    let heading = headings[i];
    const dup = headings.some((h, j) => j !== i && h === heading);
    if (dup) {
      const name = n.stop.name.trim();
      heading = name && name !== heading ? `${heading} · ${name}` : `${heading} (${n.stop.direction ?? "sentido"})`;
    }
    return { ...n, heading };
  });
}

// Nearest stop of each direction. If the two closest are within AMBIGUOUS_GAP_M, ask — unless
// exactly one of them has a bus actually approaching, in which case that is the one they are waiting for.
export function chooseNearest(stops: Stop[], at: GeoPoint, approaching: ReadonlySet<string>): StopChoice {
  const nearest = withHeadings(nearestByDirection(stops, at), stops);
  if (nearest.length === 0) return { kind: "none" };
  if (nearest.length === 1) return { kind: "one", near: nearest[0], reason: "only" };
  const [first, second] = nearest;
  const close = nearest.filter((n) => n.meters - first.meters <= AMBIGUOUS_GAP_M);
  if (close.length < 2) return { kind: "one", near: first, reason: "closer", other: second };
  const coming = close.filter((n) => approaching.has(n.stop.id));
  if (coming.length === 1) {
    const other = close.find((n) => n.stop.id !== coming[0].stop.id);
    return { kind: "one", near: coming[0], reason: "approaching", other };
  }
  return { kind: "ask", options: close };
}

export function minuteRows(stop: string, current: number): { text: string; data: string }[][] {
  return [MINUTE_CHOICES.map((m) => ({ text: m === current ? `${m} min ✓` : `${m} min`, data: `m:${m}:${stop}` }))];
}

function lineOption(line: LineFacts): string {
  const rest = line.name.replace(new RegExp(`^l[ií]nea\\s+${line.number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "").trim().replace(/^x\s+/i, "");
  const base = rest && rest !== line.name ? `${line.number} ${rest}`.trim() : line.name;
  const suffix = line.live ? "" : line.operator ? ` · ${line.operator}` : " · sin seguimiento";
  return clip(`${base}${suffix}`, 40);
}

function lineRows(lines: LineFacts[]): { text: string; data: string }[][] {
  return lines.map((l) => [{ text: lineOption(l), data: `l:${l.id}` }]);
}

function mention(line: LineFacts): string {
  if (/^\d+$/.test(line.number)) {
    const extra = line.name.replace(new RegExp(`^l[ií]nea\\s+${line.number}\\b`, "i"), "").trim();
    return extra ? `la línea ${line.number} (${extra})` : `la línea ${line.number}`;
  }
  return line.name;
}

function noLiveText(lines: LineFacts[]): string {
  if (lines.length === 1) {
    const who = lines[0].operator ? ` (${lines[0].operator})` : "";
    return `${cap(mention(lines[0]))}${who} no tiene posición en vivo, así que no puedo avisarte cuándo pasa.`;
  }
  const names = lines.map(mention).join(" y ");
  const who = lines.every((l) => l.operator && l.operator === lines[0].operator) ? ` De ${lines[0].operator}.` : "";
  return `${cap(names)} no tienen posición en vivo, así que no puedo avisarte cuándo pasan.${who}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function whichLine(lines: LineFacts[]): string {
  const base = "Hay más de una línea con ese número. Elige una.";
  return lines.some((l) => !l.live) ? `${base} Las que no tienen seguimiento en vivo no pueden armar un aviso.` : base;
}

function listText(alerts: AlertBrief[]): string {
  if (alerts.length === 0) return askTexts.none;
  const rows = alerts.map((a) => `· ${a.lineName} en ${a.stopName}, a ${a.minutes} min`);
  const head = alerts.length === 1 ? "Tienes 1 aviso pendiente:" : `Tienes ${alerts.length} avisos pendientes:`;
  return `${head}\n${rows.join("\n")}\n\nEscribe /cancelar para borrarlos.`;
}

function touch(session: Session | null, now: number): Session {
  return { updated: now, recent: session?.recent, armCasa: session?.armCasa, heldSave: session?.heldSave, pending: session?.pending };
}

function dropPending(session: Session): Session {
  return { updated: session.updated, recent: session.recent, armCasa: session.armCasa, heldSave: session.heldSave };
}

function samePlace(a: GeoPoint, b: GeoPoint): boolean {
  return distance([a.lng, a.lat], [b.lng, b.lat]) < 30;
}

function pointOf(input: { lat: number; lng: number; label?: string }): GeoPoint {
  return { lat: input.lat, lng: input.lng, ...(input.label ? { label: input.label } : {}) };
}

export function respond(session: Session | null, input: AskInput, facts: AskFacts): AskResult {
  const base = touch(session, facts.now);
  switch (input.kind) {
    case "avisos":
      return { session: base, replies: [{ text: listText(facts.alerts), clearKeyboard: true }] };
    case "casa":
      return onCasa(base, facts);
    case "ask":
      return onAsk(base, input, facts);
    case "pick-line":
      return onPickLine(base, input.lineId, facts);
    case "start-line":
      return onStartLine(base, input.lineId, facts);
    case "location":
      return onLocation(base, pointOf(input), facts);
    case "places":
      return onPlaces(base, input.places, facts);
    case "pick-place":
      return onPickPlace(base, input.index, facts);
    case "pick-stop":
      return onPickStop(base, input.stopId, facts);
    case "continue":
      return onContinue(base, facts);
    default:
      return { session: base, replies: [{ text: texts.help }] };
  }
}

function onCasa(session: Session, facts: AskFacts): AskResult {
  if (session.recent) {
    return {
      session: { ...session, armCasa: false },
      savePlace: session.recent,
      replies: [{ text: askTexts.savedCasa, clearKeyboard: true }],
    };
  }
  return {
    session: { ...session, armCasa: true },
    replies: [{ text: facts.saved ? askTexts.casaKeep : askTexts.casaNeed, locationKeyboard: true }],
  };
}

function onAsk(session: Session, input: ParsedAsk, facts: AskFacts): AskResult {
  const pending: Pending = { query: input.query, minutes: input.minutes, minutesNote: input.minutesNote, wait: "line" };
  const matches = matchLines(facts.lines, input.query);
  if (matches.length === 0) {
    return { session: dropPending(session), replies: [{ text: askTexts.unknownLine(clip(input.query, 40)), clearKeyboard: true }] };
  }
  if (matches.every((l) => !l.live)) {
    return { session: dropPending(session), replies: [{ text: noLiveText(matches), clearKeyboard: true }] };
  }
  if (matches.length > 1) {
    return {
      session: { ...session, pending: { ...pending, wait: "line", lineIds: matches.map((l) => l.id) } },
      replies: [{ text: whichLine(matches), rows: lineRows(matches) }],
    };
  }
  return resolveLine(session, { ...pending, lineId: matches[0].id }, facts);
}

function onPickLine(session: Session, lineId: string, facts: AskFacts): AskResult {
  const pending = session.pending;
  if (!pending || pending.wait !== "line" || !pending.lineIds?.includes(lineId) || lineId.length > 60) return expired(session);
  const line = facts.lines.find((l) => l.id === lineId);
  if (!line) return expired(session);
  if (!line.live) return { session: dropPending(session), replies: [{ text: noLiveText([line]), clearKeyboard: true }] };
  return resolveLine(session, { ...pending, lineId: line.id }, facts);
}

// From the map's link for a line. The line arrives by id, so there is nothing to choose between and
// no earlier question to belong to: unlike onPickLine, this starts the conversation.
function onStartLine(session: Session, lineId: string, facts: AskFacts): AskResult {
  const line = lineId.length <= 60 ? facts.lines.find((l) => l.id === lineId) : undefined;
  if (!line) return { session: dropPending(session), replies: [{ text: askTexts.unknownLine(clip(lineId, 40)), clearKeyboard: true }] };
  if (!line.live) return { session: dropPending(session), replies: [{ text: noLiveText([line]), clearKeyboard: true }] };
  return resolveLine(session, { query: line.number, minutes: DEFAULT_MINUTES, minutesNote: false, wait: "line", lineId: line.id }, facts);
}

function resolveLine(session: Session, pending: Pending, facts: AskFacts, savePlace?: GeoPoint): AskResult {
  if (pending.at) return withDetail(session, { ...pending, fromCasa: false, wait: "direction" }, facts, savePlace);
  if (session.recent) return withDetail(session, { ...pending, at: session.recent, fromCasa: false, wait: "direction" }, facts, savePlace);
  if (facts.saved) return withDetail(session, { ...pending, at: facts.saved, fromCasa: true, wait: "direction" }, facts, savePlace);
  return {
    session: { ...session, pending: { ...pending, wait: "place" } },
    savePlace,
    replies: [{ text: askTexts.needPlace, locationKeyboard: true }],
  };
}

function onLocation(session: Session, point: GeoPoint, facts: AskFacts, savePlace?: GeoPoint): AskResult {
  const saving = savePlace ?? (session.armCasa ? point : undefined);
  const next: Session = { ...session, recent: point, armCasa: false, heldSave: saving ?? session.heldSave };
  const pending = session.pending;
  if (pending?.lineId && (pending.wait === "place" || pending.wait === "address" || pending.wait === "direction")) {
    return withDetail(next, { ...pending, at: point, fromCasa: false, wait: "direction", places: undefined, stopIds: undefined }, facts, saving);
  }
  if (pending?.wait === "line") {
    return {
      session: { ...next, pending },
      savePlace: saving,
      replies: [{ text: `${saving ? `${askTexts.savedCasa}\n` : ""}Recibí tu ubicación. Elige una línea con los botones de arriba.`, clearKeyboard: true }],
    };
  }
  return {
    session: next,
    savePlace: saving,
    replies: [{ text: saving ? askTexts.savedCasa : askTexts.gotLocation, clearKeyboard: true }],
  };
}

function onPlaces(session: Session, places: GeoPoint[], facts: AskFacts): AskResult {
  const pending = session.pending;
  if (!pending || (pending.wait !== "place" && pending.wait !== "address")) {
    return { session, replies: [{ text: texts.help, clearKeyboard: true }] };
  }
  if (places.length === 0) {
    return { session: { ...session, pending: { ...pending, wait: "place" } }, replies: [{ text: askTexts.addressMiss, locationKeyboard: true }] };
  }
  if (places.length === 1) return onLocation(session, places[0], facts);
  return {
    session: { ...session, pending: { ...pending, wait: "address", places } },
    replies: [{ text: askTexts.addressMany, rows: places.map((p, i) => [{ text: clip(p.label || "Dirección", 40), data: `p:${i}` }]) }],
  };
}

function onPickPlace(session: Session, index: number, facts: AskFacts): AskResult {
  const place = session.pending?.places?.[index];
  if (!place) return expired(session);
  return onLocation(session, place, facts);
}

function onPickStop(session: Session, stopId: string, facts: AskFacts): AskResult {
  const pending = session.pending;
  if (!pending?.lineId || !pending.stopIds?.includes(stopId)) return expired(session);
  if (!facts.detail || facts.detail.line.id !== pending.lineId) {
    return { session, needDetail: pending.lineId, replies: [] };
  }
  const stop = facts.detail.stops.find((s) => s.id === stopId);
  const at = pending.at;
  if (!stop || !at) return expired(session);
  const near: NearStop = {
    stop,
    meters: distance([at.lng, at.lat], [stop.lng, stop.lat]),
    heading: directionHeading(facts.detail.stops, stop.direction),
  };
  return createFrom(session, pending, near, "only", undefined, facts.detail, facts, session.heldSave);
}

function onContinue(session: Session, facts: AskFacts): AskResult {
  const pending = session.pending;
  if (!pending?.lineId || !pending.at) return { session, replies: [{ text: texts.help }] };
  return withDetail(session, pending, facts, session.heldSave);
}

function withDetail(session: Session, pending: Pending, facts: AskFacts, savePlace?: GeoPoint): AskResult {
  const lineId = pending.lineId;
  if (!lineId || !pending.at) {
    return { session: { ...session, pending: { ...pending, wait: "place" } }, savePlace, replies: [{ text: askTexts.needPlace, locationKeyboard: true }] };
  }
  if (!facts.detail || facts.detail.line.id !== lineId) {
    const held = savePlace ?? session.heldSave;
    return { session: { ...session, pending, heldSave: held }, savePlace: held, needDetail: lineId, replies: [] };
  }
  if (facts.detail.stops.length === 0) {
    return { session: dropPending(session), savePlace, replies: [{ text: askTexts.noStops, clearKeyboard: true }] };
  }
  const choice = chooseNearest(facts.detail.stops, pending.at, new Set(facts.detail.approaching));
  if (choice.kind === "none") {
    return { session: dropPending(session), savePlace, replies: [{ text: askTexts.noStops, clearKeyboard: true }] };
  }
  if (choice.kind === "ask") {
    const replies: AskReply[] = [];
    if (savePlace) replies.push({ text: askTexts.savedCasa, clearKeyboard: true });
    replies.push({
      text: whichWay(choice.options),
      rows: choice.options.map((o) => [{ text: clip(`hacia ${o.heading}`, 40), data: `s:${o.stop.id}` }]),
    });
    return {
      session: { ...session, heldSave: undefined, pending: { ...pending, wait: "direction", stopIds: choice.options.map((o) => o.stop.id) } },
      savePlace,
      replies,
    };
  }
  return createFrom(session, pending, choice.near, choice.reason, choice.other, facts.detail, facts, savePlace);
}

function whichWay(options: NearStop[]): string {
  const bits = options.map((o) => phrase(o));
  if (bits.length === 2) return `Hay dos paradas cerca: una ${bits[0]} y otra ${bits[1]}. ¿Para cuál sentido te aviso?`;
  return `Hay varias paradas cerca: ${bits.join(", ")}. ¿Para cuál sentido te aviso?`;
}

function phrase(o: NearStop): string {
  const stop = o.stop.name.trim();
  if (stop && fold(stop) !== fold(o.heading)) return `${stop}, hacia ${o.heading} (${formatDistance(o.meters)})`;
  return `hacia ${o.heading} (${formatDistance(o.meters)})`;
}

function createFrom(
  session: Session,
  pending: Pending,
  near: NearStop,
  reason: "only" | "closer" | "approaching",
  other: NearStop | undefined,
  detail: DetailFacts,
  facts: AskFacts,
  savePlace?: GeoPoint,
): AskResult {
  const stopName = near.stop.name.trim() || "tu parada";
  const replacing = facts.alerts.some((a) => a.stop === near.stop.id);
  if (facts.alerts.length >= MAX_PER_CHAT && !replacing) {
    return { session: dropPending(session), savePlace, replies: [{ text: texts.tooMany, clearKeyboard: true }] };
  }
  const draft = { line: detail.line.id, stop: near.stop.id, lineName: detail.line.name, stopName, minutes: pending.minutes };
  const replies: AskReply[] = [];
  if (savePlace) replies.push({ text: askTexts.savedCasa, clearKeyboard: true });
  replies.push({ text: confirmation(draft, pending, near, reason, other, detail, facts.saved, Boolean(savePlace)), rows: minuteRows(near.stop.id, pending.minutes) });
  const recent = pending.fromCasa ? session.recent : pending.at;
  return {
    session: { updated: session.updated, recent, armCasa: false },
    savePlace,
    create: draft,
    replies,
  };
}

function confirmation(
  draft: Pick<Alert, "line" | "stop" | "lineName" | "stopName" | "minutes">,
  pending: Pending,
  near: NearStop,
  reason: "only" | "closer" | "approaching",
  other: NearStop | undefined,
  detail: DetailFacts,
  saved: GeoPoint | null,
  justSaved: boolean,
): string {
  const alert = { ...draft, chat: 0, created: 0 };
  const parts = [texts.created(alert)];
  const why = reasonSentence(reason, near, other);
  if (why) parts.push(why);
  if (!justSaved && pending.fromCasa) parts.push("Uso la ubicación que guardaste como casa.");
  parts.push(`La parada queda a ${formatDistance(near.meters)} a pie.`);
  parts.push(etaSentence(detail.fleetKnown ? (detail.eta[near.stop.id] ?? null) : null, detail.fleetKnown));
  if (!justSaved && !pending.fromCasa) {
    if (!saved) parts.push("Si esta es tu casa, escribe /casa y la uso la próxima vez. La guardo 90 días.");
    else if (pending.at && !samePlace(saved, pending.at)) parts.push("Para usar esta ubicación la próxima vez, escribe /casa. La guardo 90 días.");
  }
  if (pending.minutesNote) parts.push("Solo puedo avisar a 3, 5 o 10 minutos, así que lo dejé en 5.");
  return parts.join("\n");
}

function reasonSentence(reason: "only" | "closer" | "approaching", near: NearStop, other?: NearStop): string {
  if (reason === "approaching" && other) {
    return `Las paradas de los dos sentidos quedan cerca. Elegí hacia ${near.heading} porque hay un colectivo en camino; hacia ${other.heading} ahora no.`;
  }
  if (reason === "closer" && other) {
    return `Elegí la parada hacia ${near.heading} porque es la más cercana. La del otro sentido queda a ${formatDistance(other.meters)}.`;
  }
  return "";
}

function etaSentence(minutes: number | null, fleetKnown: boolean): string {
  if (!fleetKnown) return "Ahora no pude ver si hay un colectivo en camino. Si aparece dentro de 90 minutos, te aviso.";
  if (minutes === null) return "Ahora no hay un colectivo de esa línea en camino. Si aparece dentro de 90 minutos, te aviso.";
  if (minutes < 1) return "El próximo está llegando. Es un tiempo estimado.";
  return `El próximo pasa en ≈ ${Math.round(minutes)} min. Es un tiempo estimado.`;
}

function expired(session: Session): AskResult {
  return { session: dropPending(session), replies: [{ text: askTexts.expired }] };
}
