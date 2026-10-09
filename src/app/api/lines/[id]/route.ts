import { lineDetail } from "@/lib/lines";

// Routes and stops rarely change: the CDN keeps them for a day.
const CACHE = "public, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const detail = await lineDetail(id);
    if (!detail) return Response.json({ error: "line_not_found" }, { status: 404 });
    return Response.json(detail, { headers: { "Cache-Control": CACHE } });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "line_unavailable" }, { status: 502 });
  }
}
