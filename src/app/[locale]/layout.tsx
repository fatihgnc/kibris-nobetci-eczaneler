import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { IBM_Plex_Mono, Outfit } from "next/font/google";
import { notFound } from "next/navigation";
import RegisterSW from "@/components/RegisterSW";
import SiteJsonLd from "@/components/SiteJsonLd";
import { routing } from "@/i18n/routing";
import { clientMessages } from "@/lib/messages";
import { SITE_URL } from "@/lib/site";
import "../globals.css";

const outfit = Outfit({
  // latin-ext is not optional here: ş, ğ, ı and İ live in that subset, and
  // half of this interface is Turkish.
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-outfit",
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
  const path = `/${locale}`;
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
        ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])),
        "x-default": `/${routing.defaultLocale}`,
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
    <html lang={locale} className={`${outfit.variable} ${plexMono.variable}`}>
      <body>
        <SiteJsonLd locale={locale} name={t("name")} />
        <NextIntlClientProvider messages={messages}>
          {children}
          <RegisterSW />
          {/* No-op off Vercel, so dev and self-hosted runs stay untouched. */}
          <Analytics />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
