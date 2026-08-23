// Dev-only fixture for /api/on-duty (enabled with MOCK_DATA=1).
// Lets the UI be developed and reviewed without a Supabase project.
// Data mirrors the design prototype's sample roster.
import { dutyDateFor, dutyMinutesFor } from "./duty-date";
import { deriveStatus } from "./status";
import type { OnDutyPharmacy, OnDutyResponse } from "./types";
import type { RegionCode } from "./regions";

type Row = {
  id: number;
  name: string;
  region: RegionCode;
  address: string;
  phone: string;
  opensAt: string;
  closesAt: string;
  onCall: { from: string; to: string } | null;
  lat: number;
  lng: number;
};

const ROWS: Row[] = [
  { id: 1, name: "Sema Eczanesi", region: "LEFKOSA", address: "Şht. Mustafa Ahmet Ruso Cd. No:24, Köşklüçiftlik, Lefkoşa", phone: "(0392) 227 41 08", opensAt: "08:00", closesAt: "00:00", onCall: null, lat: 35.1795, lng: 33.3671 },
  { id: 2, name: "Kuğu Eczanesi", region: "LEFKOSA", address: "Bedreddin Demirel Cd. No:118/B, Yenişehir, Lefkoşa", phone: "(0392) 228 63 55", opensAt: "08:00", closesAt: "22:00", onCall: { from: "22:00", to: "00:00" }, lat: 35.1931, lng: 33.3555 },
  { id: 3, name: "Gönyeli Yıldız Eczanesi", region: "LEFKOSA", address: "Atatürk Cd. No:7, Gönyeli, Lefkoşa", phone: "(0392) 223 19 74", opensAt: "08:00", closesAt: "00:00", onCall: null, lat: 35.2172, lng: 33.3125 },
  { id: 4, name: "Liman Eczanesi", region: "GIRNE", address: "Ziya Rızkı Cd. No:12, Girne merkez", phone: "(0392) 815 22 61", opensAt: "08:00", closesAt: "00:00", onCall: null, lat: 35.3403, lng: 33.3178 },
  { id: 5, name: "Karaoğlanoğlu Eczanesi", region: "GIRNE", address: "Ecevit Cd. No:45, Karaoğlanoğlu, Girne", phone: "(0392) 822 34 90", opensAt: "08:00", closesAt: "22:00", onCall: null, lat: 35.3382, lng: 33.2378 },
  { id: 6, name: "Suriçi Eczanesi", region: "GAZIMAGUSA", address: "Sinan Paşa Sk. No:3, Suriçi, Gazimağusa", phone: "(0392) 366 51 27", opensAt: "08:00", closesAt: "00:00", onCall: null, lat: 35.1257, lng: 33.9385 },
  { id: 7, name: "Baykal Eczanesi", region: "GAZIMAGUSA", address: "Salamis Yolu No:88, Baykal, Gazimağusa", phone: "(0392) 365 84 12", opensAt: "08:00", closesAt: "22:00", onCall: { from: "22:00", to: "00:00" }, lat: 35.1418, lng: 33.9204 },
  { id: 8, name: "Portakal Eczanesi", region: "GUZELYURT", address: "Ecevit Cd. No:61, Güzelyurt merkez", phone: "(0392) 714 27 33", opensAt: "08:00", closesAt: "22:00", onCall: null, lat: 35.1994, lng: 32.993 },
  { id: 9, name: "Cengiz Topel Eczanesi", region: "LEFKE", address: "Cengiz Topel Cd. No:7, Lefke", phone: "(0392) 727 71 19", opensAt: "08:00", closesAt: "19:00", onCall: { from: "19:00", to: "00:00" }, lat: 35.1104, lng: 32.8479 },
  { id: 10, name: "Boğaz Eczanesi", region: "ISKELE", address: "Boğaz Anıtı Yolu No:2, Boğaz, İskele", phone: "(0392) 371 26 40", opensAt: "08:00", closesAt: "22:00", onCall: null, lat: 35.2861, lng: 33.8899 },
  { id: 11, name: "Yenierenköy Eczanesi", region: "KARPAZ", address: "Atatürk Cd. No:18, Yenierenköy, Karpaz", phone: "(0392) 374 41 55", opensAt: "08:00", closesAt: "19:00", onCall: { from: "19:00", to: "00:00" }, lat: 35.4796, lng: 34.1961 },
  { id: 12, name: "Değirmenlik Eczanesi", region: "UST_MESARYA", address: "Şht. Salih Terzi Cd. No:9, Değirmenlik", phone: "(0392) 234 60 21", opensAt: "08:00", closesAt: "22:00", onCall: null, lat: 35.2072, lng: 33.4753 },
  { id: 13, name: "Serdarlı Eczanesi", region: "ALT_MESARYA", address: "Cumhuriyet Cd. No:31, Serdarlı", phone: "(0392) 236 12 88", opensAt: "08:00", closesAt: "19:00", onCall: { from: "19:00", to: "00:00" }, lat: 35.2402, lng: 33.6684 },
];

function kmBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLng - aLng) * Math.PI) / 180;
  const la = (aLat * Math.PI) / 180;
  const lb = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function mockOnDuty(lat: number | null, lng: number | null): OnDutyResponse {
  const nowMinutes = dutyMinutesFor();
  const pharmacies: OnDutyPharmacy[] = ROWS.map((r) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    address: r.address,
    phone: r.phone,
    phoneAlt: null,
    lat: r.lat,
    lng: r.lng,
    hoursRaw: r.onCall ? `${r.opensAt} - ${r.closesAt} (${r.onCall.from} - ${r.onCall.to} On-Call)` : `${r.opensAt} - ${r.closesAt}`,
    opensAt: r.opensAt,
    closesAt: r.closesAt,
    onCall: r.onCall,
    status: deriveStatus(
      { opensAt: r.opensAt, closesAt: r.closesAt, oncallFrom: r.onCall?.from ?? null, oncallTo: r.onCall?.to ?? null },
      nowMinutes
    ),
    distanceKm: lat !== null && lng !== null ? Math.round(kmBetween(lat, lng, r.lat, r.lng) * 10) / 10 : null,
  }));
  if (lat !== null) pharmacies.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  return {
    dutyDate: dutyDateFor(),
    lastSyncedAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
    stale: true,
    pharmacies,
  };
}
