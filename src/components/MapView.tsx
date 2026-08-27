"use client";
// Leaflet + OpenStreetMap tiles (SPEC §7). Loaded with next/dynamic ssr:false.
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

export interface MapPoint {
  id: number;
  lat: number;
  lng: number;
  statusClass: string; // s-open | s-warn | s-oncall | s-closed
  /** Filtered out: drawn as faded context, not part of the fit, not clickable. */
  muted: boolean;
}

interface Props {
  points: MapPoint[];
  me: [number, number] | null;
  selId: number | null;
  fitSignal: number;
  onSelect: (id: number) => void;
  /** Which basemap to draw. */
  /**
   * Height in px of the map container hidden behind the bottom sheet. Leaflet
   * fits to the whole container, so without this the pins are centred behind
   * the sheet and the user opens the app to an empty patch of sea.
   */
  bottomInset?: number;
}

const CYPRUS_CENTER: [number, number] = [35.25, 33.45];

/**
 * OpenStreetMap's standard tiles: no account, no API key, no quota to babysit.
 *
 * There used to be a CARTO basemap per theme, light and dark. CARTO closed off
 * keyless access and started stamping "API KEY REQUIRED" across the tiles it
 * serves, so both are gone. OSM ships one style only, and the map now looks the
 * same in dark mode as it does in light — a deliberate trade for not owing an
 * account to anyone. Inverting it with a CSS filter is not an option: that
 * turns the land a muddy olive and inverts the label text along with it.
 */
const BASEMAP = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const TILE_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * The island and almost nothing else. Cyprus spans roughly 34.56-35.71 N and
 * 32.27-34.60 E; this is that box plus a coastline's worth of sea.
 *
 * Panning beyond it serves no purpose and only loses the user — at 3am,
 * scrolling off into the Mediterranean is a real way to get lost.
 */
const ISLAND = L.latLngBounds([34.45, 32.15], [35.80, 34.72]);

/**
 * The wall the user cannot drag through: the island, dropped at the bottom by
 * however much the sheet covers.
 *
 * The two pull against each other. Leaflet knows only the container, so it
 * centres on the whole of it — but on mobile the visible map is the strip
 * above the sheet, and putting the island in that strip means the centre sits
 * south of the coast. A box drawn tight to the island would clamp that centre
 * back and drag the northern pharmacies off screen.
 *
 * So the south edge alone gives way, by exactly the sheet's height converted
 * to degrees at the current zoom. Everywhere else stays tight to the water.
 * Computed right after a fit, when the map is at its most zoomed-out and a
 * pixel is worth the most latitude it will ever be worth — minZoom is pinned
 * there, so the allowance can only ever be too generous, never too mean.
 */
function wallFor(m: L.Map, inset: number): L.LatLngBounds {
  if (inset <= 0) return ISLAND;
  const z = m.getZoom();
  const sw = m.project(ISLAND.getSouthWest(), z);
  const south = m.unproject(L.point(sw.x, sw.y + inset), z).lat;
  return L.latLngBounds([south, ISLAND.getWest()], [ISLAND.getNorth(), ISLAND.getEast()]);
}

/** Zoom at which the whole island fits the current container. */
function islandZoom(m: L.Map): number {
  const z = m.getBoundsZoom(ISLAND);
  return Number.isFinite(z) ? z : 8;
}

/**
 * Floor for user-driven zoom-out, applied after a programmatic fit.
 *
 * On mobile the fit needs a wider view than "the island fills the container",
 * for the same reason the wall does: the pins have to land in the strip the
 * sheet leaves. Constraining the fit to the island zoom pushed the outermost
 * pharmacies back out of sight.
 *
 * So the fit is left free and the floor is set to whatever it settled on —
 * never tighter than the island zoom. The user cannot pull further out than
 * the view they were given, and the wall stops them wandering off.
 */
function lockZoomOut(m: L.Map) {
  m.setMinZoom(Math.min(m.getZoom(), islandZoom(m)));
}

export default function MapView({ points, me, selId, fitSignal, onSelect, bottomInset = 0 }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const insetRef = useRef(bottomInset);
  insetRef.current = bottomInset;

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const m = L.map(elRef.current, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: true,
      fadeAnimation: false,
      // A solid wall rather than a rubber band: viscosity 1 stops the drag at
      // the edge instead of letting it spring past and snap back.
      maxBounds: ISLAND,
      maxBoundsViscosity: 1,
    });
    L.tileLayer(BASEMAP, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(m);
    m.setView(CYPRUS_CENTER, 9);
    lockZoomOut(m);
    layerRef.current = L.layerGroup().addTo(m);
    mapRef.current = m;
    const t = setTimeout(() => m.invalidateSize(), 60);
    return () => {
      clearTimeout(t);
      m.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Markers
  useEffect(() => {
    const m = mapRef.current;
    const layer = layerRef.current;
    if (!m || !layer) return;
    layer.clearLayers();
    if (me) {
      L.marker(me, {
        icon: L.divIcon({ className: "", html: '<div class="mepin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
        zIndexOffset: 200,
        keyboard: false,
      }).addTo(layer);
    }
    for (const p of points) {
      const sel = p.id === selId && !p.muted;
      const marker = L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div class="pin ${p.statusClass} ${p.muted ? "muted" : ""} ${sel ? "sel" : ""}"><i></i></div>`,
          iconSize: sel ? [34, 34] : [26, 26],
          iconAnchor: sel ? [17, 17] : [13, 13],
        }),
        // Muted pins sit under the rest so a dense region still reads.
        zIndexOffset: sel ? 400 : p.muted ? -200 : 0,
        interactive: !p.muted,
      }).addTo(layer);
      if (!p.muted) marker.on("click", () => onSelectRef.current(p.id));
    }
    m.invalidateSize();
  }, [points, me, selId]);

  // Fit all points (recenter button, data / filter changes)
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const fit = () => {
      // Only what the filter actually selected: fitting the muted pins too
      // would zoom back out to the whole island on every region change.
      const pts: [number, number][] = points
        .filter((p) => !p.muted)
        .map((p) => [p.lat, p.lng] as [number, number]);
      if (me) pts.push(me);
      m.invalidateSize();
      // Let the fit choose freely; the floor is applied to its result below.
      m.setMinZoom(0);
      // Keep at least a usable strip: on a short viewport the sheet can cover
      // nearly the whole map, and Leaflet cannot fit into a negative box.
      const usable = Math.max(0, m.getSize().y - insetRef.current - 92);
      const bottom = usable > 80 ? insetRef.current + 46 : 46;
      if (pts.length > 1) {
        m.fitBounds(pts, {
          paddingTopLeft: [46, 46],
          paddingBottomRight: [46, bottom],
          maxZoom: 12,
        });
      } else if (pts.length === 1) m.setView(pts[0], 13);
      else m.setView(CYPRUS_CENTER, 9);
      lockZoomOut(m);
      m.setMaxBounds(wallFor(m, insetRef.current));
    };
    fit();
    const t = setTimeout(fit, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal, bottomInset]);

  // Focus the selected pharmacy
  useEffect(() => {
    const m = mapRef.current;
    if (!m || selId === null) return;
    const p = points.find((x) => x.id === selId && !x.muted);
    if (p) m.setView([p.lat, p.lng], 14, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  return <div className="map" ref={elRef} />;
}
