import fs from "node:fs";
import path from "node:path";
import { PHOTO_DIR } from "@/lib/db";

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".webp": "image/webp", ".png": "image/png", ".gif": "image/gif", ".avif": "image/avif" };

/** Serves downloaded photos from data/photos. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  const full = path.resolve(PHOTO_DIR, ...parts);
  if (!full.startsWith(PHOTO_DIR + path.sep)) return new Response("Not found", { status: 404 });
  try {
    const buf = await fs.promises.readFile(full);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": TYPES[path.extname(full).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
