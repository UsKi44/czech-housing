import type { ListingInput, Param } from "../lib/types";
import { fetchJson } from "./http";
import type { PageResult, SourceScraper } from "./types";

/**
 * Bezrealitky.cz — uses the public GraphQL API its own website uses.
 * Search results already contain every field, so no per-listing detail request is needed.
 * regionId 486 = Praha.
 */

const API = "https://api.bezrealitky.cz/graphql/";
const PAGE_SIZE = 60;

const QUERY = `
query Listings($offset: Int!, $limit: Int!) {
  listAdverts(offerType: [PRONAJEM], estateType: [BYT], regionId: "486", order: TIMEORDER_DESC,
              limit: $limit, offset: $offset, currency: CZK) {
    totalCount
    list {
      id uri title titleEnglish description descriptionEnglish
      price charges serviceCharges utilityCharges deposit fee currency
      surface etage totalFloors disposition construction condition ownership equipped penb
      lowEnergy parking garage lift petFriendly barrierFree roommate shortTerm reserved
      balconySurface terraceSurface cellarSurface loggiaSurface frontGarden
      street houseNumber zip address(locale: CS) cityDistrict(locale: CS) gps { lat lng }
      availableFrom serviceChargesNote utilityChargesNote
      tags(locale: EN)
      formattedParameters(locale: EN) { title value }
      formattedBoolParameters(locale: EN) { name title }
      publicImages { url(filter: RECORD_MAIN) thumb: url(filter: RECORD_THUMB) order }
    }
  }
}`;

interface BrAdvert {
  id: string;
  uri: string;
  title: string | null;
  titleEnglish: string | null;
  description: string | null;
  descriptionEnglish: string | null;
  price: number | null;
  charges: number | null;
  serviceCharges: number | null;
  utilityCharges: number | null;
  deposit: number | null;
  fee: number | null;
  currency: string;
  surface: number | null;
  etage: number | null;
  totalFloors: number | null;
  disposition: string | null;
  construction: string | null;
  condition: string | null;
  ownership: string | null;
  equipped: string | null;
  penb: string | null;
  lowEnergy: boolean | null;
  parking: boolean | null;
  garage: boolean | null;
  lift: boolean | null;
  petFriendly: boolean | null;
  barrierFree: boolean | null;
  roommate: boolean | null;
  shortTerm: boolean | null;
  reserved: boolean | null;
  balconySurface: number | null;
  terraceSurface: number | null;
  cellarSurface: number | null;
  loggiaSurface: number | null;
  frontGarden: number | null;
  street: string | null;
  houseNumber: string | null;
  zip: string | null;
  address: string | null;
  cityDistrict: string | null;
  gps: { lat: number; lng: number } | null;
  availableFrom: number | null;
  serviceChargesNote: string | null;
  utilityChargesNote: string | null;
  tags: string[];
  formattedParameters: Param[] | { title: string; value: string }[];
  formattedBoolParameters: { name: string; title: string }[];
  publicImages: { url: string; thumb: string | null; order: number | null }[];
}

function layout(d: string | null, roommate: boolean | null): string | null {
  if (roommate) return "room";
  if (!d) return null;
  const m = d.match(/^DISP_(\d)_(KK|1)$/);
  if (m) return Number(m[1]) >= 6 ? "6+" : `${m[1]}+${m[2].toLowerCase()}`;
  if (d === "GARSONIERA") return "1+kk";
  if (d === "OSTATNI") return "atypical";
  return null;
}

/** Many owners leave the layout field empty but mention it in the text, e.g. "byt 2+kk". */
function layoutFromText(text: string | null): string | null {
  const m = text?.match(/(?<![\d+])([1-6])\s*\+\s*(kk|1)(?![a-z\d])/i);
  if (!m) return null;
  return Number(m[1]) >= 6 ? "6+" : `${m[1]}+${m[2].toLowerCase()}`;
}

function enumText(v: string | null): string | null {
  if (!v || v === "UNDEFINED" || v === "UNKNOWN") return null;
  return v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ");
}

function pragueDate(unixSeconds: number | null): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
}

// Promotional rows Bezrealitky mixes into the parameters.
const AD_ROW = /internet|investment advisor|deposit\?|without (a )?deposit/i;

