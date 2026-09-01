"use client";
// Main application shell — mobile-first (map + draggable bottom sheet),
// desktop (400px list panel + full-height map) from 1024px up.
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { addDutyDays, dutyDateFor, dutyMinutesFor } from "@/lib/duty-date";
import {
  directionsUrl,
  mapSearchUrl,
  formatAgo,
  formatClock,
  formatDistanceKm,
  formatDriveTime,
  formatDayChipParts,
  formatDutyDate,
  formatDutyDateParts,
  telHref,
} from "@/lib/format";
import {
  isOnCyprus,
  isRegionCode,
  REGION_LABEL,
  REGION_ORDER,
  REGION_SLUG,
  regionDisplay,
  type RegionCode,
} from "@/lib/regions";
import { pharmacySlug } from "@/lib/slug";
import { deriveStatus, type DutyStatus } from "@/lib/status";
import type { DutyDaysResponse, OnDutyPharmacy, OnDutyResponse } from "@/lib/types";
import { CloseIcon, NavIcon, PhoneIcon, RecenterIcon } from "./icons";
import type { MapPoint } from "./MapView";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  // Painted in the server HTML and held until Leaflet's chunk arrives: the map
  // corner of the screen is otherwise bare surface for the several seconds the
  // tiles take on a phone, and a bare corner reads as broken rather than late.
  loading: () => <div className="mapghost" aria-hidden="true" />,
});

/**
 * `denied` is only ever a refusal — the user said no, or the browser has no
 * geolocation to offer. A fix that fails for any other reason (the OS location
 * service is off, no signal, the 12s timeout ran out) is `unavailable`: same
 * loss of distances, but telling someone who already granted the permission to
 * go and grant it is wrong, and it was the one thing they could not act on.
 *
 * There is deliberately no "ask for permission" state. The arrival effect
 * always resolves the question by itself — Permissions API, then locate() —
 * so a state like that only ever existed for the moment before the answer
 * came back, and rendering a notice for it meant every refresh flashed
 * "turn on location" at people who had granted it long ago. `locating` is
 * the honest name for that moment, and it renders as nothing.
 */
type LocMode = "locating" | "granted" | "denied" | "unavailable";

const STATUS_CLASS: Record<DutyStatus, string> = {
  OPEN: "s-open",
  CLOSING_SOON: "s-warn",
  ON_CALL: "s-oncall",
  CLOSED: "s-closed",
};

/** Sheet snap points as a translate ratio of app height: map / half / list. */
const SNAPS = [0.62, 0.42, 0.06];

