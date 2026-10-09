import muni from "@/data/muni-lines.json";
import { labelPaths } from "./eta";
import { orderStops } from "./route";
import { fetchRoutes, fetchStops, type Line, type LineRoute, type Stop } from "./santa-ana";

const muniLines = muni as LineRoute[];

// Every line of the city: Santa Ana's (tracked live) plus the municipal routes of the rest.
export async function allRoutes(): Promise<LineRoute[]> {
  return [...(await fetchRoutes()), ...muniLines];
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
