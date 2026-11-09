import { parse, type HTMLElement } from "node-html-parser";
import type { ListingInput, Param } from "../lib/types";
import { HttpError, politeFetch } from "./http";
import { layoutFromText } from "./layout";
import type { PageResult, SourceScraper } from "./types";

/**
 * iDNES Reality (reality.idnes.cz) — server-rendered HTML, 25 listings per page, newest first.
 * Paging uses ?page=N without a sort parameter, which the site's robots.txt allows.
 */

const BASE = "https://reality.idnes.cz";
const LIST = `${BASE}/s/pronajem/byty/praha/`;
const PAGE_SIZE = 25;

async function fetchHtml(url: string): Promise<{ status: number; url: string; html: string }> {
  const res = await politeFetch(url, { headers: { Accept: "text/html" } });
  return { status: res.status, url: res.url, html: await res.text() };
}

function text(el: HTMLElement | null | undefined): string {
  return (el?.text ?? "").replace(/[‍ ]/g, " ").replace(/\s+/g, " ").trim();
}

function money(s: string): number | null {
  const digits = s.replace(/[‍\s.]/g, "").match(/\d+/);
  return digits ? Number(digits[0]) : null;
}

/** "Oddechová, Praha 5 - Lipence" → street, district (only Praha 1–10), neighbourhood. */
export function parsePlace(info: string): { street: string | null; district: string | null; neighbourhood: string | null } {
  const parts = info.split(",").map((p) => p.trim()).filter(Boolean);
  const last = parts.pop() ?? "";
  const m = last.match(/^Praha(?:\s+(\d{1,2}))?(?:\s*-\s*(.+))?$/);
  if (!m) return { street: parts[0] ?? null, district: null, neighbourhood: last || null };
  const n = m[1] ? Number(m[1]) : null;
  return { street: parts[0] ?? null, district: n && n <= 10 ? `Praha ${n}` : null, neighbourhood: m[2]?.trim() || null };
}

