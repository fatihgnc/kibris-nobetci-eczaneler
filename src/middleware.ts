import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

export default function middleware(req: NextRequest) {
  const res = intl(req);
  /**
   * Replace the platform's `no-store` on page HTML.
   *
   * Vercel stamps dynamic renders `private, no-cache, no-store`, which
   * disables the back/forward cache — every back press re-rendered the page —
   * and rules out edge caching. The roster changes once a sync, not once a
   * request, so the HTML gets the same window as /api/on-duty (SPEC §6): the
   * edge holds it for 300s and revalidates in the background, while the
   * browser (Vercel strips the s-maxage directives it consumes) is left with
   * `public, max-age=0` — revalidate on every load, but bfcache-eligible.
   */
  res.headers.set("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
  return res;
}

export const config = {
  // Everything except API routes, Next internals, and files with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
