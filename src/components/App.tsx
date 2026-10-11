"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { trackLineSelected, trackStopOpened, trackTelegramAlert, trackTripPlanned } from "@/lib/analytics";
import { arrivals } from "@/lib/eta";
import { textOn, tone } from "@/lib/color";
import { formatDistance } from "@/lib/geo";
import type { Option } from "@/lib/plan";
import type { RouteLine } from "@/lib/motion";
import { directionEnds, hasBothDirections, ridePath } from "@/lib/route";
import type { Bus, Fleet, Line, LineRoute, Stop } from "@/lib/santa-ana";
import { HOLD_MS, RETRY_MS, STATUS_TEXT, hasBuses, holdFleet, liveText, noDataStatus, type Good } from "@/lib/fleet-hold";
import type { MapBus, MapMark, MapPath, MapStop } from "./BusMap";
import BusEta from "./BusEta";
import Install from "./Install";
import ShareSite from "./ShareSite";
import { ChevronIcon, CloseIcon, DirectionsIcon, JujuyDevIcon, InstagramIcon, LocateIcon, PlaneIcon, RampIcon, SearchIcon, ShareIcon, StarIcon, XIcon } from "./icons";
import LinePicker from "./LinePicker";
import Logo from "./Logo";
import Loading from "./Loading";
import Planner, { type End, type Point } from "./Planner";
import { plateLabel, Plate } from "./Plate";
import Trip, { type Detail } from "./Trip";
import Feedback from "./Feedback";
import ThemeToggle from "./ThemeToggle";
import { useTheme } from "./ThemeProvider";

const BusMap = dynamic(() => import("./BusMap"), { ssr: false, loading: () => <Loading className="map-wait">Cargando mapa…</Loading> });

// Saved lines live on this device only: there is no account and no database.
const SAVED_LINES = "lineas-guardadas";
// Username of the Telegram bot, without the @. Without it there is no alert button.
const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT;
const NO_PATHS: LineRoute["paths"] = [];
const NO_STOPS: Stop[] = [];
const NO_PINS: { at: Point; end: End }[] = [];
const NO_MARKS: MapMark[] = [];

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

type WalkEnds = [Point, Point];

// The streets between two points, from /api/walk. null until it answers or when it fails:
// the caller then draws the straight line.
function useWalk(ends: WalkEnds | null): Point[] | null {
  const q = ends ? `from=${ends[0][0].toFixed(5)},${ends[0][1].toFixed(5)}&to=${ends[1][0].toFixed(5)},${ends[1][1].toFixed(5)}` : null;
  const { data } = useSWR<{ coordinates: Point[] }>(q ? `/api/walk?${q}` : null, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    keepPreviousData: false,
  });
  return data?.coordinates?.length ? data.coordinates : null;
}

const stopName = (name: string) => name.trim() || "Parada sin nombre";
const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
}

