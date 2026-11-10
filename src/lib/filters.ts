import { fold } from "./text";
import { LAYOUTS, SOURCES, type Source } from "./types";

export const FEATURES = [
  { id: "balcony", label: "Balcony / loggia / terrace" },
  { id: "lift", label: "Lift" },
  { id: "parking", label: "Parking / garage" },
  { id: "cellar", label: "Cellar" },
  { id: "pets", label: "Pets allowed" },
] as const;
export type Feature = (typeof FEATURES)[number]["id"];

export const SORTS = [
  { id: "newest", label: "Newest first" },
  { id: "price-asc", label: "Cheapest first" },
  { id: "price-desc", label: "Most expensive first" },
  { id: "area-desc", label: "Largest first" },
  { id: "ppm-asc", label: "Cheapest per m²" },
] as const;
export type Sort = (typeof SORTS)[number]["id"];

export interface Filters {
  sources: Source[];
  layouts: string[];
  districts: string[];
  priceMin?: number;
  priceMax?: number;
  /** Compare prices as rent + monthly fees instead of rent only. */
  withCharges: boolean;
  areaMin?: number;
  areaMax?: number;
  furnished?: "yes" | "partly" | "no" | "any";
  features: Feature[];
  q?: string;
  showRemoved: boolean;
  sort: Sort;
  page: number;
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function getAll(sp: ParamSource, key: string): string[] {
  if (sp instanceof URLSearchParams) return sp.getAll(key);
  const v = sp[key];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}
function get(sp: ParamSource, key: string): string | undefined {
  return getAll(sp, key)[0] || undefined;
}
function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(/\s/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function parseFilters(sp: ParamSource): Filters {
  const sourceIds = SOURCES.map((s) => s.id) as string[];
  const furnished = get(sp, "furnished");
  const sort = get(sp, "sort");
  return {
    sources: getAll(sp, "source").filter((s) => sourceIds.includes(s)) as Source[],
    layouts: getAll(sp, "layout").filter((l) => (LAYOUTS as readonly string[]).includes(l)),
    districts: getAll(sp, "district").filter(Boolean),
    priceMin: num(get(sp, "priceMin")),
    priceMax: num(get(sp, "priceMax")),
    withCharges: get(sp, "withCharges") === "1",
    areaMin: num(get(sp, "areaMin")),
    areaMax: num(get(sp, "areaMax")),
    furnished: furnished === "yes" || furnished === "partly" || furnished === "no" || furnished === "any" ? furnished : undefined,
    features: getAll(sp, "feature").filter((f) => FEATURES.some((x) => x.id === f)) as Feature[],
    q: get(sp, "q")?.trim() || undefined,
    showRemoved: get(sp, "showRemoved") === "1",
    sort: SORTS.some((s) => s.id === sort) ? (sort as Sort) : "newest",
    page: Math.max(1, Math.floor(num(get(sp, "page")) ?? 1)),
  };
}

/** Serialise filters back to a query string. Omits page by default. */
export function toQuery(f: Filters, overrides: Partial<Filters> = {}, { withPage = false } = {}): string {
  const x = { ...f, ...overrides };
  const p = new URLSearchParams();
  x.sources.forEach((s) => p.append("source", s));
  x.layouts.forEach((l) => p.append("layout", l));
  x.districts.forEach((d) => p.append("district", d));
  if (x.priceMin !== undefined) p.set("priceMin", String(x.priceMin));
  if (x.priceMax !== undefined) p.set("priceMax", String(x.priceMax));
  if (x.withCharges) p.set("withCharges", "1");
  if (x.areaMin !== undefined) p.set("areaMin", String(x.areaMin));
  if (x.areaMax !== undefined) p.set("areaMax", String(x.areaMax));
  if (x.furnished) p.set("furnished", x.furnished);
  x.features.forEach((ft) => p.append("feature", ft));
  if (x.q) p.set("q", x.q);
  if (x.showRemoved) p.set("showRemoved", "1");
  if (x.sort !== "newest") p.set("sort", x.sort);
  if (withPage && x.page > 1) p.set("page", String(x.page));
  return p.toString();
}

/** Human-readable one-line summary, used for alert names. */
export function describeFilters(f: Filters): string {
  const parts: string[] = [];
  if (f.layouts.length) parts.push(f.layouts.join("/"));
  if (f.districts.length) parts.push(f.districts.join(", "));
  if (f.priceMin !== undefined || f.priceMax !== undefined) {
    parts.push(`${f.priceMin ?? 0}–${f.priceMax ?? "∞"} CZK${f.withCharges ? " incl. fees" : ""}`);
  }
  if (f.areaMin !== undefined || f.areaMax !== undefined) parts.push(`${f.areaMin ?? 0}–${f.areaMax ?? "∞"} m²`);
  if (f.furnished) parts.push(f.furnished === "any" ? "furnished" : `furnished: ${f.furnished}`);
  if (f.features.length) parts.push(f.features.join(", "));
  if (f.sources.length) parts.push(f.sources.join(", "));
  if (f.q) parts.push(`"${f.q}"`);
  return parts.join(" · ") || "All Prague rentals";
}

const TOTAL = "(l.price + COALESCE(l.charges, 0))";

/** SQL condition: listing `o` is shown in preference to listing `l` (same flat on two sites). */
export function preferredOver(o: string, l: string): string {
  const ro = sourceRankSql(o);
  const rl = sourceRankSql(l);
  return `((${o}.removed_at IS NULL AND ${l}.removed_at IS NOT NULL)
    OR ((${o}.removed_at IS NULL) = (${l}.removed_at IS NULL) AND (${ro} < ${rl} OR (${ro} = ${rl} AND ${o}.id < ${l}.id))))`;
}

/** SQL expression ranking sources (lower = preferred as the main card when a flat is on several sites). */
export function sourceRankSql(alias: string): string {
  return `(CASE ${alias}.source ${SOURCES.map((s, i) => `WHEN '${s.id}' THEN ${i}`).join(" ")} ELSE 99 END)`;
}

export function buildWhere(f: Filters): { where: string; params: (string | number)[] } {
  const w: string[] = ["1 = 1"];
  const p: (string | number)[] = [];
  const priceExpr = f.withCharges ? TOTAL : "l.price";

  if (!f.showRemoved) w.push("l.removed_at IS NULL");
  if (f.sources.length) {
    w.push(`l.source IN (${f.sources.map(() => "?").join(",")})`);
    p.push(...f.sources);
  }
  // Show each flat once: hide a listing when a preferred copy of the same flat exists on another site
  // (active beats removed; then source order; then id). Without a source filter this is precomputed
  // (dup_hidden, see refreshDuplicateVisibility); with one, it is computed among the chosen sources only.
  if (!f.sources.length) w.push("l.dup_hidden = 0");
  else {
    // One ranking pass over the chosen sources: keep the preferred copy of each flat.
    w.push(`l.id IN (SELECT id FROM (
      SELECT x.id, ROW_NUMBER() OVER (PARTITION BY COALESCE(x.group_id, x.id) ORDER BY x.removed_at IS NOT NULL, ${sourceRankSql("x")}, x.id) AS rn
      FROM listings x WHERE x.source IN (${f.sources.map(() => "?").join(",")})) WHERE rn = 1)`);
    p.push(...f.sources);
  }
  if (f.layouts.length) {
    w.push(`l.layout IN (${f.layouts.map(() => "?").join(",")})`);
    p.push(...f.layouts);
  }
  if (f.districts.length) {
    w.push(`(l.district IN (${f.districts.map(() => "?").join(",")}) OR l.neighbourhood IN (${f.districts.map(() => "?").join(",")}))`);
    p.push(...f.districts, ...f.districts);
  }
  if (f.priceMin !== undefined) {
    w.push(`${priceExpr} >= ?`);
    p.push(f.priceMin);
  }
  if (f.priceMax !== undefined) {
    w.push(`${priceExpr} <= ?`);
    p.push(f.priceMax);
  }
  if (f.areaMin !== undefined) {
    w.push("l.area >= ?");
    p.push(f.areaMin);
  }
  if (f.areaMax !== undefined) {
    w.push("l.area <= ?");
    p.push(f.areaMax);
  }
  if (f.furnished === "any") w.push("l.furnished IN ('yes', 'partly')");
  else if (f.furnished) {
    w.push("l.furnished = ?");
    p.push(f.furnished);
  }
  for (const ft of f.features) {
    if (ft === "balcony") w.push("(l.balcony = 1 OR l.loggia = 1 OR l.terrace = 1)");
    else if (ft === "parking") w.push("(l.parking = 1 OR l.garage = 1)");
    else if (ft === "lift") w.push("l.lift = 1");
    else if (ft === "cellar") w.push("l.cellar = 1");
    else if (ft === "pets") w.push("l.pets = 1");
  }
  if (f.q) {
    for (const term of fold(f.q).split(/\s+/).filter(Boolean).slice(0, 5)) {
      w.push("l.search_text LIKE ? ESCAPE '!'");
      p.push(`%${term.replace(/[!%_]/g, (c) => "!" + c)}%`);
    }
  }
  return { where: w.join(" AND "), params: p };
}

export function orderBy(sort: Sort, withCharges: boolean): string {
  const priceExpr = withCharges ? TOTAL : "l.price";
  switch (sort) {
    case "price-asc":
      return `l.price IS NULL, ${priceExpr} ASC, l.first_seen DESC`;
    case "price-desc":
      return `l.price IS NULL, ${priceExpr} DESC, l.first_seen DESC`;
    case "area-desc":
      return "l.area IS NULL, l.area DESC, l.first_seen DESC";
    case "ppm-asc":
      return `l.area IS NULL OR l.area = 0, CAST(${priceExpr} AS REAL) / NULLIF(l.area, 0) ASC`;
    default:
      return "l.first_seen DESC, l.id";
  }
}
