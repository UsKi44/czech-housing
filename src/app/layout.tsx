import type { Metadata } from "next";
import Link from "next/link";
import { syncStatus } from "@/lib/queries";
import { timeAgo } from "@/lib/format";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prague Rentals",
  description: "Private overview of Prague apartment rentals from Sreality and Bezrealitky",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const s = syncStatus();
  const total = s.active.reduce((a, b) => a + b.n, 0);
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              🏠 Prague Rentals
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/" className="hover:underline">
                Listings
              </Link>
              <Link href="/alerts" className="hover:underline">
                Alerts
              </Link>
            </nav>
            <div className="ml-auto text-xs text-stone-500 dark:text-stone-400">
              {total.toLocaleString("en")} active · {s.newToday} new in 24 h · updated {timeAgo(s.lastCycleAt)}
              {s.lastErrors.length > 0 && <span className="ml-2 text-amber-600">⚠ {s.lastErrors.map((e) => e.source).join(", ")} had a problem</span>}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
