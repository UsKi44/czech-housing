/**
 * Polite HTTP client: one request at a time per host, a pause between requests,
 * and backing off (instead of retrying harder) when a site signals it wants us to slow down.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** Minimum pause between two requests to the same host, in ms (plus random jitter). */
const HOST_DELAY_MS: Record<string, number> = {
  "www.sreality.cz": 1500,
  "api.bezrealitky.cz": 1500,
  "reality.idnes.cz": 2000,
  "ud.api.ulovdomov.cz": 1500,
};
const DEFAULT_DELAY_MS = 400; // image CDNs

export class BlockedError extends Error {
  constructor(
    public host: string,
    public status: number,
  ) {
    super(`${host} answered ${status}: looks like we are being rate-limited or blocked`);
  }
}

const hostQueues = new Map<string, Promise<void>>();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Serialise requests per host and keep the configured gap between them. */
async function throttle(host: string): Promise<() => void> {
  const prev = hostQueues.get(host) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  hostQueues.set(
    host,
    prev.then(() => mine),
  );
  await prev;
  return () => {
    const gap = (HOST_DELAY_MS[host] ?? DEFAULT_DELAY_MS) * (1 + Math.random() * 0.5);
    setTimeout(release, gap);
  };
}

export interface FetchOpts {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export async function politeFetch(url: string, opts: FetchOpts = {}): Promise<Response> {
  const host = new URL(url).host;
  const maxAttempts = 3;
  for (let attempt = 1; ; attempt++) {
    const done = await throttle(host);
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: { "User-Agent": UA, "Accept-Language": "cs,en;q=0.8", ...opts.headers },
        body: opts.body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      });
    } catch (e) {
      done();
      if (attempt >= maxAttempts) throw e;
      await sleep(5_000 * attempt);
      continue;
    }
    done();
    if (res.status === 429 || res.status === 403) {
      // Do not hammer: give up on this run and let the worker pause this source.
      throw new BlockedError(host, res.status);
    }
    if (res.status >= 500 && attempt < maxAttempts) {
      await sleep(10_000 * attempt);
      continue;
    }
    return res;
  }
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await politeFetch(url, { ...opts, headers: { Accept: "application/json", ...opts.headers } });
  if (!res.ok) throw new HttpError(url, res.status);
  return (await res.json()) as T;
}

export class HttpError extends Error {
  constructor(
    public url: string,
    public status: number,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}
