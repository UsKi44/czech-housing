import type { ListingInput, Param } from "../lib/types";
import { fetchJson } from "./http";
import { layoutFromText } from "./layout";
import type { PageResult, SourceScraper } from "./types";

/**
 * UlovDomov.cz — uses the JSON API its own website uses. Search results are complete
 * (owner contacts are only shown to logged-in users, so they are not available).
 * The search is a map box around Prague; results outside Prague itself are dropped.
 */

const API = "https://ud.api.ulovdomov.cz/v1/offer/find";
const PAGE_SIZE = 100;
const PRAGUE_BOUNDS = { northEast: { lat: 50.1774, lng: 14.7068 }, southWest: { lat: 49.9419, lng: 14.2244 } };

interface UdOffer {
  id: number;
  title: string | null;
  area: number | null;
  description: string | null;
  disposition: string | null;
  geoCoordinates: { lat: number; lng: number } | null;
  photos: { id: number; path: string; alt?: string }[] | null;
  rentalPrice: { value: number; currency: string } | null;
  depositPrice: { value: number } | null;
  monthlyFeesPrice: { value: number } | null;
  isNoCommission: boolean | null;
  priceUnit: string | null;
  published: string | null;
  street: { title: string } | null;
  village: { title: string } | null;
  villagePart: { title: string } | null;
  convenience: string[] | null;
  houseConvenience: string[] | null;
  floorLevel: number | null;
  availableFrom: string | null;
  priceNote: string | null;
  absoluteUrl: string;
}

const NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

function layout(d: string | null, title: string | null): string | null {
  const m = d?.match(/^(one|two|three|four|five|six|seven)Plus(Kk|One)$/);
  if (m) {
    const n = NUMBERS[m[1]];
    return n >= 6 ? "6+" : `${n}+${m[2] === "Kk" ? "kk" : "1"}`;
  }
  if (d && /six|seven|more/i.test(d)) return "6+";
  if (d && /atyp/i.test(d)) return "atypical";
  if (d && /room|pokoj/i.test(d)) return "room";
  return layoutFromText(title);
}

const FEATURE_LABELS: Record<string, string> = {
  balcony: "Balcony",
  loggia: "Loggia",
  terrace: "Terrace",
  cellar: "Cellar",
  lift: "Lift",
  garage: "Garage",
  parking: "Parking",
  pool: "Pool",
  fridge: "Fridge",
  dishwasher: "Dishwasher",
  washingMachine: "Washing machine",
};

function toListing(o: UdOffer): ListingInput {
  const conv = new Set([...(o.convenience ?? []), ...(o.houseConvenience ?? [])]);
  const street = o.street?.title ?? null;
  const part = o.villagePart?.title ?? null;
  const params: Param[] = [];
  if (o.priceNote) params.push({ label: "Price note", value: o.priceNote });
  if (o.isNoCommission !== null) params.push({ label: "Agency commission", value: o.isNoCommission ? "No commission" : "Yes" });
  if (o.floorLevel !== null) params.push({ label: "Floor", value: String(o.floorLevel) });
  if (o.availableFrom) params.push({ label: "Available from", value: o.availableFrom });
  if (o.published) params.push({ label: "Published", value: o.published.slice(0, 10) });
  // "garden" is set on almost every UlovDomov offer, so it carries no information.
  const feats = [...conv].filter((c) => c !== "garden").map((c) => FEATURE_LABELS[c] ?? c);
  if (feats.length) params.push({ label: "Features", value: feats.join(", ") });

  return {
    source: "ulovdomov",
    sourceId: String(o.id),
    url: o.absoluteUrl,
    title: o.title,
    price: o.rentalPrice?.value ?? null,
    charges: o.monthlyFeesPrice?.value || null,
    deposit: o.depositPrice?.value || null,
    area: o.area || null,
    layout: layout(o.disposition, o.title),
    floor: o.floorLevel,
    neighbourhood: part,
    street,
    address: [street, ["Praha", part].filter(Boolean).join(" - ")].filter(Boolean).join(", "),
    lat: o.geoCoordinates?.lat ?? null,
    lng: o.geoCoordinates?.lng ?? null,
    description: o.description,
    balcony: conv.has("balcony"),
    loggia: conv.has("loggia"),
    terrace: conv.has("terrace"),
    cellar: conv.has("cellar"),
    lift: conv.has("lift"),
    parking: conv.has("parking"),
    garage: conv.has("garage"),
    availableFrom: o.availableFrom,
    contactCompany: "UlovDomov (contact via the original listing)",
    params,
    raw: o,
    photos: (o.photos ?? []).map((p) => ({ url: p.path, thumbUrl: p.path })),
    isDetail: true,
    listSig: [o.rentalPrice?.value, o.monthlyFeesPrice?.value, o.title, o.photos?.length ?? 0].join("|"),
  };
}

export const ulovdomov: SourceScraper = {
  source: "ulovdomov",
  pageSize: PAGE_SIZE,

  async fetchPage(page: number): Promise<PageResult> {
    const res = await fetchJson<{ success: boolean; data: { offers: UdOffer[] }; extraData: { total: number } }>(
      `${API}?page=${page + 1}&perPage=${PAGE_SIZE}&sorting=latest`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://www.ulovdomov.cz", Referer: "https://www.ulovdomov.cz/" },
        body: JSON.stringify({ offerType: "rent", propertyType: "flat", bounds: PRAGUE_BOUNDS }),
      },
    );
    if (!res.success) throw new Error("UlovDomov API returned success=false");
    const offers = res.data.offers;
    return {
      // Keep only Prague itself (the map box also covers nearby towns), and monthly rents.
      items: offers.filter((o) => o.village?.title === "Praha" && o.priceUnit !== "perDay").map(toListing),
      total: res.extraData.total,
      rawCount: offers.length,
    };
  },
};
