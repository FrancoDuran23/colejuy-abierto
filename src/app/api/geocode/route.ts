import { searchPlaces, type Place } from "@/lib/geocode";

export const preferredRegion = "gru1";

export type { Place };

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 3 || q.length > 80) return Response.json({ error: "bad_query" }, { status: 400 });
  try {
    const places = await searchPlaces(q);
    return Response.json({ places }, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "search_unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
