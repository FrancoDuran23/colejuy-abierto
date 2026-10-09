import { listAlerts, removeAlert, storeKind } from "@/lib/alert-store";
import { decide, texts, type Alert } from "@/lib/alerts";
import { arrivals } from "@/lib/eta";
import { lineDetail } from "@/lib/lines";
import { fetchFleet } from "@/lib/santa-ana";
import { botConfigured, sendMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const preferredRegion = "gru1";

// Called once a minute by a scheduler. Checks every pending alert against the live fleet and
// sends the ones that are due. With no alerts pending it does not touch Santa Ana at all.
export async function GET(req: Request) {
  const expected = process.env.TICK_SECRET ?? process.env.CRON_SECRET;
  if (!expected) return Response.json({ error: "tick_not_configured" }, { status: 503 });
  const given = new URL(req.url).searchParams.get("key") ?? req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (given !== expected) return Response.json({ error: "forbidden" }, { status: 403 });

  const alerts = await listAlerts();
  const summary = { pending: alerts.length, notified: 0, expired: 0, failed: 0, store: storeKind, bot: botConfigured };
  if (alerts.length === 0) return Response.json(summary);

  // Without positions nothing can be decided: alerts are left as they are, not expired by mistake.
  let fleet;
  try {
    fleet = await fetchFleet();
  } catch (err) {
    console.error(err);
    return Response.json({ ...summary, fleet: "unavailable" });
  }
  const byLine = new Map<string, Alert[]>();
  for (const a of alerts) byLine.set(a.line, [...(byLine.get(a.line) ?? []), a]);
  const now = Date.now();

  for (const [lineId, group] of byLine) {
    try {
      const detail = await lineDetail(lineId);
      const buses = fleet.buses.filter((b) => b.line === lineId && b.fresh);
      for (const alert of group) {
        const stop = detail?.stops.find((s) => s.id === alert.stop);
        const next = detail && stop ? arrivals(detail.line.paths, stop, buses)[0] : undefined;
        const decision = decide(alert, now, next ? next.minutes : null);
        if (decision === "wait") continue;
        // Remove first: if sending fails the person misses one alert, which beats getting it every minute.
        await removeAlert(alert.chat, alert.stop);
        if (decision === "notify" && next) {
          await sendMessage(alert.chat, texts.notify(alert, next.meters, next.minutes, next.bus.number));
          summary.notified += 1;
        } else {
          await sendMessage(alert.chat, texts.expired(alert));
          summary.expired += 1;
        }
      }
    } catch (err) {
      console.error(err);
      summary.failed += group.length;
    }
  }
  return Response.json(summary);
}
