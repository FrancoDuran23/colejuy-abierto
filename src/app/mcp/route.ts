import { createMcpHandler } from "@modelcontextprotocol/server";
import { apiOrigin, buildServer } from "@/lib/mcp";

export const dynamic = "force-dynamic";
export const preferredRegion = "gru1";

// Stateless: a fresh server per request, JSON answers. `legacy: "stateless"` keeps serving
// 2025-era MCP clients the same way; GET/DELETE session calls get a 405 from that leg.
const handler = createMcpHandler((ctx) => buildServer(apiOrigin(ctx.requestInfo?.url)), { legacy: "stateless", onerror: (err) => console.error("mcp", err) });

// Public, read-only and without credentials, so any origin may call it (browser-based MCP clients
// need the preflight). No cookies are read, which is what keeps a wildcard origin safe here.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};

async function serve(req: Request): Promise<Response> {
  const res = await handler.fetch(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