export default function App() {
  const { resolvedTheme } = useTheme();
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
  const [focus, setFocus] = useState<{ lng: number; lat: number; key: string } | null>(null);
  // The coach whose arrival card is open, and whether the location prompt from that tap is still pending.
  const [etaBusId, setEtaBusId] = useState<number | null>(null);
  const [etaPinned, setEtaPinned] = useState<Bus | null>(null);
  const [etaLoc, setEtaLoc] = useState<"asking" | "denied" | "unsupported" | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // When the current reading arrived, on this device's clock: comparing against the server's
  // timestamp would call fresh data stale on a phone whose clock runs fast.
  const [received, setReceived] = useState(0);
  const restored = useRef(false);
  const selectedRow = useRef<HTMLLIElement>(null);
  const watching = useRef<number | null>(null);
  const focusCount = useRef(0);
  const current = useRef({ lineId, stopId, planning, target, trip, me, origin });
  current.current = { lineId, stopId, planning, target, trip, me, origin };

  // One open line: ask only for it, often. Overview, saved lines and trips: the whole fleet, rarely.
  // A trip asks for its own lines only (Santa Ana limits requests), never the whole fleet.
  const fleetLines = useMemo(() => [...new Set([lineId, ...(trip?.legs.map((l) => l.line) ?? [])].filter((l): l is string => Boolean(l)))], [lineId, trip]);
  const fleet = useSWR<Fleet>(fleetLines.length ? `/api/fleet?${fleetLines.map((l) => `line=${encodeURIComponent(l)}`).join("&")}` : "/api/fleet", fetcher, {
    // Without live coaches, ask again every 15 s.
    refreshInterval: (data) => {
      const base = fleetLines.length ? 10000 : 25000;
      return hasBuses(data) ? base : Math.min(base, RETRY_MS);
    },
    keepPreviousData: true,
  });
  // Last good answer, kept up to 3 minutes while the next ones come back empty or refused.
  const [good, setGood] = useState<Good | null>(null);
  const [mountedAt] = useState(() => Date.now());
  useEffect(() => {
    setGood((prev) => holdFleet(prev, fleet.data, Date.now()));
  }, [fleet.data]);
  const fleetData = hasBuses(fleet.data) || !good || now - good.at > HOLD_MS ? fleet.data : good.fleet;
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
    if (hasBuses(fleet.data)) setReceived(Date.now());
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

  // The card follows the fleet the map already polls. A coach that drops out stays pinned so the card can say so.
  useEffect(() => {
    if (etaBusId == null) return;
    const live = fleetData?.buses.find((b) => b.id === etaBusId);
    if (live) setEtaPinned(live);
  }, [fleetData, etaBusId]);

  useEffect(() => {
    if (etaBusId == null || !etaPinned?.line) return;
    if (lineId !== etaPinned.line) setEtaBusId(null);
  }, [lineId, etaBusId, etaPinned?.line]);

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

  const lineBuses = useMemo(() => (fleetData?.buses ?? []).filter((b) => b.line === lineId), [fleetData, lineId]);

  // What the map shows: one line, the saved lines, or nothing.
  // Opening on every bus of the city helps nobody find theirs, and a trip being planned needs a clear map.
  const view = lineId ? "line" : trip ? "trip" : planning ? "none" : saved.length ? "saved" : "none";

  const mapBuses: MapBus[] = useMemo(() => {
    const all = fleetData?.buses ?? [];
    const source =
      view === "line"
        ? lineBuses
        : view === "trip"
          ? all.filter((b) => trip?.legs.some((l) => l.line === b.line))
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
  }, [fleetData, lineBuses, lineMap, view, saved, trip]);

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
    setEtaBusId(null);
  };

  const pickEtaStop = useCallback((id: string) => {
    const open = current.current.lineId;
    if (!open || current.current.stopId === id) return;
    setStopId(id);
    trackStopOpened(open, id);
  }, []);

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
  // centreMap is only for the location button: a bus tap must not yank the map off the coach.
  const follow = useCallback(
    (asked: boolean, centreMap = asked) => {
      if (watching.current !== null || !navigator.geolocation) return;
      let first = true;
      watching.current = navigator.geolocation.watchPosition(
        (pos) => {
          const here: Point = [pos.coords.longitude, pos.coords.latitude];
          setMe(here);
          if (first) {
            setLocating(false);
            if (centreMap) centre(here);
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

  // Permission is asked here, and only because a bus was tapped with no stop to aim at.
  const askHere = useCallback(() => {
    if (!navigator.geolocation) {
      setEtaLoc("unsupported");
      return;
    }
    setEtaLoc("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMe([pos.coords.longitude, pos.coords.latitude]);
        setEtaLoc(null);
        follow(false);
      },
      () => setEtaLoc("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  }, [follow]);

  const onBusTap = useCallback(
    (busId: number) => {
      const bus = fleetData?.buses.find((b) => b.id === busId);
      if (!bus?.line) return;
      setEtaBusId(busId);
      setEtaPinned(bus);
      const snap = current.current;
      const tripStop = snap.trip?.legs.find((leg) => leg.line === bus.line)?.board.id ?? null;
      const hasStop = (snap.lineId === bus.line && snap.stopId != null) || tripStop != null;
      const rider = snap.me ?? ((snap.planning || snap.trip) && snap.origin !== "me" ? snap.origin : null);
      if (snap.lineId !== bus.line) openLine(bus.line, tripStop);
      if (!hasStop && !rider) askHere();
    },
    [fleetData, openLine, askHere],
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
  const stale = Boolean(fleetData) && (Boolean(fleet.error) || age > 45000);

  let status: string;
  const refused = fleetData?.unavailable;
  // One short line whatever the reason: on a phone there is room for a few words, and a rider
  // does not need to know which of the source's refusals it was.
  if (refused) status = STATUS_TEXT[noDataStatus(fleetData, good?.at ?? mountedAt, now)];
  else if (fleetData && !hasBuses(fleetData) && view === "none") status = STATUS_TEXT[noDataStatus(fleetData, good?.at ?? mountedAt, now)];
  else if (!fleetData) status = fleet.error ? "No se pudo cargar la posición de los colectivos. Se vuelve a intentar solo." : "Buscando colectivos…";
  else if (stale) status = `Santa Ana no responde. Posiciones de hace ${ago(age)}.`;
  else if (view === "line" && summary?.live === false) status = "Sin seguimiento en vivo. Solo se ve el recorrido.";
  else if (view === "line") status = plural(lineBuses.length, "coche en servicio", "coches en servicio");
  else if (view === "saved") status = plural(mapBuses.length, "coche de tus líneas en servicio", "coches de tus líneas en servicio");
  else status = liveText(fleetData.buses.length);
  const waiting = (!fleetData && !fleet.error) || (!hasBuses(fleetData) && noDataStatus(fleetData, good?.at ?? mountedAt, now) === "updating" && Boolean(fleetData));
  const warn = (Boolean(refused) && noDataStatus(fleetData, good?.at ?? mountedAt, now) === "none") || stale || (!fleetData && Boolean(fleet.error)) || (view === "line" && summary?.live === false);

  // The part of each line the trip rides, and the stops where the person gets on and off.
  const tripDetails = useMemo(() => [legA.data, legB.data], [legA.data, legB.data]);
  // Where each walk starts and ends. The person's dot moves; a walk is drawn from where it was when the trip was chosen.
  const walkEnds = useMemo(() => {
    if (!trip) return [null, null, null] as (WalkEnds | null)[];
    const first = trip.legs[0];
    const last = trip.legs[trip.legs.length - 1];
    const start = origin === "me" ? me : origin;
    const pt = (s: { lng: number; lat: number }): Point => [s.lng, s.lat];
    return [
      start ? ([start, pt(first.board)] as WalkEnds) : null,
      trip.legs[1] ? ([pt(first.alight), pt(trip.legs[1].board)] as WalkEnds) : null,
      destination ? ([pt(last.alight), destination] as WalkEnds) : null,
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip, origin, destination]);
  const walk0 = useWalk(walkEnds[0]);
  const walk1 = useWalk(walkEnds[1]);
  const walk2 = useWalk(walkEnds[2]);

  const tripShapes = useMemo(() => {
    const paths: MapPath[] = [];
    const marks: MapStop[] = [];
    trip?.legs.forEach((leg, i) => {
      const lineColor = tone(lineMap.get(leg.line)?.color);
      const board: Point = [leg.board.lng, leg.board.lat];
      const alight: Point = [leg.alight.lng, leg.alight.lat];
      const detail = tripDetails[i];
      // Until the route arrives, the two stops are joined by a straight line.
      paths.push({ direction: `leg${i}`, coordinates: detail ? ridePath(detail.line.paths, board, alight, leg.board.direction, leg.ride) : [board, alight], color: lineColor });
      marks.push({ id: `${i}:board`, lng: board[0], lat: board[1], color: lineColor }, { id: `${i}:alight`, lng: alight[0], lat: alight[1], color: lineColor });
    });
    // On foot: along the streets when OSRM answers, a straight dotted line otherwise.
    const walks = [walk0, walk1, walk2];
    walkEnds.forEach((ends, i) => {
      if (ends) paths.push({ direction: `walk${i}`, coordinates: walks[i] ?? ends, color: "#6b6a64" });
    });
    // Labeled marks: where it starts, where to get on and off each bus, where it ends.
    const labeled: MapMark[] = [];
    if (trip) {
      const startAt = walkEnds[0]?.[0];
      if (startAt) labeled.push({ id: "A", lng: startAt[0], lat: startAt[1], kind: "letter", text: "A", color: "#1c1b18", textColor: "#ffffff" });
      trip.legs.forEach((leg, i) => {
        const line = lineMap.get(leg.line);
        const c = tone(line?.color);
        const num = line ? plateLabel(line) : leg.line;
        labeled.push(
          { id: `${i}:board`, lng: leg.board.lng, lat: leg.board.lat, kind: "label", text: `${num} · Subís`, color: c, textColor: textOn(c), bus: true },
          { id: `${i}:alight`, lng: leg.alight.lng, lat: leg.alight.lat, kind: "label", text: "Bajás", color: "#ffffff", textColor: "#1c1b18" },
        );
      });
      if (destination) labeled.push({ id: "B", lng: destination[0], lat: destination[1], kind: "letter", text: "B", color: "#d6322e", textColor: "#ffffff" });
    }
    return { paths, marks, labeled, loaded: tripDetails.filter(Boolean).length };
  }, [trip, tripDetails, lineMap, walkEnds, walk0, walk1, walk2, destination]);

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

  const etaChosen: Stop | null = (() => {
    if (!etaPinned?.line || etaPinned.line !== lineId) return null;
    if (stop) return stop;
    const board = trip?.legs.find((leg) => leg.line === etaPinned.line)?.board;
    if (!board) return null;
    return (
      allStops.find((s) => s.id === board.id) ?? {
        id: board.id,
        name: board.name,
        lat: board.lat,
        lng: board.lng,
        direction: board.direction,
        order: board.order,
      }
    );
  })();
  const etaAt: Point | null = me ?? ((planning || trip) && origin !== "me" ? origin : null);
  const etaCard =
    etaBusId != null && etaPinned?.line ? (
      <BusEta
        bus={etaPinned}
        live={Boolean(fleetData?.buses.some((b) => b.id === etaPinned.id))}
        lineId={etaPinned.line}
        line={etaPinned.line === line?.id ? line : (lineMap.get(etaPinned.line) ?? null)}
        paths={etaPinned.line === line?.id ? paths : NO_PATHS}
        stops={etaPinned.line === line?.id ? allStops : NO_STOPS}
        loading={etaPinned.line === lineId && !line}
        chosen={etaChosen}
        at={etaAt}
        locating={etaLoc === "asking"}
        locationBlocked={etaLoc === "denied" || etaLoc === "unsupported"}
        fleetNote={stale ? status : null}
        refused={Boolean(refused)}
        onPickStop={pickEtaStop}
        onClose={() => {
          setEtaBusId(null);
          setEtaLoc(null);
        }}
      />
    ) : null;

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
      <footer className="credit">
        <div className="credit-bar">
          <Image src="/franco.jpg" alt="" width={32} height={32} className="credit-photo" unoptimized />
          <p className="credit-name">
            <b>Hecho por Franco Durán</b>
            <span>Founder de jujuy.dev</span>
          </p>
          <div className="credit-icons">
            {/* Opens a message to the author, not just the profile. */}
            <a href="https://ig.me/m/francoduran.23" target="_blank" rel="noopener noreferrer" aria-label="Instagram y sugerencias" title="Instagram y sugerencias">
              <InstagramIcon />
            </a>
            <a href="https://jujuy.dev.ar" target="_blank" rel="noopener noreferrer" aria-label="jujuy.dev" title="jujuy.dev">
              <JujuyDevIcon />
            </a>
            <a href="https://x.com/fdurandev" target="_blank" rel="noopener noreferrer" aria-label="X" title="X">
              <XIcon />
            </a>
            <ShareSite />
          </div>
        </div>
      </footer>
    </>
  );

  return (
    <div className="app">
      <h1 className="sr-only">Colectivos de San Salvador de Jujuy en vivo</h1>

      <div className="stage">
        <BusMap
          theme={resolvedTheme}
          buses={mapBuses}
          paths={view === "trip" ? tripShapes.paths : paths}
          activeDirection={twoWay ? direction : null}
          color={color}
          stops={view === "trip" ? NO_STOPS : listOpen ? stops : NO_STOPS}
          selectedStop={stopId}
          me={me}
          pins={view === "trip" ? NO_PINS : pins}
          marks={view === "trip" ? tripShapes.labeled : NO_MARKS}
          fitKey={line ? line.id : view === "trip" && trip ? `trip:${trip.legs.map((l) => l.line + l.board.id).join(">")}:${tripShapes.loaded}:${[walk0, walk1, walk2].filter(Boolean).length}` : ""}
          frame={frame}
          focus={focus}
          routes={motionRoutes}
          legend={view === "line" && bothWays}
          onBus={onBusTap}
          onStop={selectStop}
          onMap={tapMap}
        />
        <button type="button" className="icon-button locate" onClick={locateMe} aria-label="Mostrar mi ubicación">
          <LocateIcon />
        </button>
        <p className="toast" role="status" data-open={notice ? "" : undefined}>
          {notice}
        </p>
        {etaCard}
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
          <Trip option={trip} lineMap={lineMap} details={tripDetails} buses={fleetData?.buses} unavailable={Boolean(refused)} onOpenLine={openLine} onClose={() => setTrip(null)} />
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
              <div className="home-actions">
                <button type="button" className="button primary" onClick={() => setPicking(true)}>
                  <SearchIcon />
                  Buscar línea
                </button>
                <button
                  type="button"
                  className="button"
                  aria-label="Cómo llegar"
                  onClick={() => {
                    setPlanning(true);
                    setTarget("to");
                  }}
                >
                  <DirectionsIcon />
                  Cómo llegar
                </button>
              </div>
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
      <div className="top-actions">
        <Install />
        <ThemeToggle />
        <Feedback lineId={lineId} stopId={stopId} />
      </div>
    </div>
  );
}
