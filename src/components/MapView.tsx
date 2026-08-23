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
}

const CYPRUS_CENTER: [number, number] = [35.25, 33.45];

export default function MapView({ points, me, selId, fitSignal, onSelect }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const m = L.map(elRef.current, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: true,
      fadeAnimation: false,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(m);
    m.setView(CYPRUS_CENTER, 9);
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
      if (pts.length > 1) m.fitBounds(pts, { padding: [46, 46], maxZoom: 12 });
      else if (pts.length === 1) m.setView(pts[0], 13);
      else m.setView(CYPRUS_CENTER, 9);
    };
    fit();
    const t = setTimeout(fit, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

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
