"use client";

import { useEffect, useState } from "react";
import { trackBusEtaShown, type BusEtaResult } from "@/lib/analytics";
import { tone } from "@/lib/color";
import { etaText, resolveEta, type EtaResolved } from "@/lib/eta";
import type { LngLat } from "@/lib/geo";
import type { Bus, Line, Path, Stop } from "@/lib/santa-ana";
import { CloseIcon, RampIcon } from "./icons";
import Loading from "./Loading";
import { Plate } from "./Plate";

type Props = {
  bus: Bus;
  // False once this coach drops out of the latest fleet reading.
  live: boolean;
  lineId: string;
  line: Line | null;
  paths: Path[];
  stops: Stop[];
  // The line's route is still loading, so nothing can be measured yet.
  loading: boolean;
  chosen: Stop | null;
  at: LngLat | null;
  locating: boolean;
  // The person refused the location prompt, or this browser has no location.
  locationBlocked: boolean;
  // The same words the panel already uses when the fleet is old or refused.
  fleetNote: string | null;
  refused: boolean;
  onPickStop: (id: string) => void;
  onClose: () => void;
};

const stopName = (name: string) => name.trim() || "Parada sin nombre";

function ago(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
}

function groupsOf(stops: Stop[]): { label: string | null; stops: Stop[] }[] {
  const order = (a: Stop, b: Stop) => (a.order ?? 1e9) - (b.order ?? 1e9);
  const ida = stops.filter((s) => s.direction === "ida").sort(order);
  const vuelta = stops.filter((s) => s.direction === "vuelta").sort(order);
  const rest = stops.filter((s) => s.direction !== "ida" && s.direction !== "vuelta").sort(order);
  const groups: { label: string | null; stops: Stop[] }[] = [];
  if (ida.length)
    groups.push({
      label: vuelta.length || rest.length ? "Ida" : null,
      stops: ida,
    });
  if (vuelta.length)
    groups.push({
      label: ida.length || rest.length ? "Vuelta" : null,
      stops: vuelta,
    });
  if (rest.length) groups.push({ label: groups.length ? "Otras" : null, stops: rest });
  return groups;
}

export default function BusEta({ bus, live, lineId, line, paths, stops, loading, chosen, at, locating, locationBlocked, fleetNote, refused, onPickStop, onClose }: Props) {
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    setChoosing(false);
  }, [bus.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const resolved: EtaResolved | null = !live || refused || loading || !line ? null : resolveEta(paths, stops, bus, choosing ? null : chosen, choosing ? null : at);
  const text = resolved?.kind === "ready" ? etaText(resolved.route) : null;
  const staleSignal = Boolean(fleetNote) || !bus.fresh;
  const noStops = Boolean(line) && !loading && stops.length === 0;
  const result: BusEtaResult | null =
    !live || refused
      ? "unavailable"
      : text
        ? text.kind === "passed"
          ? "passed"
          : staleSignal
            ? "stale"
            : "coming"
        : resolved?.kind === "off-route" || noStops
          ? "unavailable"
          : null;
  const aimed = resolved?.kind === "ready" ? resolved.stop.id : resolved?.kind === "off-route" ? (resolved.stop?.id ?? "") : "";

  useEffect(() => {
    if (!result) return;
    trackBusEtaShown(lineId, aimed, result);
  }, [result, lineId, aimed, bus.id]);

  const fromLocation = resolved?.kind === "ready" && resolved.source === "location";
  const passed = text?.kind === "passed";
  const title = text
    ? passed
      ? fromLocation
        ? "Ya pasó por la parada más cercana a vos"
        : "Ya pasó por tu parada"
      : text.title
    : refused
      ? "Sin datos en vivo"
      : !live
        ? "Ya no figura"
        : loading
          ? "Cargando recorrido…"
          : noStops || resolved?.kind === "off-route"
            ? "No se puede estimar"
            : "Elegí tu parada para ver cuándo llega";

  const showList = choosing && stops.length > 0;
  const canPick = live && !refused && !loading && stops.length > 0;
  const needsChoice = !text || resolved?.kind === "off-route" || fromLocation;
  const offerPick = canPick && !showList && needsChoice;

  return (
    <div className="bus-eta" role="dialog" aria-labelledby="bus-eta-title">
      <header className="bus-eta-head">
        {line && <Plate line={line} />}
        <div className="bus-eta-who">
          <p className="bus-eta-name">{line?.name ?? "Colectivo"}</p>
          <p className="bus-eta-interno" id={loading && live && !refused ? "bus-eta-title" : undefined}>
            Interno {bus.number ?? bus.id}
          </p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
          <CloseIcon />
        </button>
      </header>

      {loading && live && !refused ? (
        <Loading>Cargando recorrido…</Loading>
      ) : (
        <h2 id="bus-eta-title" className={text && !passed ? (staleSignal ? "eta dim" : "eta") : "bus-eta-status"}>
          {title}
        </h2>
      )}

      {text && resolved?.kind === "ready" && (
        <div className="bus-eta-fact">
          <p className="bus-eta-where">
            {passed ? "" : fromLocation ? "A la parada más cercana a vos: " : "Llega a "}
            <strong>{stopName(resolved.stop.name)}</strong>
          </p>
          <p className="bus-eta-range">
            {passed ? `Pasó ${text.distance}` : text.kind === "coming" && text.title === "Está llegando" ? `Está a ${text.distance}` : `El colectivo está a ${text.distance}`}
          </p>
          {bus.ramp && (
            <p className="ramp">
              <RampIcon /> Con rampa
            </p>
          )}
        </div>
      )}

      {refused && <p className="status warn">No se puede estimar.</p>}
      {!refused && !live && <p className="status warn">Este interno ya no está en el mapa.</p>}
      {!refused && live && fleetNote && <p className="status warn">{fleetNote}</p>}
      {!refused && live && !fleetNote && !bus.fresh && <p className="status warn">Señal de hace {ago(bus.age)}.</p>}

      {!loading && noStops && live && !refused && <p className="status">Esta línea no tiene paradas cargadas.</p>}
      {resolved?.kind === "off-route" && !choosing && live && !refused && (
        <p className="status">{resolved.stop ? `No viene hacia ${stopName(resolved.stop.name)}.` : "No está sobre el recorrido."}</p>
      )}
      {locating && !at && !text && live && !refused && <Loading>Buscando tu ubicación…</Loading>}
      {locationBlocked && !at && !chosen && live && !refused && <p className="status">Activá la ubicación en el navegador, o elegí una parada.</p>}

      {showList && (
        <div className="bus-eta-stops">
          {groupsOf(stops).map((group) => (
            <section key={group.label ?? "paradas"}>
              {group.label && <h3>{group.label}</h3>}
              <ol>
                {group.stops.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="stop"
                      onClick={() => {
                        setChoosing(false);
                        onPickStop(s.id);
                      }}
                    >
                      <span className="stop-dot" style={{ borderColor: tone(line?.color) }} />
                      <span className="stop-name">{stopName(s.name)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {offerPick && (
        <button type="button" className="button" onClick={() => setChoosing(true)}>
          Elegir parada
        </button>
      )}
    </div>
  );
}
