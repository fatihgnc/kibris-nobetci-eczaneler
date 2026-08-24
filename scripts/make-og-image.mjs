/**
 * Renders public/og.png, the 1200x630 card that WhatsApp, X and Google show
 * when someone shares a link.
 *
 * Re-run it whenever the wording below changes:
 *   node scripts/make-og-image.mjs
 *
 * The text lives here rather than in messages/: an image cannot be localised
 * per request, and the audience pasting this link into a group chat is
 * Turkish-speaking.
 */
import sharp from "sharp";

const W = 1200;
const H = 630;

// The app's light palette, resolved to hex — an SVG cannot read CSS variables.
const BG = "#fafafc";
const TEXT = "#31363d";
const TEXT_2 = "#666e7a";
const ACCENT = "#1f6ad0";
const LINE = "#e0e3e8";

const HEADLINE = "KKTC Nöbetçi Eczaneler";
const SUB = "Bu gece açık olan nöbetçi eczaneler";
const DETAIL = "Harita · Telefon · Nöbet saatleri";
const DOMAIN = "acikeczanevarmi.com";

const FONT = "Archivo, Segoe UI, Helvetica, Arial, sans-serif";

const ICON = 196;
const PAD = 96;
// Icon on the left, text column beside it, both centred on the same axis —
// stacking them needs more vertical room than 630px leaves once the headline
// is this big, and they end up colliding.
const ICON_TOP = Math.round((H - ICON) / 2);
const COL = PAD + ICON + 48;

const icon = await sharp("public/icon-512.png").resize(ICON, ICON).png().toBuffer();
// Rounded corners, to match how the icon reads on a home screen.
const mask = Buffer.from(
  `<svg width="${ICON}" height="${ICON}"><rect width="${ICON}" height="${ICON}" rx="42" ry="42" fill="#fff"/></svg>`
);
const roundedIcon = await sharp(icon)
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toBuffer();

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="${H - 10}" width="${W}" height="10" fill="${ACCENT}"/>
  <text x="${COL}" y="236" font-family="${FONT}" font-size="64" font-weight="700" fill="${TEXT}">${HEADLINE}</text>
  <text x="${COL}" y="298" font-family="${FONT}" font-size="36" font-weight="500" fill="${TEXT_2}">${SUB}</text>
  <line x1="${COL}" y1="344" x2="${W - PAD}" y2="344" stroke="${LINE}" stroke-width="2"/>
  <text x="${COL}" y="392" font-family="${FONT}" font-size="30" font-weight="400" fill="${TEXT_2}">${DETAIL}</text>
  <text x="${COL}" y="456" font-family="${FONT}" font-size="32" font-weight="600" fill="${ACCENT}">${DOMAIN}</text>
</svg>`;

await sharp(Buffer.from(svg))
  .composite([{ input: roundedIcon, top: ICON_TOP, left: PAD }])
  .png({ compressionLevel: 9 })
  .toFile("public/og.png");

const meta = await sharp("public/og.png").metadata();
console.log(`public/og.png ${meta.width}x${meta.height}  icon ${PAD}..${PAD + ICON}  text from ${COL}`);
