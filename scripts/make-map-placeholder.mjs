// Builds public/map-placeholder.webp: the map's opening view of Cyprus,
// stitched once from OSM tiles so the page can paint it with the first HTML.
//
// Why it exists: the live map only starts fetching tiles after hydration, so
// the largest thing on the screen — a map tile — was also the last to arrive,
// and LCP sat at the end of that chain. A same-origin <img> of the identical
// view is discovered by the preload scanner in the first bytes of HTML,
// paints alongside the list, and takes over as the LCP element.
//
// Run it once (and again only if the opening view ever changes):
//   node scripts/make-map-placeholder.mjs
//
// ~15 tiles, fetched once, politely, with a proper User-Agent — well inside
// the OSM tile usage policy for a build-time one-off. The required
// attribution is baked into the corner of the image, since the Leaflet
// attribution control does not exist yet while the placeholder is showing.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Same box as ISLAND in src/components/MapView.tsx: the island plus a
// coastline's worth of sea. Keep the two in sync.
const WEST = 32.15;
const SOUTH = 34.45;
const EAST = 34.72;
const NORTH = 35.8;

// z9 gives ~940px of width across the island — sharp enough for a 2x phone
// screen without hauling the z10 tile count.
const Z = 9;
const TILE = 256;
const WORLD = TILE * 2 ** Z;

const lonToX = (lon) => ((lon + 180) / 360) * WORLD;
const latToY = (lat) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * WORLD;
};

const pxWest = lonToX(WEST);
const pxEast = lonToX(EAST);
const pxNorth = latToY(NORTH);
const pxSouth = latToY(SOUTH);

const tileX0 = Math.floor(pxWest / TILE);
const tileX1 = Math.floor(pxEast / TILE);
const tileY0 = Math.floor(pxNorth / TILE);
const tileY1 = Math.floor(pxSouth / TILE);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTile(x, y) {
  const url = `https://tile.openstreetmap.org/${Z}/${x}/${y}.png`;
  const res = await fetch(url, {
    headers: {
      // OSM's tile policy asks scripted access to identify itself.
      "User-Agent": "acikeczanevarmi.com build script (one-off placeholder; https://acikeczanevarmi.com)",
    },
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const cols = tileX1 - tileX0 + 1;
const rows = tileY1 - tileY0 + 1;
console.log(`Fetching ${cols * rows} tiles at z${Z} (${cols}x${rows})...`);

const composites = [];
for (let x = tileX0; x <= tileX1; x++) {
  for (let y = tileY0; y <= tileY1; y++) {
    composites.push({
      input: await fetchTile(x, y),
      left: (x - tileX0) * TILE,
      top: (y - tileY0) * TILE,
    });
    await sleep(150); // politeness, not necessity
  }
}

const cropLeft = Math.round(pxWest - tileX0 * TILE);
const cropTop = Math.round(pxNorth - tileY0 * TILE);
const cropWidth = Math.round(pxEast - pxWest);
const cropHeight = Math.round(pxSouth - pxNorth);

// The licence requires the credit visible, and while this image is on screen
// the Leaflet attribution control does not exist yet — so it rides along.
const credit = Buffer.from(
  `<svg width="${cropWidth}" height="${cropHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${cropWidth - 172}" y="${cropHeight - 18}" width="172" height="18" fill="rgba(255,255,255,0.75)"/>
    <text x="${cropWidth - 6}" y="${cropHeight - 5}" text-anchor="end"
      font-family="Arial, sans-serif" font-size="11" fill="#333">© OpenStreetMap contributors</text>
  </svg>`
);

const out = path.join(process.cwd(), "public", "map-placeholder.webp");
await mkdir(path.dirname(out), { recursive: true });

// Three passes, buffered between them: sharp runs extract before composite
// inside a single pipeline, so stitching, cropping and annotating have to be
// separate steps to happen in that order.
const stitched = await sharp({
  create: { width: cols * TILE, height: rows * TILE, channels: 3, background: "#f2efe9" },
})
  .composite(composites)
  .png()
  .toBuffer();

const cropped = await sharp(stitched)
  .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
  .png()
  .toBuffer();

const final = await sharp(cropped)
  .composite([{ input: credit, left: 0, top: 0 }])
  .webp({ quality: 72 })
  .toBuffer();
await writeFile(out, final);

const meta = await sharp(final).metadata();
console.log(`Wrote ${out}: ${meta.width}x${meta.height}, ${(final.length / 1024).toFixed(0)} KiB`);
