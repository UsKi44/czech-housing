/**
 * Background worker: keeps the local database in sync with the source sites.
 *
 * Every cycle (default 10 min):
* Sources: Sreality, Bezrealitky, iDNES Reality, UlovDomov.
 *
 *   1. quick scan — newest pages of each source until we reach listings we already know
 *      (every 2 h this is a full sweep through all pages instead, to notice price changes and removals)
 *   2. fetch missing details (Sreality only; Bezrealitky search results are already complete)
 *   3. send Telegram alerts for new matches
 *   4. download photos for a few minutes
 *
 * Run once with `npm run scrape:once`.
 */
import { getDb, getKv, nowIso, setKv } from "../lib/db";
import { countActive, knownIds, markMissingAsRemoved, upsertListing } from "../lib/repo";
import type { Source } from "../lib/types";
import { processAlerts } from "./alerts";
import { bezrealitky } from "./bezrealitky";
import { BlockedError } from "./http";
import { log } from "./log";
import { cleanupOldPhotos, downloadPhotos } from "./photos";
import { sreality } from "./sreality";
import { idnes } from "./idnes";
import { ulovdomov } from "./ulovdomov";
import { assignGroups, refreshDuplicateVisibility } from "../lib/dedupe";
import type { SourceScraper } from "./types";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local: fine, everything has defaults */
}

const SCRAPERS: SourceScraper[] = [sreality, bezrealitky, idnes, ulovdomov];
const INTERVAL_MS = Math.max(5, Number(process.env.SCRAPE_INTERVAL_MIN) || 10) * 60_000;
const FULL_SWEEP_EVERY_MS = 2 * 3600_000;
const QUICK_MAX_PAGES = 5;
const PAUSE_WHEN_BLOCKED_MS = 60 * 60_000;
const ONCE = process.argv.includes("--once");

