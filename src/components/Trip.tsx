"use client";

import { textOn, tone } from "@/lib/color";
import { arrivals } from "@/lib/eta";
import { formatDistance } from "@/lib/geo";
import { CHANGE_WAIT_MIN, WALK_M_PER_MIN, type Leg, type Option } from "@/lib/plan";
import type { Bus, Line, LineRoute, Stop } from "@/lib/santa-ana";
import { CloseIcon } from "./icons";
import { Plate } from "./Plate";
import "./trip.css";

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

const icon = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const WalkIcon = () => (
  <svg {...icon}>
    <circle cx="13" cy="4.5" r="1.8" />
    <path d="M9 21l2.5-6-2-3 1-4.5L13 8l2.5 3.5 3 1M11.5 15l3 2.5L15 21M10.5 7.5L8 12" />
  </svg>
);
const BusIcon = () => (
  <svg {...icon}>
    <rect x="4" y="3.5" width="16" height="14" rx="3" />
    <path d="M4 11h16M7 20.5v-3M17 20.5v-3" />
    <circle cx="8.5" cy="14.2" r=".6" fill="currentColor" />
    <circle cx="15.5" cy="14.2" r=".6" fill="currentColor" />
  </svg>
);
const ClockIcon = () => (
  <svg {...icon}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
const FlagIcon = () => (
  <svg {...icon}>
    <path d="M6 21V4M6 4.5h11l-2 4 2 4H6" />
  </svg>
);

const walkMinutes = (meters: number) => Math.max(1, Math.round(meters / WALK_M_PER_MIN));
const stopName = (name: string) => name.trim() || "parada sin nombre";

// How many stops the bus makes from where you get on to where you get off.
function stopsBetween(leg: Leg, detail: Detail | undefined): number | null {
  const { order: a } = leg.board;
  const { order: b } = leg.alight;
  if (a !== null && b !== null && b > a) return b - a;
  if (!detail) return null;
  const mine = detail.stops.filter((s) => s.direction === leg.board.direction).sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
  const i = mine.findIndex((s) => s.id === leg.board.id);
  const j = mine.findIndex((s) => s.id === leg.alight.id);
  return i >= 0 && j > i ? j - i : null;
}

const count = (n: number) => (n === 1 ? "1 parada" : `${n} paradas`);

function Step({ icon: Icon, color, children }: { icon: () => React.JSX.Element; color?: string; children: React.ReactNode }) {
  return (
    <li className="tl">
      <span className={color ? "tl-icon bus" : "tl-icon"} style={color ? { background: color, color: textOn(color) } : undefined}>
        <Icon />
      </span>
      <div className="tl-text">{children}</div>
    </li>
  );
}

function Ride({ leg, line, detail, buses, unavailable, first, onOpenLine }: { leg: Leg; line: Line | undefined; detail: Detail | undefined; buses: Bus[] | undefined; unavailable: boolean; first: boolean; onOpenLine: Props["onOpenLine"] }) {
  const stop = detail?.stops.find((s) => s.id === leg.board.id);
  const next = detail && stop && buses ? arrivals(detail.line.paths, stop, buses.filter((b) => b.line === leg.line))[0] : undefined;
  const color = tone(line?.color);
  const n = stopsBetween(leg, detail);
  return (
    <>
      <Step icon={BusIcon} color={color}>
        Tomá la línea {line ? <Plate line={line} /> : <b>{leg.line}</b>} hasta <b>{stopName(leg.alight.name)}</b>
        <span className="tl-sub">
          {n ? `${count(n)} · ` : ""}
          subís en {stopName(leg.board.name)}
        </span>
      </Step>
      <Step icon={ClockIcon}>
        {!detail || !buses ? (
          <span className="tl-sub">Buscando coches…</span>
        ) : next ? (
          <>
            <span className="tl-live">{next.minutes < 1 ? "El coche está llegando" : `Próximo coche en ~${Math.max(1, Math.round(next.minutes))} min`}</span>
            <span className="tl-sub">
              Coche {next.bus.number ?? next.bus.id} · a {formatDistance(next.meters)} de la parada
            </span>
          </>
        ) : (
          <>
            <span className="tl-live">Sin datos en vivo</span>
            <span className="tl-sub">{unavailable ? "Santa Ana no informa posiciones ahora." : "No hay coches en camino a esta parada."}</span>
          </>
        )}
        {first && (
          <button type="button" className="tl-link" onClick={() => onOpenLine(leg.line, leg.board.id)}>
            Ver {line?.name ?? "la línea"}
          </button>
        )}
      </Step>
    </>
  );
}

export default function Trip({ option, lineMap, details, buses, unavailable, onOpenLine, onClose }: Props) {
  const [first, second] = option.legs;
  const last = second ?? first;
  const total = Math.max(1, Math.round(option.minutes));
  return (
    <>
      <header className="trip-head">
        <h2>Tu viaje</h2>
        <span className="trip-total" title="Caminando y en colectivo, sin contar la espera del primer coche">
          ≈ {total} min
        </span>
        <span className="trip-spacer" />
        <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar el viaje">
          <CloseIcon />
        </button>
      </header>
      <div className="scroll">
        <ol className="timeline">
          <Step icon={WalkIcon}>
            Caminá <b>{walkMinutes(option.walkTo)} min</b> ({formatDistance(option.walkTo)}) hasta la parada <b>{stopName(first.board.name)}</b>
          </Step>
          <Ride leg={first} line={lineMap.get(first.line)} detail={details[0]} buses={buses} unavailable={unavailable} first onOpenLine={onOpenLine} />
          {second && (
            <>
              <Step icon={WalkIcon}>
                Transbordo: caminá <b>{walkMinutes(option.walkBetween)} min</b> ({formatDistance(option.walkBetween)}) hasta <b>{stopName(second.board.name)}</b>
                <span className="tl-sub">Contá unos {CHANGE_WAIT_MIN} min de espera</span>
              </Step>
              <Ride leg={second} line={lineMap.get(second.line)} detail={details[1]} buses={buses} unavailable={unavailable} first={false} onOpenLine={onOpenLine} />
            </>
          )}
          <Step icon={FlagIcon}>
            Caminá <b>{walkMinutes(option.walkFrom)} min</b> ({formatDistance(option.walkFrom)}) hasta tu destino
            <span className="tl-sub">Bajás en {stopName(last.alight.name)}</span>
          </Step>
        </ol>
      </div>
    </>
  );
}
