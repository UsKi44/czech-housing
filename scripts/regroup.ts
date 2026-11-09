/** Re-run duplicate detection from scratch (e.g. after changing the matching rules in src/lib/dedupe.ts). */
import { getDb } from "../src/lib/db";
import { assignGroups } from "../src/lib/dedupe";

getDb().exec("UPDATE listings SET group_id = NULL, grouped = 0");
console.log(`${assignGroups()} listings matched a copy on another site`);
