import { toEnglish } from "@/lib/translate";

/** POST { texts: string[] } → { english: string[] }. Only reachable from this computer (the app listens on 127.0.0.1). */
export async function POST(req: Request) {
  // Only this site's own pages may use it (blocks other websites open in your browser from calling it).
  const origin = req.headers.get("origin");
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  let texts: unknown;
  try {
    texts = ((await req.json()) as { texts?: unknown }).texts;
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (!Array.isArray(texts) || texts.length > 500 || !texts.every((t) => typeof t === "string")) {
    return Response.json({ error: "Expected { texts: string[] }" }, { status: 400 });
  }
  if ((texts as string[]).reduce((n, t) => n + t.length, 0) > 60_000) {
    return Response.json({ error: "Too much text" }, { status: 413 });
  }
  try {
    return Response.json({ english: await toEnglish(texts as string[]) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Translation failed" }, { status: 502 });
  }
}
