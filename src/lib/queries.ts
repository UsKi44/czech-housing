import { getDb, getKv } from "./db";
import { buildWhere, orderBy, type Filters } from "./filters";
import type { ListingRow } from "./types";

export const PAGE_SIZE = 24;

export type ListingCardRow = ListingRow & { cover: string | null; photo_count: number; prev_price: number | null; also_on: string | null };

/** URL to show a photo: the local copy when downloaded, otherwise the source site's image. */
export function photoSrc(p: { local_path: string | null; url: string }): string {
  return p.local_path ? `/photos/${p.local_path}` : p.url;
}

export function searchListings(f: Filters): { rows: ListingCardRow[]; total: number } {
  const db = getDb();
  const { where, params } = buildWhere(f);
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM listings l WHERE ${where}`).get(...params) as { n: number }).n;
  const rows = db
    .prepare(
      `SELECT l.id, l.source, l.source_id, l.url, l.title, l.price, l.charges, l.deposit, l.area, l.layout, l.floor,
              l.district, l.neighbourhood, l.street, l.address, l.furnished, l.energy_rating, l.balcony, l.loggia, l.terrace,
              l.lift, l.parking, l.garage, l.pets, l.available_from, l.first_seen, l.last_seen, l.removed_at,
              (SELECT COALESCE('/photos/' || p.local_path, p.thumb_url, p.url) FROM photos p WHERE p.listing_id = l.id ORDER BY p.idx LIMIT 1) AS cover,
              (SELECT COUNT(*) FROM photos p WHERE p.listing_id = l.id) AS photo_count,
              (SELECT h.price FROM price_history h WHERE h.listing_id = l.id ORDER BY h.seen_at DESC LIMIT 1 OFFSET 1) AS prev_price,
              (SELECT group_concat(DISTINCT o.source) FROM listings o WHERE o.group_id = l.group_id AND o.id != l.id AND o.removed_at IS NULL) AS also_on
       FROM listings l WHERE ${where} ORDER BY ${orderBy(f.sort, f.withCharges)} LIMIT ? OFFSET ?`,
    )
    .all(...params, PAGE_SIZE, (f.page - 1) * PAGE_SIZE) as unknown as ListingCardRow[];
  return { rows, total };
}

/** Districts ("Praha N") and neighbourhoods with active listings, for the filter dropdown. */
export function districtOptions(): { districts: { name: string; n: number }[]; neighbourhoods: { name: string; n: number }[] } {
  const db = getDb();
  const districts = db
    .prepare("SELECT district AS name, COUNT(*) AS n FROM listings WHERE removed_at IS NULL AND dup_hidden = 0 AND district GLOB 'Praha [0-9]*' GROUP BY district")
    .all() as { name: string; n: number }[];
  districts.sort((a, b) => (parseInt(a.name.replace(/\D/g, "")) || 99) - (parseInt(b.name.replace(/\D/g, "")) || 99));
  const neighbourhoods = db
    .prepare("SELECT neighbourhood AS name, COUNT(*) AS n FROM listings WHERE removed_at IS NULL AND dup_hidden = 0 AND neighbourhood IS NOT NULL AND trim(neighbourhood) != '' GROUP BY neighbourhood")
    .all() as { name: string; n: number }[];
  neighbourhoods.sort((a, b) => a.name.localeCompare(b.name, "cs"));
  // SQLite rows have a null prototype; React only passes plain objects to client components.
  const plain = (rows: { name: string; n: number }[]) => rows.map((r) => ({ name: r.name, n: r.n }));
  return { districts: plain(districts), neighbourhoods: plain(neighbourhoods) };
}

export interface SyncStatus {
  /** When the listings were last checked against the source sites. */
  lastScanAt: string | null;
  /** Set while the background worker is checking the sites right now. */
  updating: boolean;
  /** Visible flats (duplicates across sites counted once). */
  total: number;
  newToday: number;
  lastErrors: { source: string; error: string; at: string }[];
}

export function syncStatus(): SyncStatus {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) AS n FROM listings WHERE removed_at IS NULL AND dup_hidden = 0").get() as { n: number }).n;
  const since = new Date(Date.now() - 86400_000).toISOString();
  const newToday = (db.prepare("SELECT COUNT(*) AS n FROM listings WHERE first_seen >= ? AND dup_hidden = 0").get(since) as { n: number }).n;
  const lastErrors = db
    .prepare(
      `SELECT r.source, r.error, r.finished_at AS at FROM runs r
       WHERE r.id = (SELECT MAX(id) FROM runs r2 WHERE r2.source = r.source) AND r.error IS NOT NULL`,
    )
    .all() as { source: string; error: string; at: string }[];
  const updatingSince = getKv("updating_since");
  // A stale flag (worker killed mid-scan) is ignored after 30 minutes.
  const updating = !!updatingSince && Date.now() - Date.parse(updatingSince) < 30 * 60_000;
  return { lastScanAt: getKv("last_scan_at") ?? getKv("last_cycle_at") ?? null, updating, total, newToday, lastErrors };
}
