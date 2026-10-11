"use client";

import { track as vercelTrack } from "@vercel/analytics";

// Same gtag the layout snippet installs. No id means no Google call at all.
export const GA_EVENTS = {
  lineSelected: "line_selected",
  stopOpened: "stop_opened",
  tripPlanned: "trip_planned",
  telegramAlert: "telegram_alert_click",
  installClick: "install_click",
  installPromptAccepted: "install_prompt_accepted",
  installFallbackShown: "install_fallback_shown",
  shareClick: "share_click",
  copyLinkClick: "copy_link_click",
  busEtaShown: "bus_eta_shown",
} as const;

export type BusEtaResult = "coming" | "passed" | "stale" | "unavailable";

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

// Vercel Web Analytics: cookieless. Only public line ids and coarse labels; never stops, coordinates or interno.
function vTrack(name: string, props?: Record<string, string | number>) {
  try {
    vercelTrack(name, props);
  } catch {
    // analytics must never break the app
  }
}

export function trackLineSelected(lineId: string) {
  vTrack("line_open", { line: lineId });
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

export function trackInstallClick(surface: string) {
  vTrack("install_prompt", { step: "click" });
  track(GA_EVENTS.installClick, { surface });
}

export function trackInstallPromptAccepted() {
  vTrack("install_prompt", { step: "accepted" });
  track(GA_EVENTS.installPromptAccepted);
}

export function trackInstallFallbackShown(surface: string) {
  track(GA_EVENTS.installFallbackShown, { surface });
}

export function trackShareClick() {
  vTrack("share", { method: "share" });
  track(GA_EVENTS.shareClick);
}

export function trackCopyLinkClick() {
  vTrack("share", { method: "copy_link" });
  track(GA_EVENTS.copyLinkClick);
}

// The line and the stop the card aimed at. No position, no address, no interno.
export function trackBusEtaShown(lineId: string, stopId: string, result: BusEtaResult) {
  vTrack("bus_eta_tap", { line: lineId, result });
  track(GA_EVENTS.busEtaShown, { line_id: lineId, stop_id: stopId, result });
}
