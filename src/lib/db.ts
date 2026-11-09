import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fold } from "./text";

// turbopackIgnore: the data folder (database + photos) is runtime data, not part of the build.
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? path.join(process.cwd(), "data"));
export const PHOTO_DIR = path.join(DATA_DIR, "photos");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS listings (
  id                TEXT PRIMARY KEY,          -- "<source>:<source_id>"
  source            TEXT NOT NULL,             -- sreality | bezrealitky
  source_id         TEXT NOT NULL,
  url               TEXT NOT NULL,
  title             TEXT,
  price             INTEGER,                   -- monthly rent, CZK
  charges           INTEGER,                   -- monthly service + utility fees, CZK
  deposit           INTEGER,
  fee               INTEGER,                   -- agency commission / one-off fee
  area              INTEGER,                   -- m²
  layout            TEXT,                      -- 1+kk, 2+1, ..., 6+, atypical, room
  floor             INTEGER,
  total_floors      INTEGER,
  district          TEXT,                      -- Praha 1 .. Praha 10
  neighbourhood     TEXT,                      -- Vinohrady, Krč, ...
  street            TEXT,
  address           TEXT,
  lat               REAL,
  lng               REAL,
  description       TEXT,
  energy_rating     TEXT,                      -- A..G
  furnished         TEXT,                      -- yes | partly | no
  building_type     TEXT,
  condition         TEXT,
  balcony           INTEGER,
  terrace           INTEGER,
  loggia            INTEGER,
  cellar            INTEGER,
  lift              INTEGER,
  parking           INTEGER,
  garage            INTEGER,
  pets              INTEGER,
  available_from    TEXT,
  contact_name      TEXT,
  contact_phone     TEXT,
  contact_email     TEXT,
  contact_company   TEXT,
  params_json       TEXT,                      -- [{label, value}] every parameter the source shows
  raw_json          TEXT,                      -- full raw source data
  list_sig          TEXT,                      -- fingerprint of the search-result data, to spot edits
  first_seen        TEXT NOT NULL,
  last_seen         TEXT NOT NULL,
  removed_at        TEXT,
  detail_fetched_at TEXT,
  detail_failures   INTEGER NOT NULL DEFAULT 0,
  alert_checked     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_listings_seen ON listings(first_seen DESC);
CREATE INDEX IF NOT EXISTS idx_listings_source ON listings(source, removed_at);

CREATE TABLE IF NOT EXISTS photos (
  listing_id TEXT NOT NULL,
  idx        INTEGER NOT NULL,
  url        TEXT NOT NULL,                    -- full-size source URL
  thumb_url  TEXT,                             -- small source URL for the grid
  local_path TEXT,                             -- relative to data/photos when downloaded
  bytes      INTEGER,
  failures   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (listing_id, idx)
);
CREATE INDEX IF NOT EXISTS idx_photos_pending ON photos(local_path, failures);

CREATE TABLE IF NOT EXISTS price_history (
  listing_id TEXT NOT NULL,
  price      INTEGER,
  charges    INTEGER,
  seen_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_price_history ON price_history(listing_id, seen_at);

CREATE TABLE IF NOT EXISTS alerts (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  query      TEXT NOT NULL,                    -- URL query string of the saved search
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sent_alerts (
  alert_id   INTEGER NOT NULL,
  listing_id TEXT NOT NULL,
  sent_at    TEXT NOT NULL,
  PRIMARY KEY (alert_id, listing_id)
);

CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY,
  source      TEXT NOT NULL,
  kind        TEXT NOT NULL,                   -- quick | full
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  seen        INTEGER,
  added       INTEGER,
  updated     INTEGER,
  removed     INTEGER,
  error       TEXT
);

-- Learned from Sreality, which knows both: neighbourhood -> "Praha N". Used to fill Bezrealitky districts.
CREATE TABLE IF NOT EXISTS district_map (
  neighbourhood TEXT PRIMARY KEY,
  district      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

const globalForDb = globalThis as unknown as { __housingDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (globalForDb.__housingDb) return globalForDb.__housingDb;
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "housing.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 10000; PRAGMA synchronous = NORMAL;");
  db.exec(SCHEMA);
  migrate(db);
  globalForDb.__housingDb = db;
  return db;
}

function migrate(db: DatabaseSync): void {
  // Placeholder "no photo" images were stored as photos by the first version: drop them.
  for (const r of db.prepare("SELECT local_path FROM photos WHERE url LIKE '%placeholder%' AND local_path IS NOT NULL").all() as { local_path: string }[]) {
    try {
      fs.unlinkSync(path.join(PHOTO_DIR, r.local_path));
    } catch {
      /* already gone */
    }
  }
  db.exec("DELETE FROM photos WHERE url LIKE '%placeholder%'");

  const cols = new Set((db.prepare("PRAGMA table_info(listings)").all() as { name: string }[]).map((c) => c.name));
  if (!cols.has("search_text")) {
    // Lower-case, accent-free text for search, so "balkon" finds "balkón".
    db.exec("ALTER TABLE listings ADD COLUMN search_text TEXT");
    const rows = db.prepare("SELECT id, title, address, neighbourhood, district, description FROM listings").all() as Record<string, string | null>[];
    const upd = db.prepare("UPDATE listings SET search_text = ? WHERE id = ?");
    db.exec("BEGIN");
    for (const r of rows) upd.run(searchText(r.title, r.address, r.neighbourhood, r.district, r.description), r.id as string);
    db.exec("COMMIT");
  }
}

export function searchText(...parts: (string | null | undefined)[]): string {
  return fold(parts.filter(Boolean).join("\n"));
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function getKv(key: string): string | undefined {
  const row = getDb().prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setKv(key: string, value: string): void {
  getDb().prepare("INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

/** Run fn inside a transaction. */
export function tx<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
