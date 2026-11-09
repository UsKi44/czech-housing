import fs from "node:fs";
import path from "node:path";
import { getDb, nowIso, PHOTO_DIR, searchText } from "./db";
import type { ListingInput, ListingRow, PhotoInput, PhotoRow, Source } from "./types";

const COLUMN_MAP: [keyof ListingInput, keyof ListingRow][] = [
  ["url", "url"],
  ["title", "title"],
  ["price", "price"],
  ["charges", "charges"],
  ["deposit", "deposit"],
  ["fee", "fee"],
  ["area", "area"],
  ["layout", "layout"],
  ["floor", "floor"],
  ["totalFloors", "total_floors"],
  ["district", "district"],
  ["neighbourhood", "neighbourhood"],
  ["street", "street"],
  ["address", "address"],
  ["lat", "lat"],
  ["lng", "lng"],
  ["description", "description"],
  ["energyRating", "energy_rating"],
  ["furnished", "furnished"],
  ["buildingType", "building_type"],
  ["condition", "condition"],
  ["balcony", "balcony"],
  ["terrace", "terrace"],
  ["loggia", "loggia"],
  ["cellar", "cellar"],
  ["lift", "lift"],
  ["parking", "parking"],
  ["garage", "garage"],
  ["pets", "pets"],
  ["availableFrom", "available_from"],
  ["contactName", "contact_name"],
  ["contactPhone", "contact_phone"],
  ["contactEmail", "contact_email"],
  ["contactCompany", "contact_company"],
];

function toDb(v: unknown): string | number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const str = String(v).trim();
  return str === "" ? null : str; // sources sometimes send "" for unknown values
}

export type UpsertResult = { status: "new" | "updated" | "unchanged"; id: string; priceChanged: boolean; needsDetail: boolean };

/**
 * Insert or merge a listing. Fields that are undefined in the input keep their stored value,
 * so search-result data never wipes out richer detail data.
 */
export function upsertListing(input: ListingInput, seenAt = nowIso()): UpsertResult {
  const db = getDb();
  const id = `${input.source}:${input.sourceId}`;
  const existing = db.prepare("SELECT * FROM listings WHERE id = ?").get(id) as ListingRow | undefined;

  // Fill the "Praha N" district from neighbourhood when the source does not give it.
  if (input.neighbourhood && input.district) {
    db.prepare(
      "INSERT INTO district_map(neighbourhood, district) VALUES(?, ?) ON CONFLICT(neighbourhood) DO UPDATE SET district = excluded.district",
    ).run(input.neighbourhood, input.district);
  } else if (input.neighbourhood && !input.district) {
    const m = db.prepare("SELECT district FROM district_map WHERE neighbourhood = ?").get(input.neighbourhood) as { district: string } | undefined;
    if (m) input.district = m.district;
  }

  const row: Record<string, string | number | null> = {};
  for (const [k, col] of COLUMN_MAP) {
    const v = input[k];
    row[col] = v === undefined ? ((existing?.[col] as string | number | null | undefined) ?? null) : toDb(v);
  }
  row.params_json = input.params ? JSON.stringify(input.params) : (existing?.params_json ?? null);
  row.raw_json = input.raw !== undefined ? JSON.stringify(input.raw) : (existing?.raw_json ?? null);
  row.list_sig = input.listSig ?? existing?.list_sig ?? null;
  row.search_text = searchText(row.title as string, row.address as string, row.neighbourhood as string, row.district as string, row.description as string);

  const sigChanged = !!existing && input.listSig !== undefined && existing.list_sig !== input.listSig;
  let detailFetchedAt = existing?.detail_fetched_at ?? null;
  if (input.isDetail) detailFetchedAt = seenAt;
  else if (sigChanged) detailFetchedAt = null; // listing was edited at the source: refresh its detail

  let status: UpsertResult["status"];
  let priceChanged = false;

  if (!existing) {
    status = "new";
    const cols = Object.keys(row);
    db.prepare(
      `INSERT INTO listings (id, source, source_id, ${cols.join(", ")}, first_seen, last_seen, detail_fetched_at)
       VALUES (?, ?, ?, ${cols.map(() => "?").join(", ")}, ?, ?, ?)`,
    ).run(id, input.source, input.sourceId, ...cols.map((c) => row[c]), seenAt, seenAt, detailFetchedAt);
    if (row.price !== null) {
      db.prepare("INSERT INTO price_history(listing_id, price, charges, seen_at) VALUES(?, ?, ?, ?)").run(id, row.price, row.charges, seenAt);
    }
  } else {
    const changed = Object.keys(row).some((c) => c !== "raw_json" && (existing[c as keyof ListingRow] ?? null) !== row[c]);
    status = changed || existing.removed_at ? "updated" : "unchanged";
    priceChanged = existing.price !== row.price || (existing.charges ?? null) !== (row.charges ?? null);
    const cols = Object.keys(row);
    db.prepare(
      `UPDATE listings SET ${cols.map((c) => `${c} = ?`).join(", ")}, last_seen = ?, removed_at = NULL, detail_fetched_at = ?
       WHERE id = ?`,
    ).run(...cols.map((c) => row[c]), seenAt, detailFetchedAt, id);
    if (priceChanged && row.price !== null) {
      db.prepare("INSERT INTO price_history(listing_id, price, charges, seen_at) VALUES(?, ?, ?, ?)").run(id, row.price, row.charges, seenAt);
    }
  }

  if (input.photos && input.photos.length > 0) {
    // Search results may only carry a preview subset of photos: never let them replace a full gallery.
    const hasPhotos = !!db.prepare("SELECT 1 FROM photos WHERE listing_id = ? LIMIT 1").get(id);
    if (input.isDetail || !hasPhotos) setPhotos(id, input.photos);
  }

  return { status, id, priceChanged, needsDetail: detailFetchedAt === null };
}

