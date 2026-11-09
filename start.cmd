@echo off
rem Double-click to start Prague Rentals: the website plus the background scraper.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org and try again. & pause & exit /b 1)
rem Install / rebuild only when needed (first run, or after pulling new code).
node scripts\needs-install.mjs && call npm install
node scripts\needs-build.mjs && call npm run build
start "" http://localhost:3000
npm start
