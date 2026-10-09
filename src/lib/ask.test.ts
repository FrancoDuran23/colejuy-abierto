import { describe, expect, it } from "vitest";
import { texts } from "./alerts";
import {
  AMBIGUOUS_GAP_M,
  askTexts,
  chooseNearest,
  classify,
  directionHeading,
  matchLines,
  minuteRows,
  parseAsk,
  respond,
  type AskFacts,
  type AskInput,
  type DetailFacts,
  type GeoPoint,
  type LineFacts,
} from "./ask";
import { distance, formatDistance } from "./geo";
import type { Stop } from "./santa-ana";
import { UpdateSchema } from "./telegram";

const LINES: LineFacts[] = [
  { id: "2", number: "2", name: "Linea 2", live: true, operator: "Santa Ana" },
  { id: "2-savio", number: "2", name: "Linea 2 Savio", live: true, operator: "Santa Ana" },
  { id: "10", number: "10", name: "Linea 10", live: true, operator: "Santa Ana" },
  { id: "12", number: "12", name: "Linea 12", live: true, operator: "Santa Ana" },
  { id: "41", number: "41", name: "Linea 41", live: true, operator: "Santa Ana" },
  { id: "49", number: "49", name: "Linea 49", live: true, operator: "Santa Ana" },
  { id: "49bis", number: "49bis", name: "Linea 49 bis", live: true, operator: "Santa Ana" },
  { id: "servicio-humahuaca", number: "Humahuaca", name: "Servicio a Humahuaca", live: true, operator: "Santa Ana" },
  { id: "muni-l001", number: "1", name: "Linea 1", live: false, operator: "El Urbano" },
  { id: "muni-l013", number: "13", name: "Linea 13 150 Hectareas", live: false, operator: "El Urbano" },
  { id: "muni-l013b", number: "13", name: "Linea 13 10 Hectareas", live: false, operator: "El Urbano" },
  { id: "muni-l026", number: "26", name: "Linea 26 Nueva Zona Gorriti Los Alisos", live: false, operator: null },
];

const LAT = -24.19;
const LNG = -65.3;
const HERE: GeoPoint = { lat: LAT, lng: LNG };

function metersNorth(m: number): number {
  return LAT + m / 111194.93;
}
function metersWest(m: number): number {
  return LNG - m / (111194.93 * Math.cos((LAT * Math.PI) / 180));
}

function stop(over: Partial<Stop> & Pick<Stop, "id">): Stop {
  return { name: "Parada", lat: LAT, lng: LNG, direction: "ida", order: 1, ...over };
}

const IDA_NEAR = stop({ id: "41-00000001", name: "San Martin", lat: metersNorth(40), direction: "ida", order: 3 });
const IDA_END = stop({ id: "41-00000002", name: "Alto Comedero", lat: metersNorth(800), direction: "ida", order: 12 });
const VUELTA_NEAR = stop({ id: "41-00000003", name: "Belgrano", lng: metersWest(70), direction: "vuelta", order: 3 });
const VUELTA_END = stop({ id: "41-00000004", name: "Centro", lat: metersNorth(-700), lng: metersWest(70), direction: "vuelta", order: 12 });
const VUELTA_FAR = stop({ id: "41-00000005", name: "Belgrano", lng: metersWest(400), direction: "vuelta", order: 3 });
const VUELTA_FAR_END = stop({ id: "41-00000006", name: "Centro", lat: metersNorth(-700), lng: metersWest(400), direction: "vuelta", order: 12 });

const LINE_41: LineFacts = LINES.find((l) => l.id === "41")!;

function detail(stops: Stop[], eta: Record<string, number | null> = {}, approaching: string[] = [], fleetKnown = true): DetailFacts {
  return { line: LINE_41, stops, approaching, eta, fleetKnown };
}

function facts(over: Partial<AskFacts> = {}): AskFacts {
  return { lines: LINES, saved: null, alerts: [], now: 1_700_000_000_000, ...over };
}

