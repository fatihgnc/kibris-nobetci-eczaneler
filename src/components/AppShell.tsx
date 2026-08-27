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
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { dutyDateFor, dutyMinutesFor } from "@/lib/duty-date";
import {
  directionsUrl,
  mapSearchUrl,
  formatAgo,
  formatClock,
  formatDistanceKm,
  formatDriveTime,
  formatDutyDate,
  formatDutyDateParts,
  telHref,
} from "@/lib/format";
import { isRegionCode, REGION_LABEL, REGION_ORDER, type RegionCode } from "@/lib/regions";
import { deriveStatus, type DutyStatus } from "@/lib/status";
import type { OnDutyPharmacy, OnDutyResponse } from "@/lib/types";
import { CloseIcon, NavIcon, PhoneIcon, RecenterIcon } from "./icons";
import type { MapPoint } from "./MapView";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

type LocMode = "preask" | "locating" | "granted" | "denied";

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

function useIsDesktop(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setV(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
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
let rosterCache: { data: OnDutyResponse; at: number } | null = null;
let coordsCache: [number, number] | null = null;

type Listed = OnDutyPharmacy & { liveStatus: DutyStatus; dist: number | null };

export default function AppShell() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDesktop = useIsDesktop();

  const regionParam = searchParams.get("region");
  const region: RegionCode | null = isRegionCode(regionParam) ? regionParam : null;

  const cachedRoster = rosterCache && Date.now() - rosterCache.at < ROSTER_TTL_MS ? rosterCache : null;
  const [data, setData] = useState<OnDutyResponse | null>(cachedRoster?.data ?? null);
  const [loading, setLoading] = useState(!cachedRoster);
  const [error, setError] = useState(false);
  const [locMode, setLocMode] = useState<LocMode>(coordsCache ? "granted" : "preask");
  const [coords, setCoords] = useState<[number, number] | null>(coordsCache);
  const [sel, setSel] = useState<number | null>(null);
  const [snap, setSnap] = useState(1);
  const [nowMin, setNowMin] = useState(() => dutyMinutesFor());
  const [fitSignal, setFitSignal] = useState(0);
  const [showLocHelp, setShowLocHelp] = useState(false);
  const [mapInset, setMapInset] = useState(0);

  const bumpFit = useCallback(() => setFitSignal((n) => n + 1), []);

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
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/on-duty");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as OnDutyResponse;
      rosterCache = { data: json, at: Date.now() };
      setData(json);
      // Re-fit once the roster lands: the first fit runs while the map is still
      // empty, so without this the pins stay off the visible strip.
      setFitSignal((n) => n + 1);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocMode("denied");
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
      () => setLocMode("denied"),
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
      // the network nor the user is asked again.
      if (!cachedRoster) await load();
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

  // Re-derive status badges as time passes.
  useEffect(() => {
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
      liveStatus: deriveStatus(
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
  }, [data, coords, nowMin]);

  const list: Listed[] = useMemo(() => {
    const filtered = all.filter((p) => !region || p.region === region);
    if (coords) {
      filtered.sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
    } else {
      const order: DutyStatus[] = ["OPEN", "CLOSING_SOON", "ON_CALL", "CLOSED"];
      filtered.sort(
        (a, b) =>
          (a.region ? REGION_ORDER.indexOf(a.region) : 99) - (b.region ? REGION_ORDER.indexOf(b.region) : 99) ||
          order.indexOf(a.liveStatus) - order.indexOf(b.liveStatus) ||
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
          lat: p.lat as number,
          lng: p.lng as number,
          statusClass: STATUS_CLASS[p.liveStatus],
          // Outside the filter: context only, so it is dimmed, ignored by the
          // fit, and not clickable — its card is not in the list to open.
          muted: region !== null && p.region !== region,
        })),
    [all, region]
  );

  const selected = sel !== null ? list.find((p) => p.id === sel) ?? null : null;

  const setRegion = useCallback(
    (r: RegionCode | null) => {
      setSel(null);
      const params = new URLSearchParams(searchParams.toString());
      if (r) params.set("region", r);
      else params.delete("region");
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  // Refit once the region has actually landed in the URL. setRegion only asks
  // the router to navigate, so fitting inside it would still see the old set.
  const fittedRegion = useRef<RegionCode | null | undefined>(undefined);
  useEffect(() => {
    const first = fittedRegion.current === undefined;
    fittedRegion.current = region;
    if (!first) bumpFit();
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
  const dutyDate = data?.dutyDate ?? dutyDateFor();
  const dutyDateText = formatDutyDate(dutyDate, locale);
  const dutyParts = formatDutyDateParts(dutyDate, locale);
  // "23 Ağu Paz" rather than "23 Ağustos Pazar gecesi": the long form does not
  // fit the phone header beside a name as long as a domain, and truncating it
  // mid-word reads worse than saying less.
  const dutyPartsShort = formatDutyDateParts(dutyDate, locale, "short");
  const titleTxt =
    coords && locMode === "granted"
      ? t("list.nearest")
      : region
        ? t("list.regionOnDuty", { region: REGION_LABEL[region] })
        : t("list.tonight");
  const showInitialSkeleton = loading && !data;
  const countTxt = showInitialSkeleton ? "" : t("list.count", { count: list.length });

  const badgeLabel = (p: Listed) =>
    t(`status.${p.liveStatus}`, { time: p.closesAt ?? "" });

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
  const staleBanner =
    data?.stale && !showInitialSkeleton ? (
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
        <button onClick={() => load()}>{t("actions.refresh")}</button>
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

  const card = (p: Listed) => {
    const cls = STATUS_CLASS[p.liveStatus];
    const callFirst = p.liveStatus === "ON_CALL" || p.liveStatus === "CLOSED";
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
          <span className={`badge ${cls}`}>
            <span className="b" aria-hidden="true" />
            {badgeLabel(p)}
          </span>
          {p.region && <span className="region">{REGION_LABEL[p.region]}</span>}
        </div>
        {p.address && <p className="addr">{p.address}</p>}
        <p className="hours">{hoursLine(p)}</p>
        <div className="acts">
          {p.phone && (
            <a
              className={`btn ${callFirst ? "pri" : "sec"}`}
              href={telHref(p.phone)}
              onClick={(e) => e.stopPropagation()}
            >
              <PhoneIcon />
              {t("actions.call")}
            </a>
          )}
          <a
            className={`btn ${callFirst ? "sec" : "pri"}`}
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
      {locMode === "preask" && !showInitialSkeleton && (
        <div className="notice locask">
          <h4>{t("locask.title")}</h4>
          <p>{t("locask.body")}</p>
          <div className="acts">
            <button className="btn pri" onClick={locate}>
              {t("locask.cta")}
            </button>
          </div>
        </div>
      )}
      {locMode === "denied" && !showInitialSkeleton && (
        <div className="notice">
          <h4>{t("denied.title")}</h4>
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
      {showInitialSkeleton ? (
        skeletons
      ) : error && !data ? (
        <div className="notice">
          <h4>{t("error.title")}</h4>
          <p>{t("error.body")}</p>
          <div className="acts">
            <button className="btn sec" onClick={() => load()}>
              {t("actions.retry")}
            </button>
          </div>
        </div>
      ) : list.length === 0 ? (
        <div className="notice empty">
          <div className="glyph" aria-hidden="true">
            —
          </div>
          <h4>{region ? t("empty.title", { region: REGION_LABEL[region] }) : t("empty.titleAll")}</h4>
          <p>{t("empty.body")}</p>
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
      <span className="warn">{t("foot.confirm")}</span>
    </div>
  );

  const detailBody = (p: Listed) => {
    const cls = STATUS_CLASS[p.liveStatus];
    const callFirst = p.liveStatus === "ON_CALL" || p.liveStatus === "CLOSED";
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
            <span className={`badge ${cls}`}>
              <span className="b" aria-hidden="true" />
              {badgeLabel(p)}
            </span>
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
              <a className={`btn ${callFirst ? "pri" : "sec"}`} href={telHref(p.phone)}>
                <PhoneIcon />
                {t("actions.call")}
              </a>
            )}
            <a
              className={`btn ${callFirst ? "sec" : "pri"}`}
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
        href={region ? { pathname: "/", query: { region } } : "/"}
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
    <button className="iconbtn" onClick={bumpFit} title={t("header.recenter")} aria-label={t("header.recenter")}>
      <RecenterIcon />
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
            <div className="deskbar">
              <div className="datechip">
                {t.rich("header.dutyNightShort", { b: (c) => <strong>{c}</strong>, ...dutyParts })}
              </div>
            </div>
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
            {staleBanner && <div className="dstale">{staleBanner}</div>}
            <div className="sheethead">
              <h2>{titleTxt}</h2>
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
        <div className="datechip">
          {t.rich("header.dutyDateShort", { b: (c) => <strong>{c}</strong>, ...dutyPartsShort })}
        </div>
        {localeSwitch}
      </div>
      <div className="chips" ref={chipsRef} role="group" aria-label={t("chips.regionFilter")}>
        <button className="chip" aria-pressed={region === null} onClick={() => setRegion(null)}>
          {t("chips.all")}
        </button>
        {REGION_ORDER.map((r) => (
          <button key={r} className="chip" aria-pressed={region === r} onClick={() => setRegion(r)}>
            {REGION_LABEL[r]}
          </button>
        ))}
      </div>
      <div ref={staleRef}>{staleBanner}</div>
      <div className="mapwrap" ref={mapwrapRef}>
        {mapView}
        {/* The map container runs to the bottom of the screen, so buttons
            anchored to it end up behind the sheet and cannot be tapped.
            Lift them by however much the sheet currently covers. */}
        <div className="mapbtns" style={{ bottom: mapInset + 14 }}>
          {recenterButton}
        </div>
      </div>
      <section className="sheet" ref={sheetRef} aria-label={t("list.title")}>
        <div
          className="grab"
          onPointerDown={onGrabPointerDown}
          onPointerMove={onGrabPointerMove}
          onPointerUp={onGrabPointerUp}
        >
          <span />
        </div>
        <div className="sheethead">
          <h2>{titleTxt}</h2>
          <span className="n">{countTxt}</span>
          <span className="sortbtn">{coords ? t("list.sortDistance") : t("list.sortRegion")}</span>
        </div>
        <div className="list">{listContent}</div>
        {foot}
      </section>
      <div className={`scrim ${selected ? "on" : ""}`} onClick={closeDetail} aria-hidden="true" />
      <aside className={`detail ${selected ? "on" : ""}`} aria-modal={selected ? true : undefined}>
        {selected && detailBody(selected)}
      </aside>
    </div>
  );
}
