import { describe, expect, it } from "vitest";
import { arrivalRange, decide, EXPIRES_MS, parseLine, parseStop, texts, type Alert } from "./alerts";

const alert: Alert = { chat: 1, line: "12", stop: "12-0fa9195c", lineName: "Linea 12", stopName: "Av Italia y Belgrano", minutes: 5, created: 1_000_000 };

describe("parseStop", () => {
  it("splits a stop id into its line and the stop", () => {
    expect(parseStop("12-0fa9195c")).toEqual({ line: "12", stop: "12-0fa9195c" });
    expect(parseStop("2-savio-903182a2")).toEqual({ line: "2-savio", stop: "2-savio-903182a2" });
  });

  it("rejects anything that is not a stop id", () => {
    for (const bad of ["", "12", "12-xyz", "12-0FA9195C", "../etc-0fa9195c", "12-0fa9195c extra", "a".repeat(60) + "-0fa9195c"]) {
      expect(parseStop(bad)).toBeNull();
    }
  });
});

describe("parseLine", () => {
  it("reads the line from a line-only start link", () => {
    expect(parseLine("l_12")).toBe("12");
    expect(parseLine("l_2-savio")).toBe("2-savio");
    expect(parseLine("l_49bis")).toBe("49bis");
  });

  it("rejects stop ids and anything else", () => {
    for (const bad of ["", "12", "l_", "12-0fa9195c", "l_12 extra", "L_12", "l_../x", "l_" + "a".repeat(60)]) expect(parseLine(bad)).toBeNull();
  });

  it("never reads a stop id as a line, nor a line link as a stop", () => {
    expect(parseStop("l_12")).toBeNull();
    expect(parseLine("2-savio-903182a2")).toBeNull();
  });
});

describe("decide", () => {
  it("waits while the nearest bus is further than asked", () => {
    expect(decide(alert, alert.created + 60_000, 9)).toBe("wait");
  });

  it("notifies when the bus is as close as asked, or closer", () => {
    expect(decide(alert, alert.created + 60_000, 5)).toBe("notify");
    expect(decide(alert, alert.created + 60_000, 0.4)).toBe("notify");
  });

  it("waits when no bus is on its way yet", () => {
    expect(decide(alert, alert.created + 60_000, null)).toBe("wait");
  });

  it("expires after 90 minutes with no bus close enough", () => {
    expect(decide(alert, alert.created + EXPIRES_MS + 1, null)).toBe("expire");
    expect(decide(alert, alert.created + EXPIRES_MS + 1, 30)).toBe("expire");
  });

  it("still notifies an old alert if the bus is finally close", () => {
    expect(decide(alert, alert.created + EXPIRES_MS + 1, 3)).toBe("notify");
  });
});

describe("texts", () => {
  it("says the minutes, the line and the stop", () => {
    // 1,417 m is "5 minutes" at the average speed: the message gives the distance and what that can mean.
    expect(texts.notify(alert, 1417, 5, "736")).toBe("Linea 12 está a 1,4 km de Av Italia y Belgrano (coche 736). Llega en unos 5 min; puede ser entre 3 y 7.");
    expect(texts.notify(alert, 850, 3, null)).toBe("Linea 12 está a 850 m de Av Italia y Belgrano. Llega en unos 3 min; puede ser entre 2 y 4.");
    expect(texts.notify(alert, 2833, 10, "201")).toBe("Linea 12 está a 2,8 km de Av Italia y Belgrano (coche 201). Llega en unos 10 min; puede ser entre 5 y 14.");
    expect(texts.notify(alert, 300, 1.06, null)).toBe("Linea 12 está a 300 m de Av Italia y Belgrano. Llega en 1 min; puede ser entre 1 y 2.");
    // Close enough that both ends round to the same minute: no range to give.
    expect(texts.notify(alert, 160, 0.56, null)).toBe("Linea 12 está a 160 m de Av Italia y Belgrano. Llega en 1 min.");
  });

  it("says it is arriving under one minute, and copes without a bus number", () => {
    expect(texts.notify(alert, 90, 0.3, null)).toBe("Está llegando Linea 12 a Av Italia y Belgrano.");
  });

  it("counts cancelled alerts", () => {
    expect(texts.cancelled(0)).toBe("No tenías avisos pendientes.");
    expect(texts.cancelled(1)).toBe("Cancelé tu aviso.");
    expect(texts.cancelled(3)).toBe("Cancelé tus 3 avisos.");
  });
});

describe("arrivalRange", () => {
  it("brackets the average estimate on both sides", () => {
    // 17 km/h is 283 m a minute.
    for (const minutes of [3, 5, 10]) {
      const [soonest, latest] = arrivalRange(minutes * 283);
      expect(soonest).toBeLessThan(minutes);
      expect(latest).toBeGreaterThan(minutes);
    }
  });

  it("gives whole minutes, never under one, and never a latest before the soonest", () => {
    for (const meters of [0, 50, 151, 400, 1417, 2833, 9000]) {
      const [soonest, latest] = arrivalRange(meters);
      expect(Number.isInteger(soonest) && Number.isInteger(latest)).toBe(true);
      expect(soonest).toBeGreaterThanOrEqual(1);
      expect(latest).toBeGreaterThanOrEqual(soonest);
    }
  });

  it("covers the slow and the fast end measured on the fleet", () => {
    // 1,000 m: 11.8 km/h takes 5.1 min, 31.3 km/h takes 1.9.
    expect(arrivalRange(1000)).toEqual([2, 5]);
    expect(arrivalRange(1417)).toEqual([3, 7]);
  });
});
