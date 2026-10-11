import muni from "@/data/muni-lines.json";
import { labelPaths } from "./eta";
import { orderStops } from "./route";
import { fetchRoutes, fetchStops, type Line, type LineRoute, type Stop } from "./santa-ana";

const muniLines = muni as LineRoute[];

// Every line of the city: Santa Ana's (tracked live) plus the municipal routes of the rest.
export async function allRoutes(): Promise<LineRoute[]> {
  try {
    return [...(await fetchRoutes()), ...muniLines];
  } catch (err) {
    // Build machines often get nginx 403 from Santa Ana (datacenter IP block). Without a
    // fallback the whole production build dies and env updates never ship.
    // Runtime / ISR still throw so Next can keep the last good daily copy.
    if (process.env.NEXT_PHASE === "phase-production-build") {
      console.warn("Santa Ana unreachable during build; municipal lines only", err);
      return [...muniLines];
    }
    throw err;
  }
}

export async function allLines(): Promise<Line[]> {
  return (await allRoutes()).map(({ id, number, name, color, operator, live }) => ({
    id,
    number,
    name,
    color,
    operator,
    live,
  }));
}

export async function findRoute(id: string): Promise<LineRoute | undefined> {
  return (await allRoutes()).find((l) => l.id === id);
}

// A line with its stops, and each path labelled with the direction of the stops that lie on it.
export async function lineDetail(id: string): Promise<{ line: LineRoute; stops: Stop[] } | null> {
  const line = await findRoute(id);
  if (!line) return null;
  const stops = line.live ? await fetchStops(line.id) : [];
  const paths = labelPaths(line.paths, stops);
  // Every reader gets the stops in the order a bus reaches them: the list, the two ends of each
  // direction, the bot and the trip planner all sort by `order`.
  return { line: { ...line, paths }, stops: orderStops(stops, paths) };
}
