import { allRoutes, lineDetail } from "@/lib/lines";
import type { NetLine } from "@/lib/plan";

export const revalidate = 86400;

// Every line with its stops in the order a bus reaches them, for working out which line joins two points.
// Errors are not caught, for the same reason as in /api/lines.
export async function GET() {
  const routes = (await allRoutes()).filter((r) => r.live);
  const lines: NetLine[] = [];
  // A few lines at a time, so the daily rebuild does not hit the source with 39 requests at once.
  for (let i = 0; i < routes.length; i += 6) {
    const batch = routes.slice(i, i + 6);
    const results = await Promise.all(batch.map((r) => lineDetail(r.id)));
    results.forEach((detail, j) => {
      if (detail?.stops.length) lines.push({ id: batch[j].id, stops: detail.stops });
    });
  }
  return Response.json({ lines });
}
