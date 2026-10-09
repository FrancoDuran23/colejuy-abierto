"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { trackLineSelected, trackStopOpened, trackTelegramAlert, trackTripPlanned } from "@/lib/analytics";
import { arrivals } from "@/lib/eta";
import { textOn, tone } from "@/lib/color";
import { formatDistance, slice } from "@/lib/geo";
import type { Option } from "@/lib/plan";
import type { RouteLine } from "@/lib/motion";
import { directionEnds, hasBothDirections } from "@/lib/route";
import type { Fleet, Line, LineRoute, Stop } from "@/lib/santa-ana";
import type { MapBus, MapPath, MapStop } from "./BusMap";
import Install from "./Install";
import { ChevronIcon, CloseIcon, LocateIcon, PlaneIcon, RampIcon, ShareIcon, StarIcon } from "./icons";
import LinePicker from "./LinePicker";
import Logo from "./Logo";
import Loading from "./Loading";
import Planner, { type End, type Point } from "./Planner";
import { plateLabel, Plate } from "./Plate";
import Trip, { type Detail } from "./Trip";

const BusMap = dynamic(() => import("./BusMap"), { ssr: false, loading: () => <Loading className="map-wait">Cargando mapa…</Loading> });

// Saved lines live on this device only: there is no account and no database.
const SAVED_LINES = "lineas-guardadas";
// Username of the Telegram bot, without the @. Without it there is no alert button.
const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT;
const NO_PATHS: LineRoute["paths"] = [];
const NO_STOPS: Stop[] = [];

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const stopName = (name: string) => name.trim() || "Parada sin nombre";
const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
}

