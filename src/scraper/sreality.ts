import type { ListingInput, Param } from "../lib/types";
import { fetchJson, HttpError } from "./http";
import type { PageResult, SourceScraper } from "./types";

/**
 * Sreality.cz — uses the same JSON API the sreality.cz website itself loads data from.
 * Search: category_type_cb=2 (rent), category_main_cb=1 (apartments), locality_region_id=10 (Prague).
 */

const API = "https://www.sreality.cz/api/v1";
const PAGE_SIZE = 100;

// Image sizes the sreality website itself requests.
// Only the size presets sreality.cz itself uses are served (others answer 400): SQUARE_1200_WEBP and IMG_4TO3_400X300_WEBP.
const FULL = "?fl=res,1200,1200,1|shr,,20|webp,60";
const THUMB = "?fl=res,400,300,3|shr,,20|webp,60";

type Cb = { name: string; value: number } | null | undefined;

interface SrLocality {
  city?: string | null;
  citypart?: string | null;
  citypart_seo_name?: string | null;
  district?: string | null;
  street?: string | null;
  street_seo_name?: string | null;
  housenumber?: string | null;
  streetnumber?: string | null;
  quarter?: string | null;
  ward?: string | null;
  zip?: number | string | null;
  gps_lat?: number | null;
  gps_lon?: number | null;
}

interface SrSearchItem {
  hash_id: number;
  advert_name: string;
  advert_images?: string[];
  category_sub_cb?: Cb;
  locality: SrLocality;
  price_czk?: number | null;
  price_summary_czk?: number | null;
}

interface SrSearch {
  pagination: { limit: number; offset: number; total: number };
  results: SrSearchItem[];
}

