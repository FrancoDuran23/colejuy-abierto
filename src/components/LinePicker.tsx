"use client";

import { useEffect, useRef, useState } from "react";
import type { Line } from "@/lib/santa-ana";
import { CloseIcon } from "./icons";
import Loading from "./Loading";
import { Plate, plateLabel, variant } from "./Plate";

type Props = {
  lines: Line[] | undefined;
  saved: string[];
  failed: boolean;
  retry: () => void;
  onPick: (id: string) => void;
  onClose: () => void;
};

export default function LinePicker({ lines, saved, failed, retry, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    // showModal focuses the first control, the close button. With a keyboard, typing has to work
    // straight away; on a touch screen focusing the field would raise the keyboard over the lines
    // before the person asked for it, so there the field waits to be tapped.
    if (window.matchMedia("(pointer: fine)").matches) search.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const match = (l: Line) => !q || plateLabel(l).toLowerCase().startsWith(q) || l.name.toLowerCase().includes(q);
  const groups = [
    { title: "Tus líneas", items: (lines ?? []).filter((l) => saved.includes(l.id) && match(l)) },
    { title: "Con seguimiento en vivo", items: (lines ?? []).filter((l) => l.live && match(l)) },
    { title: "Solo recorrido", items: (lines ?? []).filter((l) => !l.live && match(l)) },
  ].filter((g) => g.items.length > 0);

  return (
    <dialog ref={dialog} className="picker" aria-labelledby="picker-title" onClose={onClose} onClick={(e) => e.target === dialog.current && onClose()}>
      <div className="picker-body">
        <header className="picker-head">
          <h2 id="picker-title">Buscar línea</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </header>
        <label className="field">
          <span>Número o nombre</span>
          <input ref={search} type="search" inputMode="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        </label>
        <div className="picker-scroll">
          {!lines ? (
            failed ? (
              <div className="empty">
                <p>No se pudieron cargar las líneas.</p>
                <button type="button" className="button" onClick={retry}>
                  Reintentar
                </button>
              </div>
            ) : (
              <Loading className="empty">Cargando líneas…</Loading>
            )
          ) : groups.length === 0 ? (
            <p className="empty">Ninguna línea coincide con “{query}”.</p>
          ) : (
            groups.map((g) => (
              <section key={g.title}>
                <h3>{g.title}</h3>
                <ul className="line-grid">
                  {g.items.map((l) => (
                    <li key={l.id}>
                      <button type="button" className="line-cell" onClick={() => onPick(l.id)} aria-label={l.name} title={l.name}>
                        <Plate line={l} size="large" />
                        <span className="line-variant">{variant(l)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </dialog>
  );
}