/** Replace the photo list of a listing, keeping already-downloaded files for photos that are still there. */
function setPhotos(listingId: string, photos: PhotoInput[]): void {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM photos WHERE listing_id = ?").all(listingId) as unknown as (PhotoRow & { bytes: number | null; failures: number })[];
  const sameList = existing.length === photos.length && existing.every((p) => photos[p.idx]?.url === p.url);
  if (sameList) return;

  const byUrl = new Map(existing.map((p) => [p.url, p]));
  const keep = new Set(photos.map((p) => p.url));
  for (const p of existing) {
    if (!keep.has(p.url) && p.local_path) deletePhotoFile(p.local_path);
  }
  db.prepare("DELETE FROM photos WHERE listing_id = ?").run(listingId);
  const ins = db.prepare("INSERT INTO photos(listing_id, idx, url, thumb_url, local_path, bytes, failures) VALUES(?, ?, ?, ?, ?, ?, ?)");
  photos.forEach((p, idx) => {
    const old = byUrl.get(p.url);
    ins.run(listingId, idx, p.url, p.thumbUrl ?? null, old?.local_path ?? null, old?.bytes ?? null, old?.failures ?? 0);
  });
}

export function deletePhotoFile(localPath: string): void {
  const full = path.resolve(PHOTO_DIR, localPath);
  if (!full.startsWith(PHOTO_DIR)) return;
  try {
    fs.unlinkSync(full);
  } catch {
    /* already gone */
  }
}

/** Mark listings of a source that were not seen since `sweepStart` as removed. Returns how many. */
export function markMissingAsRemoved(source: Source, sweepStart: string): number {
  const r = getDb()
    .prepare("UPDATE listings SET removed_at = ? WHERE source = ? AND removed_at IS NULL AND last_seen < ?")
    .run(nowIso(), source, sweepStart);
  return Number(r.changes);
}

export function countActive(source: Source): number {
  const r = getDb().prepare("SELECT COUNT(*) AS n FROM listings WHERE source = ? AND removed_at IS NULL").get(source) as { n: number };
  return r.n;
}

export function knownIds(source: Source, sourceIds: string[]): Set<string> {
  if (sourceIds.length === 0) return new Set();
  const rows = getDb()
    .prepare(`SELECT source_id FROM listings WHERE source = ? AND source_id IN (${sourceIds.map(() => "?").join(",")})`)
    .all(source, ...sourceIds) as { source_id: string }[];
  return new Set(rows.map((r) => r.source_id));
}

export function getListing(id: string): ListingRow | undefined {
  return getDb().prepare("SELECT * FROM listings WHERE id = ?").get(id) as ListingRow | undefined;
}

export function getPhotos(listingId: string): PhotoRow[] {
  return getDb().prepare("SELECT listing_id, idx, url, thumb_url, local_path FROM photos WHERE listing_id = ? ORDER BY idx").all(listingId) as unknown as PhotoRow[];
}

export function getPriceHistory(listingId: string): { price: number | null; charges: number | null; seen_at: string }[] {
  return getDb().prepare("SELECT price, charges, seen_at FROM price_history WHERE listing_id = ? ORDER BY seen_at").all(listingId) as {
    price: number | null;
    charges: number | null;
    seen_at: string;
  }[];
}