function absUrl(u: string): string {
  return u.startsWith("//") ? `https:${u}` : u;
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeLayout(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  const m = n.match(/^(\d)\s*\+\s*(kk|1)$/);
  if (m) return Number(m[1]) >= 6 ? "6+" : `${m[1]}+${m[2]}`;
  if (n.startsWith("6") || n.includes("více")) return "6+";
  if (n.startsWith("atyp")) return "atypical";
  if (n.startsWith("pokoj")) return "room";
  return n;
}

function layoutFromName(advertName: string): string | null {
  const m = advertName.match(/(\d\s*\+\s*(?:kk|1))/i);
  return m ? normalizeLayout(m[1].replace(/\s/g, "")) : null;
}

function areaFromName(advertName: string): number | null {
  const m = advertName.match(/(\d+(?:[.,]\d+)?)\s*m²/);
  return m ? Math.round(Number(m[1].replace(",", "."))) : null;
}

function listingUrl(id: number | string, layout: string | null, loc: SrLocality): string {
  const layoutSeo = layout === "6+" ? "6-a-vice" : layout === "atypical" ? "atypicky" : layout === "room" ? "pokoj" : (layout ?? "byt");
  const place = ["praha", loc.citypart_seo_name ?? (loc.citypart ? slug(loc.citypart) : ""), loc.street_seo_name ?? (loc.street ? slug(loc.street) : "")]
    .filter(Boolean)
    .join("-");
  return `https://www.sreality.cz/detail/pronajem/byt/${layoutSeo}/${place}/${id}`;
}

function address(loc: SrLocality): string {
  const street = [loc.street, loc.streetnumber || loc.housenumber].filter(Boolean).join(" ");
  const area = [loc.city, loc.citypart].filter(Boolean).join(" - ");
  return [street, area].filter(Boolean).join(", ");
}

function fromSearch(it: SrSearchItem): ListingInput {
  const layout = normalizeLayout(it.category_sub_cb?.name) ?? layoutFromName(it.advert_name);
  const images = it.advert_images ?? [];
  return {
    source: "sreality",
    sourceId: String(it.hash_id),
    url: listingUrl(it.hash_id, layout, it.locality),
    title: it.advert_name,
    price: it.price_czk || it.price_summary_czk || null,
    area: areaFromName(it.advert_name),
    layout,
    district: it.locality.district ?? undefined,
    neighbourhood: it.locality.citypart ?? undefined,
    street: it.locality.street ?? undefined,
    address: address(it.locality),
    lat: it.locality.gps_lat ?? undefined,
    lng: it.locality.gps_lon ?? undefined,
    // Search results only carry a few photos; the full gallery comes with the detail.
    photos: images.map((u) => ({ url: absUrl(u) + FULL, thumbUrl: absUrl(u) + THUMB })),
    listSig: [it.advert_name, it.price_czk, it.price_summary_czk, images.length, images[0] ?? ""].join("|"),
  };
}

const ENERGY = ["", "A", "B", "C", "D", "E", "F", "G"];

const LABELS: Record<string, string> = {
  advert_code: "Listing code",
  acceptance_year: "Year of final building approval",
  balcony_area: "Balcony area",
  basin_area: "Pool area",
  building_area: "Built-up area",
  building_condition: "Condition",
  building_type: "Building type",
  cellar_area: "Cellar area",
  commission: "Agency commission",
  cost_of_living: "Monthly costs",
  easy_access: "Barrier-free access",
  edited: "Last edited",
  elevator: "Lift",
  energy_efficiency_rating_cb: "Energy rating (PENB)",
  energy_performance_certificate: "Energy certificate (regulation)",
  floor_area: "Floor area",
  floor_number: "Floor",
  floors: "Floors in building",
  furnished: "Furnished",
  garage_count: "Garages",
  garden_area: "Garden area",
  gas_set: "Gas",
  gully_set: "Sewerage",
  heating_set: "Heating",
  heating_source_set: "Heating source",
  heating_element_set: "Heating elements",
  internet_connection_provider: "Internet provider",
  internet_connection_speed: "Internet speed",
  internet_connection_type_set: "Internet",
  lease_type_cb: "Lease type",
  loggia_area: "Loggia area",
  object_age: "Building age",
  object_location: "Location type",
  ownership: "Ownership",
  parking: "Parking spaces",
  price_note: "Price note",
  ready_date: "Available from",
  reconstruction_year: "Reconstruction year",
  refundable_deposit: "Refundable deposit",
  road_type_set: "Road access",
  since: "Listed since",
  surroundings_type: "Surroundings",
  telecommunication_set: "Telecommunications",
  terrace_area: "Terrace area",
  transport_set: "Transport",
  underground_floors: "Underground floors",
  usable_area: "Usable area",
  water_heat_source_set: "Hot water",
  water_set: "Water",
  electricity_set: "Electricity",
  circuit_breaker_cb: "Circuit breaker",
  phase_distributions_cb: "Electrical phases",
  flat_class: "Flat type",
  protection: "Protection zone",
  personal: "Personal transfer",
  state_cb: "State",
  beginning_date: "Construction start",
  finish_date: "Construction finish",
  first_tour_date: "First viewing",
  low_energy: "Low-energy building",
  tenant_not_pay_commission: "Tenant pays no commission",
  exclusively_at_rk: "Exclusively with this agency",
};

const BOOL_FEATURES = ["balcony", "loggia", "terrace", "cellar", "garage", "garret", "basin", "parking_lots", "low_energy", "tenant_not_pay_commission", "exclusively_at_rk"];

// Fields shown elsewhere on the page or internal to sreality.
const SKIP = new Set([
  "advert_description", "advert_images", "advert_name", "category_main_cb", "category_sub_cb", "category_type_cb", "hash_id", "locality",
  "premise", "user", "videos", "panorama", "panorama_data", "matterport_url", "keywords", "labels", "labels_extended", "price", "price_czk",
  "price_summary", "price_summary_czk", "price_currency_cb", "price_unit_cb", "price_summary_unit_cb", "price_czk_m2", "price_summary_old",
  "price_summary_old_czk", "price_flag_negotiation_cb", "discount_show", "project", "stats", "rus", "rus_reply",
  "sdn_energy_performance_attachment_url", "energy_performance_summary", "well_type_set", "sale_date",
]);

function humanize(key: string): string {
  return LABELS[key] ?? key.replace(/_(cb|set)$/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function formatValue(key: string, v: unknown): string | null {
  if (v === null || v === undefined || v === "" || v === 0) return null;
  if (typeof v === "boolean") return v ? "Yes" : null;
  if (typeof v === "number") return key.endsWith("_area") ? `${v} m²` : key === "commission" || key === "refundable_deposit" ? `${v.toLocaleString("en")} CZK` : String(v);
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    const names = v.map((x) => (x && typeof x === "object" && "name" in x ? String((x as { name: string }).name) : String(x))).filter(Boolean);
    return names.length ? names.join(", ") : null;
  }
  if (typeof v === "object" && v && "name" in v && "value" in v) {
    const cb = v as { name: string; value: number };
    return cb.value ? cb.name : null;
  }
  return null;
}

function buildParams(d: Record<string, unknown>): Param[] {
  const params: Param[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (SKIP.has(k) || BOOL_FEATURES.includes(k)) continue;
    const value = formatValue(k, v);
    if (value) params.push({ label: humanize(k), value });
  }
  const features = BOOL_FEATURES.filter((k) => d[k] === true).map(humanize);
  if (features.length) params.push({ label: "Features", value: features.join(", ") });
  return params;
}

function cbValue(v: unknown): number | null {
  return v && typeof v === "object" && "value" in v ? Number((v as { value: number }).value) || null : null;
}
function cbName(v: unknown): string | null {
  return cbValue(v) ? (v as { name: string }).name : null;
}

export const sreality: SourceScraper = {
  source: "sreality",
  pageSize: PAGE_SIZE,

  async fetchPage(page: number): Promise<PageResult> {
    const url =
      `${API}/estates/search?category_type_cb=2&category_main_cb=1&locality_region_id=10` +
      `&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&sort=-date&lang=cs`;
    const data = await fetchJson<SrSearch>(url);
    return { items: data.results.map(fromSearch), total: data.pagination.total };
  },

  async fetchDetail(sourceId: string): Promise<ListingInput | null> {
    let data: { result: Record<string, unknown> };
    try {
      data = await fetchJson(`${API}/estates/${sourceId}?lang=en`);
    } catch (e) {
      if (e instanceof HttpError && (e.status === 404 || e.status === 410)) return null;
      throw e;
    }
    const d = data.result;
    const loc = (d.locality ?? {}) as SrLocality;
    const user = (d.user ?? {}) as { user_name?: string; user_email?: string; user_phones?: { phone: string }[] };
    const premise = (d.premise ?? {}) as { name?: string };
    const images = ((d.advert_images ?? []) as { url: string; order?: number | null }[]).slice();
    images.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    const furnished = cbValue(d.furnished);
    const energy = cbValue(d.energy_efficiency_rating_cb);
    const elevator = cbValue(d.elevator);
    const deposit = typeof d.refundable_deposit === "number" ? d.refundable_deposit : null;
    const commission = typeof d.commission === "number" && d.commission > 0 ? d.commission : null;

    return {
      source: "sreality",
      sourceId,
      // layout, title, url and area stay as parsed from the Czech search results
      price: (d.price_czk as number) || (d.price_summary_czk as number) || undefined,
      deposit,
      fee: commission,
      area: (d.usable_area as number) || (d.floor_area as number) || undefined,
      floor: typeof d.floor_number === "number" ? d.floor_number : null,
      totalFloors: typeof d.floors === "number" ? d.floors : null,
      district: loc.district ?? undefined,
      neighbourhood: loc.citypart ?? undefined,
      street: loc.street ?? undefined,
      address: address(loc),
      lat: loc.gps_lat ?? undefined,
      lng: loc.gps_lon ?? undefined,
      description: (d.advert_description as string) ?? null,
      energyRating: energy ? ENERGY[energy] ?? null : null,
      furnished: furnished === 1 ? "yes" : furnished === 2 ? "no" : furnished === 3 ? "partly" : null,
      buildingType: cbName(d.building_type),
      condition: cbName(d.building_condition),
      balcony: d.balcony === true,
      terrace: d.terrace === true,
      loggia: d.loggia === true,
      cellar: d.cellar === true,
      lift: elevator === 1 ? true : elevator === 2 ? false : null,
      parking: d.parking_lots === true || (typeof d.parking === "number" && d.parking > 0),
      garage: d.garage === true,
      pets: null,
      availableFrom: (d.ready_date as string) ?? null,
      contactName: user.user_name ?? null,
      contactPhone: user.user_phones?.map((p) => p.phone).join(", ") || null,
      contactEmail: user.user_email ?? null,
      contactCompany: premise.name ?? null,
      params: buildParams(d),
      raw: d,
      photos: images.map((im) => ({ url: absUrl(im.url) + FULL, thumbUrl: absUrl(im.url) + THUMB })),
      isDetail: true,
    };
  },
};
