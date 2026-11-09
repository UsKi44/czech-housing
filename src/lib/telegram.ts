/** Minimal Telegram Bot API client. Configured through TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.local. */

export function telegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;
}

async function call(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; description?: string; result?: unknown }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN is not set" };
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  return (await res.json()) as { ok: boolean; description?: string; result?: unknown };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendTelegram(html: string, photoUrl?: string | null): Promise<{ ok: boolean; error?: string }> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return { ok: false, error: "TELEGRAM_CHAT_ID is not set" };
  if (photoUrl) {
    const r = await call("sendPhoto", { chat_id: chatId, photo: photoUrl, caption: html.slice(0, 1000), parse_mode: "HTML" });
    if (r.ok) return { ok: true };
    // Fall back to a text message, e.g. when Telegram cannot fetch the photo.
  }
  const r = await call("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  return r.ok ? { ok: true } : { ok: false, error: r.description };
}

/** Chats that have recently messaged the bot — used by the setup script to find your chat id. */
export async function recentChats(): Promise<{ id: number; name: string }[]> {
  const r = await call("getUpdates", {});
  if (!r.ok) throw new Error(r.description ?? "getUpdates failed");
  const chats = new Map<number, string>();
  for (const u of (r.result ?? []) as { message?: { chat: { id: number; first_name?: string; username?: string; title?: string } } }[]) {
    const c = u.message?.chat;
    if (c) chats.set(c.id, c.title ?? c.username ?? c.first_name ?? String(c.id));
  }
  return [...chats].map(([id, name]) => ({ id, name }));
}
