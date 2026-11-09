import Link from "next/link";
import type { ListingCardRow } from "@/lib/queries";
import { czk, listingTitle, sourceLabel, timeAgo } from "@/lib/format";

/** `back` is the query string of the current search, so "Back to listings" returns to the same filters and page. */
export function ListingCard({ l, back }: { l: ListingCardRow; back: string }) {
  const priceDrop = l.prev_price && l.price && l.price < l.prev_price ? l.prev_price - l.price : 0;
  const tags = [
    l.furnished === "yes" ? "Furnished" : l.furnished === "partly" ? "Partly furnished" : l.furnished === "no" ? "Unfurnished" : null,
    l.balcony || l.loggia || l.terrace ? "Balcony" : null,
    l.lift ? "Lift" : null,
    l.parking || l.garage ? "Parking" : null,
    l.pets ? "Pets OK" : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/listing/${encodeURIComponent(l.id)}${back ? `?back=${encodeURIComponent(back)}` : ""}`}
      className={`group overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md dark:border-stone-800 dark:bg-stone-900 ${l.removed_at ? "opacity-60" : ""}`}
    >
      <div className="relative aspect-[4/3] bg-stone-200 dark:bg-stone-800">
        {l.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.cover} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-stone-500">No photo</div>
        )}
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">{sourceLabel(l.source)}</span>
        {l.photo_count > 1 && <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">📷 {l.photo_count}</span>}
        {l.removed_at && <span className="absolute right-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-xs text-white">Removed</span>}
        {!l.removed_at && Date.now() - Date.parse(l.first_seen) < 86400_000 && (
          <span className="absolute right-2 top-2 rounded bg-emerald-600 px-1.5 py-0.5 text-xs text-white">New</span>
        )}
      </div>
      <div className="space-y-1 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-semibold">{czk(l.price)}</span>
          {l.area && l.price ? <span className="text-xs text-stone-500">{Math.round(l.price / l.area)} CZK/m²</span> : null}
        </div>
        {(l.charges || priceDrop > 0) && (
          <div className="text-xs">
            {l.charges ? <span className="text-stone-500">+ {czk(l.charges)} fees</span> : null}
            {priceDrop > 0 && <span className="ml-2 font-medium text-emerald-600">↓ {czk(priceDrop)}</span>}
          </div>
        )}
        <div className="font-medium">{listingTitle(l)}</div>
        <div className="truncate text-sm text-stone-500 dark:text-stone-400">{l.address}</div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {tags.map((t) => (
              <span key={t} className="rounded bg-stone-100 px-1.5 py-0.5 text-xs dark:bg-stone-800">
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-1 pt-1 text-xs text-stone-400">
          <span>Seen {timeAgo(l.first_seen)}</span>
          {l.also_on && <span title="The same flat is also listed on these sites">Also on {[...new Set(l.also_on.split(","))].map(sourceLabel).join(", ")}</span>}
        </div>
      </div>
    </Link>
  );
}
