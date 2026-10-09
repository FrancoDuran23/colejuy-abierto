import { onCallback, onLocation, onText } from "@/lib/ask-run";
import { UpdateSchema } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const preferredRegion = "gru1";

export async function POST(req: Request) {
  // Telegram repeats this secret on every call; anything else is not Telegram.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "bot_not_configured" }, { status: 503 });
  if (req.headers.get("x-telegram-bot-api-secret-token") !== secret) return Response.json({ error: "forbidden" }, { status: 403 });

  const update = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!update.success) return Response.json({ ok: true });
  try {
    const { message, callback_query: callback } = update.data;
    if (callback?.message) await onCallback(callback.message.chat.id, callback.id, callback.data ?? "");
    else if (message?.location) await onLocation(message.chat.id, message.location.latitude, message.location.longitude);
    else if (message?.text) await onText(message.chat.id, message.text);
  } catch (err) {
    // Answer 200 anyway: Telegram retries a failed update for hours, and a second attempt would not go better.
    console.error(err);
  }
  return Response.json({ ok: true });
}
