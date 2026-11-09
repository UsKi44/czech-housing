/** One-off: shrink photos stored before automatic compression existed. Safe to run any time. */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getDb, PHOTO_DIR } from "../src/lib/db";

const db = getDb();
const rows = db.prepare("SELECT listing_id, idx, local_path, bytes FROM photos WHERE local_path IS NOT NULL AND bytes > 120000 AND local_path NOT LIKE '%.webp'").all() as {
  listing_id: string; idx: number; local_path: string; bytes: number;
}[];
let saved = 0;
for (const r of rows) {
  const full = path.join(PHOTO_DIR, r.local_path);
  try {
    const data = await sharp(fs.readFileSync(full)).rotate().resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    if (data.length >= r.bytes) continue;
    const rel = r.local_path.replace(/\.[a-z]+$/, ".webp");
    fs.writeFileSync(path.join(PHOTO_DIR, rel), data);
    if (rel !== r.local_path) fs.unlinkSync(full);
    db.prepare("UPDATE photos SET local_path = ?, bytes = ? WHERE listing_id = ? AND idx = ?").run(rel, data.length, r.listing_id, r.idx);
    saved += r.bytes - data.length;
  } catch (e) {
    console.warn(`skipped ${r.local_path}: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(`Compressed ${rows.length} photos, saved ${(saved / 1e6).toFixed(1)} MB`);
