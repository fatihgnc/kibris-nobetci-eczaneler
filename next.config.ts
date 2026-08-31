import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  /**
   * The old Turkish addresses, retired for good.
   *
   * next-intl's middleware already sends /tr/* to /*, but with a 307 — and a
   * temporary redirect leaves Google holding the old URL open, waiting to see
   * if it comes back. These run before the middleware ever sees the request
   * and say it with a 308, so the indexed /tr pages hand their history to the
   * bare addresses instead of keeping it in escrow. Query strings (?date=…)
   * are carried over automatically.
   */
  async redirects() {
    return [
      { source: "/tr", destination: "/", permanent: true },
      { source: "/tr/:path*", destination: "/:path*", permanent: true },
    ];
  },
  /**
   * Edge caching for the page HTML, said in the one header Vercel listens to.
   *
   * The middleware writes a normal Cache-Control, and on a self-hosted `next
   * start` that is the header that goes out — but on Vercel the render's own
   * `no-store` outranks anything middleware or config puts in Cache-Control.
   * `Vercel-CDN-Cache-Control` is the documented exception: top priority even
   * from next.config, consumed by the CDN, never forwarded to the browser.
   * Same window as /api/on-duty (SPEC §6). Scoped like the middleware
   * matcher, so API responses keep making their own decisions.
   */
  async headers() {
    return [
      {
        source: "/((?!api|_next|_vercel|.*\\..*).*)",
        headers: [
          {
            key: "Vercel-CDN-Cache-Control",
            value: "max-age=300, stale-while-revalidate=600",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
