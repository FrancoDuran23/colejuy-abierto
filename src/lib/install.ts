// How "Instalar acceso directo" decides what to show. Kept pure so the phone
// cases can be tested without a browser.

export const HIDDEN_KEY = "colejuy-instalar-oculto";
export const HIDE_MS = 7 * 24 * 60 * 60 * 1000;

export const INSTALL_COPY = {
  button: "Instalar acceso directo",
  hide: "Ocultar",
  inappTitle: "Abrilo en el navegador",
  inapp: "Abrilo en Chrome o Safari: tocá ⋮ o … y elegí Abrir en el navegador.",
  chrome: [
    "En la barra de direcciones (a la derecha de la URL), hacé clic en el ícono de instalación (⊕ o pantalla).",
    "O en el menú ⋮ > Guardar y compartir > Instalar ColeJUY…",
    "Confirmá en “Instalar” para abrir la app en su propia ventana.",
  ],
  desktopChrome: [
    "En la barra de direcciones (a la derecha de la URL), hacé clic en el ícono de instalación (⊕ o pantalla).",
    "O en el menú ⋮ > Guardar y compartir > Instalar ColeJUY…",
    "Confirmá en “Instalar” para abrir la app en su propia ventana.",
  ],
  desktopEdge: [
    "En la barra de direcciones (a la derecha de la URL), hacé clic en el ícono de instalación (⊞).",
    "O en el menú … > Aplicaciones > Instalar este sitio como aplicación.",
    "Confirmá en “Instalar” para integrarla con tu sistema.",
  ],
  macSafari: [
    "En la barra de menú superior de tu Mac, hacé clic en “Archivo” (o el ícono Compartir).",
    "Seleccioná “Agregar al Dock…”.",
    "Hacé clic en “Agregar” para abrir ColeJUY como app en tu Mac.",
  ],
  desktopFirefox:
    "Firefox de escritorio no cuenta con soporte nativo para instalar PWAs. Te recomendamos abrir ColeJUY en Google Chrome, Microsoft Edge o Safari para instalarlo como aplicación independiente.",
  firefox: [
    "Tocá el menú de opciones (⋮ o …).",
    "Elegí “Instalar” o “Agregar a pantalla de inicio”.",
    "Confirmá en “Agregar”.",
  ],
  samsung: [
    "Tocá el menú de opciones (☰ o ⋮ abajo a la derecha).",
    "Elegí “Agregar página a” > “Pantalla de inicio”.",
    "Confirmá en “Agregar”.",
  ],
  other: "En el menú del navegador o barra de direcciones, buscá “Instalar app” o “Agregar a pantalla principal”.",
  iosSafari: ["Tocá el ícono Compartir", "Elegí “Agregar a inicio”", "Tocá “Agregar”"],
  iosBrowser: ["Tocá “Compartir”", "Elegí “Agregar a inicio”", "Tocá “Agregar”"],
} as const;

export const SHARE_URL = "https://colejuy.vercel.app";
export const SHARE_TITLE = "ColeJUY";
export const SHARE_TEXT = "Mirá los colectivos de Jujuy en vivo.";

export type Platform =
  | "ios-safari"
  | "ios-browser"
  | "android"
  | "desktop-mac"
  | "desktop-windows"
  | "other";

export type GuideKind =
  | "ios-safari"
  | "ios-browser"
  | "inapp"
  | "mac-safari"
  | "desktop-chrome"
  | "desktop-edge"
  | "desktop-firefox"
  | "chrome"
  | "firefox"
  | "samsung"
  | "other";

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
  const appleMobile = /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  if (appleMobile) return /CriOS|FxiOS|EdgiOS/.test(ua) ? "ios-browser" : "ios-safari";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|Mac OS X/i.test(ua) || platform === "MacIntel") return "desktop-mac";
  if (/Windows|Win32|Win64/i.test(ua)) return "desktop-windows";
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

  if (where === "desktop-mac" && !/Chrome|CriOS|Firefox|FxiOS|Edg/i.test(ua) && /Safari/i.test(ua)) {
    return "mac-safari";
  }

  if (where === "desktop-mac" || where === "desktop-windows") {
    if (/Edg\//i.test(ua)) return "desktop-edge";
    if (/Firefox/i.test(ua)) return "desktop-firefox";
    if (/Chrome|Chromium|Brave|OPR|Opera/i.test(ua)) return "desktop-chrome";
  }

  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Firefox|FxiOS/i.test(ua)) return "firefox";
  if (/Chrome|CriOS|EdgA|EdgiOS|OPR|Opera/i.test(ua)) return "chrome";
  return "other";
}

export function isStandalone(matches: (query: string) => boolean, standalone: boolean | undefined): boolean {
  if (standalone === true) return true;
  return matches("(display-mode: standalone)");
}

export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return isStandalone((query) => window.matchMedia(query).matches, nav.standalone);
}

// iOS browsers install from the Share sheet. Calling a captured
// beforeinstallprompt there is unreliable (and Chrome can mistake the action
// for a file save), so only non-iOS browsers may use the native prompt.
export function canUseNativeInstallPrompt(platform: Platform, inApp: boolean): boolean {
  return !inApp && platform !== "ios-safari" && platform !== "ios-browser";
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
// rest. Service-worker registration lives in layout.tsx so development cannot
// accidentally re-register it after the cleanup script runs.
export function bindInstallCapture(): void {
  if (typeof window === "undefined" || window.__bipBound) return;
  window.__bipBound = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    window.__bip = event as InstallPromptEvent;
  });
}

bindInstallCapture();
