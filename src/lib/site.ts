/**
 * The canonical origin, in one place: metadata, robots and the sitemap all
 * need absolute URLs, and a wrong one silently poisons every canonical tag and
 * share card.
 *
 * SITE_URL lets a preview deployment describe itself honestly; production
 * leaves it unset and gets the real domain.
 */
export const SITE_URL = (process.env.SITE_URL ?? "https://acikeczanevarmi.com").replace(/\/$/, "");
