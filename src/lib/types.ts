export type Source = "sreality" | "bezrealitky";

export const SOURCES: { id: Source; label: string; home: string }[] = [
  { id: "sreality", label: "Sreality", home: "https://www.sreality.cz" },
  { id: "bezrealitky", label: "Bezrealitky", home: "https://www.bezrealitky.cz" },
];

export const LAYOUTS = ["1+kk", "1+1", "2+kk", "2+1", "3+kk", "3+1", "4+kk", "4+1", "5+kk", "5+1", "6+", "atypical", "room"] as const;

export type Param = { label: string; value: string };

export type PhotoInput = { url: string; thumbUrl?: string };

/** A listing as produced by a scraper, before it is stored. Undefined = "unknown, keep what we had". */
export interface ListingInput {
  source: Source;
  sourceId: string;
  /** Required for new listings; detail updates may omit it. */
  url?: string;
  title?: string | null;
  price?: number | null;
  charges?: number | null;
  deposit?: number | null;
  fee?: number | null;
  area?: number | null;
  layout?: string | null;
  floor?: number | null;
  totalFloors?: number | null;
  district?: string | null;
  neighbourhood?: string | null;
  street?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  description?: string | null;
  energyRating?: string | null;
  furnished?: "yes" | "partly" | "no" | null;
  buildingType?: string | null;
  condition?: string | null;
  balcony?: boolean | null;
  terrace?: boolean | null;
  loggia?: boolean | null;
  cellar?: boolean | null;
  lift?: boolean | null;
  parking?: boolean | null;
  garage?: boolean | null;
  pets?: boolean | null;
  availableFrom?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactCompany?: string | null;
  params?: Param[];
  raw?: unknown;
  photos?: PhotoInput[];
  /** True when this input contains full detail data (not just search-result data). */
  isDetail?: boolean;
  /** Fingerprint of the search-result data; when it changes the detail is fetched again. */
  listSig?: string;
}

/** A row of the listings table. */
export interface ListingRow {
  id: string;
  source: Source;
  source_id: string;
  url: string;
  title: string | null;
  price: number | null;
  charges: number | null;
  deposit: number | null;
  fee: number | null;
  area: number | null;
  layout: string | null;
  floor: number | null;
  total_floors: number | null;
  district: string | null;
  neighbourhood: string | null;
  street: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  energy_rating: string | null;
  furnished: string | null;
  building_type: string | null;
  condition: string | null;
  balcony: number | null;
  terrace: number | null;
  loggia: number | null;
  cellar: number | null;
  lift: number | null;
  parking: number | null;
  garage: number | null;
  pets: number | null;
  available_from: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_company: string | null;
  params_json: string | null;
  raw_json: string | null;
  list_sig: string | null;
  first_seen: string;
  last_seen: string;
  removed_at: string | null;
  detail_fetched_at: string | null;
}

export interface PhotoRow {
  listing_id: string;
  idx: number;
  url: string;
  thumb_url: string | null;
  local_path: string | null;
}
