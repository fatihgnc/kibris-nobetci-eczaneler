import type { RegionCode } from "./regions";
import type { DutyStatus } from "./status";

/** One pharmacy in the /api/on-duty response (SPEC §6). */
export interface OnDutyPharmacy {
  id: number;
  name: string;
  region: RegionCode | null;
  address: string | null;
  phone: string | null;
  phoneAlt: string | null;
  lat: number | null;
  lng: number | null;
  hoursRaw: string;
  opensAt: string | null; // "HH:MM"
  closesAt: string | null;
  onCall: { from: string; to: string } | null;
  status: DutyStatus;
  distanceKm: number | null;
}

export interface OnDutyResponse {
  dutyDate: string;
  lastSyncedAt: string | null;
  stale: boolean;
  pharmacies: OnDutyPharmacy[];
}
