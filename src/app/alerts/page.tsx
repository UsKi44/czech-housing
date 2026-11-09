import Link from "next/link";
import { getDb } from "@/lib/db";
import { buildWhere, parseFilters } from "@/lib/filters";
import { pragueDateTime } from "@/lib/format";
import { telegramConfigured } from "@/lib/telegram";
import { deleteAlert, renameAlert, testTelegram } from "./actions";

export const dynamic = "force-dynamic";

export default async function AlertsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = getDb();
  const alerts = db.prepare("SELECT id, name, query, created_at FROM alerts ORDER BY id DESC").all() as {
    id: number;
    name: string;
    query: string;
    created_at: string;
  }[];
  const configured = telegramConfigured();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Alerts</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          When a new listing matches one of these searches, you get a Telegram message. To add one, set filters on the{" "}
          <Link href="/" className="underline">
            listings page
          </Link>{" "}
          and click “Alert me about new ones”.
        </p>
      </div>

      {sp.saved && <Notice tone="ok">Alert saved.</Notice>}
      {sp.test === "ok" && <Notice tone="ok">Test message sent — check Telegram.</Notice>}
      {sp.test && sp.test !== "ok" && <Notice tone="warn">Telegram test failed: {sp.test}</Notice>}

      <section className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="font-semibold">Telegram</h2>
        {configured ? (
          <div className="mt-2 flex items-center justify-between gap-4 text-sm">
            <span className="text-emerald-600">✓ Connected</span>
            <form action={testTelegram}>
              <button className="rounded-md border border-stone-300 px-3 py-1.5 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800">Send test message</button>
            </form>
          </div>
        ) : (
          <div className="mt-2 space-y-2 text-sm">
            <p className="text-amber-600">Not set up yet — alerts are saved but no messages are sent. It takes about 2 minutes:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                In Telegram, open <b>@BotFather</b>, send <code>/newbot</code> and follow the steps. It gives you a token.
              </li>
              <li>
                Copy <code>.env.example</code> to <code>.env.local</code> in the project folder and paste the token after <code>TELEGRAM_BOT_TOKEN=</code>.
              </li>
              <li>Open your new bot in Telegram and send it any message (e.g. “hi”).</li>
              <li>
                Run <code>npm run telegram:setup</code> — it finds your chat id and saves it.
              </li>
              <li>Restart the app.</li>
            </ol>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Saved searches ({alerts.length})</h2>
        {alerts.length === 0 && <p className="text-sm text-stone-500">No alerts yet.</p>}
        {alerts.map((a) => {
          const f = parseFilters(new URLSearchParams(a.query));
          const { where, params } = buildWhere(f);
          const matching = (db.prepare(`SELECT COUNT(*) AS n FROM listings l WHERE ${where}`).get(...params) as { n: number }).n;
          const sent = (db.prepare("SELECT COUNT(*) AS n FROM sent_alerts WHERE alert_id = ?").get(a.id) as { n: number }).n;
          return (
            <div key={a.id} className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
              <form action={renameAlert} className="flex gap-2">
                <input type="hidden" name="id" value={a.id} />
                <input type="text" name="name" defaultValue={a.name} className="flex-1 font-medium" aria-label="Alert name" />
                <button className="rounded-md border border-stone-300 px-2 text-sm dark:border-stone-700">Rename</button>
              </form>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
                <span>{matching} matching right now</span>
                <span>{sent} alerts sent</span>
                <span>since {pragueDateTime(a.created_at)}</span>
                <Link href={a.query ? `/?${a.query}` : "/"} className="underline">
                  Show listings
                </Link>
                <form action={deleteAlert} className="ml-auto">
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-red-600 hover:underline">Delete</button>
                </form>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Notice({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <div className={`rounded-md px-4 py-2 text-sm ${tone === "ok" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>
      {children}
    </div>
  );
}