const ask41: AskInput = { kind: "ask", query: "41", minutes: 5, minutesNote: false };

describe("parseAsk", () => {
  it("reads the command, with an optional lead time of 3, 5 or 10", () => {
    expect(parseAsk("/avisame 41")).toEqual({ query: "41", minutes: 5, minutesNote: false });
    expect(parseAsk("/avisame@ColectivosBot 41 10")).toEqual({ query: "41", minutes: 10, minutesNote: false });
    expect(parseAsk("/avisame 10")).toEqual({ query: "10", minutes: 5, minutesNote: false });
    expect(parseAsk("/avisame 10 10")).toEqual({ query: "10", minutes: 10, minutesNote: false });
    expect(parseAsk("/avisame 2-savio")).toEqual({ query: "2-savio", minutes: 5, minutesNote: false });
    expect(parseAsk("/avisame 49 bis")).toEqual({ query: "49 bis", minutes: 5, minutesNote: false });
    expect(parseAsk("/avisame servicio-humahuaca 3")).toEqual({ query: "servicio-humahuaca", minutes: 3, minutesNote: false });
  });

  it("understands a sentence and keeps a line number that is not a lead time", () => {
    expect(parseAsk("avisame cuando el 41 pase cerca mío")).toEqual({ query: "41", minutes: 5, minutesNote: false });
    expect(parseAsk("decime cuando pase el 10")).toEqual({ query: "10", minutes: 5, minutesNote: false });
    expect(parseAsk("cuando viene el 2")).toEqual({ query: "2", minutes: 5, minutesNote: false });
    expect(parseAsk("41 a 5 min")).toEqual({ query: "41", minutes: 5, minutesNote: false });
    expect(parseAsk("avisame cuando pase el 2 savio")).toEqual({ query: "2 savio", minutes: 5, minutesNote: false });
    expect(parseAsk("avísame el servicio humahuaca")).toEqual({ query: "servicio humahuaca", minutes: 5, minutesNote: false });
  });

  it("does not invent a lead time outside 3, 5 and 10", () => {
    expect(parseAsk("41 a 7 minutos")).toEqual({ query: "41", minutes: 5, minutesNote: true });
    expect(parseAsk("/avisame 41 7")).toEqual({ query: "41", minutes: 5, minutesNote: true });
  });

  it("ignores messages that are not an ask", () => {
    expect(parseAsk("hola")).toBeNull();
    expect(parseAsk("/avisame")).toBeNull();
    expect(parseAsk("")).toBeNull();
  });
});

describe("classify", () => {
  it("keeps commands and asks apart from a typed address", () => {
    expect(classify("/casa", true)).toMatchObject({ type: "command", name: "/casa" });
    expect(classify("avisame el 41", true)).toMatchObject({ type: "ask", query: "41" });
    expect(classify("Belgrano 540", true)).toEqual({ type: "address" });
    expect(classify("Belgrano 540", false)).toEqual({ type: "help" });
    expect(classify("hola", false)).toEqual({ type: "help" });
  });
});

describe("matchLines", () => {
  it("matches ids and names that are not plain numbers", () => {
    expect(matchLines(LINES, "2-savio").map((l) => l.id)).toEqual(["2-savio"]);
    expect(matchLines(LINES, "2 savio").map((l) => l.id)).toEqual(["2-savio"]);
    expect(matchLines(LINES, "savio").map((l) => l.id)).toEqual(["2-savio"]);
    expect(matchLines(LINES, "49bis").map((l) => l.id)).toEqual(["49bis"]);
    expect(matchLines(LINES, "49 bis").map((l) => l.id)).toEqual(["49bis"]);
    expect(matchLines(LINES, "servicio-humahuaca").map((l) => l.id)).toEqual(["servicio-humahuaca"]);
    expect(matchLines(LINES, "humahuaca").map((l) => l.id)).toEqual(["servicio-humahuaca"]);
  });

  it("asks for a choice when a number matches several lines, and does not swallow a longer number", () => {
    expect(matchLines(LINES, "2").map((l) => l.id)).toEqual(["2", "2-savio"]);
    expect(matchLines(LINES, "49").map((l) => l.id)).toEqual(["49", "49bis"]);
    expect(matchLines(LINES, "13").map((l) => l.id)).toEqual(["muni-l013", "muni-l013b"]);
    expect(matchLines(LINES, "10").map((l) => l.id)).toEqual(["10"]);
    expect(matchLines(LINES, "1").map((l) => l.id)).toEqual(["muni-l001"]);
    expect(matchLines(LINES, "12").map((l) => l.id)).toEqual(["12"]);
    expect(matchLines(LINES, "26").map((l) => l.id)).toEqual(["muni-l026"]);
  });
});

