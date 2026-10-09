import { deleteKey, listAlerts, putAlert, readJson, removeAlert, writeJson } from "./alert-store";
import { DEFAULT_MINUTES, MAX_PER_CHAT, MINUTE_CHOICES, parseLine, parseStop, texts, type Alert } from "./alerts";
import {
  askTexts,
  classify,
  minuteRows,
  parseAsk,
  PLACE_TTL_MS,
  PLACE_TTL_S,
  respond,
  SESSION_TTL_MS,
  SESSION_TTL_S,
  type AskInput,
  type AskReply,
  type DetailFacts,
  type GeoPoint,
  type LineFacts,
  type Session,
} from "./ask";
import { arrivals } from "./eta";
import { searchPlaces } from "./geocode";
import { allLines, lineDetail } from "./lines";
import { fetchFleet, type Bus } from "./santa-ana";
import { answerCallback, sendMessage, type Button, type Markup } from "./telegram";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "el mapa";

type StoredPlace = GeoPoint & { until: number };

const sessionKey = (chat: number) => `session:${chat}`;
const placeKey = (chat: number) => `place:${chat}`;

async function loadSession(chat: number, now: number): Promise<Session | null> {
  const session = await readJson<Session>(sessionKey(chat));
  if (!session || now - session.updated > SESSION_TTL_MS) return null;
  return session;
}

async function loadPlace(chat: number, now: number): Promise<GeoPoint | null> {
  const place = await readJson<StoredPlace>(placeKey(chat));
  if (!place || place.until <= now) {
    if (place) await deleteKey(placeKey(chat));
    return null;
  }
  return { lat: place.lat, lng: place.lng, ...(place.label ? { label: place.label } : {}) };
}

async function persist(chat: number, session: Session | null) {
  // heldSave only bridges the two steps of a single update. It must not sit in Redis
  // and get applied again the next time the person writes.
  const stored = session ? { ...session, heldSave: undefined } : null;
  if (!stored || (!stored.pending && !stored.recent && !stored.armCasa)) {
    await deleteKey(sessionKey(chat));
    return;
  }
  await writeJson(sessionKey(chat), stored, SESSION_TTL_S);
}

function markup(reply: AskReply): Button[] | Markup | undefined {
  if (reply.locationKeyboard) return { location: true };
  if (reply.rows?.length) return { rows: reply.rows.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) };
  if (reply.clearKeyboard) return { remove: true };
  return undefined;
}

async function deliver(chat: number, replies: AskReply[]) {
  for (const reply of replies) await sendMessage(chat, reply.text, markup(reply));
}

async function loadDetail(lineId: string): Promise<DetailFacts | null> {
  const detail = await lineDetail(lineId);
  if (!detail) return null;
  let fleetKnown = true;
  let buses: Bus[] = [];
  try {
    const fleet = await fetchFleet();
    buses = fleet.buses.filter((b) => b.line === lineId && b.fresh);
  } catch (err) {
    // The alert can still be created. The minute job checks the fleet again.
    console.error(err);
    fleetKnown = false;
  }
  const approaching: string[] = [];
  const eta: Record<string, number | null> = {};
  if (fleetKnown) {
    for (const stop of detail.stops) {
      const next = arrivals(detail.line.paths, stop, buses)[0];
      eta[stop.id] = next ? next.minutes : null;
      if (next) approaching.push(stop.id);
    }
  }
  return {
    line: {
      id: detail.line.id,
      number: detail.line.number,
      name: detail.line.name,
      live: detail.line.live,
      operator: detail.line.operator || null,
    },
    stops: detail.stops,
    approaching,
    eta,
    fleetKnown,
  };
}

async function run(chat: number, input: AskInput) {
  const now = Date.now();
  const [session, saved, all] = await Promise.all([loadSession(chat, now), loadPlace(chat, now), listAlerts()]);
  // Every input that names a line has to find it in the list. Leaving one out does not fail loudly:
  // the line is looked up in an empty list and the bot answers that it does not exist.
  const needsLines = input.kind === "ask" || input.kind === "pick-line" || input.kind === "start-line";
  let lines: LineFacts[] = [];
  if (needsLines) {
    try {
      lines = (await allLines()).map((l) => ({ id: l.id, number: l.number, name: l.name, live: l.live, operator: l.operator || null }));
    } catch (err) {
      console.error(err);
      await sendMessage(chat, askTexts.linesDown);
      return;
    }
  }
  const facts = {
    lines,
    saved,
    alerts: all.filter((a) => a.chat === chat).map((a) => ({ stop: a.stop, lineName: a.lineName, stopName: a.stopName, minutes: a.minutes })),
    now,
  };
  let result = respond(session, input, facts);
  if (result.needDetail) {
    let detail: DetailFacts | null = null;
    try {
      detail = await loadDetail(result.needDetail);
    } catch (err) {
      console.error(err);
      await saveOutcome(chat, result.savePlace ?? result.session?.heldSave ?? null, now);
      await persist(chat, result.session);
      await sendMessage(chat, askTexts.stopsDown);
      return;
    }
    if (!detail) {
      await persist(chat, result.session ? { ...result.session, pending: undefined } : null);
      await sendMessage(chat, askTexts.unknownLine(result.session?.pending?.query ?? "esa"));
      return;
    }
    const next: AskInput = input.kind === "pick-stop" ? input : { kind: "continue" };
    result = respond(result.session, next, { ...facts, detail });
  }
  if (result.create) {
    const alert: Alert = { ...result.create, chat, created: now };
    await putAlert(alert);
  }
  await saveOutcome(chat, result.savePlace ?? null, now);
  await persist(chat, result.session);
  await deliver(chat, result.replies);
}

