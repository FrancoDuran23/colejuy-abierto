import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import manifest from "@/app/manifest";
import {
  canUseNativeInstallPrompt,
  guideKind,
  hiddenForNow,
  HIDE_MS,
  HIDDEN_KEY,
  isStandalone,
  rememberHide,
  INSTALL_COPY,
} from "@/lib/install";

describe("PWA Contract - Web App Manifest", () => {
  it("enforces strict 'ColeJUY' app naming without long description text", () => {
    const config = manifest();
    expect(config.name).toBe("ColeJUY");
    expect(config.short_name).toBe("ColeJUY");
    expect(config.name).not.toContain("colectivos de San Salvador de Jujuy");
    expect(config.short_name).not.toContain("colectivos");
  });

  it("configures standalone display and launch URLs", () => {
    const config = manifest();
    expect(config.start_url).toBe("/");
    expect(config.scope).toBe("/");
    expect(config.display).toBe("standalone");
    expect(config.lang).toBe("es");
  });

  it("includes complete icon set with maskable support", () => {
    const config = manifest();
    expect(config.icons).toBeDefined();
    expect(config.icons!.length).toBeGreaterThanOrEqual(4);

    const icon192 = config.icons!.find((i) => i.sizes === "192x192" && i.purpose === "any");
    const icon512 = config.icons!.find((i) => i.sizes === "512x512" && i.purpose === "any");
    const maskable192 = config.icons!.find((i) => i.sizes === "192x192" && i.purpose === "maskable");
    const maskable512 = config.icons!.find((i) => i.sizes === "512x512" && i.purpose === "maskable");

    expect(icon192).toBeDefined();
    expect(icon512).toBeDefined();
    expect(maskable192).toBeDefined();
    expect(maskable512).toBeDefined();
  });
});

describe("PWA Contract - Layout Metadata & Apple Web App", () => {
  const layoutPath = path.resolve(process.cwd(), "src/app/layout.tsx");
  const layoutContent = fs.readFileSync(layoutPath, "utf-8");

  it("defines ColeJUY title and application name metadata", () => {
    expect(layoutContent).toMatch(/applicationName:\s*["']ColeJUY["']/);
    expect(layoutContent).toMatch(/title:\s*\{\s*default:\s*["']ColeJUY["']/);
  });

  it("configures iOS standalone web app capabilities", () => {
    expect(layoutContent).toMatch(/appleWebApp:\s*\{\s*capable:\s*true,\s*title:\s*["']ColeJUY["']/);
  });

  it("configures viewport with safe area inset cover", () => {
    expect(layoutContent).toMatch(/viewportFit:\s*["']cover["']/);
    expect(layoutContent).toMatch(/themeColor:\s*["']#f3f0e8["']/);
    expect(layoutContent).toMatch(/manifest:\s*["']\/manifest\.webmanifest["']/);
  });
});

describe("PWA Contract - Service Worker Implementation", () => {
  const swPath = path.resolve(process.cwd(), "public/sw.js");
  const swContent = fs.readFileSync(swPath, "utf-8");

  it("defines cache versioning and precache assets", () => {
    expect(swContent).toContain("CACHE_VERSION");
    expect(swContent).toContain("APP_SHELL");
    expect(swContent).toContain("'/manifest.webmanifest'");
    expect(swContent).toContain("'/icon-192.png'");
    expect(swContent).toContain("'/icon-512.png'");
    expect(swContent).toContain("'/maplibre-gl-worker.mjs'");
  });

  it("strictly bypasses cache for real-time fleet positions", () => {
    // /api/fleet MUST be network-only to prevent showing stale or frozen buses
    expect(swContent).toMatch(/pathname === '\/api\/fleet' \|\| url\.pathname\.startsWith\('\/api\/fleet\/'\)/);
    expect(swContent).toContain("event.respondWith(fetch(request))");
  });

  it("includes offline fallback for navigation and static routes", () => {
    expect(swContent).toContain("request.mode === 'navigate'");
    expect(swContent).toContain("ColeJUY sin conexión");
    expect(swContent).toContain("Estás sin conexión");
  });
});

describe("PWA Contract - Cross-Platform Installation Guidance", () => {
  it("provides tailored instructions for macOS Safari (Dock integration)", () => {
    const macSafariUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
    const kind = guideKind(macSafariUA, "MacIntel", 0);
    expect(kind).toBe("mac-safari");
    expect(INSTALL_COPY.macSafari[1]).toContain("Agregar al Dock");
  });

  it("provides tailored instructions for Windows Microsoft Edge", () => {
    const edgeUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
    const kind = guideKind(edgeUA, "Win32", 0);
    expect(kind).toBe("desktop-edge");
    expect(INSTALL_COPY.desktopEdge[0]).toContain("⊞");
  });

  it("provides tailored instructions for Desktop Chrome", () => {
    const chromeUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    const kind = guideKind(chromeUA, "Win32", 0);
    expect(kind).toBe("desktop-chrome");
    expect(INSTALL_COPY.desktopChrome[0]).toContain("⊕");
  });

  it("provides tailored instructions for iOS Safari (Share menu)", () => {
    const iosUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1";
    const kind = guideKind(iosUA, "iPhone", 5);
    expect(kind).toBe("ios-safari");
    expect(INSTALL_COPY.iosSafari[0]).toContain("Compartir");
    expect(INSTALL_COPY.iosSafari[1]).toContain("Agregar a inicio");
  });

  it("warns in-app browsers to open in external browser", () => {
    const igUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0";
    const kind = guideKind(igUA, "iPhone", 5);
    expect(kind).toBe("inapp");
    expect(INSTALL_COPY.inapp).toContain("Abrilo en Chrome o Safari");
  });

  it("distinguishes native install prompt availability between Android/Desktop and iOS", () => {
    expect(canUseNativeInstallPrompt("android", false)).toBe(true);
    expect(canUseNativeInstallPrompt("desktop-windows", false)).toBe(true);
    expect(canUseNativeInstallPrompt("desktop-mac", false)).toBe(true);
    expect(canUseNativeInstallPrompt("ios-safari", false)).toBe(false);
    expect(canUseNativeInstallPrompt("ios-browser", false)).toBe(false);
    expect(canUseNativeInstallPrompt("android", true)).toBe(false);
  });
});

describe("PWA Contract - Standalone & Dismissal Lifecycle", () => {
  it("detects standalone display mode correctly", () => {
    expect(isStandalone((q) => q.includes("standalone"), false)).toBe(true);
    expect(isStandalone(() => false, true)).toBe(true);
    expect(isStandalone(() => false, false)).toBe(false);
  });

  it("enforces 7-day cooldown when dismissed", () => {
    const memory = new Map<string, string>();
    const store = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, val: string) => memory.set(key, val),
    };

    const now = 1700000000000;
    expect(hiddenForNow(now, store)).toBe(false);

    rememberHide(now, store);
    expect(memory.get(HIDDEN_KEY)).toBe(String(now + HIDE_MS));
    expect(HIDE_MS).toBe(7 * 24 * 60 * 60 * 1000);

    // 1 day later -> still hidden
    expect(hiddenForNow(now + 24 * 3600 * 1000, store)).toBe(true);
    // 6 days later -> still hidden
    expect(hiddenForNow(now + 6 * 24 * 3600 * 1000, store)).toBe(true);
    // 8 days later -> cooldown expired, prompt shown again
    expect(hiddenForNow(now + 8 * 24 * 3600 * 1000, store)).toBe(false);
  });
});
