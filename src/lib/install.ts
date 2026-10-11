// How "Instalar acceso directo" decides what to show. Kept pure so the phone
// cases can be tested without a browser.

export const HIDDEN_KEY = "colejuy-instalar-oculto";
export const HIDE_MS = 7 * 24 * 60 * 60 * 1000;

export const INSTALL_COPY = {
  button: "Instalar acceso directo",
  hide: "Ocultar",
  inappTitle: "Abrilo en el navegador",
  inapp: "Abrilo en Chrome/Safari: tocá ⋮ o … y elegí Abrir en el navegador.",
  chrome: "Menú ⋮ > Instalar app / Agregar a pantalla principal.",
  firefox: "Menú ⋮ > Instalar o Agregar a pantalla de inicio.",
  samsung: "Menú > Agregar página a > Pantalla de inicio.",
  other: "En el menú del navegador, buscá “Instalar app” o “Agregar a pantalla principal”.",
  iosSafari: ["Tocá el ícono Compartir", "Elegí “Agregar a inicio”", "Tocá “Agregar”"],
  iosBrowser: ["Tocá “Compartir”", "Elegí “Agregar a inicio”", "Tocá “Agregar”"],
} as const;

export const SHARE_URL = "https://colejuy.vercel.app";
export const SHARE_TITLE = "Colectivos Jujuy";
export const SHARE_TEXT = "Mirá los colectivos de Jujuy en vivo.";

export type Platform = "ios-safari" | "ios-browser" | "android" | "other";
export type GuideKind = "ios-safari" | "ios-browser" | "inapp" | "chrome" | "firefox" | "samsung" | "other";

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __bip?: InstallPromptEvent | null;
    __bipBound?: boolean;
  }
}

// Facebook, Instagram and Telegram open the site in their own browser. So do the
// other in-app webviews that arrive the same way. None of them can install a PWA.
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Telegram|WhatsApp|TikTok|Snapchat|Twitter|LinkedInApp|MicroMessenger|GSA\/|; wv\)/i;

export function isInApp(ua: string): boolean {
  return IN_APP.test(ua);
}

export function platformOf(ua: string, platform = "", maxTouchPoints = 0): Platform {
  const apple = /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  if (apple) return /CriOS|FxiOS|EdgiOS/.test(ua) ? "ios-browser" : "ios-safari";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export function iosBrowserName(ua: string): string {
  if (/CriOS/.test(ua)) return "Chrome";
  if (/FxiOS/.test(ua)) return "Firefox";
  if (/EdgiOS/.test(ua)) return "Edge";
  return "este navegador";
}

// What the sheet says when the browser will not show its own install prompt.
export function guideKind(ua: string, platform = "", maxTouchPoints = 0): GuideKind {
  if (isInApp(ua)) return "inapp";
  const where = platformOf(ua, platform, maxTouchPoints);
  if (where === "ios-safari") return "ios-safari";
  if (where === "ios-browser") return "ios-browser";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Firefox|FxiOS/i.test(ua)) return "firefox";
  if (/Chrome|CriOS|EdgA|EdgiOS|OPR|Opera/i.test(ua)) return "chrome";
  return "other";
}

export function isStandalone(matches: (query: string) => boolean, standalone: boolean | undefined): boolean {
  if (standalone === true) return true;
  return ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"].some((mode) => matches(`(display-mode: ${mode})`));
}

export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return isStandalone((query) => window.matchMedia(query).matches, nav.standalone);
}

type Store = Pick<Storage, "getItem" | "setItem">;

function storage(): Store | null {
  return globalThis.localStorage ?? null;
}

// "Ocultar" lasts a week. The old value "1" meant forever; it is a timestamp in
// 1970, so it no longer hides the button.
export function hiddenForNow(now = Date.now(), store: Store | null = storage()): boolean {
  if (!store) return false;
  try {
    const raw = store.getItem(HIDDEN_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && now < until;
  } catch {
    return false;
  }
}

export function rememberHide(now = Date.now(), store: Store | null = storage()): void {
  if (!store) return;
  try {
    store.setItem(HIDDEN_KEY, String(now + HIDE_MS));
  } catch {
    // Private mode can refuse storage. The button still hides for this visit.
  }
}

export function whatsappShareUrl(text = SHARE_TEXT, url = SHARE_URL): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

// The browser can fire beforeinstallprompt before this module loads. layout.tsx
// listens first and leaves the event on window.__bip. This listener covers the
// rest, and registers the worker as soon as the bundle runs.
export function bindInstallCapture(): void {
  if (typeof window === "undefined" || window.__bipBound) return;
  window.__bipBound = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    window.__bip = event as InstallPromptEvent;
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }
}

bindInstallCapture();
