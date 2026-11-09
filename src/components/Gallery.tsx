"use client";

import { useCallback, useEffect, useState } from "react";

export function Gallery({ photos }: { photos: { src: string; thumb: string }[] }) {
  const [i, setI] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const n = photos.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (n === 0) {
    return <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-stone-200 text-stone-500 dark:bg-stone-800">No photos</div>;
  }

  const main = (
    <div className={fullscreen ? "fixed inset-0 z-50 flex items-center justify-center bg-black" : "relative aspect-[4/3] overflow-hidden rounded-xl bg-stone-900"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photos[i].src}
        alt={`Photo ${i + 1} of ${n}`}
        referrerPolicy="no-referrer"
        onClick={() => setFullscreen((f) => !f)}
        className={`cursor-zoom-in object-contain ${fullscreen ? "max-h-full max-w-full cursor-zoom-out" : "h-full w-full"}`}
      />
      {n > 1 && (
        <>
          <button onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-xl text-white hover:bg-black/70">
            ‹
          </button>
          <button onClick={() => go(1)} aria-label="Next photo" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-xl text-white hover:bg-black/70">
            ›
          </button>
        </>
      )}
      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {i + 1} / {n}
      </span>
      {fullscreen && (
        <button onClick={() => setFullscreen(false)} aria-label="Close" className="absolute right-4 top-4 rounded-full bg-black/50 px-3 py-1 text-white">
          ✕
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      {main}
      {n > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p, idx) => (
            <button key={idx} onClick={() => setI(idx)} className={`h-16 w-20 flex-none overflow-hidden rounded-md border-2 ${idx === i ? "border-stone-900 dark:border-white" : "border-transparent opacity-70 hover:opacity-100"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