function kmBetween(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const la = (a[0] * Math.PI) / 180;
  const lb = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Which layout to render. False until the media query can be read.
 *
 * useLayoutEffect, not useEffect: the server cannot know the viewport, so the
 * phone tree is always what is rendered first and the desktop one replaces it a
 * commit later. Under useEffect that replacement landed *after* a paint, so a
 * desktop arrival saw the phone layout full-width and then watched it snap into
 * a 400px panel. Reading the query before the browser paints makes the swap
 * invisible — it is the same two renders, just not two pictures.
 */
function useIsDesktop(): boolean {
  const [v, setV] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setV(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return v;
}

/**
 * False until the first client commit, on both sides of hydration.
 *
 * Everything the sheet's geometry depends on — its height, how far it is
 * translated down, how much of the map it covers — is measured from the live
 * DOM, so the server has none of it and the HTML it sends carries no inline
 * style at all. The browser paints that HTML before React ever runs, and an
 * unpositioned sheet is simply as tall as its contents: with a real roster in
 * it, the full height of the screen. This flag exists to let CSS hold it to a
 * sane size for exactly that one frame.
 */
function useHydrated(): boolean {
  const [v, setV] = useState(false);
  useLayoutEffect(() => setV(true), []);
  return v;
}

/**
 * Roster and fix, kept outside the component so a locale switch does not throw
 * them away.
 *
 * Switching TR/EN is a route change: /tr and /en are different segments, so
 * React unmounts this component and mounts a fresh one with empty state. That
 * used to mean a refetch and a second permission round on every switch — the
 * list blinked back to skeletons and the map lost its pins, for a change that
 * touches nothing but the labels. The roster is locale-independent (names,
 * addresses and hours come from KTEB untranslated), so the same response is
 * correct on both sides of the switch.
 *
 * Module scope, not sessionStorage: this only has to outlive a client-side
 * navigation within one page load, and a hard reload should still go to the
 * network. TTL is short — the duty roster changes at the day boundary, and a
 * stale one at 3am is exactly the failure this app exists to prevent.
 */
const ROSTER_TTL_MS = 60_000;
/**
 * Keyed by duty date: the strip lets one visit look at several days, and
 * stepping back to a day already seen should not go to the network again.
 * Today and a planned Tuesday are different rosters, so one slot would make
 * the second lookup serve the first one's list.
 */
const rosterCache = new Map<string, { data: OnDutyResponse; at: number }>();
let daysCache: DutyDaysResponse | null = null;
let coordsCache: [number, number] | null = null;
/**
 * The region last shown. Module scope, like the caches above, and for the same
 * reason: a region is a page of its own now, so moving between regions unmounts
 * this component instead of changing its state, and a ref would forget on every
 * move. The framing itself is MapView's decision — it compares the pins it is
 * about to frame against the ones it framed last — so this is only what closes
 * an open detail card that the new region may not contain.
 */
let lastRegion: RegionCode | null | undefined = undefined;

/**
 * Whether the arrival fix has already had its say about the region.
 *
 * Module scope for the same reason as `lastRegion`: choosing a region navigates
 * to that region's page, which unmounts this component, so a ref would forget
 * the decision the moment it was acted on. It also makes the guess a one-time
 * event per visit rather than a standing rule — someone who follows the guess
 * with "Tüm bölgeler" gets the whole island back and keeps it, instead of being
 * pushed home again by their own coordinates.
 */
let autoRegionSettled = false;

const freshRoster = (date: string) => {
  const hit = rosterCache.get(date);
  return hit && Date.now() - hit.at < ROSTER_TTL_MS ? hit : null;
};

/**
 * `liveStatus` is null on a future day.
 *
 * Open / closing soon / on-call are all statements about the clock right now.
 * Printed against next Tuesday's roster they would be false, and false in the
 * most costly direction: someone reading "Açık" drives to a pharmacy that is
 * shut. Null forces every render site to decide what to show instead.
 */
type Listed = OnDutyPharmacy & { liveStatus: DutyStatus | null; dist: number | null };

/**
 * Everything the server already knows, handed over so the first HTML carries
 * the roster instead of a skeleton.
 *
 * This component is a client component, but Next still renders it to HTML on
 * the server — it printed placeholders only because its state started empty.
 * A crawler that does not run our JavaScript sees whatever this pass produces,
 * so the roster reaching it is entirely a matter of these props being filled.
 */
export interface AppShellProps {
  /** The day's roster, queried server-side. Ignored if it is for another day. */
  initialData?: OnDutyResponse | null;
  /** Which days the roster covers, so the strip is in the HTML too. */
  initialDays?: DutyDaysResponse | null;
  /**
   * Minutes into the duty day as the server saw them.
   *
   * Status badges are derived from the clock, so letting each side read its own
   * would make the server's HTML and the client's first render disagree and
   * break hydration. Both start from this; the interval below corrects it.
   */
  initialNowMinutes?: number;
  /** Region fixed by the URL path, on a region page. Null on the homepage. */
  initialRegion?: RegionCode | null;
  /**
   * A sentence or two about the region being shown, rendered with the filter.
   *
   * Under the region control on desktop; at the head of the list on a phone,
   * where putting it between the chips and the map would cost the map the
   * height of a paragraph. A region page is otherwise this same component over
   * a filtered list, and this is what keeps each of the sixteen of them a page
   * of its own rather than a near-copy of the other fifteen.
   */
  regionIntro?: ReactNode;
}

export default function AppShell({
  initialData = null,
  initialDays = null,
  initialNowMinutes,
  initialRegion = null,
  regionIntro = null,
}: AppShellProps = {}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDesktop = useIsDesktop();
  const hydrated = useHydrated();

  // The path wins over the query: on a region page the region *is* the URL, and
  // a stray ?region= pointing elsewhere must not quietly override it.
  const regionParam = searchParams.get("region");
  const region: RegionCode | null =
    initialRegion ?? (isRegionCode(regionParam) ? regionParam : null);

  const [days, setDays] = useState<DutyDaysResponse | null>(daysCache ?? initialDays);
  /**
   * Today comes from the server, not from `new Date()` here.
   *
   * The duty day rolls over at 08:00 Nicosia time, and a device whose clock or
   * timezone is off would otherwise label the wrong chip "Bugün" — on a strip
   * whose entire job is telling today apart from the days after it. The local
   * fallback only covers the moment before the days request lands.
   */
  const todayDate = days?.today ?? dutyDateFor();

  const dateParam = searchParams.get("date");
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayDate;
  const isFuture = date > todayDate;

  const cachedRoster = freshRoster(date);
  /**
   * The server's roster counts only for the day it was queried for. Stepping to
   * another day through the strip changes `date` while this prop stays put, and
   * showing Tuesday's list under Friday's heading is worse than a skeleton.
   */
  const seeded = initialData && initialData.dutyDate === date ? initialData : null;
  const [data, setData] = useState<OnDutyResponse | null>(cachedRoster?.data ?? seeded);
  const [loading, setLoading] = useState(!cachedRoster && !seeded);
  const [error, setError] = useState(false);
  const [locMode, setLocMode] = useState<LocMode>(coordsCache ? "granted" : "locating");
  const [coords, setCoords] = useState<[number, number] | null>(coordsCache);
  const [sel, setSel] = useState<number | null>(null);
  const [snap, setSnap] = useState(1);
  const [nowMin, setNowMin] = useState(initialNowMinutes ?? dutyMinutesFor());
  const [fitSignal, setFitSignal] = useState(0);
  const [showLocHelp, setShowLocHelp] = useState(false);
  const [mapInset, setMapInset] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(true);

  const bumpFit = useCallback(() => setFitSignal((n) => n + 1), []);

  /**
   * Drag the day strip sideways with a mouse.
   *
   * `overflow-x: auto` is scrollable by touch and by a trackpad's sideways
   * gesture, and by nothing a mouse can do — no horizontal wheel, no grab. On
   * a desktop panel showing six of fifteen days that made the rest of the
   * strip unreachable. Touch is left alone: it already pans natively, and
   * intercepting it here would fight the browser.
   */
  const stripRef = useRef<HTMLDivElement>(null);
  const stripDrag = useRef({ down: false, startX: 0, startLeft: 0, moved: false });

  const onStripDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = stripRef.current;
    if (!el || e.pointerType !== "mouse") return;
    stripDrag.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
  }, []);

  const onStripMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = stripRef.current;
    const d = stripDrag.current;
    if (!d.down || !el) return;
    const dx = e.clientX - d.startX;
    // A few pixels of slop, so a click that trembles still selects a day.
    if (!d.moved && Math.abs(dx) < 4) return;
    d.moved = true;
    el.scrollLeft = d.startLeft - dx;
  }, []);

  const onStripUp = useCallback(() => {
    stripDrag.current.down = false;
    // The click that follows this release fires first, so the flag is still
    // set when it is checked; clearing it a task later keeps it from sitting
    // there and swallowing an unrelated click — a keyboard Enter on a focused
    // chip, say, which arrives with no pointerdown to reset it.
    setTimeout(() => {
      stripDrag.current.moved = false;
    }, 0);
  }, []);

  // A drag that ends on a chip must not also pick that day.
  const onStripClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!stripDrag.current.moved) return;
    stripDrag.current.moved = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /** Vertical wheel over the strip scrolls it sideways — a mouse has no other way. */
  const onStripWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = stripRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // already a sideways gesture
    el.scrollLeft += e.deltaY;
  }, []);

  /**
   * The roster is fetched without the user's coordinates, and distances are
   * computed on the device.
   *
   * SPEC §10 requires that location is never written to logs, and a hosting
   * platform logs the request URL including its query string — so sending
   * lat/lng that way would put it in the logs by construction. There is no
   * need for it either: a duty day has ~15 pharmacies, which is nothing to
   * sort locally. It also means every visitor shares one cached response
   * instead of fragmenting the edge cache by coordinate.
   */
  const load = useCallback(async (forDate: string) => {
    setLoading(true);
    setError(false);
    try {
      // Today is the bare URL: it keeps the default view on one edge-cached
      // response instead of splitting it by a date every visitor sends.
      const qs = forDate === todayDate ? "" : `?date=${forDate}`;
      const res = await fetch(`/api/on-duty${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as OnDutyResponse;
      rosterCache.set(forDate, { data: json, at: Date.now() });
      setData(json);
      // Re-fit once the roster lands: the first fit runs while the map is still
      // empty, so without this the pins stay off the visible strip.
      setFitSignal((n) => n + 1);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [todayDate]);

  /** Serve the day from the cache when it is there, fetch it when it is not. */
  const ensureRoster = useCallback(
    async (forDate: string) => {
      const hit = freshRoster(forDate);
      if (hit) {
        setData(hit.data);
        setLoading(false);
        setError(false);
        setFitSignal((n) => n + 1);
        return;
      }
      await load(forDate);
    },
    [load]
  );

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      // Nothing to grant here, so this is not a refusal either.
      setLocMode("unavailable");
      return;
    }
    setLocMode("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        coordsCache = c;
        setCoords(c);
        setLocMode("granted");
        setShowLocHelp(false);
        // No refetch: the roster does not depend on where the user is.
        setFitSignal((n) => n + 1);
      },
      (err) =>
        // PERMISSION_DENIED is the only code that means "no". TIMEOUT and
        // POSITION_UNAVAILABLE happen with the permission granted, and used to
        // land on the same panel — which is why the prompt to enable location
        // kept coming back to people who had already enabled it.
        setLocMode(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 }
    );
  }, []);

  /**
   * Ask for location as soon as the user arrives.
   *
   * SPEC §7 requires a full page before the permission prompt, not the absence
   * of one, so the roster is awaited first: the browser dialog then opens over
   * a list the user can already read and use, and dismissing it leaves them
   * exactly where they were. Denial stays a normal path — the region filter
   * carries the whole app without coordinates.
   *
   * Only a `prompt` or already-`granted` state reaches getCurrentPosition. A
   * standing `denied` is not worth calling into: the browser answers instantly
   * from the stored decision without showing anything, so it would only flash
   * the "locating" state on the way to a refusal the user already gave.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // A fresh cache means this mount is a locale switch, not an arrival:
      // the list is already on screen and the fix already known, so neither
      // the network nor the user is asked again. A server-rendered roster is
      // the same story from the other direction — the list is already here, so
      // fetching it again would only ask for what we are looking at. It is
      // filed under the day it belongs to, so a locale switch keeps it too.
      if (seeded) rosterCache.set(seeded.dutyDate, { data: seeded, at: Date.now() });
      else if (!cachedRoster) await load(date);
      if (cancelled || typeof navigator === "undefined" || coordsCache) return;
      if (!navigator.permissions?.query) {
        // Safari before 16 has no Permissions API for geolocation; asking is
        // the only way to find out where we stand.
        locate();
        return;
      }
      try {
        const res = await navigator.permissions.query({ name: "geolocation" });
        if (cancelled) return;
        if (res.state === "denied") setLocMode("denied");
        else locate();
      } catch {
        if (!cancelled) locate();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Follow the permission after the first read.
   *
   * Granting location in the browser's own settings does not reload the page,
   * so without this the notice sits there — asking for something the user has
   * already given — until they think to refresh. The same subscription catches
   * a permission revoked mid-visit, where the coordinates on screen have just
   * become something we are no longer allowed to hold.
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => {
      if (!status) return;
      if (status.state === "denied") {
        coordsCache = null;
        setCoords(null);
        setLocMode("denied");
      } else if (status.state === "granted" && !coordsCache) {
        locate();
      }
    };
    navigator.permissions
      .query({ name: "geolocation" })
      .then((s) => {
        if (cancelled) return;
        status = s;
        s.addEventListener("change", onChange);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      status?.removeEventListener("change", onChange);
    };
  }, [locate]);

  /**
   * Which days the roster covers. Fetched once, and allowed to fail quietly:
   * without it the strip simply does not appear and the app is what it was.
   */
  useEffect(() => {
    if (daysCache) return;
    // Rendered server-side already: file it so a locale switch keeps the strip
    // without a round trip, and skip the request.
    if (initialDays) {
      daysCache = initialDays;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/duty-days");
        if (!res.ok) return;
        const json = (await res.json()) as DutyDaysResponse;
        if (!Array.isArray(json.days) || !json.today) return;
        daysCache = json;
        if (!cancelled) setDays(json);
      } catch {
        /* no strip, no harm */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A day picked from the strip. Skipped on mount, where the arrival effect
  // above already loads the day in the URL.
  const loadedDate = useRef(date);
  useEffect(() => {
    if (loadedDate.current === date) return;
    loadedDate.current = date;
    setSel(null);
    ensureRoster(date);
  }, [date, ensureRoster]);

  // Re-derive status badges as time passes. The first call runs after
  // hydration, which is where the server's clock — carried in to keep the two
  // renders identical — hands back over to this device's own.
  useEffect(() => {
    setNowMin(dutyMinutesFor());
    const id = setInterval(() => setNowMin(dutyMinutesFor()), 30000);
    return () => clearInterval(id);
  }, []);

  // Every on-duty pharmacy, region filter not yet applied: the map draws the
  // ones outside the filter too, dimmed, so the filter never looks like the
  // island has emptied out.
  const all: Listed[] = useMemo(() => {
    if (!data) return [];
    return data.pharmacies.map((p) => ({
      ...p,
      liveStatus: isFuture
        ? null
        : deriveStatus(
            {
              opensAt: p.opensAt,
              closesAt: p.closesAt,
              oncallFrom: p.onCall?.from ?? null,
              oncallTo: p.onCall?.to ?? null,
            },
            nowMin
          ),
      dist:
        p.distanceKm ??
        (coords && p.lat !== null && p.lng !== null
          ? Math.round(kmBetween(coords, [p.lat, p.lng]) * 10) / 10
          : null),
    }));
  }, [data, coords, nowMin, isFuture]);

  const list: Listed[] = useMemo(() => {
    const filtered = all.filter((p) => !region || p.region === region);
    if (coords) {
      filtered.sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
    } else {
      const order: DutyStatus[] = ["OPEN", "CLOSING_SOON", "ON_CALL", "CLOSED"];
      const rank = (p: Listed) => (p.liveStatus ? order.indexOf(p.liveStatus) : 0);
      filtered.sort(
        (a, b) =>
          (a.region ? REGION_ORDER.indexOf(a.region) : 99) - (b.region ? REGION_ORDER.indexOf(b.region) : 99) ||
          rank(a) - rank(b) ||
          a.name.localeCompare(b.name, "tr")
      );
    }
    return filtered;
  }, [all, region, coords]);

  const points: MapPoint[] = useMemo(
    () =>
      all
        .filter((p) => p.lat !== null && p.lng !== null)
        .map((p) => ({
          id: p.id,
          name: p.name,
          lat: p.lat as number,
          lng: p.lng as number,
          statusClass: p.liveStatus ? STATUS_CLASS[p.liveStatus] : "s-future",
          // Outside the filter: context only, so it is dimmed, ignored by the
          // fit, and not clickable — its card is not in the list to open.
          muted: region !== null && p.region !== region,
        })),
    [all, region]
  );

  const selected = sel !== null ? list.find((p) => p.id === sel) ?? null : null;

  /**
   * Where a given region and day live.
   *
   * The region is a path segment rather than a query parameter, so every
   * region is an address a crawler can follow and rank — the filter used to be
   * client state with a `?region=` written after the fact, which meant the
   * eight of them shared one URL and none of them existed as far as search was
   * concerned. The day stays a query: today is the bare URL, because a link to
   * "today" that pinned a date would be wrong the morning after it was shared.
   */
  const rosterHref = useCallback(
    (r: RegionCode | null, d: string) => {
      const query = d === todayDate ? undefined : { date: d };
      return r
        ? ({ pathname: "/pharmacies-on-duty/[region]", params: { region: REGION_SLUG[r] }, query } as const)
        : ({ pathname: "/", query } as const);
    },
    [todayDate]
  );

  const setRegion = useCallback(
    (r: RegionCode | null) => {
      setSel(null);
      router.replace(rosterHref(r, date), { scroll: false });
    },
    [router, rosterHref, date]
  );

  /**
   * On arrival with a fix, open the region the user is standing in.
   *
   * Only from the unfiltered roster: a region in the path or the query is the
   * user's own choice — or a shared link's — and coordinates do not get to
   * overrule it. `autoRegionSettled` then closes the question for the rest of
   * the visit, so clearing the filter back to the whole island sticks.
   *
   * The region comes from the nearest on-duty pharmacy rather than from a fixed
   * map of the island, which means it is the roster's answer and can differ from
   * one night to the next: standing in the same spot, the nearest pharmacy on
   * duty may be over the boundary. That is the trade accepted for needing no
   * geography beyond what the list already carries.
   *
   * A fix off the island buys nothing here — the nearest on-duty pharmacy to
   * someone in London is a coin toss between eight regions — so it settles the
   * question without narrowing anything, and the full roster stands.
   */
  useEffect(() => {
    if (autoRegionSettled || region !== null || locMode !== "granted" || !coords) return;
    if (!isOnCyprus(coords[0], coords[1])) {
      autoRegionSettled = true;
      return;
    }
    // Distances need the roster; before it lands there is nothing to be nearest
    // to, so this waits rather than settling on no answer.
    const nearest = all
      .filter((p) => p.region !== null && p.dist !== null)
      .sort((a, b) => (a.dist as number) - (b.dist as number))[0];
    if (!nearest) return;
    autoRegionSettled = true;
    setRegion(nearest.region as RegionCode);
  }, [all, coords, locMode, region, setRegion]);

  const setDate = useCallback(
    (d: string) => {
      setSel(null);
      router.replace(rosterHref(region, d), { scroll: false });
    },
    [router, rosterHref, region]
  );

  // Refit once the region has actually landed in the URL — a chip is a link, so
  // the new set only exists after the navigation, not when it is clicked. The
  // open detail card is closed here for the same reason: it may well belong to
  // a pharmacy the new region does not contain.
  useEffect(() => {
    const changed = lastRegion !== undefined && lastRegion !== region;
    lastRegion = region;
    if (!changed) return;
    setSel(null);
    bumpFit();
  }, [region, bumpFit]);

  const select = useCallback(
    (id: number) => {
      setSel(id);
      if (!isDesktop) setSnap((s) => (s === 2 ? 1 : s));
    },
    [isDesktop]
  );
  const closeDetail = useCallback(() => setSel(null), []);

  /* ---------- mobile sheet layout & drag ---------- */
  const appRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const staleRef = useRef<HTMLDivElement>(null);
  const mapwrapRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const insetRef = useRef(0);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  const layoutMobile = useCallback(() => {
    const app = appRef.current;
    const chips = chipsRef.current;
    const mapwrap = mapwrapRef.current;
    const sheet = sheetRef.current;
    if (!app || !chips || !mapwrap || !sheet) return;
    const H = app.clientHeight;
    const chipsBottom = chips.getBoundingClientRect().bottom - app.getBoundingClientRect().top;
    const staleH = staleRef.current?.offsetHeight ?? 0;
    mapwrap.style.top = `${chipsBottom + staleH}px`;
    mapwrap.style.bottom = "0px";
    sheet.style.height = `${H - chipsBottom - staleH - 10}px`;
    const drop = SNAPS[snapRef.current] * H;
    sheet.style.transform = `translateY(${drop}px)`;
    // The sheet is anchored to the bottom and then pushed down by the snap, so
    // that much of it hangs off the screen — and 100dvh can itself run past the
    // visible viewport while the browser chrome is showing. Pad the sheet by
    // both, or the last card and the footer sit below the fold unreachably.
    const visible = window.visualViewport?.height ?? window.innerHeight;
    const belowFold = Math.max(0, app.getBoundingClientRect().bottom - visible);
    sheet.style.paddingBottom = `${drop + belowFold}px`;
    // How much of the map the sheet covers, so fitBounds can stay above it.
    // That is the sheet's *visible* height: its own height minus how far it is
    // translated down, not the distance from the top of the viewport.
    const sheetH = H - chipsBottom - staleH - 10;
    const covered = Math.max(0, Math.round(sheetH - SNAPS[snapRef.current] * H));
    if (insetRef.current !== covered) {
      insetRef.current = covered;
      setMapInset(covered);
    }
  }, []);

  useLayoutEffect(() => {
    if (!isDesktop) layoutMobile();
  });

  useEffect(() => {
    const on = () => {
      layoutMobile();
      bumpFit();
    };
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [layoutMobile, bumpFit]);

  const dragState = useRef({ startY: 0, startT: 0, dragging: false });
  const onGrabPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const app = appRef.current;
    if (!app) return;
    dragState.current = {
      startY: e.clientY,
      startT: SNAPS[snapRef.current] * app.clientHeight,
      dragging: true,
    };
    sheetRef.current?.classList.add("dragging");
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onGrabPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragState.current;
    const app = appRef.current;
    const sheet = sheetRef.current;
    if (!st.dragging || !app || !sheet) return;
    const H = app.clientHeight;
    const tY = Math.min(SNAPS[0] * H, Math.max(SNAPS[2] * H, st.startT + (e.clientY - st.startY)));
    sheet.style.transform = `translateY(${tY}px)`;
  };
  const onGrabPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragState.current;
    const app = appRef.current;
    if (!st.dragging || !app) return;
    st.dragging = false;
    sheetRef.current?.classList.remove("dragging");
    const H = app.clientHeight;
    const ratio = (st.startT + (e.clientY - st.startY)) / H;
    let best = 0;
    let bd = Infinity;
    SNAPS.forEach((s, i) => {
      const d = Math.abs(s - ratio);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (Math.abs(e.clientY - st.startY) < 4) {
      // Tap: cycle half → list → map → half, like the design.
      setSnap((s) => (s === 1 ? 2 : s === 2 ? 0 : 1));
    } else {
      setSnap(best);
    }
  };

  /* ---------- shared strings ---------- */
  const dutyDate = data?.dutyDate ?? date;
  const dutyDateText = formatDutyDate(dutyDate, locale);
  const titleTxt =
    coords && locMode === "granted"
      ? t("list.nearest")
      : region
        ? // regionDisplay, not the bare label: on the English page this heading
          // is where "Kyrenia" gets said, since the URL keeps the Turkish slug.
          t("list.regionOnDuty", { region: regionDisplay(region, locale) })
        : isFuture
          ? t("list.onDate", { date: formatDutyDateParts(date, locale, "short").dayMonth })
          : t("list.tonight");
  const showInitialSkeleton = loading && !data;
  const countTxt = showInitialSkeleton ? "" : t("list.count", { count: list.length });

  const badgeLabel = (p: Listed) =>
    p.liveStatus ? t(`status.${p.liveStatus}`, { time: p.closesAt ?? "" }) : "";

  // The clock times carry the chip; the words around them stay plain text, so
  // the eye lands on the hours without the whole sentence shouting.
  const hoursLine = (p: Listed) => {
    const time = (c: ReactNode) => <span className="t">{c}</span>;
    if (p.onCall && p.opensAt && p.closesAt) {
      return t.rich("hours.oncall", { t: time, open: p.opensAt, close: p.closesAt, until: p.onCall.to });
    }
    if (p.opensAt && p.closesAt) return t.rich("hours.range", { t: time, open: p.opensAt, close: p.closesAt });
    return t.rich("hours.unknown", { t: time, raw: p.hoursRaw });
  };

  /* ---------- fragments ---------- */

  // Only offer the picker once there is more than one day to pick. When the
  // days request fails the chip stays the plain label it has always been.
  const canPickDay = (days?.days.length ?? 0) > 1;
  const tomorrow = addDutyDays(todayDate, 1);

  // Short form on the phone — "23 Ağu Paz" rather than "23 Ağustos Pazar
  // gecesi": the long one does not fit the header beside a name as long as a
  // domain, and truncating it mid-word reads worse than saying less.
  const dateChipInner = (short: boolean) =>
    t.rich(short ? "header.dutyDateShort" : "header.dutyNightShort", {
      b: (c) => <strong>{c}</strong>,
      ...formatDutyDateParts(dutyDate, locale, short ? "short" : "long"),
    });

  const dateChip = (short: boolean) =>
    canPickDay ? (
      <button
        className={`datechip pick ${pickerOpen ? "on" : ""}`}
        onClick={() => setPickerOpen((v) => !v)}
        // No aria-label: it said "close the picker" while the button visibly
        // read as a date, and an accessible name that does not contain the
        // visible label breaks voice control ("tap 23 Ağu" found nothing).
        // The date is the name; aria-expanded carries the open/closed state.
        aria-expanded={pickerOpen}
      >
        {dateChipInner(short)}
        <span className="caret" aria-hidden="true" />
      </button>
    ) : (
      <div className="datechip">{dateChipInner(short)}</div>
    );

  const dayStrip =
    canPickDay && pickerOpen ? (
      <div
        className="daystrip"
        ref={stripRef}
        role="group"
        aria-label={t("days.label")}
        onPointerDown={onStripDown}
        onPointerMove={onStripMove}
        onPointerUp={onStripUp}
        onPointerLeave={onStripUp}
        onClickCapture={onStripClickCapture}
        onWheel={onStripWheel}
      >
        {days!.days.map((d) => {
          const parts = formatDayChipParts(d, locale);
          const top = d === todayDate ? t("days.today") : d === tomorrow ? t("days.tomorrow") : parts.weekday;
          return (
            <button key={d} className="day" aria-pressed={d === date} onClick={() => setDate(d)}>
              <span className="w">{top}</span>
              {/* Every chip carries its month. Printing it only where it
                  changed left most of the row as bare numbers, which reads as
                  a count rather than a date. */}
              <span className="d">{`${parts.day} ${parts.month}`}</span>
            </button>
          );
        })}
      </div>
    ) : null;

  /**
   * What a future day says about itself.
   *
   * It takes the freshness banner's place rather than sitting beside it: on
   * this day nothing on screen is a live reading, and the one thing the reader
   * must not do is act on it as if it were tonight. It has to survive being
   * arrived at from a shared link, at 3am, by someone who did not choose the
   * date — hence the way back to today, always in reach.
   */
  const planBar = isFuture ? (
    <div className="planbar" role="status">
      {/* The way back shares the heading's row rather than standing beside the
          sentence: on a phone a button in that column squeezes the text into a
          third line, and the bar is already taking room from the map. */}
      <div className="pbtop">
        <b>{t("days.planTitle")}</b>
        <button className="pbback" onClick={() => setDate(todayDate)}>
          {t("days.backToToday")}
        </button>
      </div>
      <p>{t.rich("days.planBody", { b: (c) => <b>{c}</b>, date: formatDutyDate(date, locale) })}</p>
    </div>
  ) : null;

  const staleBanner =
    data?.stale && !showInitialSkeleton && !isFuture ? (
      <div className="stale" role="status">
        <span className="dot" aria-hidden="true" />
        {/* An empty roster is flagged stale even when the sync itself is
            recent, and "last updated 2 hours ago" above an empty list would
            read as a reassurance. Say what is actually missing instead. */}
        {data.pharmacies.length === 0
          ? t("stale.missing")
          : data.lastSyncedAt
            ? t("stale.label", {
                ago: formatAgo(data.lastSyncedAt, locale),
                time: formatClock(data.lastSyncedAt, locale),
              })
            : t("stale.never")}
        <button onClick={() => load(date)}>{t("actions.refresh")}</button>
      </div>
    ) : null;

  /**
   * Where the "Yol Tarifi" button goes.
   *
   * KTEB leaves the map iframe off some detail pages, so those pharmacies
   * reach us with no coordinates: no pin on the map, nothing to focus when
   * their card is tapped. Dropping the button as well left the user with an
   * address on screen and no way to act on it, so they fall back to a Maps
   * search on the name and address — good enough to start driving, and the
   * card says plainly that this one is not on our map.
   */
  const mapsHref = (p: Listed) =>
    p.lat !== null && p.lng !== null
      ? directionsUrl(p.lat, p.lng)
      : // The address already names its town, so the region is the fallback for
        // when there is no address at all, not an addition to one.
        mapSearchUrl(p.name, p.address ?? (p.region ? REGION_LABEL[p.region] : null), "KKTC");

  /**
   * The pharmacy's own page.
   *
   * A real link rather than another way to select the card, and the only one
   * on this side of the site: until now four hundred pharmacy pages hung off
   * the directory alone, unreachable from the roster that names them every
   * night. The slug is derived from the id and the name the response already
   * carries, so nothing extra has to be fetched to draw it.
   */
  const pharmacyHref = (p: Listed) =>
    ({ pathname: "/pharmacy/[slug]", params: { slug: pharmacySlug(p) } }) as const;

  const card = (p: Listed) => {
    const cls = p.liveStatus ? STATUS_CLASS[p.liveStatus] : "s-future";
    return (
      <article key={p.id} className={`card ${sel === p.id ? "sel" : ""}`} onClick={() => select(p.id)}>
        <div className="row1">
          <h3>
            <button
              className="titlebtn"
              onClick={(e) => {
                e.stopPropagation();
                select(p.id);
              }}
            >
              {p.name}
            </button>
          </h3>
          {p.dist !== null && (
            <span className="dist">
              {formatDistanceKm(p.dist, locale)}
              <small>{t("status.distance")}</small>
            </span>
          )}
        </div>
        <div className="meta">
          {p.liveStatus && (
            <span className={`badge ${cls}`}>
              <span className="b" aria-hidden="true" />
              {badgeLabel(p)}
            </span>
          )}
          {p.region && <span className="region">{REGION_LABEL[p.region]}</span>}
        </div>
        {p.address && <p className="addr">{p.address}</p>}
        <p className="hours">{hoursLine(p)}</p>
        {/* Quiet text rather than a third button: the two below are what
            someone at 2am actually presses, and this is for the other visit —
            the one asking when this pharmacy is next on duty. The click is
            stopped because the card behind it selects a map pin. */}
        <p className="pglink">
          <Link href={pharmacyHref(p)} onClick={(e) => e.stopPropagation()}>
            {t("list.pharmacyPage")}
          </Link>
        </p>
        <div className="acts">
          {/* Calling is offered on a planned day too. It was withheld on the
              grounds that ringing about a shift days away puts a real person on
              the line for nothing — but the person deciding to make that call
              is better placed to judge it than we are, and someone planning
              around a pharmacy usually wants to confirm it. */}
          {p.phone && (
            <a
              className="btn sec"
              href={telHref(p.phone)}
              onClick={(e) => e.stopPropagation()}
            >
              <PhoneIcon />
              {t("actions.call")}
            </a>
          )}
          <a
            className="btn pri"
            href={mapsHref(p)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <NavIcon />
            {t("actions.directions")}
          </a>
        </div>
      </article>
    );
  };

  const skeletons = (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div className="sk" key={i} aria-hidden="true">
          <i style={{ width: "62%" }} />
          <i style={{ width: "38%", marginTop: 11 }} />
          <i style={{ width: "88%", marginTop: 13, height: 9 }} />
          <i style={{ width: "70%", marginTop: 7, height: 9 }} />
          <i style={{ width: "100%", marginTop: 14, height: 44, borderRadius: 12 }} />
        </div>
      ))}
    </>
  );

  const listContent = (
    <>
      {locMode === "denied" && !showInitialSkeleton && (
        <div className="notice">
          <h2>{t("denied.title")}</h2>
          <p>{t("denied.body")}</p>
          {showLocHelp && <p style={{ marginTop: 8 }}>{t("denied.help")}</p>}
          <div className="acts two">
            <button className="btn sec" onClick={locate}>
              {t("actions.retry")}
            </button>
            <button className="btn ghost" onClick={() => setShowLocHelp((v) => !v)}>
              {t("actions.howTo")}
            </button>
          </div>
        </div>
      )}
      {locMode === "unavailable" && !showInitialSkeleton && (
        <div className="notice">
          <h2>{t("unavailable.title")}</h2>
          <p>{t("unavailable.body")}</p>
          <div className="acts">
            <button className="btn sec" onClick={locate}>
              {t("actions.retry")}
            </button>
          </div>
        </div>
      )}
      {showInitialSkeleton ? (
        skeletons
      ) : error && !data ? (
        <div className="notice">
          <h2>{t("error.title")}</h2>
          <p>{t("error.body")}</p>
          <div className="acts">
            <button className="btn sec" onClick={() => load(date)}>
              {t("actions.retry")}
            </button>
          </div>
        </div>
      ) : list.length === 0 ? (
        <div className="notice empty">
          <div className="glyph" aria-hidden="true">
            —
          </div>
          <h2>
            {region
              ? t("empty.title", { region: REGION_LABEL[region] })
              : isFuture
                ? t("days.emptyTitle", { date: formatDutyDate(date, locale) })
                : t("empty.titleAll")}
          </h2>
          <p>{isFuture && !region ? t("days.emptyBody") : t("empty.body")}</p>
          {region && (
            <div className="acts">
              <button className="btn sec" onClick={() => setRegion(null)}>
                {t("actions.showAll")}
              </button>
            </div>
          )}
        </div>
      ) : (
        list.map(card)
      )}
    </>
  );

  const foot = (
    <div className="foot">
      <span>
        <b>{t("foot.sourceLabel")}</b>{" "}
        <a href="https://kteb.org/dp/?lang=tr" target="_blank" rel="noopener noreferrer">
          Kıbrıs Türk Eczacılar Birliği
        </a>
      </span>
      {/* The only path to these pages. Naming the publisher and saying what
          happens to a location reading is table stakes for a health listing —
          and unreachable pages are the same as unwritten ones. */}
      <span className="links">
        <Link href="/pharmacies">{t("nav.pharmacies")}</Link>
        {/* Real elements rather than an ::before on the links. A pseudo-element
            lives inside the anchor, so the dot picked up the hover underline
            and sat inside the click target — a separator you could click. */}
        <i aria-hidden="true">·</i>
        <Link href="/widget">{t("nav.widget")}</Link>
        <i aria-hidden="true">·</i>
        <Link href="/about">{t("nav.about")}</Link>
        <i aria-hidden="true">·</i>
        <Link href="/privacy">{t("nav.privacy")}</Link>
        <i aria-hidden="true">·</i>
        <Link href="/contact">{t("nav.contact")}</Link>
      </span>
    </div>
  );

  const detailBody = (p: Listed) => {
    const cls = p.liveStatus ? STATUS_CLASS[p.liveStatus] : "s-future";
    return (
      <>
        <div className="grab" onClick={closeDetail}>
          <span />
        </div>
        <button className="dclose" onClick={closeDetail} aria-label={t("actions.close")}>
          <CloseIcon />
        </button>
        <div className="dbody">
          <div className="meta" style={{ margin: "0 0 10px" }}>
            {p.liveStatus && (
              <span className={`badge ${cls}`}>
                <span className="b" aria-hidden="true" />
                {badgeLabel(p)}
              </span>
            )}
            {p.region && <span className="region">{REGION_LABEL[p.region]}</span>}
            {p.dist !== null && (
              <span className="region" style={{ fontFamily: "var(--font-mono)" }}>
                {formatDistanceKm(p.dist, locale)}
              </span>
            )}
          </div>
          <h2>{p.name}</h2>
          <div className="acts">
            {p.phone && (
              <a className="btn sec" href={telHref(p.phone)}>
                <PhoneIcon />
                {t("actions.call")}
              </a>
            )}
            <a
              className="btn pri"
              href={mapsHref(p)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <NavIcon />
              {t("actions.directions")}
            </a>
          </div>
          {(p.lat === null || p.lng === null) && (
            // Otherwise selecting this pharmacy looks broken: the map does not
            // move, because there is no pin of its to move to.
            <div className="nopinnote">{t("detail.noPin")}</div>
          )}
          {p.liveStatus === "ON_CALL" && p.onCall && (
            <div className="oncallnote">
              {t.rich("detail.oncallNote", {
                b: (c) => <b>{c}</b>,
                until: p.onCall.to,
              })}
            </div>
          )}
          <dl className="kv">
            {p.address && (
              <div>
                <dt>{t("detail.address")}</dt>
                <dd>{p.address}</dd>
              </div>
            )}
            {p.phone && (
              <div>
                <dt>{t("detail.phone")}</dt>
                <dd className="mono">{p.phone}</dd>
              </div>
            )}
            {p.phoneAlt && (
              <div>
                <dt>{t("detail.phoneAlt")}</dt>
                <dd className="mono">{p.phoneAlt}</dd>
              </div>
            )}
            {p.opensAt && p.closesAt && (
              <div>
                <dt>{t("detail.duty")}</dt>
                <dd className="mono">
                  {p.opensAt} – {p.closesAt}
                </dd>
              </div>
            )}
            <div>
              <dt>{t("detail.date")}</dt>
              <dd>{t("detail.dutyNight", { date: dutyDateText })}</dd>
            </div>
            {p.dist !== null && (
              <div>
                <dt>{t("detail.approx")}</dt>
                <dd className="mono">
                  {t("detail.drive", {
                    distance: formatDistanceKm(p.dist, locale),
                    duration: formatDriveTime(Math.max(3, Math.round(p.dist * 1.6)), locale),
                  })}
                </dd>
              </div>
            )}
          </dl>
          <p className="pglink dpglink">
            <Link href={pharmacyHref(p)}>{t("list.pharmacyPage")}</Link>
          </p>
          <p className="dsource">
            {t.rich("detail.source", {
              b: (c) => <b>{c}</b>,
              warn: (c) => <span className="warn">{c}</span>,
            })}
          </p>
        </div>
      </>
    );
  };

  // Both locales side by side: the current one is inert text, the other a link.
  const localeItem = (l: "tr" | "en") =>
    l === locale ? (
      <span className="on" aria-current="true">
        {l.toUpperCase()}
      </span>
    ) : (
      <Link
        // Same view, other language: the region is in the path now and the day
        // in the query, so both have to be carried across or the switch quietly
        // sends you back to tonight's island-wide list.
        href={rosterHref(region, date)}
        locale={l}
        aria-label={t("header.switchLocale")}
      >
        {l.toUpperCase()}
      </Link>
    );

  const localeSwitch = (
    <div className="localesw">
      {localeItem("tr")}
      <span className="sep" aria-hidden="true">
        /
      </span>
      {localeItem("en")}
    </div>
  );

  const recenterButton = (
    <button className="mapbtn" onClick={coords ? bumpFit : locate} title={t("header.recenter")}>
      <RecenterIcon />
      {t("header.recenter")}
    </button>
  );

  const mapView = (
    <MapView
      points={points}
      me={coords}
      selId={sel}
      fitSignal={fitSignal}
      onSelect={select}
      bottomInset={isDesktop ? 0 : mapInset}
    />
  );

  /* ---------- desktop ---------- */
  if (isDesktop) {
    return (
      <div className="app" ref={appRef}>
        <div className="deskgrid">
          <div className="panel">
            <div className="topbar">
              <div className="brand">
                <b>{t("app.name")}</b>
              </div>
              <div className="datechip" style={{ visibility: "hidden" }} />
              {localeSwitch}
            </div>
            {/* Its own row under the name and the locale switch, so neither of
                those has to grow a line to make room for it. Desktop only: the
                phone's topbar already shares one tight row with the date and
                the locate button. */}
            <p className="tagline">{t("app.tagline")}</p>
            {/* Its own paragraph rather than a second sentence: the strip below
                is the only part of this panel nobody thinks to touch, and a
                clause buried at the end of the first paragraph was not going
                to change that. */}
            <p className="tagline">{t("app.taglineDays")}</p>
            <div className="deskbar">{dateChip(false)}</div>
            {dayStrip}
            <div className="selectwrap">
              <div className="selectfield">
                <select
                  className="select"
                  aria-label={t("chips.regionFilter")}
                  value={region ?? "ALL"}
                  onChange={(e) => setRegion(isRegionCode(e.target.value) ? e.target.value : null)}
                >
                  <option value="ALL">{t("chips.allRegions")}</option>
                  {REGION_ORDER.map((r) => (
                    <option key={r} value={r}>
                      {REGION_LABEL[r]}
                    </option>
                  ))}
                </select>
                {/* Drawn here rather than left to the native arrow, which sits
                    hard against the border with no room to inset it. */}
                <span className="selectcaret" aria-hidden="true" />
              </div>
            </div>
            {regionIntro && <p className="regionintro">{regionIntro}</p>}
            {(planBar ?? staleBanner) && <div className="dstale">{planBar ?? staleBanner}</div>}
            <div className="sheethead">
              <h1>{titleTxt}</h1>
              <span className="n">{countTxt}</span>
            </div>
            <div className="list">{listContent}</div>
            {foot}
          </div>
          <div className="deskmap">
            <div className="mapwrap">{mapView}</div>
            <div className="mapbtns">{recenterButton}</div>
            {selected && <div className="deskdetail">{detailBody(selected)}</div>}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- mobile ---------- */
  return (
    <div className="app" ref={appRef}>
      <div className="topbar">
        <div className="brand">
          <b>{t("app.name")}</b>
        </div>
        {dateChip(true)}
        {localeSwitch}
      </div>
      {/* Region and day are different questions, so they get their own rows —
          on one line they read as a single filter and the day is lost in it.
          Both live inside the measured wrapper: the sheet is positioned from
          its bottom edge, so a strip outside it would sit under the map. */}
      <div ref={chipsRef}>
        {/* Links, not buttons: each region is a page of its own, and a crawler
            has to be able to walk to it. Scrolling is suppressed so tapping a
            chip does not also throw the sheet back to the top. */}
        <nav className="chips" aria-label={t("chips.regionFilter")}>
          <Link
            className="chip"
            href={rosterHref(null, date)}
            aria-current={region === null ? "page" : undefined}
            scroll={false}
          >
            {t("chips.all")}
          </Link>
          {REGION_ORDER.map((r) => (
            <Link
              key={r}
              className="chip"
              href={rosterHref(r, date)}
              aria-current={region === r ? "page" : undefined}
              scroll={false}
            >
              {REGION_LABEL[r]}
            </Link>
          ))}
        </nav>
        {dayStrip}
      </div>
      <div className="mstale" ref={staleRef}>{planBar ?? staleBanner}</div>
      <div className="mapwrap" ref={mapwrapRef}>
        {mapView}
        {/* The map container runs to the bottom of the screen, so buttons
            anchored to it end up behind the sheet and cannot be tapped.
            Lift them by however much the sheet currently covers. */}
        <div className="mapbtns" style={{ bottom: mapInset + 14 }}>
          {recenterButton}
        </div>
      </div>
      <section
        className={hydrated ? "sheet" : "sheet preboot"}
        ref={sheetRef}
        aria-label={t("list.title")}
      >
        {/* The handle and the heading drag together. On a phone the bar alone
            is a ~18px strip to land a thumb on, and the row under it looks
            just as grabbable — missing it read as a sheet that would not
            open at all. */}
        <div
          className="sheetdrag"
          onPointerDown={onGrabPointerDown}
          onPointerMove={onGrabPointerMove}
          onPointerUp={onGrabPointerUp}
        >
          <div className="grab">
            <span />
          </div>
          <div className="sheethead">
            <h1>{titleTxt}</h1>
            <span className="n">{countTxt}</span>
            <span className="sortbtn">{coords ? t("list.sortDistance") : t("list.sortRegion")}</span>
          </div>
        </div>
        <div className="list">
          {regionIntro && <p className="regionintro">{regionIntro}</p>}
          {listContent}
        </div>
        {foot}
      </section>
      <div className={`scrim ${selected ? "on" : ""}`} onClick={closeDetail} aria-hidden="true" />
      <aside className={`detail ${selected ? "on" : ""}`} aria-modal={selected ? true : undefined}>
        {selected && detailBody(selected)}
      </aside>
    </div>
  );
}