function idFromUrl(url: string): string | null {
  return url.match(/\/([0-9a-f]{24})\/?(?:[?#]|$)/)?.[1] ?? null;
}

function parseList(html: string): PageResult {
  const root = parse(html);
  const total = money(root.querySelector(".b-filter__info, .b-results__title, h1")?.text.match(/([\d\s ‍]+)\s*inzer/)?.[1] ?? "") ??
    money(html.match(/([\d\s ]+)\s*inzerát/)?.[1] ?? "0") ?? 0;
  const items: ListingInput[] = [];
  let rawCount = 0;
  for (const item of root.querySelectorAll(".c-products__item")) {
    if (item.classList.contains("c-products__item-advertisment")) continue;
    const link = item.querySelector("a.c-products__link");
    const href = link?.getAttribute("href");
    const id = href ? idFromUrl(href) : null;
    if (!href || !id) continue;
    rawCount++;
    const title = text(item.querySelector(".c-products__title"));
    const info = text(item.querySelector(".c-products__info"));
    const priceText = text(item.querySelector(".c-products__price"));
    const place = parsePlace(info);
    const img = item.querySelector("img")?.getAttribute("data-src") ?? item.querySelector("img")?.getAttribute("src");
    const area = title.match(/(\d+)\s*m²/)?.[1];
    const fullTitle = title.charAt(0).toUpperCase() + title.slice(1);
    items.push({
      source: "idnes",
      sourceId: id,
      url: href.startsWith("http") ? href : BASE + href,
      title: fullTitle,
      price: /kč/i.test(priceText) ? money(priceText) : null,
      area: area ? Number(area) : null,
      layout: layoutFromText(title) ?? (/atyp/i.test(title) ? "atypical" : /pokoj/i.test(title) ? "room" : null),
      district: place.district ?? undefined,
      neighbourhood: place.neighbourhood ?? undefined,
      street: place.street ?? undefined,
      address: info,
      contactCompany: link?.getAttribute("data-brand") || undefined,
      photos: img && !img.includes("no-image") ? [{ url: img, thumbUrl: img }] : undefined,
      listSig: [title, priceText, info].join("|"),
    });
  }
  return { items, total, rawCount };
}

const LABELS: Record<string, string> = {
  "Číslo zakázky": "Listing code",
  Cena: "Price",
  "Poznámka k ceně": "Price note",
  "Náklady na bydlení": "Monthly costs",
  "Poplatky za služby": "Service fees",
  Kauce: "Deposit",
  "Vratná kauce": "Deposit",
  Provize: "Agency commission",
  "Konstrukce budovy": "Building type",
  "Stav bytu": "Condition",
  "Stav budovy": "Building condition",
  Vlastnictví: "Ownership",
  "Lokalita objektu": "Location type",
  "Užitná plocha": "Usable area",
  "Podlahová plocha": "Floor area",
  Podlaží: "Floor",
  "Počet podlaží budovy": "Floors in building",
  Balkon: "Balcony",
  Lodžie: "Loggia",
  Terasa: "Terrace",
  Sklep: "Cellar",
  Výtah: "Lift",
  Parkování: "Parking",
  Elektřina: "Electricity",
  Topení: "Heating",
  Vybavení: "Furnished",
  "Datum nastěhování": "Available from",
  PENB: "Energy rating (PENB)",
  "Domácí zvířata": "Pets",
  "Bezbariérový přístup": "Barrier-free access",
  "Rok výstavby": "Year built",
  "Rok rekonstrukce": "Reconstruction year",
};

function czDate(s: string): string | null {
  const m = s.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : /ihned|okamžitě/i.test(s) ? "immediately" : null;
}

export function parseDetail(id: string, html: string): ListingInput {
  const root = parse(html);
  const rows = new Map<string, string>();
  const params: Param[] = [];
  for (const dt of root.querySelectorAll("dt")) {
    const label = text(dt);
    const dd = dt.nextElementSibling;
    if (!label || !dd || dd.tagName !== "DD" || label.startsWith("Spočítej")) continue;
    // Feature rows (lift, loggia, …) have an empty value with a check icon.
    const value = text(dd).replace(/(\d)\s*m ?2\b/g, "$1 m²") || "Yes";
    rows.set(label, value);
    params.push({ label: LABELS[label] ?? label, value });
  }

  const get = (k: string) => rows.get(k) ?? null;
  const has = (k: string) => (rows.has(k) ? !/^ne\b/i.test(rows.get(k)!) : null);
  const furnishedText = get("Vybavení") ?? "";
  const furnished = /částečně/i.test(furnishedText) ? "partly" : /nezařízen|nevybaven/i.test(furnishedText) ? "no" : /zařízen|vybaven/i.test(furnishedText) ? "yes" : null;
  const parking = get("Parkování");

  const desc = root.querySelector(".b-desc");
  desc?.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  const description = desc?.structuredText.replace(/\n{3,}/g, "\n\n").trim() || null;

  const photos = root
    .querySelectorAll('a.carousel__item[data-fancybox="images"]')
    .map((a) => {
      const img = a.querySelector("img");
      const url = a.getAttribute("href");
      const thumb = img?.getAttribute("data-lazy") ?? img?.getAttribute("src");
      return url ? { url, thumbUrl: thumb && !thumb.includes("no-image") ? thumb : url } : null;
    })
    .filter((p): p is { url: string; thumbUrl: string } => p !== null);

  const gps = html.match(new RegExp(`"coordinates"\\s*:\\s*\\[\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*\\]\\s*}\\s*,\\s*"properties"\\s*:\\s*{\\s*"id"\\s*:\\s*"${id}"`));
  const author = root.querySelector(".b-author");
  const phones = [...new Set((author?.querySelectorAll('a[href^="tel:"]') ?? []).map((a) => a.getAttribute("href")!.slice(4)))];
  const emails = [...new Set((author?.querySelectorAll('a[href^="mailto:"]') ?? []).map((a) => decodeURIComponent(a.getAttribute("href")!.slice(7).split("?")[0])))];
  const floor = get("Podlaží")?.match(/-?\d+/)?.[0];
  const totalFloors = get("Počet podlaží budovy")?.match(/\d+/)?.[0];
  const energy = get("PENB")?.match(/^[A-G]\b/)?.[0] ?? null;
  const area = (get("Užitná plocha") ?? get("Podlahová plocha"))?.match(/\d+/)?.[0];
  const deposit = get("Vratná kauce") ?? get("Kauce");
  const fees = get("Poplatky za služby") ?? get("Náklady na bydlení");

  return {
    source: "idnes",
    sourceId: id,
    area: area ? Number(area) : undefined,
    floor: floor !== undefined ? Number(floor) : null,
    totalFloors: totalFloors ? Number(totalFloors) : null,
    deposit: deposit ? money(deposit) : null,
    charges: fees ? money(fees) : null,
    lat: gps ? Number(gps[2]) : undefined,
    lng: gps ? Number(gps[1]) : undefined,
    description,
    energyRating: energy,
    furnished,
    buildingType: get("Konstrukce budovy"),
    condition: get("Stav bytu") ?? get("Stav budovy"),
    balcony: has("Balkon"),
    loggia: has("Lodžie"),
    terrace: has("Terasa"),
    cellar: has("Sklep"),
    lift: has("Výtah"),
    parking: parking ? !/^ne\b/i.test(parking) : null,
    garage: parking ? /garáž/i.test(parking) : null,
    pets: rows.has("Domácí zvířata") ? !/^ne|zakázán/i.test(get("Domácí zvířata")!) : null,
    availableFrom: czDate(get("Datum nastěhování") ?? ""),
    contactName: text(author?.querySelector(".b-author__title")) || null,
    contactPhone: phones.join(", ") || null,
    contactEmail: emails.join(", ") || null,
    params,
    raw: { params: Object.fromEntries(rows) },
    photos,
    isDetail: true,
  };
}

export const idnes: SourceScraper = {
  source: "idnes",
  pageSize: PAGE_SIZE,

  async fetchPage(page: number): Promise<PageResult> {
    const { status, html } = await fetchHtml(page === 0 ? LIST : `${LIST}?page=${page}`);
    if (status !== 200) throw new HttpError(LIST, status);
    return parseList(html);
  },

  async fetchDetail(sourceId: string): Promise<ListingInput | null> {
    const { getDb } = await import("../lib/db");
    const row = getDb().prepare("SELECT url FROM listings WHERE source = 'idnes' AND source_id = ?").get(sourceId) as { url: string } | undefined;
    if (!row) return null;
    const { status, url, html } = await fetchHtml(row.url);
    // Removed listings answer 404/410 or redirect back to a search page.
    if (status === 404 || status === 410 || !url.includes(sourceId)) return null;
    if (status !== 200) throw new HttpError(row.url, status);
    return parseDetail(sourceId, html);
  },
};