async function saveOutcome(chat: number, place: GeoPoint | null, now: number) {
  if (!place) return;
  const stored: StoredPlace = { ...place, until: now + PLACE_TTL_MS };
  await writeJson(placeKey(chat), stored, PLACE_TTL_S);
}

export async function onText(chat: number, text: string) {
  const now = Date.now();
  const session = await loadSession(chat, now);
  const waiting = session?.pending?.wait === "place" || session?.pending?.wait === "address";
  const classified = classify(text, waiting);
  if (classified.type === "command") {
    const { name, rest } = classified;
    if (name === "/start") {
      if (!rest) {
        await persist(chat, session ? { ...session, pending: undefined, updated: now } : null);
        return sendMessage(chat, texts.welcome(SITE));
      }
      return startFromMap(chat, rest);
    }
    if (name === "/cancelar") return cancel(chat);
    if (name === "/avisos") return run(chat, { kind: "avisos" });
    if (name === "/casa") return run(chat, { kind: "casa" });
    if (name === "/avisame") {
      const parsed = parseAsk(text);
      if (!parsed) return sendMessage(chat, askTexts.usage);
      return run(chat, { kind: "ask", ...parsed });
    }
    return sendMessage(chat, texts.help);
  }
  if (classified.type === "ask") return run(chat, { kind: "ask", query: classified.query, minutes: classified.minutes, minutesNote: classified.minutesNote });
  if (classified.type === "address") {
    const q = text.trim();
    if (q.length < 3 || q.length > 80) return sendMessage(chat, askTexts.addressMiss, { location: true });
    try {
      const places = (await searchPlaces(q)).map((p) => ({ lat: p.lat, lng: p.lng, label: p.name }));
      return run(chat, { kind: "places", places });
    } catch (err) {
      console.error(err);
      return sendMessage(chat, askTexts.searchDown, { location: true });
    }
  }
  return sendMessage(chat, texts.help);
}

export async function onLocation(chat: number, lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  return run(chat, { kind: "location", lat, lng });
}

export async function onCallback(chat: number, callbackId: string, data: string) {
  if (data.startsWith("m:")) return changeMinutes(chat, callbackId, data);
  await answerCallback(callbackId);
  if (data.startsWith("l:")) return run(chat, { kind: "pick-line", lineId: data.slice(2) });
  if (data.startsWith("s:")) return run(chat, { kind: "pick-stop", stopId: data.slice(2) });
  if (data.startsWith("p:")) {
    const index = Number(data.slice(2));
    if (!Number.isInteger(index)) return;
    return run(chat, { kind: "pick-place", index });
  }
  return sendMessage(chat, askTexts.expired);
}

async function startFromMap(chat: number, payload: string) {
  // From the line itself, before any stop is chosen. Not "pick-line": that one answers a question
  // the bot asked earlier, and a link arrives with no question pending.
  const lineOnly = parseLine(payload);
  if (lineOnly) return run(chat, { kind: "start-line", lineId: lineOnly });
  const parsed = parseStop(payload);
  const detail = parsed ? await lineDetail(parsed.line) : null;
  const stop = detail?.stops.find((s) => s.id === parsed?.stop);
  if (!parsed || !detail || !stop) return sendMessage(chat, texts.unknownStop);
  const mine = (await listAlerts()).filter((a) => a.chat === chat);
  if (mine.length >= MAX_PER_CHAT && !mine.some((a) => a.stop === stop.id)) return sendMessage(chat, texts.tooMany);
  const alert: Alert = {
    chat,
    line: detail.line.id,
    stop: stop.id,
    lineName: detail.line.name,
    stopName: stop.name.trim() || "tu parada",
    minutes: DEFAULT_MINUTES,
    created: Date.now(),
  };
  await putAlert(alert);
  const now = Date.now();
  const session = await loadSession(chat, now);
  await persist(chat, session ? { ...session, pending: undefined, updated: now } : null);
  const row = minuteRows(alert.stop, alert.minutes)[0].map((b) => ({ text: b.text, callback_data: b.data }));
  return sendMessage(chat, texts.created(alert), row);
}

async function cancel(chat: number) {
  const now = Date.now();
  const [mine, session] = await Promise.all([listAlerts(), loadSession(chat, now)]);
  const own = mine.filter((a) => a.chat === chat);
  await Promise.all(own.map((a) => removeAlert(chat, a.stop)));
  await persist(chat, session ? { ...session, pending: undefined, armCasa: false, updated: now } : null);
  return sendMessage(chat, texts.cancelled(own.length), { remove: true });
}

async function changeMinutes(chat: number, callbackId: string, data: string) {
  const match = /^m:(\d{1,2}):(.+)$/.exec(data);
  const minutes = match ? Number(match[1]) : NaN;
  const alert = match ? (await listAlerts()).find((a) => a.chat === chat && a.stop === match[2]) : undefined;
  if (!alert || !MINUTE_CHOICES.includes(minutes)) return answerCallback(callbackId, texts.gone);
  const next = { ...alert, minutes };
  await putAlert(next);
  await answerCallback(callbackId);
  return sendMessage(chat, texts.changed(next));
}
