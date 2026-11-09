# Prague Rentals

A private website that collects every apartment for rent in Prague from **Sreality.cz**, **Bezrealitky.cz**, **iDNES Reality** and **UlovDomov.cz** into one place, with all photos and details, filters, price history and Telegram alerts for new listings. A flat posted on several sites is shown once, with links to every copy.

It runs on your own computer. Nothing is published, and there are no accounts or costs.

## Start it

Requires [Node.js](https://nodejs.org) 22.13 or newer (the LTS version is fine).

**Windows:** double-click `start.cmd`.

**Mac:**
1. Install Node.js from <https://nodejs.org> (LTS, the macOS installer).
2. Get the code: `git clone https://github.com/UsKi44/czech-housing.git` (or download the ZIP from GitHub and unzip it).
3. Double-click `start.command` in Finder. The first time, macOS may block it: right-click → **Open** → **Open**. (If it says "permission denied", run `chmod +x start.command` once in Terminal.)

Both launchers install and build on first run (and again automatically after you pull code changes), start everything and open <http://localhost:3000>.

Each computer keeps its own database and photos in `data/`; a new computer starts with a fresh sync (a few minutes for the listings).

**Or from a terminal (any OS):**

```sh
npm install
npm run build
npm start          # website on http://localhost:3000 + background scraper
```

Keep the window open: the scraper checks for new listings every 10 minutes while it runs. Closing it stops both.

The very first run downloads all listings (~8,000 across the four sites) within about 10 minutes. Full details for Sreality and iDNES (agent contact, energy rating, floor, …) and photos then fill in over the next hours, newest listings first.

## How often it updates

Only while the app is running (window open, computer awake):

- **Every 10 minutes:** a quick check of the newest listings on each site. A new flat shows up on the site, and in Telegram if it matches an alert, within about 10 minutes of being posted.
- **Every 2 hours:** a full pass over every listing on every site, which catches price changes and listings that were taken down.
- **In between:** detail pages and photos download in the background.

When the app is closed nothing updates; the next start catches up automatically. To have it update around the clock, leave it running on a computer that stays on.

## Translating listings

Every listing page has a **🌐 Translate to English** button: it translates the description, title and all Czech parameters in place (click again for the original). Tick **Always translate listings** to have every listing open in English. Translations come from Google Translate (no account needed) and are cached in the database, so each text is translated only once. Only public listing text is sent, never contact details.

## Telegram alerts (optional, ~2 minutes)

1. In Telegram, open **@BotFather**, send `/newbot` and follow the steps. It gives you a token.
2. Copy `.env.example` to `.env.local` and paste the token after `TELEGRAM_BOT_TOKEN=`.
3. Open your new bot in Telegram and send it any message.
4. Run `npm run telegram:setup`. It finds your chat id, saves it and sends a test message.
5. Restart the app.

Then set filters on the listings page and click **🔔 Alert me about new ones**. Manage alerts on the **Alerts** page.

## How it works

| Part | What it does |
|---|---|
| `src/scraper/worker.ts` | Background loop: quick check for new listings every 10 min, full sweep every 2 h (price changes, removals), detail pages, photos, alerts |
| `src/scraper/sreality.ts` | Reads the JSON API that sreality.cz's own website uses |
| `src/scraper/bezrealitky.ts` | Reads the GraphQL API that bezrealitky.cz's own website uses |
| `src/scraper/idnes.ts` | Reads reality.idnes.cz search and detail pages (HTML) |
| `src/scraper/ulovdomov.ts` | Reads the JSON API that ulovdomov.cz's own website uses |
| `src/lib/dedupe.ts` | Groups the same flat posted on several sites (same layout, size ±1 m², rent ±3 %, within 300 m) |
| `src/scraper/http.ts` | Polite requests: one at a time per site, 1.5 s+ apart; pauses a site for an hour if it signals rate-limiting |
| `src/scraper/photos.ts` | Downloads and compresses photos into `data/photos` (10 GB cap); deletes them 60 days after a listing disappears |
| `src/app/` | Next.js website: listings with filters, listing detail, alerts |
| `data/` | SQLite database and photos. Not in git |

A listing is marked **removed** when it is missing from two full sweeps in a row, or when its detail page returns "not found".

## Settings (`.env.local`)

| Variable | Default | Meaning |
|---|---|---|
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | – | Telegram alerts |
| `PHOTO_LIMIT_GB` | `10` | Max disk space for photos. When full, photos are shown from the source sites instead |
| `SCRAPE_INTERVAL_MIN` | `10` | Minutes between checks (minimum 5) |

## Commands

| Command | |
|---|---|
| `npm start` | Website + scraper (after `npm run build`) |
| `npm run dev` | Same, with live reload while changing code |
| `npm run scrape:once` | Run one scraper cycle and exit |
| `npm run telegram:setup` | Connect Telegram |
| `npm run typecheck` | Type-check |

The website only listens on `127.0.0.1`, so it is reachable from this computer only.