describe("chooseNearest", () => {
  const both = [IDA_NEAR, IDA_END, VUELTA_NEAR, VUELTA_END];

  it("names a direction from the last stop of that direction, not from the path order", () => {
    expect(directionHeading(both, "ida")).toBe("Alto Comedero");
    expect(directionHeading(both, "vuelta")).toBe("Centro");
  });

  it("asks when the nearest stop of each direction is within the gap", () => {
    const gap = distance([LNG, LAT], [VUELTA_NEAR.lng, VUELTA_NEAR.lat]) - distance([LNG, LAT], [IDA_NEAR.lng, IDA_NEAR.lat]);
    expect(gap).toBeLessThan(AMBIGUOUS_GAP_M);
    const choice = chooseNearest(both, HERE, new Set());
    expect(choice.kind).toBe("ask");
    if (choice.kind !== "ask") return;
    expect(choice.options.map((o) => o.stop.id)).toEqual([IDA_NEAR.id, VUELTA_NEAR.id]);
    expect(choice.options.map((o) => o.heading)).toEqual(["Alto Comedero", "Centro"]);
  });

  it("picks the stop a bus is actually approaching when both directions are close", () => {
    const choice = chooseNearest(both, HERE, new Set([VUELTA_NEAR.id]));
    expect(choice.kind).toBe("one");
    if (choice.kind !== "one") return;
    expect(choice.near.stop.id).toBe(VUELTA_NEAR.id);
    expect(choice.reason).toBe("approaching");
    expect(choice.other?.stop.id).toBe(IDA_NEAR.id);
  });

  it("picks the closer direction when the other side is clearly farther", () => {
    const stops = [IDA_NEAR, IDA_END, VUELTA_FAR, VUELTA_FAR_END];
    const gap = distance([LNG, LAT], [VUELTA_FAR.lng, VUELTA_FAR.lat]) - distance([LNG, LAT], [IDA_NEAR.lng, IDA_NEAR.lat]);
    expect(gap).toBeGreaterThan(AMBIGUOUS_GAP_M);
    const choice = chooseNearest(stops, HERE, new Set([VUELTA_FAR.id]));
    expect(choice.kind).toBe("one");
    if (choice.kind !== "one") return;
    expect(choice.near.stop.id).toBe(IDA_NEAR.id);
    expect(choice.reason).toBe("closer");
  });

  it("returns the only direction without asking", () => {
    const choice = chooseNearest([IDA_NEAR, IDA_END], HERE, new Set());
    expect(choice.kind).toBe("one");
    if (choice.kind !== "one") return;
    expect(choice.reason).toBe("only");
    expect(choice.near.heading).toBe("Alto Comedero");
  });
});

