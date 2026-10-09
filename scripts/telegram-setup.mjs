// Points the bot at the deployed site and sets its command list. Run once after deploying:
//   NEXT_PUBLIC_SITE_URL=https://... TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... node scripts/telegram-setup.mjs
const { NEXT_PUBLIC_SITE_URL: site, TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret } = process.env;
if (!site || !token || !secret) throw new Error("Set NEXT_PUBLIC_SITE_URL, TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET.");
if (!site.startsWith("https://")) throw new Error("Telegram only calls https addresses.");

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  console.log(`${method}: ok`);
}

await call("setWebhook", { url: `${site}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message", "callback_query"] });
await call("setMyCommands", {
  commands: [
    { command: "avisame", description: "Avisarme cuando pase una línea" },
    { command: "avisos", description: "Ver mis avisos pendientes" },
    { command: "casa", description: "Guardar mi ubicación como casa" },
    { command: "cancelar", description: "Borrar mis avisos pendientes" },
  ],
});
