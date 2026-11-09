// Exit code 0 when the app must be (re)built: no build yet, or code changed since the last build (e.g. after `git pull`).
import fs from "node:fs";
import path from "node:path";

const BUILD_ID = ".next/BUILD_ID";
if (!fs.existsSync(BUILD_ID)) process.exit(0);
const built = fs.statSync(BUILD_ID).mtimeMs;

function changed(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) return fs.readdirSync(p).some((f) => changed(path.join(p, f)));
  return st.mtimeMs > built;
}

process.exit(["src", "package.json", "package-lock.json", "next.config.ts", "postcss.config.mjs"].some((p) => fs.existsSync(p) && changed(p)) ? 0 : 1);
