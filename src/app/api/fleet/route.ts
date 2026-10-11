import { fetchFleet, parseLines, SourceError, type Fleet } from "@/lib/santa-ana";

export const dynamic = "force-dynamic";
export const preferredRegion = "gru1";

// The CDN keeps one copy for a few seconds, so Santa Ana gets at most one request per region
// in that window no matter how many people are watching.
// No stale-while-revalidate: with few people watching, it answered every request with the
// previous copy, a whole polling interval late (measured: 18 s old instead of 7).
const FRESH_SECONDS = Number(process.env.FLEET_CACHE_SECONDS) || 10;

// When the source refuses, the refusal itself is cached. Without this every open page sent
// Santa Ana a request every few seconds that could only fail.
const REFUSED_SECONDS = 60;
// "Too many requests" waits much longer: a limiter that renews its penalty on every rejected
// attempt never lets go of an account that keeps knocking once a minute.
const RATE_LIMITED_SECONDS = 15;

export async function GET(request: Request) {
  try {
    const lines = parseLines(new URL(request.url).searchParams);
    return Response.json(await fetchFleet(lines.length ? lines : undefined), { headers: { "Cache-Control": `public, s-maxage=${FRESH_SECONDS}, stale-if-error=300` } });
  } catch (err) {
    console.error(err);
    const status = err instanceof SourceError ? err.status : 0;
    const wait = Math.min(60, Math.max(status === 429 ? RATE_LIMITED_SECONDS : REFUSED_SECONDS, err instanceof SourceError ? (err.retryAfter ?? 0) : 0));
    const body: Fleet = { updatedAt: new Date().toISOString(), buses: [], unavailable: status === 401 || status === 403 ? "auth" : status === 429 ? "rate" : "down" };
    // Answered with 200 because the CDN does not keep error responses, and this one has to be kept.
    return Response.json(body, { headers: { "Cache-Control": `public, s-maxage=${wait}` } });
  }
}
