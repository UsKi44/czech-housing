// Exit code 0 when dependencies must be (re)installed: none yet, or package-lock.json changed since the last install.
import fs from "node:fs";

const MARK = "node_modules/.package-lock.json";
if (!fs.existsSync(MARK)) process.exit(0);
process.exit(fs.statSync("package-lock.json").mtimeMs > fs.statSync(MARK).mtimeMs ? 0 : 1);
