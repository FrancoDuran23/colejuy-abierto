"use client";

import { useEffect, useRef, useState } from "react";
import { trackInstallClick, trackInstallFallbackShown, trackInstallPromptAccepted } from "@/lib/analytics";
import {
  canUseNativeInstallPrompt,
  guideKind,
  hiddenForNow,
  INSTALL_COPY,
  iosBrowserName,
  isInApp,
  isInstalled,
  platformOf,
  rememberHide,
  type GuideKind,
  type Platform,
} from "@/lib/install";
import { CloseIcon, DownloadIcon } from "./icons";

// The iOS share glyph: an arrow leaving a box. Safari uses this, not a word.
function IosShareIcon() {
  return (
    <svg className="ios-share" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.5v9.5M8.2 7.2 12 3.5l3.8 3.7M16.5 10.5H18a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6.5a2 2 0 0 1 2-2h1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function stepsFor(kind: GuideKind): readonly string[] | null {
  if (kind === "ios-safari") return INSTALL_COPY.iosSafari;
  if (kind === "ios-browser") return INSTALL_COPY.iosBrowser;
  if (kind === "mac-safari") return INSTALL_COPY.macSafari;
  if (kind === "desktop-chrome" || kind === "chrome") return INSTALL_COPY.desktopChrome;
  if (kind === "desktop-edge") return INSTALL_COPY.desktopEdge;
  if (kind === "firefox") return INSTALL_COPY.firefox;
  if (kind === "samsung") return INSTALL_COPY.samsung;
  return null;
}

function proseFor(kind: GuideKind): string | null {
  if (kind === "inapp") return INSTALL_COPY.inapp;
  if (kind === "desktop-firefox") return INSTALL_COPY.desktopFirefox;
  if (kind === "other") return INSTALL_COPY.other;
  return null;
}

export default function Install() {
  const [installed, setInstalled] = useState(false);
  const [banner, setBanner] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [sheet, setSheet] = useState<GuideKind | null>(null);
  const [ua, setUa] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const prompting = useRef(false);

  useEffect(() => {
    const agent = navigator.userAgent;
    const where = platformOf(agent, navigator.platform, navigator.maxTouchPoints);
    setUa(agent);
    setPlatform(where);

    const checkStandalone = () => {
      setInstalled(isInstalled());
    };

    checkStandalone();

    const onInstalled = () => {
      setInstalled(true);
      setBanner(false);
    };
    window.addEventListener("appinstalled", onInstalled);
    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener("change", checkStandalone);

    let timer: NodeJS.Timeout | undefined;
    if (!isInstalled() && !hiddenForNow()) {
      timer = setTimeout(() => {
        if (!isInstalled() && !hiddenForNow()) {
          setBanner(true);
        }
      }, 2500);
    }

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("appinstalled", onInstalled);
      media.removeEventListener("change", checkStandalone);
    };
  }, []);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (sheet && !el.open) el.showModal();
  }, [sheet]);

  const dismissBanner = () => {
    rememberHide();
    setBanner(false);
  };

  const openGuide = () => {
    const kind = guideKind(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
    setSheet(kind);
    trackInstallFallbackShown(kind);
  };

  const install = async () => {
    if (prompting.current) return;
    prompting.current = true;
    setBanner(false);
    const agent = navigator.userAgent;
    const currentPlatform = platformOf(agent, navigator.platform, navigator.maxTouchPoints);
    const currentInApp = isInApp(agent);
    trackInstallClick(currentInApp ? "inapp" : currentPlatform);

    const event = canUseNativeInstallPrompt(currentPlatform, currentInApp) ? window.__bip : undefined;
    if (event) {
      window.__bip = null;
      try {
        await event.prompt();
        const choice = await event.userChoice;
        if (choice.outcome === "accepted") {
          trackInstallPromptAccepted();
          setInstalled(true);
        }
        return;
      } catch {
        // Fallback to sheet if browser refused prompt
      } finally {
        prompting.current = false;
      }
    }
    prompting.current = false;
    openGuide();
  };

  if (installed && !sheet) return null;

  const steps = sheet ? stepsFor(sheet) : null;
  const prose = sheet ? proseFor(sheet) : null;

  return (
    <>
      {!installed && (
        <button
          type="button"
          className="install-trigger"
          onClick={install}
          aria-label="Instalar ColeJUY"
          title="Instalar ColeJUY en tu pantalla de inicio"
        >
          <DownloadIcon />
          <span className="install-trigger-text">Instalar</span>
        </button>
      )}

      {banner && !installed && (
        <aside className="install-banner" role="complementary" aria-label="Instalar aplicación">
          <div className="install-banner-header">
            <div className="install-banner-icon" aria-hidden="true">
              <DownloadIcon />
            </div>
            <div className="install-banner-info">
              <p className="install-banner-title">
                {platform === "desktop-mac"
                  ? "Instalá ColeJUY en tu Mac"
                  : platform === "desktop-windows"
                    ? "Instalá ColeJUY en Windows"
                    : "Instalá ColeJUY"}
              </p>
              <p className="install-banner-desc">
                {platform === "desktop-mac"
                  ? "Abrila desde tu Dock y usala en su propia ventana sin barras de navegador."
                  : platform === "desktop-windows"
                    ? "Abrila desde el menú Inicio y usala en su propia ventana sin barras de navegador."
                    : platform === "ios-safari" || platform === "ios-browser"
                      ? "Agregá la app a tu inicio para acceder más rápido y en pantalla completa."
                      : "Accedé al instante a tus líneas y colectivos en vivo desde tu pantalla de inicio."}
              </p>
            </div>
            <button
              type="button"
              className="install-banner-close"
              onClick={dismissBanner}
              aria-label="Cerrar aviso de instalación"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="install-banner-actions">
            <button type="button" className="button install-banner-dismiss" onClick={dismissBanner}>
              Ahora no
            </button>
            <button type="button" className="button primary install-banner-cta" onClick={install}>
              <DownloadIcon />
              <span>Instalar app</span>
            </button>
          </div>
        </aside>
      )}
      {sheet && (
        <dialog
          ref={dialog}
          className="install-sheet"
          aria-labelledby="install-title"
          onClose={() => setSheet(null)}
          onClick={(e) => {
            if (e.target === dialog.current) setSheet(null);
          }}
        >
          <header className="install-sheet-head">
            <h2 id="install-title">
              {sheet === "inapp"
                ? INSTALL_COPY.inappTitle
                : sheet === "mac-safari"
                  ? "Instalar ColeJUY en Mac"
                  : sheet === "desktop-edge"
                    ? "Instalar ColeJUY en Edge"
                    : sheet === "desktop-chrome"
                      ? "Instalar ColeJUY en Chrome"
                      : "Instalar ColeJUY"}
            </h2>
            <button type="button" className="icon-button" onClick={() => setSheet(null)} aria-label="Cerrar">
              <CloseIcon />
            </button>
          </header>
          <div className="install-sheet-body">
            {sheet === "ios-browser" && <p className="install-lead">En {iosBrowserName(ua)}, seguí estos pasos:</p>}
            {sheet === "ios-safari" && <p className="install-lead">En Safari para iPhone/iPad, seguí estos pasos:</p>}
            {sheet === "mac-safari" && <p className="install-lead">En Safari en tu Mac, seguí estos pasos:</p>}
            {(sheet === "desktop-chrome" || sheet === "chrome") && (
              <p className="install-lead">En Google Chrome, seguí estos pasos:</p>
            )}
            {sheet === "desktop-edge" && <p className="install-lead">En Microsoft Edge, seguí estos pasos:</p>}
            {sheet === "firefox" && <p className="install-lead">En Firefox para Android, seguí estos pasos:</p>}
            {sheet === "samsung" && <p className="install-lead">En Samsung Internet, seguí estos pasos:</p>}
            {sheet === "desktop-firefox" && <p className="install-lead">En Firefox para computadora:</p>}
            {steps && (
              <ol className="install-steps">
                {steps.map((step, index) => (
                  <li key={step}>
                    <span>
                      {step}
                      {index === 0 && (sheet === "ios-safari" || sheet === "ios-browser" ? <IosShareIcon /> : null)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {(sheet === "ios-safari" || sheet === "ios-browser") && (
              <div className="install-ios-badge">
                <IosShareIcon />
                <span>Compartir → Agregar a inicio</span>
              </div>
            )}
            {sheet === "mac-safari" && (
              <div className="install-ios-badge">
                <IosShareIcon />
                <span>Menú Archivo / Compartir → Agregar al Dock…</span>
              </div>
            )}
            {(sheet === "desktop-chrome" || sheet === "chrome") && (
              <div className="install-ios-badge">
                <DownloadIcon />
                <span>Barra de direcciones (⊕) → Instalar ColeJUY</span>
              </div>
            )}
            {sheet === "desktop-edge" && (
              <div className="install-ios-badge">
                <DownloadIcon />
                <span>Barra de direcciones (⊞) → Instalar app</span>
              </div>
            )}
            {prose && <p className="install-lead">{prose}</p>}
          </div>
        </dialog>
      )}
    </>
  );
}
