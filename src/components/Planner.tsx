"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import type { Place } from "@/app/api/geocode/route";
import { formatDistance } from "@/lib/geo";
import { CHANGE_WAIT_MIN, planWidening, whyNoTrip, walkMinutes, WALK_STEPS_M, type NetLine, type Option } from "@/lib/plan";
import type { Line } from "@/lib/santa-ana";
import { CloseIcon } from "./icons";
import Loading from "./Loading";
import { Plate } from "./Plate";

export type Point = [number, number];
export type End = "from" | "to";

type Props = {
  lineMap: Map<string, Line>;
  me: Point | null;
  // "me" follows the person's position; a point is a spot chosen on the map or by address.
  origin: Point | "me";
  destination: Point | null;
  // Which end the next tap on the map or the next search result fills.
  target: End;
  locating: boolean;
  onTarget: (end: End) => void;
  onPoint: (end: End, point: Point) => void;
  onLocate: () => void;
  onChoose: (option: Option) => void;
  onClose: () => void;
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export default function Planner({ lineMap, me, origin, destination, target, locating, onTarget, onPoint, onLocate, onChoose, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  // The name of a point picked from the search, remembered by the point itself.
  const names = useRef(new WeakMap<Point, string>());

  const start = origin === "me" ? me : origin;
  const search = useSWR<{ places: Place[] }>(submitted ? `/api/geocode?q=${encodeURIComponent(submitted)}` : null, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const network = useSWR<{ lines: NetLine[] }>(start && destination ? "/api/network" : null, fetcher, { revalidateOnFocus: false });

  const found = useMemo(
    () => (start && destination && network.data ? planWidening(network.data.lines, start, destination) : null),
    [start, destination, network.data],
  );
  const options = found?.options ?? [];
  const live = useMemo(() => new Set((network.data?.lines ?? []).filter((l) => l.live !== false).map((l) => l.id)), [network.data]);
  const approx = options.some((o) => o.legs.some((l) => network.data?.lines.find((n) => n.id === l.line)?.approx));
  const longWalk = options.length > 0 && found !== null && found.walk > WALK_STEPS_M[0];

  // With no trip at all, say which end is the problem and how far its nearest stop is.
  const why = useMemo(() => {
    if (!start || !destination || !network.data || options.length > 0) return null;
    return whyNoTrip(network.data.lines, start, destination, origin === "me");
  }, [start, destination, network.data, options.length, origin]);
  const onFoot = start && destination ? walkMinutes(start, destination) : null;

  const label = (end: End) => {
    if (end === "from") {
      if (origin === "me") return me ? "Tu ubicación" : "Tu ubicación, todavía sin obtener";
      return names.current.get(origin) ?? "Punto marcado en el mapa";
    }
    if (!destination) return "Sin elegir";
    return names.current.get(destination) ?? "Punto marcado en el mapa";
  };

  const pick = (place: Place) => {
    const point: Point = [place.lng, place.lat];
    names.current.set(point, place.name);
    onPoint(target, point);
    setQuery("");
    setSubmitted("");
  };

  return (
    <>
      <header className="line-head">
        <div className="line-title">
          <h2>Cómo llegar</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar cómo llegar">
          <CloseIcon />
        </button>
      </header>

      <div className="scroll">
        <div className="planner">
          <div className="ends" role="group" aria-label="Salida y destino">
            {(["from", "to"] as const).map((end) => (
              <button key={end} type="button" className="end" aria-pressed={target === end} onClick={() => onTarget(end)}>
                <span className="end-label">{end === "from" ? "Desde" : "Hasta"}</span>
                <span className="end-value">{label(end)}</span>
              </button>
            ))}
          </div>

          {target === "from" && origin === "me" && !me && (
            <button type="button" className="button" onClick={onLocate} disabled={locating}>
              {locating && <span className="spinner" aria-hidden="true" />}
              {locating ? "Buscando tu ubicación…" : "Usar mi ubicación"}
            </button>
          )}

          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(query.trim());
            }}
          >
            <label className="field">
              <span>{target === "from" ? "Dirección o lugar de salida" : "Dirección o lugar de destino"}</span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" enterKeyHint="search" />
            </label>
            <button type="submit" className="button" disabled={query.trim().length < 3}>
              Buscar
            </button>
          </form>

          {submitted &&
            (search.error ? (
              <p className="status warn">No se pudo buscar esa dirección. Marca el punto en el mapa.</p>
            ) : !search.data ? (
              <Loading>Buscando “{submitted}”…</Loading>
            ) : search.data.places.length === 0 ? (
              <p className="status">No se encontró “{submitted}”. Prueba con una calle y altura, o marca el punto en el mapa.</p>
            ) : (
              <ul className="results">
                {search.data.places.map((p) => (
                  <li key={`${p.lat},${p.lng}`}>
                    <button type="button" className="result" onClick={() => pick(p)}>
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            ))}

          {!submitted && !(start && destination) && <p className="hint">También puedes tocar el mapa para marcar el punto.</p>}

          {start && destination && (
            <section className="options" aria-label="Opciones">
              {network.data && onFoot !== null && onFoot <= 20 && (
                <p className="walk">Caminando son ≈ {Math.max(1, Math.round(onFoot))} min.</p>
              )}
              {network.error ? (
                <div className="empty">
                  <p>No se pudieron cargar las paradas.</p>
                  <button type="button" className="button" onClick={() => network.mutate()}>
                    Reintentar
                  </button>
                </div>
              ) : !network.data ? (
                <Loading>Buscando combinaciones…</Loading>
              ) : options.length === 0 ? (
                <p className="status warn">{why}</p>
              ) : (
                <ol>
                  {options.slice(0, 3).map((o) => {
                    const [first] = o.legs;
                    const names = o.legs.map((l) => lineMap.get(l.line)?.name ?? l.line).join(" y después ");
                    const boardName = first.board.name === "Parada aproximada" ? "Parada cercana" : first.board.name;
                    const isLive = o.legs.every((l) => live.has(l.line));
                    return (
                      <li key={o.legs.map((l) => l.line).join(">")}>
                        <button
                          type="button"
                          className="option"
                          onClick={() => onChoose(o)}
                          aria-label={`${names}, ${Math.max(1, Math.round(o.minutes))} minutos, ver el viaje en el mapa`}
                        >
                          <span className="option-plates">
                            {o.legs.map((l, i) => {
                              const line = lineMap.get(l.line);
                              return line ? (
                                <Fragment key={l.line}>
                                  {i > 0 && <span className="option-arrow" aria-hidden="true">→</span>}
                                  <Plate line={line} />
                                </Fragment>
                              ) : null;
                            })}
                          </span>
                          <span className="option-time">
                            {Math.max(1, Math.round(o.minutes))} min
                            {isLive && <small className="option-live">en vivo</small>}
                          </span>
                          <span className="option-sub">
                            Subí en {boardName} · {formatDistance(o.walkTo)} a pie
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
              {longWalk && <p className="status">No hay paradas a menos de 700 m: estas opciones piden caminar más.</p>}
              {options.length > 0 && (
                <p className="estimate">
                  Tiempos estimados de caminata y viaje, sin contar la espera del primer colectivo.
                  {approx && " Algunas paradas son aproximadas (se calculan sobre el recorrido): confirma la parada en el mapa."}
                  {options.slice(0, 3).some((o) => o.legs.every((l) => live.has(l.line))) && " Las opciones con «en vivo» tienen llegada en tiempo real."}
                  {options.some((o) => o.legs.length > 1) && ` Con cambio se suman ${CHANGE_WAIT_MIN} min supuestos de espera del segundo.`}
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
