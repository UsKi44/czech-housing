"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Listing translation: <TranslateProvider texts={...}> collects every translatable text on the page,
 * <TranslateButton/> toggles English on/off, and <T text="..."/> shows a text in the chosen language.
 * "Always translate" is remembered in this browser.
 */

const PREF_KEY = "translate-always";

type Ctx = {
  on: boolean;
  loading: boolean;
  error: string | null;
  always: boolean;
  toggle: () => void;
  setAlways: (v: boolean) => void;
  get: (text: string) => string;
};

const TranslateContext = createContext<Ctx | null>(null);

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function TranslateProvider({ texts, children }: { texts: string[]; children: React.ReactNode }) {
  const [map, setMap] = useState<Map<string, string> | null>(null);
  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [always, setAlwaysState] = useState(false);

  const load = useCallback(async () => {
    if (map) return true;
    setLoading(true);
    setError(null);
    try {
      const unique = [...new Set(texts.filter(Boolean))];
      const res = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts: unique }) });
      const data = (await res.json()) as { english?: string[]; error?: string };
      if (!res.ok || !data.english) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMap(new Map(unique.map((t, i) => [t, data.english![i] ?? t])));
      return true;
    } catch (e) {
      setError(`Couldn't translate: ${e instanceof Error ? e.message : "unknown error"}. Check your internet connection and try again.`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [map, texts]);

  const toggle = useCallback(async () => {
    if (on) return setOn(false);
    if (await load()) setOn(true);
  }, [on, load]);

  const setAlways = useCallback(
    (v: boolean) => {
      setAlwaysState(v);
      try {
        localStorage.setItem(PREF_KEY, v ? "1" : "0");
      } catch {
        /* private mode: the setting just isn't remembered */
      }
      if (v && !on) void toggle();
    },
    [on, toggle],
  );

  // Apply the remembered "always translate" setting on page load.
  useEffect(() => {
    if (readPref()) {
      setAlwaysState(true);
      void load().then((ok) => ok && setOn(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const get = useCallback((text: string) => (on && map ? (map.get(text) ?? text) : text), [on, map]);

  return <TranslateContext.Provider value={{ on, loading, error, always, toggle, setAlways, get }}>{children}</TranslateContext.Provider>;
}

function useTranslate(): Ctx {
  const ctx = useContext(TranslateContext);
  if (!ctx) throw new Error("TranslateProvider missing");
  return ctx;
}

/** A piece of listing text, shown in English when translation is on. */
export function T({ text }: { text: string | null | undefined }) {
  const { get } = useTranslate();
  return <>{text ? get(text) : text}</>;
}

export function TranslateButton() {
  const { on, loading, error, always, toggle, setAlways } = useTranslate();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
      >
        {loading ? "Translating…" : on ? "🌐 Show original (Czech)" : "🌐 Translate to English"}
      </button>
      <label className="flex items-center gap-2 text-sm text-stone-500">
        <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
        Always translate listings
      </label>
      {on && <span className="text-xs text-stone-400">Machine translation (Google Translate)</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
