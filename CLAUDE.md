# CLAUDE.md

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Project notes

- Private Prague rental aggregator: Next.js 16 (App Router) website + a background scraper worker (`src/scraper/worker.ts`), sharing one SQLite DB via `node:sqlite` (`src/lib/db.ts`). See `README.md`.
- Next.js 16 differs from older versions (e.g. `params`/`searchParams` are Promises). Check `node_modules/next/dist/docs/` before changing Next-specific code.
- Scraping must stay polite: all source requests go through `politeFetch` in `src/scraper/http.ts` (serialised per host, ≥1.5 s apart, back off on 403/429). Don't add parallel requests to the same host.
- `data/` (database, photos) and `.env.local` (Telegram token) are private and gitignored — never commit them.