describe("respond", () => {
  const close = detail([IDA_NEAR, IDA_END, VUELTA_NEAR, VUELTA_END], { [IDA_NEAR.id]: 8.2 }, [IDA_NEAR.id]);
  const oneSide = detail([IDA_NEAR, IDA_END], { [IDA_NEAR.id]: 8.2 }, [IDA_NEAR.id]);

  it("asks where the person is, then confirms stop, walk and the current ETA", () => {
    const first = respond(null, ask41, facts());
    expect(first.create).toBeUndefined();
    expect(first.replies[0].locationKeyboard).toBe(true);
    expect(first.replies[0].text).toContain("ubicación");
    expect(first.session?.pending?.wait).toBe("place");
    expect(first.session?.pending?.lineId).toBe("41");

    const placed = respond(first.session, { kind: "location", lat: LAT, lng: LNG }, facts());
    expect(placed.needDetail).toBe("41");
    expect(placed.replies).toEqual([]);

    const done = respond(placed.session, { kind: "continue" }, facts({ detail: oneSide }));
    expect(done.create).toMatchObject({ line: "41", stop: IDA_NEAR.id, lineName: "Linea 41", stopName: "San Martin", minutes: 5 });
    const text = done.replies[0].text;
    expect(text).toContain("San Martin");
    expect(text).toContain("a pie");
    expect(text).toContain(formatDistance(distance([LNG, LAT], [IDA_NEAR.lng, IDA_NEAR.lat])));
    expect(text).toContain("≈ 8 min");
    expect(text).toContain("/casa");
    expect(text).toContain("90 días");
    expect(done.replies[0].rows).toEqual(minuteRows(IDA_NEAR.id, 5));
    for (const row of done.replies[0].rows ?? []) for (const button of row) expect(button.data.length).toBeLessThanOrEqual(64);
  });

  it("uses a saved place without asking for the location again", () => {
    const first = respond(null, ask41, facts({ saved: HERE }));
    expect(first.needDetail).toBe("41");
    expect(first.session?.pending?.fromCasa).toBe(true);
    const done = respond(first.session, { kind: "continue" }, facts({ saved: HERE, detail: oneSide }));
    expect(done.create?.stop).toBe(IDA_NEAR.id);
    expect(done.replies[0].text).toContain("guardaste como casa");
    expect(done.replies[0].locationKeyboard).toBeUndefined();
  });

  it("offers both directions, and a later tap creates only the chosen stop", () => {
    const started = respond(null, ask41, facts({ saved: HERE, detail: detail([IDA_NEAR, IDA_END, VUELTA_NEAR, VUELTA_END]) }));
    expect(started.create).toBeUndefined();
    expect(started.session?.pending?.wait).toBe("direction");
    expect(started.replies[0].text).toContain("¿Para cuál sentido");
    const data = started.replies[0].rows?.map((row) => row[0].data);
    expect(data).toEqual([`s:${IDA_NEAR.id}`, `s:${VUELTA_NEAR.id}`]);

    const picked = respond(started.session, { kind: "pick-stop", stopId: VUELTA_NEAR.id }, facts({ saved: HERE, detail: close }));
    expect(picked.create?.stop).toBe(VUELTA_NEAR.id);
    expect(picked.create?.line).toBe("41");
  });

  it("explains when it keeps the direction a bus is approaching", () => {
    const ambiguous = detail([IDA_NEAR, IDA_END, VUELTA_NEAR, VUELTA_END], { [VUELTA_NEAR.id]: 4 }, [VUELTA_NEAR.id]);
    const done = respond(null, ask41, facts({ saved: HERE, detail: ambiguous }));
    expect(done.create?.stop).toBe(VUELTA_NEAR.id);
    expect(done.replies[0].text).toContain("en camino");
    expect(done.replies[0].text).toContain("Centro");
  });

  it("explains when one direction is clearly closer", () => {
    const far = detail([IDA_NEAR, IDA_END, VUELTA_FAR, VUELTA_FAR_END], { [IDA_NEAR.id]: 6 }, [IDA_NEAR.id]);
    const done = respond(null, ask41, facts({ saved: HERE, detail: far }));
    expect(done.create?.stop).toBe(IDA_NEAR.id);
    expect(done.replies[0].text).toContain("más cercana");
  });

  it("disambiguates a number with buttons and does not create an alert yet", () => {
    const asked = respond(null, { kind: "ask", query: "2", minutes: 5, minutesNote: false }, facts());
    expect(asked.create).toBeUndefined();
    expect(asked.replies[0].rows?.map((row) => row[0].data)).toEqual(["l:2", "l:2-savio"]);
    const picked = respond(asked.session, { kind: "pick-line", lineId: "2-savio" }, facts({ saved: HERE }));
    expect(picked.needDetail).toBe("2-savio");
    expect(picked.session?.pending?.lineId).toBe("2-savio");
    expect(picked.session?.pending?.fromCasa).toBe(true);
  });

  it("refuses a line without live positions and never creates an alert", () => {
    for (const query of ["26", "1", "13"]) {
      const result = respond(null, { kind: "ask", query, minutes: 5, minutesNote: false }, facts());
      expect(result.create).toBeUndefined();
      expect(result.replies[0].text.toLowerCase()).toContain("posición en vivo");
      expect(result.replies[0].rows).toBeUndefined();
    }
    const urbano = respond(null, { kind: "ask", query: "1", minutes: 5, minutesNote: false }, facts());
    expect(urbano.replies[0].text).toContain("El Urbano");
    const both = respond(null, { kind: "ask", query: "13", minutes: 5, minutesNote: false }, facts());
    expect(both.replies[0].text).toContain("150 Hectareas");
    expect(both.replies[0].text).toContain("10 Hectareas");
    expect(both.create).toBeUndefined();
  });

  it("does not invent stops for a tracked line that has none", () => {
    const line = LINES.find((l) => l.id === "servicio-humahuaca")!;
    const empty: DetailFacts = { line, stops: [], approaching: [], eta: {}, fleetKnown: true };
    const first = respond(null, { kind: "ask", query: "humahuaca", minutes: 5, minutesNote: false }, facts({ saved: HERE }));
    const done = respond(first.session, { kind: "continue" }, facts({ saved: HERE, detail: empty }));
    expect(done.create).toBeUndefined();
    expect(done.replies[0].text).toContain("no tiene paradas");
  });

  it("saves the last shared point as casa for 90 days", () => {
    const shared = respond(null, { kind: "location", lat: LAT, lng: LNG }, facts());
    expect(shared.session?.recent).toEqual(HERE);
    expect(shared.savePlace).toBeUndefined();
    const casa = respond(shared.session, { kind: "casa" }, facts());
    expect(casa.savePlace).toEqual(HERE);
    expect(casa.replies[0].text).toContain("90 días");
  });

  it("lists pending alerts and blocks a fourth one", () => {
    const alerts = [1, 2, 3].map((n) => ({ stop: `s${n}`, lineName: `Linea ${n}`, stopName: `Parada ${n}`, minutes: 5 }));
    const list = respond(null, { kind: "avisos" }, facts({ alerts }));
    expect(list.replies[0].text).toContain("3 avisos");
    expect(list.replies[0].text).toContain("Parada 2");
    expect(list.replies[0].text).toContain("/cancelar");
    const blocked = respond(null, ask41, facts({ saved: HERE, alerts, detail: oneSide }));
    expect(blocked.create).toBeUndefined();
    expect(blocked.replies[0].text).toBe(texts.tooMany);
  });

  it("replaces the alert for the same stop instead of counting it twice", () => {
    const alerts = [
      { stop: IDA_NEAR.id, lineName: "Linea 41", stopName: "San Martin", minutes: 10 },
      { stop: "s2", lineName: "Linea 2", stopName: "Otra", minutes: 5 },
      { stop: "s3", lineName: "Linea 3", stopName: "Otra más", minutes: 5 },
    ];
    const done = respond(null, ask41, facts({ saved: HERE, alerts, detail: oneSide }));
    expect(done.create?.stop).toBe(IDA_NEAR.id);
    expect(done.create?.minutes).toBe(5);
  });

  it("says so when the lead time they asked for is not 3, 5 or 10", () => {
    const done = respond(null, { kind: "ask", query: "41", minutes: 5, minutesNote: true }, facts({ saved: HERE, detail: oneSide }));
    expect(done.create?.minutes).toBe(5);
    expect(done.replies[0].text).toContain("3, 5 o 10");
  });

  it("says when the fleet could not be read, instead of inventing an ETA", () => {
    const blind = detail([IDA_NEAR, IDA_END], {}, [], false);
    const done = respond(null, ask41, facts({ saved: HERE, detail: blind }));
    expect(done.create?.stop).toBe(IDA_NEAR.id);
    expect(done.replies[0].text).toContain("no pude ver");
  });
});

