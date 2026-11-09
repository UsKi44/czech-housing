import Link from "next/link";
import { notFound } from "next/navigation";
import { Gallery } from "@/components/Gallery";
import { czk, layoutLabel, listingTitle, pragueDate, pragueDateTime, sourceLabel, timeAgo } from "@/lib/format";
import { photoSrc } from "@/lib/queries";
import { getListing, getPhotos, getPriceHistory } from "@/lib/repo";
import type { Param } from "@/lib/types";

export const dynamic = "force-dynamic";

function yesNo(v: number | null): string | null {
  return v === null ? null : v ? "Yes" : "No";
}

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const l = getListing(id);
  if (!l) notFound();
  const photos = getPhotos(id).map((p) => ({ src: photoSrc(p), thumb: p.local_path ? photoSrc(p) : (p.thumb_url ?? p.url) }));
  const history = getPriceHistory(id);
  const params_: Param[] = l.params_json ? JSON.parse(l.params_json) : [];

  const facts: [string, string | null][] = [
    ["Rent", czk(l.price)],
    ["Monthly fees", l.charges ? czk(l.charges) : null],
    ["Rent + fees", l.charges && l.price ? czk(l.price + l.charges) : null],
    ["Deposit", l.deposit ? czk(l.deposit) : null],
    ["Agency fee", l.fee ? czk(l.fee) : null],
    ["Layout", l.layout ? layoutLabel(l.layout) : null],
    ["Size", l.area ? `${l.area} m²` : null],
    ["Price per m²", l.area && l.price ? `${Math.round(l.price / l.area)} CZK` : null],
    ["Floor", l.floor !== null ? `${l.floor}${l.total_floors ? ` of ${l.total_floors}` : ""}` : null],
    ["Available from", l.available_from ? pragueDate(l.available_from) : null],
    ["Furnished", l.furnished === "yes" ? "Yes" : l.furnished === "partly" ? "Partly" : l.furnished === "no" ? "No" : null],
    ["Energy rating", l.energy_rating],
    ["Building", l.building_type],
    ["Condition", l.condition],
    ["Balcony", yesNo(l.balcony)],
    ["Loggia", yesNo(l.loggia)],
    ["Terrace", yesNo(l.terrace)],
    ["Cellar", yesNo(l.cellar)],
    ["Lift", yesNo(l.lift)],
    ["Parking", yesNo(l.parking)],
    ["Garage", yesNo(l.garage)],
    ["Pets", yesNo(l.pets)],
    ["District", [l.district, l.neighbourhood].filter(Boolean).join(" · ") || null],
  ];

  const mapUrl = l.lat && l.lng ? `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}` : l.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address)}` : null;
  const osm = l.lat && l.lng ? `https://www.openstreetmap.org/export/embed.html?bbox=${l.lng - 0.008},${l.lat - 0.004},${l.lng + 0.008},${l.lat + 0.004}&layer=mapnik&marker=${l.lat},${l.lng}` : null;

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-stone-500 hover:underline">
        ← Back to listings
      </Link>

      {l.removed_at && (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          This listing disappeared from {sourceLabel(l.source)} {timeAgo(l.removed_at)} — it was probably rented out or taken down.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Gallery photos={photos} />

          <section>
            <h2 className="mb-2 text-lg font-semibold">Description</h2>
            {l.description ? (
              <p className="whitespace-pre-line leading-relaxed text-stone-700 dark:text-stone-300">{l.description}</p>
            ) : (
              <p className="text-sm text-stone-500">{l.detail_fetched_at ? "No description." : "Full details are still being downloaded — check back in a few minutes."}</p>
            )}
          </section>

          {params_.length > 0 && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">All parameters from {sourceLabel(l.source)}</h2>
              <dl className="grid gap-x-6 sm:grid-cols-2">
                {params_.map((p, i) => (
                  <div key={i} className="flex justify-between gap-4 border-b border-stone-200 py-1.5 text-sm dark:border-stone-800">
                    <dt className="text-stone-500">{p.label}</dt>
                    <dd className="text-right">{p.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {osm && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Location</h2>
              <iframe src={osm} title="Map" className="h-72 w-full rounded-xl border border-stone-200 dark:border-stone-800" loading="lazy" />
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
            <h1 className="text-xl font-semibold">{listingTitle(l)}</h1>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{l.address}</p>
            {l.title && <p className="mt-1 text-xs text-stone-400">{l.title}</p>}
            <div className="mt-3 text-3xl font-bold">{czk(l.price)}</div>
            {l.charges ? <div className="text-sm text-stone-500">+ {czk(l.charges)} monthly fees</div> : null}
            <div className="mt-4 flex flex-col gap-2">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="rounded-md bg-stone-900 px-3 py-2 text-center font-medium text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900">
                Open on {sourceLabel(l.source)} ↗
              </a>
              {mapUrl && (
                <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-stone-300 px-3 py-2 text-center text-sm dark:border-stone-700">
                  Open in Google Maps ↗
                </a>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
            <h2 className="mb-2 font-semibold">Key facts</h2>
            <dl className="text-sm">
              {facts
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-stone-100 py-1.5 last:border-0 dark:border-stone-800">
                    <dt className="text-stone-500">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
            </dl>
          </div>

          {(l.contact_name || l.contact_phone || l.contact_email || l.contact_company) && (
            <div className="rounded-xl border border-stone-200 bg-white p-5 text-sm dark:border-stone-800 dark:bg-stone-900">
              <h2 className="mb-2 font-semibold">Contact</h2>
              {l.contact_name && <div className="font-medium">{l.contact_name}</div>}
              {l.contact_company && <div className="text-stone-500">{l.contact_company}</div>}
              {l.contact_phone &&
                l.contact_phone.split(", ").map((ph) => (
                  <a key={ph} href={`tel:${ph}`} className="block hover:underline">
                    📞 {ph}
                  </a>
                ))}
              {l.contact_email && (
                <a href={`mailto:${l.contact_email}`} className="block break-all hover:underline">
                  ✉️ {l.contact_email}
                </a>
              )}
              {l.source === "bezrealitky" && <p className="mt-2 text-xs text-stone-500">Bezrealitky hides owner contacts — message them through the original listing.</p>}
            </div>
          )}

          <div className="rounded-xl border border-stone-200 bg-white p-5 text-sm dark:border-stone-800 dark:bg-stone-900">
            <h2 className="mb-2 font-semibold">History</h2>
            <ul className="space-y-1">
              <li>First seen {pragueDateTime(l.first_seen)}</li>
              {history.slice(1).map((h, i) => (
                <li key={i}>
                  {pragueDateTime(h.seen_at)}: price changed {czk(history[i].price)} → <b>{czk(h.price)}</b>
                </li>
              ))}
              <li className="text-stone-500">Last checked {timeAgo(l.last_seen)}</li>
              {l.removed_at && <li className="text-red-600">Removed {pragueDateTime(l.removed_at)}</li>}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
