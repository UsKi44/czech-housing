/**
 * Finds your Telegram chat id and saves it to .env.local.
 * Before running: put TELEGRAM_BOT_TOKEN in .env.local and send your bot any message.
 */
import fs from "node:fs";
import { recentChats, sendTelegram } from "../src/lib/telegram";

const ENV = ".env.local";

try {
  process.loadEnvFile(ENV);
} catch {
  console.error(`No ${ENV} file. Copy .env.example to ${ENV} and set TELEGRAM_BOT_TOKEN first.`);
  process.exit(1);
}

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error(`TELEGRAM_BOT_TOKEN is empty in ${ENV}. Get a token from @BotFather in Telegram first.`);
  process.exit(1);
}

const chats = await recentChats();
if (chats.length === 0) {
  console.error("Your bot hasn't received any messages yet. Open it in Telegram, send it any message, then run this again.");
  process.exit(1);
}
const chat = chats[chats.length - 1];

let env = fs.readFileSync(ENV, "utf8");
if (/^TELEGRAM_CHAT_ID=.*$/m.test(env)) env = env.replace(/^TELEGRAM_CHAT_ID=.*$/m, `TELEGRAM_CHAT_ID=${chat.id}`);
else env += `\nTELEGRAM_CHAT_ID=${chat.id}\n`;
fs.writeFileSync(ENV, env);
process.env.TELEGRAM_CHAT_ID = String(chat.id);

const r = await sendTelegram("✅ Prague Rentals is connected. You'll get new-listing alerts here.");
console.log(r.ok ? `Saved chat "${chat.name}" (${chat.id}) and sent a test message. Restart the app to start alerts.` : `Saved chat id, but the test message failed: ${r.error}`);
