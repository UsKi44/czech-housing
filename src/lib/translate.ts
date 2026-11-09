import crypto from "node:crypto";
import { getDb, nowIso } from "./db";

/**
 * Czech → English translation with a permanent cache (table `translations`), so every text is translated once.
 * Uses Google Translate's free web endpoint (no API key). Only public listing text is sent — never contacts.
 */

const ENDPOINT_MANY = "https://translate.googleapis.com/translate_a/t?client=gtx&sl=cs&tl=en";
const ENDPOINT_LONG = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t";
const MAX_CHUNK = 4000;

const CZECH_CHARS = /[ěščřžýáíéúůňťďóĚŠČŘŽÝÁÍÉÚŮŇŤĎÓ]/;
const CZECH_WORDS = /\b(ano|ne|byt|bytu|dum|domu|cihlova|panelova|smisena|novostavba|osobni|druzstevni|plyn|sklep|garaz|balkon|lodzie|terasa|vytah|zarizeny|nezarizeny|castecne|klidna|cast|mesta|dohodou|ihned|mesic|mesicne|poplatky|kauce|provize)\b/i;

/** Real-estate terms machine translation gets wrong or awkward; exact (case-insensitive) matches use these. */
const GLOSSARY: Record<string, string> = {
  skeletová: "Skeleton frame",
  cihlová: "Brick",
  panelová: "Panel building",
  smíšená: "Mixed",
  dřevostavba: "Timber",
  montovaná: "Prefabricated",
  kamenná: "Stone",
  novostavba: "New build",
  "velmi dobrý": "Very good",
  dobrý: "Good",
  "po rekonstrukci": "Renovated",
  "před rekonstrukcí": "Needs renovation",
  "ve výstavbě": "Under construction",
  projekt: "Project",
  osobní: "Personal ownership",
  družstevní: "Cooperative ownership",
  státní: "State / municipal ownership",
  "státní/obecní": "State / municipal ownership",
  zařízený: "Furnished",
  "částečně zařízený": "Partly furnished",
  nezařízený: "Unfurnished",
  vybavený: "Furnished",
  "částečně vybavený": "Partly furnished",
  nevybavený: "Unfurnished",
  ano: "Yes",
  ne: "No",
  garáž: "Garage",
  "garážové stání": "Garage parking space",
  "parkovací stání": "Parking space",
  "klidná část obce": "Quiet part of town",
  "klidná část": "Quiet area",
  "centrum obce": "Town centre",
  "rušná část obce": "Busy part of town",
  "okraj obce": "Edge of town",
  sídliště: "Housing estate",
  "dohodou": "By agreement",
  ihned: "Immediately",
};

/** True when the text looks Czech (English text is left alone so it doesn't get mangled). */
export function looksCzech(s: string): boolean {
  if (!/[a-zA-Z]/.test(s)) return false;
  return CZECH_CHARS.test(s) || CZECH_WORDS.test(s.normalize("NFD").replace(/[̀-ͯ]/g, ""));
}

function ensureTable(): void {
  getDb().exec("CREATE TABLE IF NOT EXISTS translations (hash TEXT PRIMARY KEY, source TEXT NOT NULL, english TEXT NOT NULL, created_at TEXT NOT NULL)");
}

const hashOf = (s: string) => crypto.createHash("sha1").update(s).digest("hex");
const clean = (s: string) => s.replace(/​/g, "");

/** Split long text at paragraph / sentence boundaries so each request stays small. */
function chunks(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text];
  const out: string[] = [];
  let cur = "";
  for (const part of text.split(/(?<=\n)|(?<=[.!?] )/)) {
    if (cur.length + part.length > MAX_CHUNK && cur) {
      out.push(cur);
      cur = "";
    }
    cur += part;
  }
  if (cur) out.push(cur);
  return out;
}

async function translateLong(text: string): Promise<string> {
  let result = "";
  for (const c of chunks(text)) {
    const res = await fetch(ENDPOINT_LONG, { method: "POST", body: new URLSearchParams({ q: c }), signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Translation service answered ${res.status}`);
    const data = (await res.json()) as [[string, string][]];
    result += data[0].map((s) => s[0]).join("");
  }
  return clean(result);
}

async function translateShort(texts: string[]): Promise<string[]> {
  const body = new URLSearchParams();
  texts.forEach((t) => body.append("q", t));
  const res = await fetch(ENDPOINT_MANY, { method: "POST", body, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Translation service answered ${res.status}`);
  const data = (await res.json()) as (string | [string, string])[];
  return data.map((d) => clean(Array.isArray(d) ? d[0] : d));
}

/** Translate many texts; returns English for each (unchanged when not Czech). */
export async function toEnglish(texts: string[]): Promise<string[]> {
  ensureTable();
  const db = getDb();
  const get = db.prepare("SELECT english FROM translations WHERE hash = ?");
  const put = db.prepare("INSERT OR REPLACE INTO translations(hash, source, english, created_at) VALUES(?, ?, ?, ?)");

  const out = texts.slice();
  const short: { i: number; text: string }[] = [];
  const long: { i: number; text: string }[] = [];
  texts.forEach((text, i) => {
    if (!text || !looksCzech(text)) return;
    const term = GLOSSARY[text.trim().toLowerCase()];
    if (term) {
      out[i] = term;
      return;
    }
    const hit = get.get(hashOf(text)) as { english: string } | undefined;
    if (hit) out[i] = hit.english;
    else (text.length > 300 || text.includes("\n") ? long : short).push({ i, text });
  });

  // Short texts (parameter values, titles) go in batches of up to 50.
  for (let b = 0; b < short.length; b += 50) {
    const batch = short.slice(b, b + 50);
    const english = await translateShort(batch.map((x) => x.text));
    batch.forEach((x, k) => {
      out[x.i] = english[k] ?? x.text;
      put.run(hashOf(x.text), x.text, out[x.i], nowIso());
    });
  }
  for (const x of long) {
    out[x.i] = await translateLong(x.text);
    put.run(hashOf(x.text), x.text, out[x.i], nowIso());
  }
  return out;
}
