import { describe, expect, it } from "vitest";
import {
  canUseNativeInstallPrompt,
  guideKind,
  hiddenForNow,
  HIDE_MS,
  HIDDEN_KEY,
  INSTALL_COPY,
  iosBrowserName,
  isInApp,
  isStandalone,
  platformOf,
  rememberHide,
  SHARE_URL,
  whatsappShareUrl,
} from "./install";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
const IPHONE_FIREFOX =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15";
const IPHONE_EDGE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/126.0.2592.68 Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36";
const ANDROID_FIREFOX = "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0";
const ANDROID_SAMSUNG =
  "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.6167.164 Mobile Safari/537.36";
const ANDROID_FACEBOOK =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.0.0;]";
const ANDROID_INSTAGRAM =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 Instagram 340.0.0.0.0 Android";
const ANDROID_TELEGRAM =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 Telegram-Android/11.0";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0.0.0.0";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";
const WINDOWS_FIREFOX =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0";

describe("install platform", () => {
  it("treats iPhone and iPad Safari as the share-icon steps", () => {
    expect(platformOf(IPHONE_SAFARI)).toBe("ios-safari");
    expect(guideKind(IPHONE_SAFARI)).toBe("ios-safari");
    expect(platformOf(IPAD_SAFARI, "MacIntel", 5)).toBe("ios-safari");
    expect(INSTALL_COPY.iosSafari).toEqual(["Tocá el ícono Compartir", "Elegí “Agregar a inicio”", "Tocá “Agregar”"]);
  });

  it("gives Chrome, Firefox and Edge on iOS their own share-menu steps", () => {
    expect(guideKind(IPHONE_CHROME)).toBe("ios-browser");
    expect(guideKind(IPHONE_FIREFOX)).toBe("ios-browser");
    expect(guideKind(IPHONE_EDGE)).toBe("ios-browser");
    expect(iosBrowserName(IPHONE_CHROME)).toBe("Chrome");
    expect(iosBrowserName(IPHONE_FIREFOX)).toBe("Firefox");
    expect(iosBrowserName(IPHONE_EDGE)).toBe("Edge");
    expect(INSTALL_COPY.iosBrowser[0]).toContain("Compartir");
    expect(INSTALL_COPY.iosBrowser[1]).toContain("Agregar a inicio");
    expect(canUseNativeInstallPrompt("ios-browser", false)).toBe(false);
    expect(canUseNativeInstallPrompt("ios-safari", false)).toBe(false);
  });

  it("detects macOS desktop Safari with Add to Dock steps", () => {
    expect(platformOf(MAC_SAFARI)).toBe("desktop-mac");
    expect(guideKind(MAC_SAFARI)).toBe("mac-safari");
    expect(INSTALL_COPY.macSafari[1]).toContain("Agregar al Dock");
  });

  it("detects Windows Edge and Chrome with omnibox install steps", () => {
    expect(platformOf(WINDOWS_EDGE)).toBe("desktop-windows");
    expect(guideKind(WINDOWS_EDGE)).toBe("desktop-edge");
    expect(INSTALL_COPY.desktopEdge[0]).toContain("barra de direcciones");

    expect(platformOf(WINDOWS_CHROME)).toBe("desktop-windows");
    expect(guideKind(WINDOWS_CHROME)).toBe("desktop-chrome");
    expect(INSTALL_COPY.desktopChrome[0]).toContain("barra de direcciones");
  });

  it("gives desktop Firefox an informative explanation", () => {
    expect(guideKind(WINDOWS_FIREFOX)).toBe("desktop-firefox");
    expect(INSTALL_COPY.desktopFirefox).toContain("Google Chrome, Microsoft Edge o Safari");
  });

  it("keeps a button path for Android even when the native prompt never comes", () => {
    expect(platformOf(ANDROID_CHROME)).toBe("android");
    expect(guideKind(ANDROID_CHROME)).toBe("chrome");
    expect(guideKind(ANDROID_FIREFOX)).toBe("firefox");
    expect(guideKind(ANDROID_SAMSUNG)).toBe("samsung");
    expect(INSTALL_COPY.chrome[0]).toContain("barra de direcciones");
    expect(canUseNativeInstallPrompt("android", false)).toBe(true);
  });

  it("sends in-app browsers to the open-in-Chrome steps", () => {
    for (const ua of [ANDROID_FACEBOOK, ANDROID_INSTAGRAM, ANDROID_TELEGRAM, IPHONE_INSTAGRAM]) {
      expect(isInApp(ua)).toBe(true);
      expect(guideKind(ua)).toBe("inapp");
    }
    expect(INSTALL_COPY.inapp).toBe("Abrilo en Chrome o Safari: tocá ⋮ o … y elegí Abrir en el navegador.");
    expect(isInApp(ANDROID_CHROME)).toBe(false);
    expect(canUseNativeInstallPrompt("android", true)).toBe(false);
  });

  it("leaves a desktop browser without a phone guide", () => {
    const desktop = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    expect(platformOf(desktop)).toBe("other");
    expect(guideKind(desktop)).toBe("chrome");
  });
});

describe("install visibility", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
  };

  it("hides for seven days after Ocultar, and not forever", () => {
    const store = memory();
    const now = 1_700_000_000_000;
    expect(hiddenForNow(now, store)).toBe(false);
    rememberHide(now, store);
    expect(store.getItem(HIDDEN_KEY)).toBe(String(now + HIDE_MS));
    expect(hiddenForNow(now + HIDE_MS - 1, store)).toBe(true);
    expect(hiddenForNow(now + HIDE_MS, store)).toBe(false);
  });

  it("does not keep the old forever flag", () => {
    const store = memory();
    store.setItem(HIDDEN_KEY, "1");
    expect(hiddenForNow(Date.now(), store)).toBe(false);
  });

  it("stays quiet when storage throws", () => {
    const store = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(hiddenForNow(Date.now(), store)).toBe(false);
    expect(() => rememberHide(Date.now(), store)).not.toThrow();
  });

  it("treats a launched home-screen app as installed", () => {
    expect(isStandalone(() => false, true)).toBe(true);
    expect(isStandalone((query) => query === "(display-mode: standalone)", false)).toBe(true);
    expect(isStandalone(() => false, false)).toBe(false);
    expect(isStandalone(() => false, undefined)).toBe(false);
  });
});

describe("share link", () => {
  it("builds a WhatsApp message with the public site", () => {
    expect(SHARE_URL).toBe("https://colejuy.vercel.app");
    expect(whatsappShareUrl()).toBe(
      `https://wa.me/?text=${encodeURIComponent("Mirá los colectivos de Jujuy en vivo. https://colejuy.vercel.app")}`,
    );
  });
});
