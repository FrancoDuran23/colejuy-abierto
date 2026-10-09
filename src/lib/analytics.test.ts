import { afterEach, describe, expect, it, vi } from "vitest";
import { GA_EVENTS, track, trackLineSelected, trackStopOpened, trackTelegramAlert, trackTripPlanned } from "./analytics";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_GA_ID;
  vi.unstubAllGlobals();
});

describe("analytics", () => {
  it("stays quiet when the measurement id is missing", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    trackLineSelected("41");
    trackStopOpened("41", "9");
    trackTripPlanned([{ line: "41" }]);
    trackTelegramAlert("41", "9");
    track("line_selected", { line_id: "41" });
    expect(gtag).not.toHaveBeenCalled();
  });

  it("treats a blank id as off", () => {
    process.env.NEXT_PUBLIC_GA_ID = "   ";
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    trackLineSelected("41");
    expect(gtag).not.toHaveBeenCalled();
  });

  it("does nothing on the server", () => {
    process.env.NEXT_PUBLIC_GA_ID = "G-TEST";
    expect(() => trackLineSelected("41")).not.toThrow();
  });

  it("sends the four events with line and stop ids only", () => {
    process.env.NEXT_PUBLIC_GA_ID = "G-TEST";
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    trackLineSelected("2-savio");
    trackStopOpened("41", "stop-9");
    trackTripPlanned([{ line: "41" }, { line: "10" }]);
    trackTelegramAlert("41", "stop-9");
    expect(gtag.mock.calls).toEqual([
      ["event", GA_EVENTS.lineSelected, { line_id: "2-savio" }],
      ["event", GA_EVENTS.stopOpened, { line_id: "41", stop_id: "stop-9" }],
      ["event", GA_EVENTS.tripPlanned, { line_id: "41,10", changes: 1 }],
      ["event", GA_EVENTS.telegramAlert, { line_id: "41", stop_id: "stop-9" }],
    ]);
    for (const call of gtag.mock.calls) {
      expect(JSON.stringify(call)).not.toMatch(/lat|lng|ubicacion|chat/i);
    }
  });

  it("queues the event until the afterInteractive snippet defines gtag", () => {
    process.env.NEXT_PUBLIC_GA_ID = "G-TEST";
    const dataLayer: unknown[] = [];
    vi.stubGlobal("window", { dataLayer });
    trackLineSelected("41");
    const queued = dataLayer[0] as IArguments;
    expect(dataLayer).toHaveLength(1);
    expect([queued[0], queued[1], queued[2]]).toEqual(["event", GA_EVENTS.lineSelected, { line_id: "41" }]);
  });

  it("counts a direct trip as no change of bus", () => {
    process.env.NEXT_PUBLIC_GA_ID = "G-TEST";
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    trackTripPlanned([{ line: "49bis" }]);
    expect(gtag).toHaveBeenCalledWith("event", GA_EVENTS.tripPlanned, { line_id: "49bis", changes: 0 });
  });
});
