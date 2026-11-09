import { getDb, nowIso } from "../lib/db";
import { buildWhere, parseFilters } from "../lib/filters";
import { czk, listingTitle, sourceLabel } from "../lib/format";
import { escapeHtml, sendTelegram, telegramConfigured } from "../lib/telegram";
import type { ListingRow } from "../lib/types";
import { log } from "./log";

const MAX_PER_RUN = 15;

/**
 * Check listings that have not been checked against the saved alerts yet and send Telegram messages for matches.
 * Listings wait until their details are fetched and duplicate detection has run, so feature filters work
 * and a flat posted on several sites alerts only once.
 */
export async function processAlerts(): Promise<number> {
  const db = getDb();
  const pending = db
    .prepare(
      `SELECT id FROM listings WHERE alert_checked = 0 AND removed_at IS NULL AND grouped = 1
       ORDER BY first_seen`,
    )
    .all() as { id: string }[];
  if (pending.length === 0) return 0;

  const alerts = db.prepare("SELECT id, name, query FROM alerts").all() as { id: number; name: string; query: string }[];
  const markChecked = db.prepare("UPDATE listings SET alert_checked = 1 WHERE id = ?");

  if (alerts.length === 0 || !telegramConfigured()) {
    for (const p of pending) markChecked.run(p.id);
    return 0;
  }

  const matches: { alert: (typeof alerts)[number]; listing: ListingRow }[] = [];
  for (const alert of alerts) {
    const f = parseFilters(new URLSearchParams(alert.query));
    f.showRemoved = false;
    const { where, params } = buildWhere(f);
    const ids = pending.map((p) => p.id);
    const rows = db
      .prepare(
        `SELECT l.* FROM listings l WHERE ${where} AND l.id IN (${ids.map(() => "?").join(",")})
         AND NOT EXISTS (SELECT 1 FROM sent_alerts s WHERE s.alert_id = ? AND s.listing_id = l.id)
         -- the same flat already appeared earlier on another site: no second alert
         AND NOT EXISTS (SELECT 1 FROM listings o WHERE o.group_id = l.group_id AND o.id != l.id AND o.first_seen < l.first_seen)`,
      )
      .all(...params, ...ids, alert.id) as unknown as ListingRow[];
    for (const listing of rows) matches.push({ alert, listing });
  }

  const record = db.prepare("INSERT OR IGNORE INTO sent_alerts(alert_id, listing_id, sent_at) VALUES(?, ?, ?)");
  const firstPhoto = db.prepare("SELECT url FROM photos WHERE listing_id = ? ORDER BY idx LIMIT 1");
  let sent = 0;

  if (matches.length > MAX_PER_RUN) {
    // Avoid flooding the chat: send a summary instead.
    const byAlert = new Map<string, number>();
    for (const m of matches) byAlert.set(m.alert.name, (byAlert.get(m.alert.name) ?? 0) + 1);
    const lines = [...byAlert].map(([name, n]) => `• ${escapeHtml(name)}: <b>${n}</b> new`);
    const r = await sendTelegram(`🏠 <b>${matches.length} new matching apartments</b>\n${lines.join("\n")}\n\nOpen the site to see them: http://localhost:3000`);
    if (r.ok) {
      for (const m of matches) record.run(m.alert.id, m.listing.id, nowIso());
      sent = matches.length;
    } else log(`alerts: Telegram error: ${r.error}`);
  } else {
    for (const { alert, listing: l } of matches) {
      const total = l.charges ? ` (+ ${czk(l.charges)} fees)` : "";
      const html = [
        `🏠 <b>${escapeHtml(listingTitle(l))}</b>`,
        `💰 ${czk(l.price)}${total}`,
        l.address ? `📍 ${escapeHtml(l.address)}` : null,
        `🔎 ${escapeHtml(alert.name)} · ${sourceLabel(l.source)}`,
        "",
        `<a href="http://localhost:3000/listing/${encodeURIComponent(l.id)}">Open here</a> · <a href="${escapeHtml(l.url)}">Original listing</a>`,
      ]
        .filter((x) => x !== null)
        .join("\n");
      const photo = (firstPhoto.get(l.id) as { url: string } | undefined)?.url;
      const r = await sendTelegram(html, photo);
      if (r.ok) {
        record.run(alert.id, l.id, nowIso());
        sent++;
      } else {
        log(`alerts: Telegram error: ${r.error}`);
        return sent; // leave the rest unchecked and retry next cycle
      }
    }
  }

  for (const p of pending) markChecked.run(p.id);
  if (sent) log(`alerts: sent ${sent} Telegram alert(s)`);
  return sent;
}
