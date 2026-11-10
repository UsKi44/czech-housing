import Link from "next/link";
import { FilterForm } from "@/components/FilterForm";
import { ListingCard } from "@/components/ListingCard";
import { describeFilters, parseFilters, toQuery } from "@/lib/filters";
import { districtOptions, PAGE_SIZE, searchListings } from "@/lib/queries";
import { createAlert } from "./alerts/actions";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseFilters(await searchParams);
  const { rows, total } = searchListings(f);
  const { districts, neighbourhoods } = districtOptions();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const query = toQuery(f);
  const back = toQuery(f, {}, { withPage: true });

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-2">
        <details className="lg:hidden" open={false}>
          <summary className="cursor-pointer rounded-md border border-stone-300 px-3 py-2 text-sm font-medium dark:border-stone-700">Filters</summary>
          <div className="pt-4">
            <FilterForm f={f} districts={districts} neighbourhoods={neighbourhoods} />
          </div>
        </details>
        <div className="hidden lg:block">
          <FilterForm f={f} districts={districts} neighbourhoods={neighbourhoods} />
        </div>
      </aside>

      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{total.toLocaleString("en")} apartments for rent</h1>
            <p className="text-sm text-stone-500 dark:text-stone-400">{describeFilters(f)}</p>
          </div>
          <form action={createAlert} className="flex items-center gap-2">
            <input type="hidden" name="query" value={query} />
            <input type="hidden" name="name" value={describeFilters(f)} />
            <button type="submit" className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800">
              🔔 Alert me about new ones
            </button>
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-stone-500 dark:border-stone-700">
            {total === 0 && !query ? "No listings yet — the scraper is still doing its first sync. Refresh in a minute." : "Nothing matches these filters."}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((l) => (
              <ListingCard key={l.id} l={l} back={back} />
            ))}
          </div>
        )}

        {pages > 1 && (
          <nav className="mt-6 flex items-center justify-center gap-2 text-sm">
            {f.page > 1 && <PageLink q={toQuery(f, { page: f.page - 1 }, { withPage: true })}>← Previous</PageLink>}
            <span className="px-2 text-stone-500">
              Page {f.page} of {pages}
            </span>
            {f.page < pages && <PageLink q={toQuery(f, { page: f.page + 1 }, { withPage: true })}>Next →</PageLink>}
          </nav>
        )}
      </section>
    </div>
  );
}

function PageLink({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <Link href={q ? `/?${q}` : "/"} className="rounded-md border border-stone-300 px-3 py-1.5 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800">
      {children}
    </Link>
  );
}
