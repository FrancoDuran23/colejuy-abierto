import { z } from "zod";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export const botConfigured = Boolean(TOKEN);

export type Button = { text: string; callback_data: string };

// A location request uses a reply keyboard; minute and line choices use an inline keyboard.
// Telegram allows only one reply_markup per message, so a caller sends whichever the step needs.
export type Markup = {
  rows?: Button[][];
  location?: boolean;
  remove?: boolean;
};

export const UpdateSchema = z.object({
  message: z
    .object({
      chat: z.object({ id: z.number() }),
      text: z.string().optional(),
      location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      data: z.string().optional(),
      message: z.object({ chat: z.object({ id: z.number() }) }).optional(),
    })
    .optional(),
});

function replyMarkup(extra?: Button[] | Markup) {
  if (!extra) return {};
  if (Array.isArray(extra)) {
    if (extra.length === 0) return {};
    return { reply_markup: { inline_keyboard: [extra] } };
  }
  if (extra.location) {
    return {
      reply_markup: {
        keyboard: [[{ text: "Compartir ubicación", request_location: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    };
  }
  if (extra.rows && extra.rows.length > 0) return { reply_markup: { inline_keyboard: extra.rows } };
  if (extra.remove) return { reply_markup: { remove_keyboard: true } };
  return {};
}

async function call(method: string, body: Record<string, unknown>) {
  if (!TOKEN) {
    // Trying the bot without a token: nothing is sent, and it says so instead of looking like it worked.
    console.warn(`[telegram] No TELEGRAM_BOT_TOKEN: ${method} not sent.`, JSON.stringify(body));
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Telegram ${method}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}

export const sendMessage = (chat: number, text: string, extra?: Button[] | Markup) =>
  call("sendMessage", { chat_id: chat, text, ...replyMarkup(extra) });

export const answerCallback = (id: string, text?: string) => call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
