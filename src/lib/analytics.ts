"use client";

// Same gtag the layout snippet installs. No id means no Google call at all.
export const GA_EVENTS = {
  lineSelected: "line_selected",
  stopOpened: "stop_opened",
  tripPlanned: "trip_planned",
  telegramAlert: "telegram_alert_click",
} as const;

type Params = Record<string, string | number>;

type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (command: "event", name: string, params?: Params) => void;
};

export function measurementId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_GA_ID?.trim();
  return id || undefined;
}

export function track(name: string, params?: Params) {
  if (!measurementId() || typeof window === "undefined") return;
  const w = window as GtagWindow;
  w.dataLayer = w.dataLayer ?? [];
  // The layout script is afterInteractive. Queue in the same shape gtag uses if it has not run yet.
  if (typeof w.gtag !== "function") {
    w.gtag = function gtag() {
      // gtag.js reads this Arguments object. An array would sit in the queue unread.
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer?.push(arguments);
    };
  }
  w.gtag("event", name, params ?? {});
}

export function trackLineSelected(lineId: string) {
  track(GA_EVENTS.lineSelected, { line_id: lineId });
}

export function trackStopOpened(lineId: string, stopId: string) {
  track(GA_EVENTS.stopOpened, { line_id: lineId, stop_id: stopId });
}

// Line ids and whether the trip changes bus. Coordinates, stop names and addresses stay out.
export function trackTripPlanned(legs: readonly { line: string }[]) {
  track(GA_EVENTS.tripPlanned, {
    line_id: legs.map((leg) => leg.line).join(","),
    changes: legs.length > 1 ? 1 : 0,
  });
}

export function trackTelegramAlert(lineId: string, stopId: string) {
  track(GA_EVENTS.telegramAlert, { line_id: lineId, stop_id: stopId });
}
