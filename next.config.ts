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
};

export default withNextIntl(nextConfig);
