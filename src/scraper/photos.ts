import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getDb, PHOTO_DIR } from "../lib/db";
import { deletePhotoFile } from "../lib/repo";
import { politeFetch, BlockedError } from "./http";
import { log } from "./log";

const REMOVED_RETENTION_DAYS = 60;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024; // anything bigger is not a normal listing photo
const MAX_SIDE = 1280;

/** Shrink big originals (Bezrealitky serves raw uploads, sometimes multi-MB PNGs) to web-size WebP. */
async function compact(buf: Buffer, type: string): Promise<{ data: Buffer; type: string }> {
  if (buf.length < 120_000 || (type === "image/webp" && buf.length < 300_000)) return { data: buf, type };
  try {
    const data = await sharp(buf).rotate().resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    return data.length < buf.length ? { data, type: "image/webp" } : { data: buf, type };
  } catch {
    return { data: buf, type };
  }
}

function limitBytes(): number {
  const gb = Number(process.env.PHOTO_LIMIT_GB || 10);
  return (Number.isFinite(gb) && gb > 0 ? gb : 10) * 1024 ** 3;
}

function storedBytes(): number {
  const r = getDb().prepare("SELECT COALESCE(SUM(bytes), 0) AS b FROM photos WHERE local_path IS NOT NULL").get() as { b: number };
  return r.b;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/webp": "webp", "image/png": "png", "image/gif": "gif", "image/avif": "avif" };

/**
 * Download photos that are not stored yet, newest listings first, and each listing's main photo before galleries.
 * Stops after `budgetMs` or when the storage limit is reached.
 */
export async function downloadPhotos(budgetMs: number): Promise<{ downloaded: number; failed: number; full: boolean }> {
  const db = getDb();
  const deadline = Date.now() + budgetMs;
  let used = storedBytes();
  const limit = limitBytes();
  let downloaded = 0;
  let failed = 0;
  const blockedHosts = new Set<string>();

  const pending = db
    .prepare(
      `SELECT p.listing_id, p.idx, p.url, l.source, l.source_id FROM photos p JOIN listings l ON l.id = p.listing_id
       WHERE p.local_path IS NULL AND p.failures < 3 AND l.removed_at IS NULL
       ORDER BY (p.idx > 0), l.first_seen DESC, p.idx LIMIT 2000`,
    )
    .all() as { listing_id: string; idx: number; url: string; source: string; source_id: string }[];

  const done = db.prepare("UPDATE photos SET local_path = ?, bytes = ? WHERE listing_id = ? AND idx = ? AND url = ?");
  const fail = db.prepare("UPDATE photos SET failures = failures + 1 WHERE listing_id = ? AND idx = ? AND url = ?");

  for (const ph of pending) {
    if (Date.now() > deadline) break;
    if (used >= limit) return { downloaded, failed, full: true };
    const host = new URL(ph.url).host;
    if (blockedHosts.has(host)) continue;
    try {
      const res = await politeFetch(ph.url, { timeoutMs: 30_000 });
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!res.ok || !type.startsWith("image/")) {
        fail.run(ph.listing_id, ph.idx, ph.url);
        failed++;
        continue;
      }
      const original = Buffer.from(await res.arrayBuffer());
      if (original.length > MAX_SOURCE_BYTES) {
        // Not a normal listing photo (e.g. a huge placeholder): keep showing it from the source instead.
        db.prepare("UPDATE photos SET failures = 99 WHERE listing_id = ? AND idx = ? AND url = ?").run(ph.listing_id, ph.idx, ph.url);
        continue;
      }
      const { data: buf, type: storedType } = await compact(original, type);
      const hash = crypto.createHash("sha1").update(ph.url).digest("hex").slice(0, 10);
      const rel = path.posix.join(ph.source, ph.source_id, `${ph.idx}-${hash}.${EXT[storedType] ?? "img"}`);
      const full = path.join(PHOTO_DIR, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, buf);
      done.run(rel, buf.length, ph.listing_id, ph.idx, ph.url);
      used += buf.length;
      downloaded++;
    } catch (e) {
      if (e instanceof BlockedError) {
        blockedHosts.add(host);
        log(`photos: ${e.message}; skipping that host for now`);
      } else {
        fail.run(ph.listing_id, ph.idx, ph.url);
        failed++;
      }
    }
  }
  return { downloaded, failed, full: used >= limit };
}

/** Delete stored photos of listings that have been gone for more than 60 days. */
export function cleanupOldPhotos(): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - REMOVED_RETENTION_DAYS * 86400_000).toISOString();
  const rows = db
    .prepare(
      `SELECT p.listing_id, p.idx, p.local_path FROM photos p JOIN listings l ON l.id = p.listing_id
       WHERE p.local_path IS NOT NULL AND l.removed_at IS NOT NULL AND l.removed_at < ?`,
    )
    .all(cutoff) as { listing_id: string; idx: number; local_path: string }[];
  const clear = db.prepare("UPDATE photos SET local_path = NULL, bytes = NULL, failures = 99 WHERE listing_id = ? AND idx = ?");
  for (const r of rows) {
    deletePhotoFile(r.local_path);
    clear.run(r.listing_id, r.idx);
  }
  return rows.length;
}
