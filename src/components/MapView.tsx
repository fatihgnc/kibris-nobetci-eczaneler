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
  index: number; // 1-based, matches the list order
}

interface Props {
  points: MapPoint[];
  me: [number, number] | null;
  selId: number | null;
  fitSignal: number;
  onSelect: (id: number) => void;
  /**
   * Height in px of the map container hidden behind the bottom sheet. Leaflet
   * fits to the whole container, so without this the pins are centred behind
   * the sheet and the user opens the app to an empty patch of sea.
   */
  bottomInset?: number;
}

const CYPRUS_CENTER: [number, number] = [35.25, 33.45];

/**
 * The island plus a small margin. Every pharmacy this app will ever show is
 * inside it, so panning beyond serves no purpose and only loses the user —
 * at 3am, scrolling off into the Mediterranean is a real way to get lost.
 *
 * Cyprus spans roughly 34.56–35.70 N and 32.27–34.60 E. The margin is wider to
 * the south because the mobile fit puts the island in the strip above the
 * sheet, which means the map centre sits south of the island — with a tight
 * box the centre could not get there and the outermost pharmacies fell off
 * screen. The extra room is open sea; the north edge stays below the Turkish
 * coast.
 */
const CYPRUS_BOUNDS = L.latLngBounds([33.60, 31.70], [35.95, 35.10]);

/** Zoom at which the whole island fits the current container. */
function islandZoom(m: L.Map): number {
  const z = m.getBoundsZoom(CYPRUS_BOUNDS);
  return Number.isFinite(z) ? z : 8;
}

/**
 * Floor for user-driven zoom-out, applied after a programmatic fit.
 *
 * These two pull against each other on mobile: the sheet covers half the map,
 * so fitting every pin into the strip that is left needs a wider view than
 * "the island fills the container". Constraining the fit to the island zoom
 * pushed the outermost pharmacies back out of sight.
 *
 * So the fit is left free and the floor is set to whatever it settled on —
 * never tighter than the island zoom. The user cannot pull further out than
 * the view they were given, and maxBounds still stops them wandering off.
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
      maxBounds: CYPRUS_BOUNDS,
      maxBoundsViscosity: 1,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
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
      const sel = p.id === selId;
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div class="pin ${p.statusClass} ${sel ? "sel" : ""}"><i>${p.index}</i></div>`,
          iconSize: sel ? [34, 34] : [26, 26],
          iconAnchor: sel ? [17, 17] : [13, 13],
        }),
        zIndexOffset: sel ? 400 : 0,
      })
        .addTo(layer)
        .on("click", () => onSelectRef.current(p.id));
    }
    m.invalidateSize();
  }, [points, me, selId]);

  // Fit all points (recenter button, data / filter changes)
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const fit = () => {
      const pts: [number, number][] = points.map((p) => [p.lat, p.lng] as [number, number]);
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
    const p = points.find((x) => x.id === selId);
    if (p) m.setView([p.lat, p.lng], 14, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  return <div className="map" ref={elRef} />;
}