export default function App() {
  const [lineId, setLineId] = useState<string | null>(null);
  const [stopId, setStopId] = useState<string | null>(null);
  const [direction, setDirection] = useState("ida");
  // Whether the stops of that direction are listed. A line opens with both directions folded.
  const [listOpen, setListOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [me, setMe] = useState<Point | null>(null);
  // "Cómo llegar": where from, where to, and which of the two the next tap on the map sets.
  const [planning, setPlanning] = useState(false);
  const [origin, setOrigin] = useState<Point | "me">("me");
  const [destination, setDestination] = useState<Point | null>(null);
  const [target, setTarget] = useState<End>("to");
  // The option chosen in "Cómo llegar": its lines are drawn together on the map.
  const [trip, setTrip] = useState<Option | null>(null);
  // On a phone the panel can be folded down to a strip, to leave the map the whole screen.
  const [collapsed, setCollapsed] = useState(false);
  const swipe = useRef<{ y: number; moved: boolean } | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [focus, setFocus] = useState<{ lng: number; lat: number; key: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // When the current reading arrived, on this device's clock: comparing against the server's
  // timestamp would call fresh data stale on a phone whose clock runs fast.
  const [received, setReceived] = useState(0);
  const restored = useRef(false);
  const selectedRow = useRef<HTMLLIElement>(null);
  const watching = useRef<number | null>(null);
  const focusCount = useRef(0);
  const current = useRef({ lineId, stopId, planning, target, trip });
  current.current = { lineId, stopId, planning, target, trip };

  const fleet = useSWR<Fleet>("/api/fleet", fetcher, { refreshInterval: 5000, keepPreviousData: true });
  const lines = useSWR<{ lines: Line[] }>("/api/lines", fetcher, { revalidateOnFocus: false });
  const legA = useSWR<Detail>(trip ? `/api/lines/${encodeURIComponent(trip.legs[0].line)}` : null, fetcher, { revalidateOnFocus: false });
  const legB = useSWR<Detail>(trip?.legs[1] ? `/api/lines/${encodeURIComponent(trip.legs[1].line)}` : null, fetcher, { revalidateOnFocus: false });
  const detail = useSWR<{ line: LineRoute; stops: Stop[] }>(lineId ? `/api/lines/${encodeURIComponent(lineId)}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const centre = useCallback((p: Point) => {
    focusCount.current += 1;
    setFocus({ lng: p[0], lat: p[1], key: `p${focusCount.current}` });
  }, []);

  const setEnd = useCallback(
    (end: End, p: Point) => {
      if (end === "from") {
        setOrigin(p);
        // With the start set, the next thing to choose is the destination.
        setTarget("to");
      } else setDestination(p);
      centre(p);
    },
    [centre],
  );

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const params = new URLSearchParams(window.location.search);
    try {
      const lines: unknown = JSON.parse(localStorage.getItem(SAVED_LINES) ?? "[]");
      if (Array.isArray(lines)) setSaved(lines.filter((id): id is string => typeof id === "string"));
    } catch {}
    const line = params.get("linea");
    const parada = params.get("parada");
    if (line) {
      trackLineSelected(line);
      setLineId(line);
    }
    if (line && parada) {
      trackStopOpened(line, parada);
      setStopId(parada);
    }
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    const params = new URLSearchParams();
    if (lineId) params.set("linea", lineId);
    if (lineId && stopId) params.set("parada", stopId);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [lineId, stopId]);

  useEffect(() => {
    if (fleet.data) setReceived(Date.now());
  }, [fleet.data]);

  // Whatever the person just opened is shown: a folded panel opens again on its own.
  useEffect(() => {
    setCollapsed(false);
  }, [lineId, stopId, planning, trip, picking]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const lineMap = useMemo(() => new Map((lines.data?.lines ?? []).map((l) => [l.id, l])), [lines.data]);
  const line = detail.data?.line.id === lineId ? detail.data.line : null;
  const summary = lineId ? (line ?? lineMap.get(lineId) ?? null) : null;
  const color = tone(summary?.color);
  const paths = line?.paths ?? NO_PATHS;
  const allStops = line ? (detail.data?.stops ?? NO_STOPS) : NO_STOPS;
  const twoWay = paths.length === 2 && allStops.length > 0;
  const bothWays = hasBothDirections(paths);
  // The two ends of the direction shown, as names: the first stop and the last one.
  const ends = directionEnds(allStops, twoWay ? direction : null)?.split(" → ") ?? null;
  const alertLink = BOT && summary && summary.live !== false ? `https://t.me/${BOT}?start=l_${summary.id}` : null;
  // The routes of the saved lines, so their buses roll along the street on the opening map too.
  const savedRoutes = useSWR<Detail[]>(
    saved.length > 0 && !lineId ? ["saved-routes", ...saved] : null,
    ([, ...ids]: string[]) => Promise.all(ids.map((id) => fetcher(`/api/lines/${encodeURIComponent(id)}`) as Promise<Detail>)),
    { revalidateOnFocus: false },
  );
  // Routes the buses can roll along between readings: the open line, each line of a trip, and the saved lines.
  // A bus whose route is not among them is not moved between readings.
  const motionRoutes = useMemo(() => {
    const out: RouteLine[] = [];
    const add = (id: string | undefined, list: { direction: string; coordinates: [number, number][] }[] | undefined) => {
      if (!id || !list) return;
      for (const p of list) if (p.coordinates.length >= 2) out.push({ line: id, direction: p.direction, coordinates: p.coordinates });
    };
    add(line?.id, paths);
    add(legA.data?.line.id, legA.data?.line.paths);
    add(legB.data?.line.id, legB.data?.line.paths);
    for (const detail of savedRoutes.data ?? []) if (!out.some((r) => r.line === detail.line.id)) add(detail.line.id, detail.line.paths);
    return out;
  }, [line?.id, paths, legA.data, legB.data, savedRoutes.data]);

  const stops = useMemo(
    () =>
      allStops
        .filter((s) => !twoWay || !s.direction || s.direction === direction)
        .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9)),
    [allStops, twoWay, direction],
  );
  const stop = allStops.find((s) => s.id === stopId) ?? null;

  const unknownLine = Boolean(lineId && lines.data && !lineMap.has(lineId));
  useEffect(() => {
    if (!unknownLine) return;
    setLineId(null);
    setStopId(null);
    setNotice("Esa línea ya no existe.");
  }, [unknownLine]);

  // A stop chosen on the map, from a link or from the nearby list: show it in the list and on the map.
  useEffect(() => {
    if (!stop) return;
    selectedRow.current?.scrollIntoView({ block: "nearest" });
    setFocus({ lng: stop.lng, lat: stop.lat, key: `s${stop.id}` });
  }, [stop?.id, direction]); // eslint-disable-line react-hooks/exhaustive-deps

  // The selected stop decides which direction is shown.
  useEffect(() => {
    if (stop?.direction) setDirection(stop.direction);
    if (stop) setListOpen(true);
  }, [stop?.id, stop?.direction]); // eslint-disable-line react-hooks/exhaustive-deps

  const lineBuses = useMemo(() => (fleet.data?.buses ?? []).filter((b) => b.line === lineId), [fleet.data, lineId]);

  // What the map shows: one line, everything, the saved lines, or nothing.
  // Opening on every bus of the city helps nobody find theirs, and a trip being planned needs a clear map.
  const view = lineId ? "line" : trip ? "trip" : planning ? "none" : showAll ? "all" : saved.length ? "saved" : "none";

  const mapBuses: MapBus[] = useMemo(() => {
    const all = fleet.data?.buses ?? [];
    const source =
      view === "line"
        ? lineBuses
        : view === "trip"
          ? all.filter((b) => trip?.legs.some((l) => l.line === b.line))
          : view === "all"
          ? all
          : view === "saved"
            ? all.filter((b) => b.line && saved.includes(b.line))
            : [];
    return source.map((b) => {
      const l = b.line ? lineMap.get(b.line) : undefined;
      const c = tone(l?.color);
      return {
        id: b.id,
        line: b.line,
        lng: b.lng,
        lat: b.lat,
        label: l ? plateLabel(l) : "",
        color: c,
        text: textOn(c),
        fresh: b.fresh,
        speed: b.speed,
        course: b.course,
        moving: b.moving,
        age: b.age,
      };
    });
  }, [fleet.data, lineBuses, lineMap, view, saved, trip]);

  const coming = useMemo(() => (stop ? arrivals(paths, stop, lineBuses) : []), [stop, paths, lineBuses]);

  const openLine = useCallback(
    (id: string, stopToOpen: string | null = null) => {
      setPicking(false);
      if (id === lineId && stopToOpen === null) return;
      if (id !== lineId) trackLineSelected(id);
      if (stopToOpen) trackStopOpened(id, stopToOpen);
      setLineId(id);
      setStopId(stopToOpen);
      setDirection("ida");
      setListOpen(false);
    },
    [lineId],
  );

  const toggleSaved = (id: string) => {
    const next = saved.includes(id) ? saved.filter((s) => s !== id) : [...saved, id];
    setSaved(next);
    try {
      localStorage.setItem(SAVED_LINES, JSON.stringify(next));
    } catch {}
  };

  const closeLine = () => {
    setLineId(null);
    setStopId(null);
  };

  const selectStop = useCallback((id: string) => {
    // The stops of a trip are marks, not a list to pick from.
    const { lineId: open, stopId: selected } = current.current;
    if (!open) return;
    if (selected === id) {
      setStopId(null);
      return;
    }
    setStopId(id);
    trackStopOpened(open, id);
  }, []);

  // While a trip is being planned, a tap on the map marks the start or the destination.
  const tapMap = useCallback(
    (p: Point) => {
      const { lineId: open, planning: on, target: end, trip: chosen } = current.current;
      if (on && !open && !chosen) setEnd(end, p);
    },
    [setEnd],
  );

  // Follows the person once their position is known, so the dot moves as they walk.
  const follow = useCallback(
    (asked: boolean) => {
      if (watching.current !== null || !navigator.geolocation) return;
      let first = true;
      watching.current = navigator.geolocation.watchPosition(
        (pos) => {
          const here: Point = [pos.coords.longitude, pos.coords.latitude];
          setMe(here);
          if (first) {
            setLocating(false);
            if (asked) centre(here);
          }
          first = false;
        },
        () => {
          if (watching.current !== null) navigator.geolocation.clearWatch(watching.current);
          watching.current = null;
          setLocating(false);
          if (asked) setNotice("No se pudo obtener la ubicación. Activa el permiso en el navegador.");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      );
    },
    [centre],
  );

  // Someone who already gave permission sees where they are without being asked again.
  useEffect(() => {
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => {
        if (!cancelled && p.state === "granted") follow(false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (watching.current !== null) navigator.geolocation.clearWatch(watching.current);
      watching.current = null;
    };
  }, [follow]);

  const locateMe = () => {
    if (!navigator.geolocation) return setNotice("Este navegador no informa la ubicación.");
    if (planning && !lineId) setOrigin("me");
    if (me) return centre(me);
    setLocating(true);
    follow(true);
  };

  const share = async () => {
    const title = stop ? `${summary?.name} · ${stopName(stop.name)}` : (summary?.name ?? "Colectivos Jujuy");
    try {
      if (navigator.share) await navigator.share({ title, url: window.location.href });
      else {
        await navigator.clipboard.writeText(window.location.href);
        setNotice("Enlace copiado.");
      }
    } catch {}
  };

  const age = received ? Math.max(0, now - received) : 0;
  const stale = Boolean(fleet.data) && (Boolean(fleet.error) || age > 45000);

  let status: string;
  const refused = fleet.data?.unavailable;
  // One short line whatever the reason: on a phone there is room for a few words, and a rider
  // does not need to know which of the source's refusals it was.
  if (refused) status = "Sin datos en vivo";
  else if (!fleet.data) status = fleet.error ? "No se pudo cargar la posición de los colectivos. Se vuelve a intentar solo." : "Buscando colectivos…";
  else if (stale) status = `Santa Ana no responde. Posiciones de hace ${ago(age)}.`;
  else if (view === "line" && summary?.live === false) status = "Sin seguimiento en vivo. Solo se ve el recorrido.";
  else if (view === "line") status = plural(lineBuses.length, "coche en servicio", "coches en servicio");
  else if (view === "saved") status = plural(mapBuses.length, "coche de tus líneas en servicio", "coches de tus líneas en servicio");
  else status = plural(fleet.data.buses.length, "coche en servicio ahora", "coches en servicio ahora");
  const waiting = !fleet.data && !fleet.error;
  const warn = Boolean(refused) || stale || (!fleet.data && Boolean(fleet.error)) || (view === "line" && summary?.live === false);

  // The part of each line the trip rides, and the stops where the person gets on and off.
  const tripDetails = useMemo(() => [legA.data, legB.data], [legA.data, legB.data]);
  const tripShapes = useMemo(() => {
    const paths: MapPath[] = [];
    const marks: MapStop[] = [];
    trip?.legs.forEach((leg, i) => {
      const lineColor = tone(lineMap.get(leg.line)?.color);
      const board: Point = [leg.board.lng, leg.board.lat];
      const alight: Point = [leg.alight.lng, leg.alight.lat];
      const detail = tripDetails[i];
      const path = detail?.line.paths.find((p) => p.direction === leg.board.direction) ?? detail?.line.paths[0];
      // Until the route arrives, the two stops are joined by a straight line.
      paths.push({ direction: `leg${i}`, coordinates: path ? slice(path.coordinates, board, alight) : [board, alight], color: lineColor });
      marks.push({ id: `${i}:board`, lng: board[0], lat: board[1], color: lineColor }, { id: `${i}:alight`, lng: alight[0], lat: alight[1], color: lineColor });
    });
    return { paths, marks, loaded: tripDetails.filter(Boolean).length };
  }, [trip, tripDetails, lineMap]);

  // The person's own dot already marks a start that follows them; a pin is drawn only for a chosen point.
  // Pins stay while a line or a trip is open, so the map still says where the trip starts and ends.
  const pins = useMemo(() => {
    if (!planning) return [];
    const out: { at: Point; end: End }[] = [];
    if (origin !== "me") out.push({ at: origin, end: "from" });
    if (destination) out.push({ at: destination, end: "to" });
    return out;
  }, [planning, origin, destination]);

  // A trip is framed whole: its lines, where it starts and where it ends.
  const frame = useMemo(() => {
    if (!trip || lineId) return [];
    const startAt = origin === "me" ? me : origin;
    return [startAt, destination].filter((p): p is Point => p !== null);
    // The person's dot moves; the frame is taken when the trip is chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip, lineId, origin, destination]);

  const extras = (
    <>
      {saved.length > 0 && (
        <div className="saved">
          <h2>Tus líneas</h2>
          <div className="plates">
            {saved.map((id) => {
              const l = lineMap.get(id);
              return l ? (
                <button key={id} type="button" className="plate-button" onClick={() => openLine(id)} aria-label={l.name} title={l.name}>
                  <Plate line={l} />
                </button>
              ) : null;
            })}
          </div>
        </div>
      )}
      <div className="pair">
        <button
          type="button"
          className="button"
          onClick={() => {
            setPlanning(true);
            setTarget("to");
          }}
        >
          Cómo llegar
        </button>
        <button type="button" className="button" aria-pressed={showAll} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Ocultar todos" : "Ver todos"}
        </button>
      </div>
      <footer className="credit">
        <Image src="/franco.jpg" alt="" width={36} height={36} className="credit-photo" unoptimized />
        <div>
          <p className="credit-name">
            Hecho por <b>Franco Duran</b>
          </p>
          <p>
            Fundador de{" "}
            <a href="https://jujuy.dev.ar" target="_blank" rel="noopener noreferrer">
              jujuy.dev
            </a>{" "}
            ·{" "}
            <a href="https://www.instagram.com/francoduran.23" target="_blank" rel="noopener noreferrer">
              Instagram
            </a>{" "}
            ·{" "}
            <a href="https://x.com/fdurandev" target="_blank" rel="noopener noreferrer">
              X
            </a>
          </p>
        </div>
      </footer>
    </>
  );

  return (
    <div className="app">
      <h1 className="sr-only">Colectivos de San Salvador de Jujuy en vivo</h1>

      <div className="stage">
        <BusMap
          buses={mapBuses}
          paths={view === "trip" ? tripShapes.paths : paths}
          activeDirection={twoWay ? direction : null}
          color={color}
          stops={view === "trip" ? tripShapes.marks : listOpen ? stops : NO_STOPS}
          selectedStop={stopId}
          me={me}
          pins={pins}
          fitKey={line ? line.id : view === "trip" && trip ? `trip:${trip.legs.map((l) => l.line + l.board.id).join(">")}:${tripShapes.loaded}` : ""}
          frame={frame}
          focus={focus}
          routes={motionRoutes}
          legend={view === "line" && bothWays}
          onBus={openLine}
          onStop={selectStop}
          onMap={tapMap}
        />
        <button type="button" className="icon-button locate" onClick={locateMe} aria-label="Mostrar mi ubicación">
          <LocateIcon />
        </button>
        <p className="toast" role="status" data-open={notice ? "" : undefined}>
          {notice}
        </p>
      </div>

      <section
        className="panel"
        data-collapsed={collapsed ? "" : undefined}
        aria-label={summary ? summary.name : trip ? "Tu viaje" : planning ? "Cómo llegar" : "Colectivos en vivo"}
      >
        <button
          type="button"
          className="grip"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Mostrar el panel" : "Ocultar el panel"}
          onPointerDown={(e) => {
            swipe.current = { y: e.clientY, moved: false };
            // The finger ends away from the handle; capturing keeps the release coming here.
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            const dy = swipe.current ? e.clientY - swipe.current.y : 0;
            if (swipe.current && Math.abs(dy) > 24) {
              // A swipe decides by its direction; the click that follows it is ignored.
              swipe.current.moved = true;
              setCollapsed(dy > 0);
            }
          }}
          onClick={() => {
            if (swipe.current?.moved) swipe.current = null;
            else setCollapsed((v) => !v);
          }}
        >
          <span className="grip-bar" />
          {collapsed && !summary && !trip && !planning && <span className="grip-text">Mostrar opciones</span>}
        </button>
        <Install />
        {summary ? (
          <>
            <header className="line-head">
              <Plate line={summary} size="large" />
              <div className="line-title">
                <h2 title={summary.name}>{summary.name}</h2>
                <p className={warn ? "status warn" : "status"}>
                  {waiting && <span className="spinner" aria-hidden="true" />}
                  {status}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => toggleSaved(summary.id)}
                aria-pressed={saved.includes(summary.id)}
                aria-label="Guardar en tus líneas"
              >
                <StarIcon filled={saved.includes(summary.id)} />
              </button>
              <button type="button" className="icon-button" onClick={share} aria-label="Compartir esta línea">
                <ShareIcon />
              </button>
              <button type="button" className="icon-button" onClick={closeLine} aria-label="Cerrar esta línea">
                <CloseIcon />
              </button>
            </header>

            {twoWay && (
              <div className="segmented" role="group" aria-label="Sentido">
                {["ida", "vuelta"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={direction === d}
                    onClick={() => {
                      setDirection(d);
                      setStopId(null);
                    }}
                  >
                    {d === "ida" ? "Ida" : "Vuelta"}
                  </button>
                ))}
              </div>
            )}

            <div className="scroll">
              {detail.error && !line ? (
                <div className="empty">
                  <p>No se pudo cargar esta línea.</p>
                  <button type="button" className="button" onClick={() => detail.mutate()}>
                    Reintentar
                  </button>
                </div>
              ) : !line ? (
                <Loading className="empty">Cargando recorrido…</Loading>
              ) : (
                <>
                  {/* Where this direction starts and ends: its first and last stop, never the person's or a bus's position. */}
                  {ends && (
                    <p className="way-ends">
                      Desde <b>{ends[0]}</b> hasta <b>{ends[1]}</b>
                    </p>
                  )}
                  {stops.length === 0 && <p className="empty">{line.live ? "Esta línea no tiene paradas cargadas." : `Recorrido publicado por la Municipalidad${line.operator ? `. Opera ${line.operator}` : ""}.`}</p>}
                  {(stops.length > 0 || alertLink) && (
                    <div className="line-actions">
                      {stops.length > 0 && (
                        <button
                          type="button"
                          className="button"
                          aria-expanded={listOpen}
                          onClick={() => {
                            setListOpen(!listOpen);
                            setStopId(null);
                          }}
                        >
                          {listOpen ? "Ocultar paradas" : "Ver paradas"}
                          <ChevronIcon />
                        </button>
                      )}
                      {alertLink && (
                        <a className="button" href={alertLink} target="_blank" rel="noopener noreferrer" aria-label="Avisarme por Telegram" onClick={() => trackTelegramAlert(summary.id, "linea")}>
                          <PlaneIcon />
                          Avisarme
                        </a>
                      )}
                    </div>
                  )}
                  {listOpen && stops.length > 0 && (
                <ol className="stops">
                  {stops.map((s) => (
                    <li key={s.id} ref={s.id === stopId ? selectedRow : undefined}>
                      <button type="button" className="stop" aria-expanded={s.id === stopId} onClick={() => selectStop(s.id)}>
                        <span className="stop-dot" style={{ borderColor: color, background: s.id === stopId ? color : undefined }} />
                        <span className="stop-name">{stopName(s.name)}</span>
                      </button>
                      {s.id === stopId && (
                        <div className="arrivals" data-spacing-ok>
                          {coming.length === 0 ? (
                            <p>{refused ? "Sin posiciones en vivo: no se puede estimar." : "No hay coches en camino a esta parada en este momento."}</p>
                          ) : (
                            <ul>
                              {coming.map(({ bus, meters, minutes }) => (
                                <li key={bus.id} className={bus.fresh ? undefined : "dim"}>
                                  <span className="eta">{minutes < 1 ? "Llegando" : `≈ ${Math.round(minutes)} min`}</span>
                                  <span className="eta-detail">
                                    Coche {bus.number ?? bus.id} · {formatDistance(meters)}
                                    {!bus.fresh && " · señal de hace " + ago(bus.age * 1000)}
                                  </span>
                                  {bus.ramp && (
                                    <span className="ramp">
                                      <RampIcon /> Con rampa
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          <p className="estimate">Tiempo estimado según la distancia por el recorrido.</p>
                          {BOT && (
                            <a
                              className="button alert-link"
                              href={`https://t.me/${BOT}?start=${s.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => trackTelegramAlert(summary.id, s.id)}
                            >
                              Avisarme por Telegram
                            </a>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
                  )}
                </>
              )}
            </div>
          </>
        ) : trip ? (
          <Trip option={trip} lineMap={lineMap} details={tripDetails} buses={fleet.data?.buses} unavailable={Boolean(refused)} onOpenLine={openLine} onClose={() => setTrip(null)} />
        ) : planning ? (
          <Planner
            lineMap={lineMap}
            me={me}
            origin={origin}
            destination={destination}
            target={target}
            locating={locating}
            onTarget={setTarget}
            onPoint={setEnd}
            onLocate={locateMe}
            onChoose={(option) => {
              trackTripPlanned(option.legs);
              setTrip(option);
            }}
            onClose={() => {
              setPlanning(false);
              setTrip(null);
            }}
          />
        ) : (
          <div className="scroll">
            <div className="home">
              <p className="brand">
                <Logo />
                <span className="brand-name">colejuy</span>
              </p>
              <p className={warn ? "status warn" : "status"} role="status">
                {waiting && <span className="spinner" aria-hidden="true" />}
                {status}
              </p>
              <button type="button" className="button primary" onClick={() => setPicking(true)}>
                Buscar línea
              </button>
              {extras}
            </div>
          </div>
        )}
      </section>

      {picking && (
        <LinePicker
          lines={lines.data?.lines}
          saved={saved}
          failed={Boolean(lines.error)}
          retry={() => lines.mutate()}
          onPick={(id) => openLine(id)}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
