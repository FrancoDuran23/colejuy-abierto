"use client";

import { useEffect, useRef, useState } from "react";

const HIDDEN = "colejuy-instalar-oculto";

type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Mode = "hide" | "prompt" | "ios";

const installed = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

// Android/Chrome can install from the button. iPhone Safari cannot, so it gets the steps instead.
export default function Install() {
  const [mode, setMode] = useState<Mode>("hide");
  const prompt = useRef<PromptEvent | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(HIDDEN) === "1";
    } catch {
      dismissed = false;
    }
    if (installed() || dismissed) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      prompt.current = event as PromptEvent;
      setMode("prompt");
    };
    const onInstalled = () => hide();
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    const ua = navigator.userAgent;
    const apple = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (apple && !/CriOS|FxiOS|EdgiOS/.test(ua)) setMode("ios");

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const hide = () => {
    try {
      localStorage.setItem(HIDDEN, "1");
    } catch {
      // Private mode can refuse storage; hiding for this visit is enough.
    }
    setMode("hide");
  };

  const install = async () => {
    const event = prompt.current;
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    prompt.current = null;
    if (choice.outcome === "accepted" || choice.outcome === "dismissed") hide();
  };

  if (mode === "hide") return null;

  return (
    <div className="install">
      {mode === "ios" ? (
        <p>Instalar acceso directo: tocá Compartir y después “Agregar a inicio”.</p>
      ) : (
        <button type="button" onClick={install}>
          Instalar acceso directo
        </button>
      )}
      <button type="button" className="install-hide" onClick={hide}>
        Ocultar
      </button>
    </div>
  );
}