function toListing(a: BrAdvert): ListingInput {
  const neighbourhood = a.cityDistrict?.replace(/^Praha\s*-\s*/, "").trim() || null;
  const furnished = a.equipped === "VYBAVENY" ? "yes" : a.equipped === "CASTECNE" ? "partly" : a.equipped === "NEVYBAVENY" ? "no" : null;
  const params: Param[] = (a.formattedParameters as Param[] | { title: string; value: string }[])
    .map((p) => ("title" in p ? { label: p.title, value: p.value } : p))
    .filter((p) => p.value && !AD_ROW.test(p.label) && !AD_ROW.test(p.value));
  const feats = a.formattedBoolParameters.map((b) => b.title);
  if (feats.length) params.push({ label: "Features", value: feats.join(", ") });
  if (a.serviceChargesNote) params.push({ label: "Service fees note", value: a.serviceChargesNote });
  if (a.utilityChargesNote) params.push({ label: "Utility fees note", value: a.utilityChargesNote });
  if (a.shortTerm) params.push({ label: "Short-term rental", value: "Yes" });
  if (a.reserved) params.push({ label: "Reserved", value: "Yes" });

  // Listings without photos get a "no photo" placeholder image: skip it.
  const images = a.publicImages.filter((im) => im.url && !im.url.includes("placeholder")).sort((x, y) => (x.order ?? 999) - (y.order ?? 999));
  const description = [a.description, a.descriptionEnglish && a.descriptionEnglish !== a.description ? `--- English ---\n${a.descriptionEnglish}` : null]
    .filter(Boolean)
    .join("\n\n");

  return {
    source: "bezrealitky",
    sourceId: a.id,
    url: `https://www.bezrealitky.cz/nemovitosti-byty-domy/${a.uri}`,
    title: a.title,
    price: a.price,
    charges: a.charges || (a.serviceCharges ?? 0) + (a.utilityCharges ?? 0) || null,
    deposit: a.deposit || null,
    fee: a.fee || null,
    area: a.surface || null,
    layout: layout(a.disposition, a.roommate) ?? layoutFromText(a.description) ?? layoutFromText(a.descriptionEnglish),
    floor: a.etage,
    totalFloors: a.totalFloors,
    neighbourhood,
    street: a.street,
    address: a.address,
    lat: a.gps?.lat ?? null,
    lng: a.gps?.lng ?? null,
    description: description || null,
    energyRating: a.penb && /^[A-G]$/.test(a.penb) ? a.penb : null,
    furnished,
    buildingType: enumText(a.construction),
    condition: enumText(a.condition),
    balcony: (a.balconySurface ?? 0) > 0 || a.formattedBoolParameters.some((b) => b.name === "balcony"),
    terrace: (a.terraceSurface ?? 0) > 0 || a.formattedBoolParameters.some((b) => b.name === "terrace"),
    loggia: (a.loggiaSurface ?? 0) > 0 || a.formattedBoolParameters.some((b) => b.name === "loggia"),
    cellar: (a.cellarSurface ?? 0) > 0 || a.formattedBoolParameters.some((b) => b.name === "cellar"),
    lift: a.lift,
    parking: a.parking,
    garage: a.garage,
    pets: a.petFriendly,
    availableFrom: pragueDate(a.availableFrom),
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    contactCompany: "Private owner (Bezrealitky)",
    params,
    raw: a,
    photos: images.map((im) => ({ url: im.url, thumbUrl: im.thumb ?? im.url })),
    isDetail: true,
    listSig: [a.price, a.charges, a.title, images.length].join("|"),
  };
}

export const bezrealitky: SourceScraper = {
  source: "bezrealitky",
  pageSize: PAGE_SIZE,

  async fetchPage(page: number): Promise<PageResult> {
    const res = await fetchJson<{ data?: { listAdverts: { totalCount: number; list: BrAdvert[] } }; errors?: { message: string }[] }>(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://www.bezrealitky.cz", Referer: "https://www.bezrealitky.cz/" },
      body: JSON.stringify({ query: QUERY, variables: { offset: page * PAGE_SIZE, limit: PAGE_SIZE } }),
    });
    if (res.errors?.length || !res.data) throw new Error(`Bezrealitky API error: ${res.errors?.map((e) => e.message).join("; ")}`);
    const { totalCount, list } = res.data.listAdverts;
    return { items: list.map(toListing), total: totalCount };
  },
};
