"use client";

import { LngLatBounds, Map as MapLibreMap, setWorkerUrl, type GeoJSONSource, type PointLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { arrowOpacity, createMotion, heldWithoutSignal, pushFix, sameReading, stepMotion, STOP_KMH, type MotionState, type RouteLine } from "@/lib/motion";
import { routeStroke } from "@/lib/route";
import Loading from "./Loading";

export type MapBus = {
  id: number;
  line: string | null;
  lng: number;
  lat: number;
  label: string;
  color: string;
  text: string;
  fresh: boolean;
  speed: number;
  course: number | null;
  moving: boolean;
  age: number;
};
// A path or a stop may carry its own color, when more than one line is on the map at once.
export type MapPath = { direction: string; coordinates: [number, number][]; color?: string };
export type MapStop = { id: string; lng: number; lat: number; color?: string };

type Props = {
  buses: MapBus[];
  paths: MapPath[];
  activeDirection: string | null;
  color: string;
  stops: MapStop[];
  selectedStop: string | null;
  me: [number, number] | null;
  // The start and the destination of a trip being planned.
  pins: { at: [number, number]; end: "from" | "to" }[];
  // Changes when the map should frame the current route again.
  fitKey: string;
  // Points that must stay in view together with the route: where the trip starts and ends.
  frame: [number, number][];
  focus: { lng: number; lat: number; key: string } | null;
  // Full routes the buses can follow between readings. A bus whose route is not here stays at its last reading.
  routes: RouteLine[];
  // Ida and vuelta are both on the map, so the legend is shown.
  legend: boolean;
  onBus: (line: string) => void;
  onStop: (id: string) => void;
  onMap: (point: [number, number]) => void;
};

// MapLibre ships its worker as a separate file; the bundler does not carry it, so it is served from public/.
setWorkerUrl("/maplibre-gl-worker.mjs");

const STYLE = "https://tiles.openfreemap.org/styles/positron";
const CENTER: [number, number] = [-65.28, -24.215];
const ME = "#2b63d9";
// About 15 frames a second: enough for the buses to look like they roll, light on a phone.
const FRAME_MS = 66;
const STALE_S = 120;

// A chevron pointing up. MapLibre rotates it with the map, and tints it with the line color.
function arrowImage(): ImageData {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  if (!g) return new ImageData(size, size);
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.moveTo(32, 4);
  g.lineTo(50, 34);
  g.lineTo(32, 26);
  g.lineTo(14, 34);
  g.closePath();
  g.fill();
  return g.getImageData(0, 0, size, size);
}

const collection = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function BusMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const handlers = useRef(props);
  handlers.current = props;

  const motions = useRef(new globalThis.Map<number, MotionState>());

  useEffect(() => {
    if (!container.current) return;
    const m = new MapLibreMap({
      container: container.current,
      style: STYLE,
      center: CENTER,
      zoom: 11.7,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    map.current = m;

    m.on("load", () => {
      for (const id of ["route", "stops", "pin", "buses", "me"]) m.addSource(id, { type: "geojson", data: collection([]) });
      const solid = ["!=", ["get", "dashed"], true] as ["!=", ["get", string], true];
      const dashed = ["==", ["get", "dashed"], true] as ["==", ["get", string], true];
      m.addLayer({
        id: "route-edge",
        type: "line",
        source: "route",
        filter: solid,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": ["get", "opacity"] },
      });
      m.addLayer({
        id: "route",
        type: "line",
        source: "route",
        filter: solid,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 4.5, "line-opacity": ["get", "opacity"] },
      });
      // The return is the same color, broken, so the two directions can be told apart.
      m.addLayer({
        id: "route-edge-dash",
        type: "line",
        source: "route",
        filter: dashed,
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": ["get", "opacity"], "line-dasharray": [1.2, 1.4] },
      });
      m.addLayer({
        id: "route-dash",
        type: "line",
        source: "route",
        filter: dashed,
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 4.5, "line-opacity": ["get", "opacity"], "line-dasharray": [1.6, 1.5] },
      });
      m.addLayer({
        id: "stops",
        type: "circle",
        source: "stops",
        paint: {
          "circle-radius": ["case", ["get", "selected"], 9, 5],
          "circle-color": ["case", ["get", "selected"], ["get", "color"], "#ffffff"],
          "circle-stroke-color": ["case", ["get", "selected"], "#ffffff", ["get", "color"]],
          "circle-stroke-width": ["case", ["get", "selected"], 3, 2],
        },
      });
      m.addLayer({
        id: "pin",
        type: "circle",
        source: "pin",
        paint: {
          "circle-radius": 9,
          "circle-color": ["case", ["==", ["get", "end"], "to"], "#1c1b18", "#ffffff"],
          "circle-stroke-color": ["case", ["==", ["get", "end"], "to"], "#ffffff", "#1c1b18"],
          "circle-stroke-width": 4,
        },
      });
      m.addLayer({
        id: "buses",
        type: "circle",
        source: "buses",
        paint: {
          "circle-radius": 13,
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-opacity": ["case", ["get", "fresh"], 1, 0.4],
          "circle-stroke-opacity": ["case", ["get", "fresh"], 1, 0.4],
        },
      });
      if (!m.hasImage("bus-arrow")) m.addImage("bus-arrow", arrowImage(), { sdf: true });
      m.addLayer({
        id: "bus-arrow",
        type: "symbol",
        source: "buses",
        layout: {
          "icon-image": "bus-arrow",
          "icon-size": 0.55,
          "icon-rotate": ["get", "bearing"],
          "icon-rotation-alignment": "map",
          "icon-pitch-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-color": ["get", "color"],
          "icon-halo-color": "#ffffff",
          "icon-halo-width": 1.4,
          "icon-opacity": ["get", "arrow"],
        },
      });
      m.addLayer({
        id: "bus-labels",
        type: "symbol",
        source: "buses",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": ["get", "text"], "text-opacity": ["case", ["get", "fresh"], 1, 0.5] },
      });
      // The person's own position is the only blue thing on the map, with a halo around it,
      // so it is never mistaken for a point they marked.
      m.addLayer({
        id: "me-halo",
        type: "circle",
        source: "me",
        paint: { "circle-radius": 20, "circle-color": ME, "circle-opacity": 0.16 },
      });
      m.addLayer({
        id: "me",
        type: "circle",
        source: "me",
        paint: { "circle-radius": 7, "circle-color": ME, "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 },
      });
      // On a phone the open credits wrap to two lines and crowd the location button;
      // they start folded behind their own button, where MapLibre keeps them reachable.
      if (window.innerWidth < 900) {
        const credits = m.getContainer().querySelector(".maplibregl-ctrl-attrib");
        credits?.classList.remove("maplibregl-compact-show");
        credits?.removeAttribute("open");
      }
      setReady(true);
    });

    m.on("click", (e) => {
      const box: [PointLike, PointLike] = [
        [e.point.x - 16, e.point.y - 16],
        [e.point.x + 16, e.point.y + 16],
      ];
      const stop = m.queryRenderedFeatures(box, { layers: ["stops"] })[0];
      if (stop) return handlers.current.onStop(String(stop.properties.id));
      const bus = m.queryRenderedFeatures(box, { layers: ["buses", "bus-arrow"] })[0];
      if (bus?.properties.line) return handlers.current.onBus(String(bus.properties.line));
      handlers.current.onMap([e.lngLat.lng, e.lngLat.lat]);
    });

    const resize = new ResizeObserver(() => m.resize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  const { buses, paths, activeDirection, color, stops, selectedStop, me, pins, fitKey, frame, focus, routes, legend } = props;

  // A repeated reading must not restart the extrapolation. A new one glides into place.
  useEffect(() => {
    if (!ready) return;
    const now = Date.now();
    const glide = !reducedMotion();
    const seen = new Set<number>();
    for (const b of buses) {
      seen.add(b.id);
      const fix = heldWithoutSignal({ lng: b.lng, lat: b.lat, speed: b.speed, course: b.course, moving: b.moving, age: b.age }, b.fresh);
      const mine = routes.filter((r) => r.line === b.line);
      const prev = motions.current.get(b.id);
      if (!prev) motions.current.set(b.id, createMotion(fix, mine, now));
      else if (!sameReading(prev.fix, fix)) motions.current.set(b.id, pushFix(prev, fix, mine, now, glide));
    }
    for (const id of motions.current.keys()) if (!seen.has(id)) motions.current.delete(id);
  }, [ready, buses, routes]);

  // Between readings each bus keeps rolling along its route. The frame is throttled for phones.
  useEffect(() => {
    if (!ready) return;
    const source = map.current?.getSource("buses") as GeoJSONSource | undefined;
    if (!source) return;
    let frameId = 0;
    let last = 0;
    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;
      const wall = Date.now();
      const glide = !reducedMotion();
      const { buses: current, routes: lines } = handlers.current;
      source.setData(
        collection(
          current.flatMap((b) => {
            const state = motions.current.get(b.id);
            if (!state) return [];
            const mine = lines.filter((r) => r.line === b.line);
            const stepped = stepMotion(state, mine, wall, glide);
            motions.current.set(b.id, stepped);
            const ageNow = stepped.fix.age + (wall - stepped.movedAtMs) / 1000;
            const fresh = b.fresh && ageNow <= STALE_S;
            const rolling = stepped.fix.moving && stepped.fix.speed > STOP_KMH;
            return [
              {
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: stepped.shown.at },
                properties: {
                  line: b.line,
                  label: b.label,
                  color: b.color,
                  text: b.text,
                  fresh,
                  bearing: stepped.shown.bearing ?? 0,
                  arrow: arrowOpacity(rolling, fresh, stepped.shown.bearing),
                },
              },
            ];
          }),
        ),
      );
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [ready]);

  useEffect(() => {
    const source = map.current?.getSource("route") as GeoJSONSource | undefined;
    if (!ready || !source) return;
    source.setData(
      collection(
        paths.map((p) => ({
          type: "Feature",
          geometry: { type: "LineString", coordinates: p.coordinates },
          properties: {
            color: p.color ?? color,
            opacity: activeDirection === null || p.direction === activeDirection ? 1 : 0.3,
            dashed: routeStroke(p.direction) === "dashed",
          },
        })),
      ),
    );
  }, [ready, paths, activeDirection, color]);

  useEffect(() => {
    const source = map.current?.getSource("stops") as GeoJSONSource | undefined;
    if (!ready || !source) return;
    source.setData(
      collection(
        stops.map((s) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.lng, s.lat] },
          properties: { id: s.id, color: s.color ?? color, selected: s.id === selectedStop },
        })),
      ),
    );
  }, [ready, stops, selectedStop, color]);

  useEffect(() => {
    const source = map.current?.getSource("me") as GeoJSONSource | undefined;
    if (!ready || !source) return;
    source.setData(collection(me ? [{ type: "Feature", geometry: { type: "Point", coordinates: me }, properties: {} }] : []));
  }, [ready, me]);

  useEffect(() => {
    const source = map.current?.getSource("pin") as GeoJSONSource | undefined;
    if (!ready || !source) return;
    source.setData(collection(pins.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: p.at }, properties: { end: p.end } }))));
  }, [ready, pins]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || paths.length === 0) return;
    const bounds = new LngLatBounds();
    for (const p of paths) for (const c of p.coordinates) bounds.extend(c);
    for (const c of frame) bounds.extend(c);
    m.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: reducedMotion() ? 0 : 600 });
    // Framing follows the line, not every refresh of its geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !focus) return;
    m.easeTo({ center: [focus.lng, focus.lat], zoom: Math.max(m.getZoom(), 15), duration: reducedMotion() ? 0 : 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focus?.key]);

  return (
    <>
      <div ref={container} className="map" role="application" aria-label="Mapa de colectivos" />
      {legend && (
        <div className="route-legend" style={{ "--line": color } as React.CSSProperties}>
          <span>
            <i /> ida
          </span>
          <span>
            <i className="dashed" /> vuelta
          </span>
        </div>
      )}
      {!ready && <Loading className="map-wait">Cargando mapa…</Loading>}
    </>
  );
}
