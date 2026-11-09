# Prague Rentals

A private website that collects every apartment for rent in Prague from **Sreality.cz** and **Bezrealitky.cz** into one place, with all photos and details, filters, price history and Telegram alerts for new listings.

It runs on your own computer. Nothing is published, and there are no accounts or costs.

## Start it

Requires [Node.js](https://nodejs.org) 22.13 or newer (24 recommended).

**Windows:** double-click `start.cmd`. It installs and builds on first run, starts everything and opens <http://localhost:3000>.

**Or from a terminal:**

```sh
npm install
npm run build
npm start          # website on http://localhost:3000 + background scraper
```

Keep the window open: the scraper checks for new listings every 10 minutes while it runs. Closing it stops both.

The very first run downloads all ~4,800 listings within a couple of minutes. Full Sreality details (agent contact, energy rating, floor, …) and photos then fill in over the next few hours, newest listings first.

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
