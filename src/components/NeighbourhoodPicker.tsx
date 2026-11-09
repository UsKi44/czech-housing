"use client";

import { useMemo, useState } from "react";

/** Searchable multi-select of neighbourhoods. Submits each ticked one as a `district` value of the surrounding GET form. */
export function NeighbourhoodPicker({ options, selected }: { options: { name: string; n: number }[]; selected: string[] }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selected));

  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visible = useMemo(() => {
    const q = fold(query.trim());
    const list = q ? options.filter((o) => fold(o.name).includes(q)) : options;
    // Ticked neighbourhoods stay on top so you can see what is selected.
    return [...list].sort((a, b) => Number(picked.has(b.name)) - Number(picked.has(a.name)));
  }, [options, query, picked]);

  const toggle = (name: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between text-xs text-stone-500">
        <span>Neighbourhoods{picked.size ? ` · ${picked.size} selected` : ""}</span>
        {picked.size > 0 && (
          <button type="button" onClick={() => setPicked(new Set())} className="hover:underline">
            Clear
          </button>
        )}
      </div>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a neighbourhood…" className="w-full" aria-label="Find a neighbourhood" />
      <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-stone-200 p-1 dark:border-stone-800">
        {visible.length === 0 && <div className="px-1 py-1 text-xs text-stone-500">No match</div>}
        {visible.map((o) => (
          <label key={o.name} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-stone-100 dark:hover:bg-stone-800">
            <input type="checkbox" checked={picked.has(o.name)} onChange={() => toggle(o.name)} />
            <span className="flex-1 truncate">{o.name}</span>
            <span className="text-xs text-stone-400">{o.n}</span>
          </label>
        ))}
      </div>
      {/* Hidden inputs carry the selection, including ticked items currently filtered out of view. */}
      {[...picked].map((name) => (
        <input key={name} type="hidden" name="district" value={name} />
      ))}
    </div>
  );
}