describe("welcome", () => {
  it("tells the person they can ask the bot, list alerts and cancel them", () => {
    const welcome = texts.welcome("https://ejemplo");
    expect(welcome).toContain("avisame cuando pase el 41");
    expect(welcome).toContain("/avisos");
    expect(welcome).toContain("/cancelar");
    expect(welcome).toContain("/casa");
    expect(welcome).toContain("90 días");
    expect(texts.help).toContain("/avisame");
    expect(texts.help).toContain("/cancelar");
    expect(askTexts.usage).toContain("/avisame 41");
  });
});

describe("UpdateSchema", () => {
  it("accepts a location message and still accepts text and callbacks", () => {
    const located = UpdateSchema.parse({ message: { chat: { id: 7 }, location: { latitude: LAT, longitude: LNG } } });
    expect(located.message?.location).toEqual({ latitude: LAT, longitude: LNG });
    expect(located.message?.text).toBeUndefined();
    expect(UpdateSchema.parse({ message: { chat: { id: 7 }, text: "/avisos" } }).message?.text).toBe("/avisos");
    expect(UpdateSchema.parse({ callback_query: { id: "c", data: "m:5:41-00000001", message: { chat: { id: 7 } } } }).callback_query?.data).toBe("m:5:41-00000001");
  });
});

