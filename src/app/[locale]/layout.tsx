import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import RegisterSW from "@/components/RegisterSW";
import SiteJsonLd from "@/components/SiteJsonLd";
import { getPathname } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { clientMessages } from "@/lib/messages";
import { SITE_URL } from "@/lib/site";
import "../globals.css";

const bricolage = Bricolage_Grotesque({
  // latin-ext is not optional here: ş, ğ, ı and İ live in that subset, and
  // half of this interface is Turkish.
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bricolage",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  // 700 went with the clock-time chips when they moved to the UI face; what
  // is left in mono — the distance, the header bits — never goes past 500.
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });
  // Through getPathname, not string-built: with localePrefix "as-needed" the
  // Turkish homepage is `/` and only /en carries a prefix, and this is the one
  // function that knows that.
  const home = (l: AppLocale) => getPathname({ locale: l, href: "/" });
  const path = home(locale as AppLocale);
  return {
    // Absolute URLs for everything below; without it Next emits relative
    // og:image and the share card comes up blank.
    metadataBase: new URL(SITE_URL),
    title: t("title"),
    description: t("description"),
    manifest: "/manifest.webmanifest",
    alternates: {
      canonical: path,
      // Both locales are the same page in another language, so tell search
      // engines that rather than letting them pick one and drop the other.
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, home(l)])),
        "x-default": home(routing.defaultLocale),
      },
    },
    openGraph: {
      type: "website",
      siteName: t("name"),
      title: t("ogTitle"),
      description: t("ogDescription"),
      url: path,
      locale: locale === "tr" ? "tr_TR" : "en_GB",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: t("ogImageAlt") }],
    },
    twitter: {
      card: "summary_large_image",
      title: t("ogTitle"),
      description: t("ogDescription"),
      images: ["/og.png"],
    },
    icons: {
      icon: "/favicon.ico",
      apple: "/apple-touch-icon.png",
    },
    appleWebApp: { capable: true, title: t("shortName"), statusBarStyle: "black-translucent" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The app has one theme, so this is a single colour rather than a
  // prefers-color-scheme pair.
  themeColor: "#fafafc",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // Trimmed: the server-only namespaces would otherwise be serialised into
  // the HTML of every page for no one to read.
  const messages = clientMessages(await getMessages());
  const t = await getTranslations({ locale, namespace: "app" });

  return (
    <html lang={locale} className={`${bricolage.variable} ${plexMono.variable}`}>
      <body>
        {/* React hoists this into <head>. The map tiles are the largest thing
            on the screen and the last to start loading — Leaflet only asks for
            them after hydration — so the DNS+TLS handshake to the tile server
            is paid here, in parallel with everything else, instead of at the
            front of the first tile request. */}
        <link rel="preconnect" href="https://tile.openstreetmap.org" />
        <SiteJsonLd locale={locale} name={t("name")} />
        <NextIntlClientProvider messages={messages}>
          {children}
          <RegisterSW />
          {/* No-op off Vercel, so dev and self-hosted runs stay untouched. */}
          <Analytics />
          {/* Real-user Core Web Vitals, so the Lighthouse numbers have field
              data to answer to. Same no-op-off-Vercel behaviour as above. */}
          <SpeedInsights />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
