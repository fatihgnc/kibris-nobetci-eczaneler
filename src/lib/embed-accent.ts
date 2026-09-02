// The one colour an embedder may bring with them.
//
// `?accent=%23RRGGBB` reaches the frame as a string from someone else's page,
// and it is written straight into a <style> element. Nothing but a hex colour
// may come out of here: a value that is not one falls back to the theme's own
// accent, silently — a broken parameter on a news site's article must never
// become a broken widget.

/** `#RRGGBB` (also `#RGB`, with or without the hash) → lowercase `#rrggbb`; anything else null. */
export function parseAccent(raw: string | string[] | undefined | null): string | null {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!v) return null;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(v);
  if (!m) return null;
  const hex = m[1].toLowerCase();
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex}`;
}
