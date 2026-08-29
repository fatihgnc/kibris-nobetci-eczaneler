// The header's labels, fetched the same way on every document page.
import { getTranslations } from "next-intl/server";

export type NavKey = "home" | "pharmacies" | "about" | "privacy";
export type NavLabels = Record<NavKey, string>;

const KEYS: NavKey[] = ["home", "pharmacies", "about", "privacy"];

export async function navLabels(locale: string): Promise<NavLabels> {
  const t = await getTranslations({ locale, namespace: "nav" });
  return Object.fromEntries(KEYS.map((k) => [k, t(k)])) as NavLabels;
}
