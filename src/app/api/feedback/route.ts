import { z } from "zod";

export const dynamic = "force-dynamic";
export const preferredRegion = "gru1";

const WINDOW_SECONDS = 60 * 60;
const MAX_PER_IP = 5;
const MAX_GLOBAL = 40;

// Only a best-effort fallback for local development or a temporary Redis outage.
// Production uses the already configured Upstash Redis so limits work across instances.
const memoryCounters = new Map<string, { count: number; expiresAt: number }>();

const FeedbackSchema = z.object({
  topic: z.enum(["problem", "suggestion", "comment"]),
  message: z.string().trim().min(5).max(2000),
  lineId: z.string().trim().max(80).nullable().optional(),
  stopId: z.string().trim().max(120).nullable().optional(),
  page: z.string().trim().max(200).optional(),
  website: z.string().max(0).optional(),
  turnstileToken: z.string().trim().max(2048).optional(),
});

const topicLabel: Record<string, string> = { problem: "Problema", suggestion: "Sugerencia", comment: "Comentario" };

export async function OPTIONS(req: Request) {
  const origin = allowedOrigin(req);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = allowedOrigin(req);
  if (!origin) return Response.json({ error: "same_origin_required" }, { status: 403 });

  // Sec-Fetch-Site is an additional browser signal. It is not a security boundary by itself.
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return Response.json({ error: "same_origin_required" }, { status: 403, headers: corsHeaders(origin) });
  }

  const ip = clientIp(req);
  const [ipAllowed, globalAllowed] = await Promise.all([
    rateLimit(`feedback:ip:${ip}`, MAX_PER_IP, WINDOW_SECONDS),
    rateLimit("feedback:global", MAX_GLOBAL, WINDOW_SECONDS),
  ]);
  if (!ipAllowed || !globalAllowed) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { ...corsHeaders(origin), "Retry-After": String(WINDOW_SECONDS) } },
    );
  }

  const data = FeedbackSchema.safeParse(await req.json().catch(() => null));
  if (!data.success) return Response.json({ error: "invalid_feedback" }, { status: 400, headers: corsHeaders(origin) });

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (turnstileSecret) {
    const verified = await verifyTurnstile(data.data.turnstileToken, turnstileSecret, clientIp(req));
    if (!verified) return Response.json({ error: "captcha_failed" }, { status: 403, headers: corsHeaders(origin) });
  }

  const { topic, message, lineId, stopId, page } = data.data;
  const context = [lineId && `línea ${lineId}`, stopId && `parada ${stopId}`].filter(Boolean).join(" · ") || "sin contexto";
  const text = `🚌 <b>Nuevo feedback de colejuy</b>\n\n<b>Tipo:</b> ${topicLabel[topic]}\n<b>Mensaje:</b> ${escapeHtml(message)}\n<b>Contexto:</b> ${escapeHtml(context)}\n<b>Página:</b> ${escapeHtml(page || "/")}`;

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.FEEDBACK_CHAT_ID?.trim();
  const webhook = process.env.FEEDBACK_WEBHOOK_URL?.trim();
  if (token && chatId) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!response.ok) return Response.json({ error: "delivery_failed" }, { status: 502, headers: corsHeaders(origin) });
  } else if (webhook) {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, message, lineId: lineId ?? null, stopId: stopId ?? null, page: page ?? "/", createdAt: new Date().toISOString() }),
    });
    if (!response.ok) return Response.json({ error: "delivery_failed" }, { status: 502, headers: corsHeaders(origin) });
  } else {
    console.warn("Feedback received without a configured destination", { topic, lineId, stopId, page });
    return Response.json({ error: "feedback_not_configured" }, { status: 503, headers: corsHeaders(origin) });
  }

  return Response.json({ ok: true }, { headers: corsHeaders(origin) });
}

async function verifyTurnstile(token: string | undefined, secret: string, remoteip: string) {
  if (!token) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip });
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean; action?: string; hostname?: string };
    const configuredHostnames = (process.env.TURNSTILE_HOSTNAMES || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const allowedHostnames = configuredHostnames.length > 0
      ? configuredHostnames
      : process.env.NODE_ENV !== "production"
        ? ["localhost", "127.0.0.1"]
        : [];
    return result.success === true
      && result.action === "feedback"
      && !!result.hostname
      && allowedHostnames.includes(result.hostname.toLowerCase());
  } catch (error) {
    console.error("Turnstile verification failed", error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host");
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  const allowed = new Set([configured, host && `https://${host}`, host && `http://${host}`].filter(Boolean));
  if (origin) return allowed.has(origin) ? origin : null;

  // JSON POSTs from browsers normally carry Origin. Requiring Referer when it is absent
  // rejects plain curl requests while still allowing same-site browser navigations.
  const referer = req.headers.get("referer");
  if (!referer || !host) return null;
  try {
    const referrerOrigin = new URL(referer).origin;
    return allowed.has(referrerOrigin) ? referrerOrigin : null;
  } catch {
    return null;
  }
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function clientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  ).slice(0, 80);
}

async function rateLimit(key: string, max: number, windowSeconds: number) {
  const redisUrl = process.env.KV_REST_API_URL?.trim().replace(/\/$/, "");
  const redisToken = process.env.KV_REST_API_TOKEN?.trim();
  if (!redisUrl || !redisToken) return memoryRateLimit(key, max, windowSeconds);

  try {
    const response = await fetch(`${redisUrl}/incr/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${redisToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Redis rate limit HTTP ${response.status}`);
    const body = (await response.json()) as { result?: number };
    const count = Number(body.result ?? 0);
    if (count === 1) {
      await fetch(`${redisUrl}/expire/${encodeURIComponent(key)}/${windowSeconds}`, {
        headers: { Authorization: `Bearer ${redisToken}` },
        cache: "no-store",
      });
    }
    return count <= max;
  } catch (error) {
    console.error("Feedback Redis rate limit failed; using local fallback", error);
    return memoryRateLimit(key, max, windowSeconds);
  }
}

function memoryRateLimit(key: string, max: number, windowSeconds: number) {
  const now = Date.now();
  const previous = memoryCounters.get(key);
  const current = !previous || previous.expiresAt <= now ? { count: 0, expiresAt: now + windowSeconds * 1000 } : previous;
  current.count += 1;
  memoryCounters.set(key, current);
  return current.count <= max;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
