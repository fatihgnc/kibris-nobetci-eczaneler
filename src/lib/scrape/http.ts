// Polite HTTP layer for kteb.org (SPEC §4.2).

const CONTACT = process.env.SCRAPER_CONTACT ?? "mailto:fathgnc.dev@gmail.com";
export const USER_AGENT = `KKTCEczaneApp/1.0 (+${CONTACT})`;

export const KTEB_BASE = "https://www.kteb.org";

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "tr" },
    redirect: "follow",
  });
  if (!res.ok) throw new HttpError(res.status, url);
  return res.text();
}

/**
 * Run `fn` over `items` with bounded concurrency; each worker waits
 * `delayMs` between requests so the KTEB server is never hammered.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  delayMs: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
      await sleep(delayMs);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