function recordRun(source: Source, kind: string, startedAt: string, stats: { seen: number; added: number; updated: number; removed: number }, error?: string) {
  getDb()
    .prepare("INSERT INTO runs(source, kind, started_at, finished_at, seen, added, updated, removed, error) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(source, kind, startedAt, nowIso(), stats.seen, stats.added, stats.updated, stats.removed, error ?? null);
}

async function scanSource(s: SourceScraper): Promise<void> {
  const pausedUntil = Number(getKv(`paused_until:${s.source}`) ?? 0);
  if (Date.now() < pausedUntil) {
    log(`${s.source}: paused until ${new Date(pausedUntil).toLocaleTimeString("en-GB")} after being rate-limited`);
    return;
  }

  const lastFull = getKv(`last_full_start:${s.source}`);
  const full = !lastFull || Date.now() - Date.parse(lastFull) > FULL_SWEEP_EVERY_MS;
  const kind = full ? "full" : "quick";
  const startedAt = nowIso();
  const stats = { seen: 0, added: 0, updated: 0, removed: 0 };
  const firstSync = getKv(`initial_done:${s.source}`) !== "1";
  log(`${s.source}: ${kind} scan${firstSync ? " (first sync, this takes a few minutes)" : ""}…`);

  try {
    let total = 0;
    let raw = 0; // results received, including out-of-scope ones the scraper dropped
    for (let page = 0; page < 200; page++) {
      const res = await s.fetchPage(page);
      total = res.total;
      const rawCount = res.rawCount ?? res.items.length;
      raw += rawCount;
      if (rawCount === 0) break;
      const known = knownIds(s.source, res.items.map((i) => i.sourceId));
      for (const item of res.items) {
        const r = upsertListing(item);
        stats.seen++;
        if (r.status === "new") stats.added++;
        else if (r.status === "updated") stats.updated++;
      }
      if (!full && (known.size === res.items.length || page + 1 >= QUICK_MAX_PAGES)) break;
      if ((page + 1) * s.pageSize >= total) break;
    }

    if (full) {
      // A listing counts as removed only after it is missing from two full sweeps in a row,
      // because results shift while we page through them.
      const prevStart = getKv(`last_full_start:${s.source}`);
      if (prevStart && raw >= total * 0.9) stats.removed = markMissingAsRemoved(s.source, prevStart);
      setKv(`last_full_start:${s.source}`, startedAt);
      if (firstSync) {
        // Don't send alerts for everything that existed before you started using the site.
        getDb().prepare("UPDATE listings SET alert_checked = 1 WHERE source = ?").run(s.source);
        setKv(`initial_done:${s.source}`, "1");
      }
    }
    recordRun(s.source, kind, startedAt, stats);
    log(`${s.source}: ${stats.seen} seen, ${stats.added} new, ${stats.updated} changed, ${stats.removed} removed · ${countActive(s.source)} active`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof BlockedError) {
      setKv(`paused_until:${s.source}`, String(Date.now() + PAUSE_WHEN_BLOCKED_MS));
      log(`${s.source}: ${msg}. Pausing this source for 1 hour.`);
    } else log(`${s.source}: scan failed: ${msg}`);
    recordRun(s.source, kind, startedAt, stats, msg);
  }
}

/** Fetch missing details for every source in parallel: each site is a different server with its own polite pace. */
async function fetchDetails(budgetMs: number): Promise<void> {
  const deadline = Date.now() + budgetMs;
  await Promise.all(SCRAPERS.map((s) => fetchDetailsFor(s, deadline)));
}

async function fetchDetailsFor(s: SourceScraper, deadline: number): Promise<void> {
  const db = getDb();
  {
    if (!s.fetchDetail) return;
    if (Date.now() < Number(getKv(`paused_until:${s.source}`) ?? 0)) return;
    const todo = db
      .prepare(
        `SELECT source_id FROM listings WHERE source = ? AND removed_at IS NULL AND detail_fetched_at IS NULL AND detail_failures < 3
         ORDER BY first_seen DESC LIMIT 1000`,
      )
      .all(s.source) as { source_id: string }[];
    if (todo.length === 0) return;
    let done = 0;
    for (const { source_id } of todo) {
      if (Date.now() > deadline) break;
      try {
        const d = await s.fetchDetail(source_id);
        if (d) upsertListing(d);
        else db.prepare("UPDATE listings SET removed_at = ? WHERE source = ? AND source_id = ?").run(nowIso(), s.source, source_id);
        done++;
      } catch (e) {
        if (e instanceof BlockedError) {
          setKv(`paused_until:${s.source}`, String(Date.now() + PAUSE_WHEN_BLOCKED_MS));
          log(`${s.source}: ${e.message}. Pausing this source for 1 hour.`);
          break;
        }
        db.prepare("UPDATE listings SET detail_failures = detail_failures + 1 WHERE source = ? AND source_id = ?").run(s.source, source_id);
      }
    }
    const waiting = (
      db.prepare("SELECT COUNT(*) AS n FROM listings WHERE source = ? AND removed_at IS NULL AND detail_fetched_at IS NULL AND detail_failures < 3").get(s.source) as { n: number }
    ).n;
    log(`${s.source}: fetched ${done} listing details (${waiting} still waiting)`);
  }
}

async function alerts(): Promise<void> {
  try {
    const merged = assignGroups();
    if (merged) log(`duplicates: ${merged} listing(s) matched the same flat on another site`);
    refreshDuplicateVisibility();
    await processAlerts();
  } catch (e) {
    log(`alerts failed: ${e instanceof Error ? e.message : e}`);
  }
}

async function cycle(): Promise<void> {
  const started = Date.now();
  // Shown in the site header as "updating now…" while the listing scans run.
  setKv("updating_since", nowIso());
  for (const s of SCRAPERS) await scanSource(s);
  refreshDuplicateVisibility(); // removals can change which copy of a flat is shown
  setKv("last_scan_at", nowIso());
  setKv("updating_since", "");
  // New listings are fetched first (newest first), so alerts go out quickly…
  await fetchDetails(60_000);
  await alerts();
  // …then older details and photos in parallel: they come from different servers, each with its own polite pace.
  const budget = ONCE ? 60_000 : Math.max(30_000, INTERVAL_MS * 0.85 - (Date.now() - started));
  const [, p] = await Promise.all([fetchDetails(budget), downloadPhotos(budget)]);
  if (p.downloaded || p.failed) log(`photos: ${p.downloaded} downloaded, ${p.failed} failed${p.full ? " · storage limit reached (PHOTO_LIMIT_GB)" : ""}`);
  await alerts();

  const lastCleanup = Number(getKv("last_photo_cleanup") ?? 0);
  if (Date.now() - lastCleanup > 86400_000) {
    const n = cleanupOldPhotos();
    if (n) log(`photos: deleted ${n} photos of listings removed more than 60 days ago`);
    setKv("last_photo_cleanup", String(Date.now()));
  }
  setKv("last_cycle_at", nowIso());
}

async function main() {
  getDb();
  refreshDuplicateVisibility();
  log(`worker started · checking every ${INTERVAL_MS / 60_000} min`);
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
    process.exit(0);
  });
  while (!stopping) {
    const started = Date.now();
    try {
      await cycle();
    } catch (e) {
      log(`cycle failed: ${e instanceof Error ? e.stack : e}`);
    }
    if (ONCE) break;
    const wait = Math.max(30_000, INTERVAL_MS - (Date.now() - started));
    await new Promise((r) => setTimeout(r, wait));
  }
}

main();
