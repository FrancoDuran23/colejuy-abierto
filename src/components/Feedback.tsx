"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "./icons";

type TurnstileApi = {
  render: (container: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }) => string;
  reset: (widgetId: string) => void;
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
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const turnstileWidget = useRef<string | null>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

  useEffect(() => {
    if (!open || !turnstileSiteKey || !turnstileContainer.current) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !window.turnstile || !turnstileContainer.current || turnstileWidget.current) return;
      turnstileWidget.current = window.turnstile.render(turnstileContainer.current, {
        sitekey: turnstileSiteKey,
        callback: setTurnstileToken,
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => {
          setTurnstileToken("");
          setError("No se pudo verificar el formulario. Probá de nuevo.");
        },
      });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    if (window.turnstile) render();
    else if (existing) existing.addEventListener("load", render);
    else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", render);
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      if (existing) existing.removeEventListener("load", render);
      if (turnstileWidget.current && window.turnstile?.remove) window.turnstile.remove(turnstileWidget.current);
      turnstileWidget.current = null;
      setTurnstileToken("");
    };
  }, [open, turnstileSiteKey]);

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
      setError("Completá la verificación antes de enviar.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ topic, message, lineId, stopId, page: window.location.pathname, website: "", turnstileToken }),
      });
      if (!response.ok) throw new Error("feedback_failed");
      setSent(true);
      setMessage("");
    } catch {
      setError("No se pudo enviar ahora. Probá de nuevo en unos segundos.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button type="button" className="feedback-trigger" onClick={() => { setOpen(true); setSent(false); }} aria-label="Enviar feedback">
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
                {error && <p className="feedback-error" role="alert">{error}</p>}
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
