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

/**
 * The live map, kept alive across unmounts.
 *
 * Switching TR/EN navigates between two route segments, so React tears this
 * component down and builds a new one. Leaflet does not survive that: the old
 * instance is destroyed, a new one starts at the island view and every tile is
 * fetched again, which reads as the map resetting itself for a change that
 * only touches labels.
 *
 * So the instance and the element it is bound to outlive the component. On
 * mount the kept element is re-parented into the fresh host and the same map
 * carries on — same centre, same zoom, same tiles already painted. Only the
 * host div belongs to React.
 *
 * Nothing calls map.remove(): this app shows the map on every screen, so the
 * instance is never garbage to collect, and destroying it is precisely the
 * behaviour being fixed here.
 */
let keptEl: HTMLDivElement | null = null;
let keptMap: L.Map | null = null;
let keptLayer: L.LayerGroup | null = null;
/**
 * Set when a mount adopts the kept map instead of building one, and consumed
 * by the fit effect on the same pass so it leaves the carried-over view alone.
 *
 * A per-component ref cannot do this job: StrictMode runs mount, cleanup and
 * mount again on the same instance, so a ref set on the first pass is already
 * spent when the second one arrives and the fit slips through.
 */
let carriedOver = false;
/** Whether the pins have ever been framed. Until they have, every mount fits. */
let everFitted = false;
/**
 * The set of pins the current view was framed for.
 *
 * A remount is not a reason to re-frame — unless it is showing something else.
 * Regions are pages of their own, so picking one unmounts and remounts this
 * component, and "keep the view you had" was swallowing exactly the refit the
 * user asked for by picking it. Comparing what is about to be framed against
 * what was framed last tells the two cases apart without this component having
 * to know what a region is: a locale switch arrives with the same pins and
 * keeps its view, a new filter arrives with different ones and gets a fit.
 */
let fittedKey = "";

export default function MapView({ points, me, selId, fitSignal, onSelect, bottomInset = 0 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const insetRef = useRef(bottomInset);
  insetRef.current = bottomInset;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (keptMap) carriedOver = true;

    if (!keptMap || !keptEl || !keptLayer) {
      keptEl = document.createElement("div");
      keptEl.className = "mapcanvas";
      // Leaflet measures the element when the map is created, so it has to be
      // in the document and sized before L.map runs.
      host.appendChild(keptEl);
      const m = L.map(keptEl, {
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
      keptLayer = L.layerGroup().addTo(m);
      keptMap = m;
    } else if (keptEl.parentNode !== host) {
      host.appendChild(keptEl);
    }

    mapRef.current = keptMap;
    layerRef.current = keptLayer;
    // The host is a different box after a remount even when it looks the same,
    // so Leaflet has to re-measure before it draws.
    const t = setTimeout(() => keptMap?.invalidateSize(), 60);
    return () => {
      clearTimeout(t);
      // Detach, never destroy: the element goes back to holding the live map
      // until the next host asks for it.
      if (keptEl && keptEl.parentNode === host) host.removeChild(keptEl);
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
    // No invalidateSize here. Re-measuring while maxBounds is set makes Leaflet
    // pan the view back inside the wall, and this effect also runs on the
    // short-lived mount into the phone layout, where the container is a
    // different shape — the correction it made there followed the map into the
    // desktop container and showed up as the view drifting on every switch.
  }, [points, me, selId]);

  // Fit all points (recenter button, data / filter changes)
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    // What this pass would frame, named before anything decides to skip it.
    const key = points
      .filter((p) => !p.muted)
      .map((p) => p.id)
      .join(",");
    const fit = () => {
      // Only what the filter actually selected: fitting the muted pins too
      // would zoom back out to the whole island on every region change.
      const pts: [number, number][] = points
        .filter((p) => !p.muted)
        .map((p) => [p.lat, p.lng] as [number, number]);
      /*
       * "Me" joins the fit only when it belongs in the same frame.
       *
       * A muted pin means a region filter is on, and the whole point of that
       * filter is to look at one region — stretching the box to reach the user
       * standing in another one undoes it. Off the island it is worse: someone
       * opening the app from Turkey pulled the fit across the Mediterranean and
       * got the sea, with Cyprus a smudge in the corner.
       */
      const filtered = points.some((p) => p.muted);
      if (me && !filtered && ISLAND.contains(me)) pts.push(me);
      m.invalidateSize();
      // Let the fit choose freely; the floor is applied to its result below.
      m.setMinZoom(0);
      // Keep at least a usable strip: on a short viewport the sheet can cover
      // nearly the whole map, and Leaflet cannot fit into a negative box.
      const usable = Math.max(0, m.getSize().y - insetRef.current - 92);
      const bottom = usable > 80 ? insetRef.current + 46 : 46;
      /*
       * Every move here is animate: false, and it has to be.
       *
       * An animated fitBounds settles over the next few frames, but the two
       * calls below run immediately: lockZoomOut would read the zoom the map
       * is leaving rather than the one it is heading for, and setMaxBounds
       * pans the view inside the wall right away, which cancels the flight
       * mid-air and drops the map back where it started. The old code hid this
       * by fitting twice, 80ms apart — the second pass landed after the first
       * had settled. Jumping straight there needs no second pass.
       */
      if (pts.length > 1) {
        m.fitBounds(pts, {
          paddingTopLeft: [46, 46],
          paddingBottomRight: [46, bottom],
          maxZoom: 12,
          animate: false,
        });
      } else if (pts.length === 1) m.setView(pts[0], 13, { animate: false });
      else m.setView(CYPRUS_CENTER, 9, { animate: false });
      lockZoomOut(m);
      m.setMaxBounds(wallFor(m, insetRef.current));
    };
    // A remount is not a reason to re-frame: the user's pan and zoom is the
    // view they left behind, and a locale switch should not take it. Until the
    // pins have been framed once, though, every mount still owes them a fit —
    // and so does a mount that arrived with a different set of them.
    if (carriedOver && everFitted && key === fittedKey) {
      carriedOver = false;
      // Deferred for the same reason as the fit below: the mount into the
      // phone layout must not re-measure a map it is about to hand over.
      const keep = setTimeout(() => {
        // Only when the box actually changed. Re-measuring, and re-applying a
        // wall the map already has, both make Leaflet pan the view back inside
        // that wall — which nudged the map a few tens of pixels on every
        // switch, for a container that had not moved at all.
        const host = hostRef.current;
        const size = m.getSize();
        if (host && (host.clientWidth !== size.x || host.clientHeight !== size.y)) {
          m.invalidateSize();
          m.setMaxBounds(wallFor(m, insetRef.current));
        }
      }, 90);
      return () => clearTimeout(keep);
    }
    carriedOver = false;

    /*
     * Deferred, and cancelled if this mount does not survive the delay.
     *
     * useIsDesktop cannot read the media query during the first render without
     * breaking hydration, so it reports "mobile" and corrects itself in an
     * effect. Every arrival therefore mounts this component twice: once into
     * the phone layout, once into the desktop one, a frame apart. A fit that
     * ran immediately would frame the pins for the container being thrown
     * away, and — worse — would mark them framed, so the container that
     * survives would inherit a view fitted to the wrong box. Waiting lets the
     * short-lived mount die before it can claim anything.
     */
    const t = setTimeout(() => {
      everFitted = true;
      fittedKey = key;
      fit();
    }, 90);
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

  return <div className="map" ref={hostRef} />;
}
