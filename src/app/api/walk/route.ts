import { fetchWalk, parsePoint } from "@/lib/walk";

export const dynamic = "force-dynamic";

// A walk between two points never changes: the CDN keeps it for an hour, so the public
// OSRM server is asked once per pair of places, not once per person.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const from = parsePoint(q.get("from"));
  const to = parsePoint(q.get("to"));
  if (!from || !to) return Response.json({ error: "from y to son lng,lat" }, { status: 400 });
  try {
    return Response.json(await fetchWalk(from, to), { headers: { "Cache-Control": "public, s-maxage=3600, stale-if-error=86400" } });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "sin ruta a pie" }, { status: 502, headers: { "Cache-Control": "public, s-maxage=30" } });
  }
}
