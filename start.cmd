@echo off
rem Double-click to start Prague Rentals: the website plus the background scraper.
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist .next\BUILD_ID call npm run build
start "" http://localhost:3000
npm start
