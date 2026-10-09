"use client";

import { tone } from "@/lib/color";
import { arrivals } from "@/lib/eta";
import { formatDistance } from "@/lib/geo";
import type { Leg, Option } from "@/lib/plan";
import type { Bus, Line, LineRoute, Stop } from "@/lib/santa-ana";
import { CloseIcon } from "./icons";
import Loading from "./Loading";
import { Plate } from "./Plate";

export type Detail = { line: LineRoute; stops: Stop[] };

type Props = {
  option: Option;
  lineMap: Map<string, Line>;
  // Route and stops of each line of the trip, once loaded.
  details: (Detail | undefined)[];
  buses: Bus[] | undefined;
  // The source is not giving positions, so no arrival can be estimated.
  unavailable: boolean;
  onOpenLine: (line: string, stop: string) => void;
  onClose: () => void;
};

function Ride({ leg, line, detail, buses, unavailable, onOpenLine }: { leg: Leg; line: Line | undefined; detail: Detail | undefined; buses: Bus[] | undefined; unavailable: boolean; onOpenLine: Props["onOpenLine"] }) {
  const stop = detail?.stops.find((s) => s.id === leg.board.id);
  const next = detail && stop && buses ? arrivals(detail.line.paths, stop, buses.filter((b) => b.line === leg.line))[0] : undefined;
  return (
    <li className="step ride" style={{ borderColor: tone(line?.color) }}>
      {line && <Plate line={line} size="large" />}
      <div className="ride-body">
        <p>
          Sube en <b>{leg.board.name}</b>
        </p>
        {!detail || !buses ? (
          <Loading>Buscando coches…</Loading>
        ) : next ? (
          <p className="ride-eta">
            <span className="eta">{next.minutes < 1 ? "Llegando" : `≈ ${Math.round(next.minutes)} min`}</span>
            <span className="eta-detail">
              Coche {next.bus.number ?? next.bus.id} · {formatDistance(next.meters)}
            </span>
          </p>
        ) : (
          <p className="eta-detail">{unavailable ? "Sin posiciones en vivo: no se puede estimar." : "Sin coches en camino a esta parada ahora."}</p>
        )}
        <p>
          Baja en <b>{leg.alight.name}</b>
        </p>
        <button type="button" className="button" onClick={() => onOpenLine(leg.line, leg.board.id)}>
          Ver {line?.name ?? "la línea"}
        </button>
      </div>
    </li>
  );
}

export default function Trip({ option, lineMap, details, buses, unavailable, onOpenLine, onClose }: Props) {
  const [first, second] = option.legs;
  const last = second ?? first;
  return (
    <>
      <header className="line-head">
        <div className="line-title">
          <h2>Tu viaje</h2>
          <p className="status">≈ {Math.max(1, Math.round(option.minutes))} min, sin contar la espera del primer colectivo</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Volver a las opciones">
          <CloseIcon />
        </button>
      </header>
      <div className="scroll">
        <ol className="steps">
          <li className="step walk">
            Camina {formatDistance(option.walkTo)} hasta <b>{first.board.name}</b>
          </li>
          <Ride leg={first} line={lineMap.get(first.line)} detail={details[0]} buses={buses} unavailable={unavailable} onOpenLine={onOpenLine} />
          {second && (
            <>
              <li className="step walk">
                Cambia de colectivo: camina {formatDistance(option.walkBetween)} hasta <b>{second.board.name}</b>
              </li>
              <Ride leg={second} line={lineMap.get(second.line)} detail={details[1]} buses={buses} unavailable={unavailable} onOpenLine={onOpenLine} />
            </>
          )}
          <li className="step walk">
            Camina {formatDistance(option.walkFrom)} desde <b>{last.alight.name}</b> hasta tu destino
          </li>
        </ol>
      </div>
    </>
  );
}
