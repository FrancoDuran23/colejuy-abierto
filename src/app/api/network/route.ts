import { stopsFromPaths } from "@/lib/approx-stops";
import { allRoutes, lineDetail } from "@/lib/lines";
import type { NetLine } from "@/lib/plan";

export const revalidate = 86400;

// Every line with its stops in the order a bus reaches them, for working out which line joins two points.
// Real stops are used when the source gives them; when it does not (Santa Ana answers 403 to servers),
// or for lines without stop data, stops are derived from the route so the planner never runs empty.
// A failure to list the routes is not caught, so the last good daily copy is kept.
export async function GET() {
  const routes = await allRoutes();
  const lines: NetLine[] = [];
  // A few lines at a time, so the daily rebuild does not hit the source with 39 requests at once.
  for (let i = 0; i < routes.length; i += 6) {
    const batch = routes.slice(i, i + 6);
    const results = await Promise.all(
      batch.map((r) =>
        r.live
          ? lineDetail(r.id).catch((err) => {
              console.warn(`Stops unavailable for ${r.id}; using the route`, err);
              return null;
            })
          : null,
      ),
    );
    results.forEach((detail, j) => {
      const r = batch[j];
      if (detail?.stops.length) lines.push({ id: r.id, stops: detail.stops, live: r.live });
      else {
        const stops = stopsFromPaths(r.id, r.paths);
        if (stops.length) lines.push({ id: r.id, stops, live: r.live, approx: true });
      }
    });
  }
  return Response.json({ lines });
}
