// Copies the municipal routes of the lines Santa Ana does not operate into src/data.
// The GeoServer is plain HTTP on an IP, so the site cannot read it from the browser.
import { mkdir, writeFile } from "node:fs/promises";

const URL =
  "http://45.186.124.67:8080/geoserver/planificacion/ows?service=WFS&version=1.0.0&request=GetFeature" +
  "&typeName=planificacion:recorridos_lineas&outputFormat=application/json&srsName=EPSG:4326";

const round = (n) => Math.round(n * 1e6) / 1e6;
const title = (s) =>
  s.trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

const res = await fetch(URL, { signal: AbortSignal.timeout(60000) });
if (!res.ok) throw new Error(`GeoServer: HTTP ${res.status}`);
const { features } = await res.json();
if (!Array.isArray(features) || features.length === 0) throw new Error("GeoServer: no features");

const lines = new Map();
for (const f of features) {
  const p = f.properties ?? {};
  const operator = (p.empresa ?? "").trim();
  if (operator.toUpperCase() === "SANTA ANA" || !p.linea || !f.geometry) continue;
  const code = p.linea.trim();
  const m = code.match(/^L0*(\d+)(B?)$/);
  if (!m) throw new Error(`Unexpected line code: ${code}`);
  const line = lines.get(code) ?? {
    id: `muni-${code.toLowerCase()}`,
    number: m[1],
    name: title(p.name ?? `Linea ${m[1]}`),
    color: null,
    operator: operator && operator !== "-" ? title(operator) : null,
    live: false,
    paths: [],
  };
  for (const part of f.geometry.coordinates) {
    line.paths.push({
      direction: p.sentido === true ? "ida" : p.sentido === false ? "vuelta" : `tramo ${line.paths.length + 1}`,
      coordinates: part.map(([lng, lat]) => [round(lng), round(lat)]),
    });
  }
  lines.set(code, line);
}

const out = [...lines.values()].sort((a, b) => Number(a.number) - Number(b.number) || a.id.localeCompare(b.id));
if (out.length === 0) throw new Error("No lines left after filtering");

await mkdir("src/data", { recursive: true });
await writeFile("src/data/muni-lines.json", JSON.stringify(out));
console.log(`${out.length} lines written to src/data/muni-lines.json`);
for (const l of out) console.log(`  ${l.id}  ${l.name}  [${l.operator ?? "sin empresa"}]  ${l.paths.map((p) => p.direction).join(", ")}`);
