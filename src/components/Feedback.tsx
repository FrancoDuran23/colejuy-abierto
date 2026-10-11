"use client";

import { useEffect, useRef, useState } from "react";
import { BffClient } from "@/lib/bff-client";
import { CloseIcon } from "./icons";

type TurnstileApi = {
  render: (container: HTMLElement, options: { sitekey: string; action: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }) => string;
  reset?: (widgetId: string) => void;
  remove?: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type FeedbackProps = {
  lineId?: string | null;
  stopId?: string | null;
};

const topics = [
  { id: "problem", label: "Problema" },
  { id: "suggestion", label: "Sugerencia" },
  { id: "comment", label: "Comentario" },
] as const;

export default function Feedback({ lineId, stopId }: FeedbackProps) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<(typeof topics)[number]["id"]>("problem");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileLoadError, setTurnstileLoadError] = useState(false);
  const [turnstileRetry, setTurnstileRetry] = useState(0);
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const turnstileWidget = useRef<string | null>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

  useEffect(() => {
    if (!open || !turnstileSiteKey) return;
    let cancelled = false;
    let frame: number | undefined;
    const src = "https://challenges.cloudflare.com/turnstile/v0/api.js";

    const render = () => {
      if (cancelled || !window.turnstile || !turnstileContainer.current || turnstileWidget.current) return;
      try {
        turnstileWidget.current = window.turnstile.render(turnstileContainer.current, {
          sitekey: turnstileSiteKey,
          action: "feedback",
          callback: setTurnstileToken,
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => {
            setTurnstileToken("");
            setTurnstileLoadError(true);
            setError("No se pudo validar el captcha. Revisá la clave y el dominio configurado en Cloudflare.");
          },
        });
        if (loadTimeout) clearTimeout(loadTimeout);
      } catch {
        setTurnstileLoadError(true);
        setError("No se pudo cargar la verificación de seguridad. Recargá la página e intentá nuevamente.");
      }
    };

    const initialize = () => {
      if (cancelled) return;
      if (!turnstileContainer.current) {
        frame = window.requestAnimationFrame(initialize);
        return;
      }
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
      if (turnstileRetry > 0 && existing && !window.turnstile) existing.remove();
      if (window.turnstile && typeof window.turnstile.render === "function") render();
      else if (existing && document.head.contains(existing)) existing.addEventListener("load", render, { once: true });
      else {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.defer = true;
        script.addEventListener("load", render, { once: true });
        script.addEventListener("error", () => {
          setTurnstileLoadError(true);
          setError("No se pudo cargar el captcha de Cloudflare.");
        }, { once: true });
        document.head.appendChild(script);
      }
    };

    const loadTimeout = setTimeout(() => {
      if (!turnstileWidget.current && !cancelled) {
        setTurnstileLoadError(true);
        setError("Cloudflare no pudo cargar en este navegador. Revisá bloqueadores de anuncios o privacidad.");
      }
    }, 7000);
    frame = window.requestAnimationFrame(initialize);

    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
      if (loadTimeout) clearTimeout(loadTimeout);
      if (turnstileWidget.current && window.turnstile?.remove) window.turnstile.remove(turnstileWidget.current);
      turnstileWidget.current = null;
      setTurnstileToken("");
    };
  }, [open, turnstileSiteKey, turnstileRetry]);

  const close = () => {
    if (sending) return;
    setOpen(false);
    setError("");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (message.trim().length < 5) {
      setError("Contanos un poco más para que podamos ayudarte.");
      return;
    }
    if (turnstileSiteKey && !turnstileToken) {
      setError("Completá la verificación de seguridad antes de enviar.");
      return;
    }
    setSending(true);
    setError("");
    try {
      await BffClient.post("/api/feedback", { topic, message, lineId, stopId, page: window.location.pathname, website: "", turnstileToken });
      setSent(true);
      setMessage("");
    } catch {
      setError("No se pudo enviar ahora. Probá de nuevo en unos segundos.");
    } finally {
      if (turnstileWidget.current && window.turnstile?.reset) window.turnstile.reset(turnstileWidget.current);
      setTurnstileToken("");
      setSending(false);
    }
  };

  return (
    <>
      <button type="button" className="feedback-trigger" onClick={() => { setOpen(true); setSent(false); setError(""); setTurnstileLoadError(false); setTurnstileToken(""); }} aria-label="Enviar feedback">
        <span aria-hidden="true">✦</span>
        <span>Feedback</span>
      </button>

      {open && (
        <div className="feedback-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className="feedback-card" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
            <header className="feedback-head">
              <div>
                <p className="feedback-kicker">COLEJUY</p>
                <h2 id="feedback-title">Ayudanos a mejorar</h2>
              </div>
              <button type="button" className="icon-button" onClick={close} aria-label="Cerrar feedback"><CloseIcon /></button>
            </header>

            {sent ? (
              <div className="feedback-success">
                <span className="feedback-success-mark" aria-hidden="true">✓</span>
                <h3>¡Gracias por escribirnos!</h3>
                <p>Leemos cada mensaje y lo usamos para mejorar colejuy.</p>
                <button type="button" className="button primary" onClick={close}>Cerrar</button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <input className="feedback-honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                {turnstileSiteKey && <div className="feedback-turnstile" ref={turnstileContainer} aria-label="Verificación de seguridad" />}
                <fieldset className="feedback-topics">
                  <legend>¿Qué querés contarnos?</legend>
                  {topics.map((item) => (
                    <button key={item.id} type="button" className={topic === item.id ? "selected" : undefined} aria-pressed={topic === item.id} onClick={() => setTopic(item.id)}>
                      {item.label}
                    </button>
                  ))}
                </fieldset>
                <label className="feedback-field">
                  <span>Tu mensaje <b>*</b></span>
                  <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Por ejemplo: la línea 18 no aparece en el mapa…" maxLength={2000} rows={5} autoFocus required />
                </label>
                {error && (
                  <div role="alert">
                    <p className="feedback-error">{error}</p>
                    {turnstileLoadError && <button type="button" className="feedback-retry" onClick={() => { setError(""); setTurnstileLoadError(false); setTurnstileToken(""); setTurnstileRetry((value) => value + 1); }}>Reintentar verificación</button>}
                  </div>
                )}
                <button type="submit" className="button primary feedback-submit" disabled={sending}>
                  {sending ? "Enviando…" : "Enviar feedback"}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
