"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon, ShareIcon } from "./icons";
import { trackCopyLinkClick, trackShareClick } from "@/lib/analytics";
import { SHARE_TEXT, SHARE_TITLE, SHARE_URL, whatsappShareUrl } from "@/lib/install";

export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Older browsers refuse the async clipboard. The textarea below still works.
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, value.length);
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export default function ShareSite() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const share = async () => {
    trackShareClick();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: SHARE_URL });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    window.open(whatsappShareUrl(), "_blank", "noopener,noreferrer");
  };

  const copy = async () => {
    trackCopyLinkClick();
    const ok = await copyText(SHARE_URL);
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="share-row">
      <button type="button" onClick={share} aria-label="Compartir" title="Compartir">
        <ShareIcon />
      </button>
      <button type="button" onClick={copy} aria-label="Copiar link" title="Copiar link">
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copiado" : ""}
      </span>
    </div>
  );
}
