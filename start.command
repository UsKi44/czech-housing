#!/bin/bash
# Double-click in Finder (macOS) to start Prague Rentals: the website plus the background scraper.
# Linux: run ./start.command from a terminal.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install it from https://nodejs.org (LTS version), then double-click this file again."
  read -r -p "Press Enter to close…"
  exit 1
fi

# Install / rebuild only when needed (first run, or after pulling new code).
if node scripts/needs-install.mjs; then npm install || exit 1; fi
if node scripts/needs-build.mjs; then npm run build || exit 1; fi

# Open the browser once the server is up.
( sleep 4; (command -v open >/dev/null && open http://localhost:3000) || xdg-open http://localhost:3000 ) >/dev/null 2>&1 &

npm start
