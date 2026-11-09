import { SOURCES, type ListingRow } from "./types";

export function czk(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n).toLocaleString("cs-CZ").replace(/ /g, " ")} CZK`;
}

export function layoutLabel(layout: string | null): string {
  if (!layout) return "Apartment";
  if (layout === "atypical") return "Atypical layout";
  if (layout === "room") return "Room";
  return layout;
}

export function listingTitle(l: Pick<ListingRow, "layout" | "area" | "neighbourhood" | "district">): string {
  const parts = [layoutLabel(l.layout)];
  if (l.area) parts.push(`${l.area} m²`);
  const where = l.neighbourhood ?? l.district;
  return where ? `${parts.join(", ")} · ${where}` : parts.join(", ");
}

export function sourceLabel(source: string): string {
  return SOURCES.find((s) => s.id === source)?.label ?? source;
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function pragueDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Prague", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function pragueDate(isoOrDate: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate) ? new Date(`${isoOrDate}T12:00:00Z`) : new Date(isoOrDate);
  return d.toLocaleDateString("en-GB", { timeZone: "Europe/Prague", day: "numeric", month: "short", year: "numeric" });
}
