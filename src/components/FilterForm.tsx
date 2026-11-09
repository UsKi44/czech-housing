import { FEATURES, SORTS, type Filters } from "@/lib/filters";
import { LAYOUTS, SOURCES } from "@/lib/types";
import { layoutLabel } from "@/lib/format";

/** Plain GET form: filters live in the URL, so every search can be bookmarked or saved as an alert. */
export function FilterForm({
  f,
  districts,
  neighbourhoods,
}: {
  f: Filters;
  districts: { name: string; n: number }[];
  neighbourhoods: { name: string; n: number }[];
}) {
  const districtNames = new Set(districts.map((d) => d.name));
  const selectedNeighbourhood = f.districts.find((d) => !districtNames.has(d)) ?? "";
  return (
    <form method="get" action="/" className="space-y-5 text-sm">
      <Section title="Search">
        <input type="search" name="q" defaultValue={f.q} placeholder="Street, area, word in description…" className="w-full" />
      </Section>

      <Section title="Monthly price (CZK)">
        <div className="flex items-center gap-2">
          <input type="number" name="priceMin" defaultValue={f.priceMin} placeholder="from" min={0} step={1000} className="w-full" />
          <span>–</span>
          <input type="number" name="priceMax" defaultValue={f.priceMax} placeholder="to" min={0} step={1000} className="w-full" />
        </div>
        <label className="mt-2 flex items-center gap-2">
          <input type="checkbox" name="withCharges" value="1" defaultChecked={f.withCharges} />
          Include monthly fees when known
        </label>
      </Section>

      <Section title="Size (m²)">
        <div className="flex items-center gap-2">
          <input type="number" name="areaMin" defaultValue={f.areaMin} placeholder="from" min={0} className="w-full" />
          <span>–</span>
          <input type="number" name="areaMax" defaultValue={f.areaMax} placeholder="to" min={0} className="w-full" />
        </div>
      </Section>

      <Section title="Layout">
        <div className="grid grid-cols-3 gap-1">
          {LAYOUTS.map((l) => (
            <Chip key={l} name="layout" value={l} checked={f.layouts.includes(l)} label={layoutLabel(l)} />
          ))}
        </div>
      </Section>

      <Section title="District">
        <div className="grid grid-cols-2 gap-1">
          {districts.map((d) => (
            <Chip key={d.name} name="district" value={d.name} checked={f.districts.includes(d.name)} label={`${d.name}`} hint={d.n} />
          ))}
        </div>
        <select name="district" defaultValue={selectedNeighbourhood} className="mt-2 w-full">
          <option value="">Any neighbourhood</option>
          {neighbourhoods.map((n) => (
            <option key={n.name} value={n.name}>
              {n.name} ({n.n})
            </option>
          ))}
        </select>
      </Section>

      <Section title="Furnished">
        <select name="furnished" defaultValue={f.furnished ?? ""} className="w-full">
          <option value="">Doesn&apos;t matter</option>
          <option value="any">Furnished or partly</option>
          <option value="yes">Fully furnished</option>
          <option value="partly">Partly furnished</option>
          <option value="no">Unfurnished</option>
        </select>
      </Section>

      <Section title="Must have">
        <div className="space-y-1">
          {FEATURES.map((ft) => (
            <label key={ft.id} className="flex items-center gap-2">
              <input type="checkbox" name="feature" value={ft.id} defaultChecked={f.features.includes(ft.id)} />
              {ft.label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-stone-500">Listings that don&apos;t state a feature are hidden by these filters.</p>
      </Section>

      <Section title="Source">
        <div className="flex gap-1">
          {SOURCES.map((s) => (
            <Chip key={s.id} name="source" value={s.id} checked={f.sources.includes(s.id)} label={s.label} />
          ))}
        </div>
      </Section>

      <Section title="Sort">
        <select name="sort" defaultValue={f.sort} className="w-full">
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="mt-2 flex items-center gap-2">
          <input type="checkbox" name="showRemoved" value="1" defaultChecked={f.showRemoved} />
          Also show removed listings
        </label>
      </Section>

      <div className="flex gap-2">
        <button type="submit" className="flex-1 rounded-md bg-stone-900 px-3 py-2 font-medium text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900">
          Apply filters
        </button>
        <a href="/" className="rounded-md border border-stone-300 px-3 py-2 dark:border-stone-700">
          Reset
        </a>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{title}</legend>
      {children}
    </fieldset>
  );
}

function Chip({ name, value, checked, label, hint }: { name: string; value: string; checked: boolean; label: string; hint?: number }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-1 rounded-md border border-stone-300 px-2 py-1 has-[:checked]:border-stone-900 has-[:checked]:bg-stone-900 has-[:checked]:text-white dark:border-stone-700 dark:has-[:checked]:border-stone-100 dark:has-[:checked]:bg-stone-100 dark:has-[:checked]:text-stone-900">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="sr-only" />
      <span className="truncate">{label}</span>
      {hint !== undefined && <span className="text-xs opacity-60">{hint}</span>}
    </label>
  );
}
