"use client";

import { useEffect, useRef, useState } from "react";
import { trackInstallClick, trackInstallFallbackShown, trackInstallPromptAccepted } from "@/lib/analytics";
import {
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
import { CloseIcon } from "./icons";

// The iOS share glyph: an arrow leaving a box. Safari uses this, not a word.
function IosShareIcon() {
  return (
    <svg className="ios-share" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
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
  return null;
}

function proseFor(kind: GuideKind): string | null {
  if (kind === "inapp") return INSTALL_COPY.inapp;
  if (kind === "chrome") return INSTALL_COPY.chrome;
  if (kind === "firefox") return INSTALL_COPY.firefox;
  if (kind === "samsung") return INSTALL_COPY.samsung;
  if (kind === "other") return INSTALL_COPY.other;
  return null;
}

export default function Install() {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [inApp, setInApp] = useState(false);
  const [promptReady, setPromptReady] = useState(false);
  const [sheet, setSheet] = useState<GuideKind | null>(null);
  const [ua, setUa] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const prompting = useRef(false);

  useEffect(() => {
    const agent = navigator.userAgent;
    const where = platformOf(agent, navigator.platform, navigator.maxTouchPoints);
    setUa(agent);
    setPlatform(where);
    setInApp(isInApp(agent));
    setInstalled(isInstalled());
    setHidden(hiddenForNow());
    setPromptReady(Boolean(window.__bip));
    setReady(true);

    const onPrompt = () => setPromptReady(Boolean(window.__bip));
    const onInstalled = () => setInstalled(true);
    const onMode = () => {
      if (isInstalled()) setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener("change", onMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      media.removeEventListener("change", onMode);
    };
  }, []);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (sheet && !el.open) el.showModal();
  }, [sheet]);

  const hide = () => {
    rememberHide();
    setHidden(true);
    setSheet(null);
  };

  const openGuide = () => {
    const kind = guideKind(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
    setSheet(kind);
    trackInstallFallbackShown(kind);
  };

  const install = async () => {
    if (prompting.current) return;
    prompting.current = true;
    trackInstallClick(inApp ? "inapp" : platform);
    // iOS has no native prompt. Android and desktop use it when the browser offered one.
    const event = !inApp && (platform === "android" || platform === "other") ? window.__bip : undefined;
    if (event) {
      window.__bip = null;
      setPromptReady(false);
      try {
        await event.prompt();
        const choice = await event.userChoice;
        if (choice.outcome === "accepted") trackInstallPromptAccepted();
        // Dismissing the browser dialog keeps the button. Only a real install hides it.
        return;
      } catch {
        // The browser refused the prompt. The sheet still says what to tap.
      } finally {
        prompting.current = false;
      }
    }
    prompting.current = false;
    openGuide();
  };

  const show = ready && !installed && !hidden && (platform === "android" || platform === "ios-safari" || platform === "ios-browser" || inApp || promptReady);
  if (!show && !sheet) return null;

  const steps = sheet ? stepsFor(sheet) : null;
  const prose = sheet ? proseFor(sheet) : null;

  return (
    <>
      {show && (
        <div className="install">
          <button type="button" onClick={install}>
            {INSTALL_COPY.button}
          </button>
          <button type="button" className="install-hide" onClick={hide}>
            {INSTALL_COPY.hide}
          </button>
        </div>
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
            <h2 id="install-title">{sheet === "inapp" ? INSTALL_COPY.inappTitle : INSTALL_COPY.button}</h2>
            <button type="button" className="icon-button" onClick={() => setSheet(null)} aria-label="Cerrar">
              <CloseIcon />
            </button>
          </header>
          <div className="install-sheet-body">
            {sheet === "ios-browser" && <p className="install-lead">En {iosBrowserName(ua)}, seguí estos pasos.</p>}
            {steps && (
              <ol className="install-steps">
                {steps.map((step, index) => (
                  <li key={step}>
                    <span>
                      {step}
                      {index === 0 && <IosShareIcon />}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {prose && <p className="install-lead">{prose}</p>}
          </div>
        </dialog>
      )}
    </>
  );
}