describe("start-line: the map's link for a line", () => {
  it("starts the conversation with nothing pending, and asks where the person is", () => {
    const result = respond(null, { kind: "start-line", lineId: "2-savio" }, facts());
    expect(result.replies[0].text).toBe(askTexts.needPlace);
    expect(result.replies[0].locationKeyboard).toBe(true);
    expect(result.session?.pending?.lineId).toBe("2-savio");
    expect(result.session?.pending?.wait).toBe("place");
    expect(result.create).toBeUndefined();
  });

  it("never answers that the step expired, for any line with live positions", () => {
    for (const line of LINES.filter((l) => l.live)) {
      const result = respond(null, { kind: "start-line", lineId: line.id }, facts());
      expect(result.replies.map((r) => r.text)).not.toContain(askTexts.expired);
      expect(result.session?.pending?.lineId).toBe(line.id);
    }
  });

  it("does not ask which line: the id already says it, even when the number is shared", () => {
    const result = respond(null, { kind: "start-line", lineId: "2" }, facts());
    expect(result.replies[0].rows).toBeUndefined();
    expect(result.session?.pending?.lineId).toBe("2");
  });

  it("goes straight to the stops when a place is already saved", () => {
    const result = respond(null, { kind: "start-line", lineId: "41" }, facts({ saved: HERE }));
    expect(result.needDetail).toBe("41");
    expect(result.session?.pending?.fromCasa).toBe(true);
  });

  it("refuses a line without live positions", () => {
    const result = respond(null, { kind: "start-line", lineId: "muni-l026" }, facts());
    expect(result.replies[0].text.toLowerCase()).toContain("posición en vivo");
    expect(result.session?.pending).toBeUndefined();
    expect(result.create).toBeUndefined();
  });

  it("says so when the line does not exist", () => {
    const result = respond(null, { kind: "start-line", lineId: "999" }, facts());
    expect(result.replies[0].text).toBe(askTexts.unknownLine("999"));
    expect(result.session?.pending).toBeUndefined();
  });

  it("shows that pick-line was the wrong entry for a link: with nothing pending it expires", () => {
    expect(respond(null, { kind: "pick-line", lineId: "12" }, facts()).replies[0].text).toBe(askTexts.expired);
  });
});
