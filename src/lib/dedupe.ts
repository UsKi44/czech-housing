import { getDb } from "./db";
import { preferredOver, sourceRankSql } from "./filters";

/**
 * Cross-site duplicate detection. Agencies post the same flat on several portals; we put such listings
 * in one group (listings.group_id) and show the group once, with links to every copy.
 *
 * Two listings from different sites are the same flat when they have the same layout, size within 1 m²,
 * rent within 3 %, and are within 300 m of each other (or, without GPS, on the same street).
 */

const MAX_DISTANCE_M = 300;

function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(x));
}

type Row = {
  id: string;
  source: string;
  price: number | null;
  area: number | null;
  layout: string | null;
  lat: number | null;
  lng: number | null;
  street: string | null;
  group_id: string | null;
};

/** Assign groups to listings that are ready (details fetched) and not grouped yet. Returns how many joined an existing group. */
export function assignGroups(): number {
  const db = getDb();
  const pending = db
    .prepare(
      `SELECT id, source, price, area, layout, lat, lng, street, group_id FROM listings
       WHERE grouped = 0 AND (detail_fetched_at IS NOT NULL OR detail_failures >= 3)
       ORDER BY first_seen, id`,
    )
    .all() as Row[];
  if (pending.length === 0) return 0;

  const candidatesStmt = db.prepare(
    `SELECT c.id, c.source, c.price, c.area, c.layout, c.lat, c.lng, c.street, COALESCE(c.group_id, c.id) AS group_id
     FROM listings c
     WHERE c.source != ? AND c.removed_at IS NULL AND c.layout = ?
       AND c.area BETWEEN ? AND ? AND c.price BETWEEN ? AND ?
       -- never put two listings from the same site in one group
       AND NOT EXISTS (SELECT 1 FROM listings m WHERE m.group_id = COALESCE(c.group_id, c.id) AND m.source = ? AND m.removed_at IS NULL)`,
  );
  const setGroup = db.prepare("UPDATE listings SET group_id = ?, grouped = 1 WHERE id = ?");
  let merged = 0;

  db.exec("BEGIN");
  try {
    const currentGroup = db.prepare("SELECT group_id FROM listings WHERE id = ?");
    for (const r of pending) {
      // Another listing may have matched this one earlier in this run: keep that group.
      const already = (currentGroup.get(r.id) as { group_id: string | null } | undefined)?.group_id;
      if (already) {
        setGroup.run(already, r.id);
        continue;
      }
      let group = r.id;
      if (r.layout && r.area && r.price) {
        const cands = candidatesStmt.all(r.source, r.layout, r.area - 1, r.area + 1, r.price * 0.97, r.price * 1.03, r.source) as Row[];
        // Among all plausible copies pick the closest one (similar flats in the same building are common).
        let match: Row | undefined;
        let best = Infinity;
        for (const c of cands) {
          let dist: number;
          if (r.lat && r.lng && c.lat && c.lng) dist = distanceM(r.lat, r.lng, c.lat, c.lng);
          else if (r.street && c.street && r.street.toLowerCase() === c.street.toLowerCase()) dist = MAX_DISTANCE_M / 2;
          else continue;
          if (dist > MAX_DISTANCE_M) continue;
          const score = (Math.abs(c.price! - r.price) / r.price) * 1000 + Math.abs(c.area! - r.area) * 5 + dist / 100;
          if (score < best) {
            best = score;
            match = c;
          }
        }
        if (match) {
          group = match.group_id!;
          // Make sure the matched listing itself carries the group id.
          db.prepare("UPDATE listings SET group_id = ? WHERE id = ? AND group_id IS NULL").run(group, match.id);
          merged++;
        }
      }
      setGroup.run(group, r.id);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return merged;
}

/**
 * Recompute listings.dup_hidden: 1 when another site's copy of the same flat is shown instead.
 * Run after anything that changes groups or removals (the listing page then only reads the flag).
 */
export function refreshDuplicateVisibility(): void {
  getDb().exec(
    `UPDATE listings AS l SET dup_hidden = CASE WHEN EXISTS (
       SELECT 1 FROM listings o WHERE o.group_id = l.group_id AND o.id != l.id AND ${preferredOver("o", "l")}
     ) THEN 1 ELSE 0 END
     WHERE l.group_id IS NOT NULL OR l.dup_hidden != 0`,
  );
}

/** Other active copies of a listing on other sites. */
export function siblings(id: string): { id: string; source: string; url: string; price: number | null; removed_at: string | null }[] {
  return getDb()
    .prepare(
      `SELECT o.id, o.source, o.url, o.price, o.removed_at FROM listings l JOIN listings o ON o.group_id = l.group_id AND o.id != l.id
       WHERE l.id = ? ORDER BY o.removed_at IS NOT NULL, ${sourceRankSql("o")}`,
    )
    .all(id) as { id: string; source: string; url: string; price: number | null; removed_at: string | null }[];
}
