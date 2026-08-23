"use client";
// Main application shell — mobile-first (map + draggable bottom sheet),
// desktop (400px list panel + full-height map) from 1024px up.
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
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
  formatAgo,
  formatClock,
  formatDistanceKm,
  formatDutyDate,
  formatDutyDateParts,
  telHref,
} from "@/lib/format";
import { isRegionCode, REGION_LABEL, REGION_ORDER, type RegionCode } from "@/lib/regions";
import { deriveStatus, type DutyStatus } from "@/lib/status";
import type { OnDutyPharmacy, OnDutyResponse } from "@/lib/types";
import { CloseIcon, LocateIcon, NavIcon, PhoneIcon, RecenterIcon } from "./icons";
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

  const [data, setData] = useState<OnDutyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [locMode, setLocMode] = useState<LocMode>("preask");
  const [coords, setCoords] = useState<[number, number] | null>(null);
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
      setData((await res.json()) as OnDutyResponse);
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

  // Render a full page first, then only auto-locate when permission is
  // already granted — never prompt on load (SPEC §7).
  useEffect(() => {
    load();
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((res) => {
          if (res.state === "granted") locate();
          else if (res.state === "denied") setLocMode("denied");
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-derive status badges as time passes.
  useEffect(() => {
    const id = setInterval(() => setNowMin(dutyMinutesFor()), 30000);
    return () => clearInterval(id);
  }, []);

  const list: Listed[] = useMemo(() => {
    if (!data) return [];
    const filtered = data.pharmacies
      .filter((p) => !region || p.region === region)
      .map((p) => ({
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
  }, [data, region, coords, nowMin]);

  const points: MapPoint[] = useMemo(
    () =>
      list
        .filter((p) => p.lat !== null && p.lng !== null)
        .map((p, i) => ({
          id: p.id,
          lat: p.lat as number,
          lng: p.lng as number,
          statusClass: STATUS_CLASS[p.liveStatus],
          index: i + 1,
        })),
    [list]
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
      bumpFit();
    },
    [searchParams, router, pathname, bumpFit]
  );

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
    sheet.style.transform = `translateY(${SNAPS[snapRef.current] * H}px)`;
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
  const titleTxt =
    coords && locMode === "granted"
      ? t("list.nearest")
      : region
        ? t("list.regionOnDuty", { region: REGION_LABEL[region] })
        : t("list.tonight");
  const showInitialSkeleton = loading && !data;
  const countTxt = showInitialSkeleton ? "" : t("list.count", { count: list.length });
  const otherLocale = locale === "tr" ? "en" : "tr";

  const badgeLabel = (p: Listed) =>
    t(`status.${p.liveStatus}`, { time: p.closesAt ?? "" });

  const hoursLine = (p: Listed) => {
    if (p.onCall && p.opensAt && p.closesAt) {
      return t("hours.oncall", { open: p.opensAt, close: p.closesAt, until: p.onCall.to });
    }
    if (p.opensAt && p.closesAt) return t("hours.range", { open: p.opensAt, close: p.closesAt });
    return t("hours.unknown", { raw: p.hoursRaw });
  };

  /* ---------- fragments ---------- */
  const staleBanner =
    data?.stale && !showInitialSkeleton ? (
      <div className="stale" role="status">
        <span className="dot" aria-hidden="true" />
        {data.lastSyncedAt
          ? t("stale.label", {
              ago: formatAgo(data.lastSyncedAt, locale),
              time: formatClock(data.lastSyncedAt, locale),
            })
          : t("stale.never")}
        <button onClick={() => load()}>{t("actions.refresh")}</button>
      </div>
    ) : null;

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
          {p.lat !== null && p.lng !== null && (
            <a
              className={`btn ${callFirst ? "sec" : "pri"}`}
              href={directionsUrl(p.lat, p.lng)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <NavIcon />
              {t("actions.directions")}
            </a>
          )}
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
            {p.lat !== null && p.lng !== null && (
              <a
                className={`btn ${callFirst ? "sec" : "pri"}`}
                href={directionsUrl(p.lat, p.lng)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <NavIcon />
                {t("actions.directions")}
              </a>
            )}
          </div>
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
                    minutes: Math.max(3, Math.round(p.dist * 1.6)),
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

  const localeSwitch = (
    <Link
      className="iconbtn txt localebtn"
      href={region ? { pathname: "/", query: { region } } : "/"}
      locale={otherLocale}
      aria-label={t("header.switchLocale")}
    >
      {otherLocale.toUpperCase()}
    </Link>
  );

  const locButton = (
    <button
      className={`iconbtn ${locMode === "granted" ? "on" : ""}`}
      onClick={() => (locMode === "granted" ? bumpFit() : locate())}
      title={t("header.findMe")}
      aria-label={t("header.findMe")}
    >
      <LocateIcon />
    </button>
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
                <span className="mark" aria-hidden="true" />
                <b>{t("app.name")}</b>
              </div>
              <div className="datechip" style={{ visibility: "hidden" }} />
              {localeSwitch}
            </div>
            <div className="deskbar">
              <div className="datechip">
                {t.rich("header.dutyNightShort", { b: (c) => <strong>{c}</strong>, ...dutyParts })}
              </div>
              <div className="spacer" />
              {locButton}
            </div>
            <div className="selectwrap">
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
          <span className="mark" aria-hidden="true" />
          <b>{t("app.name")}</b>
        </div>
        <div className="datechip">
          {/* Short form: the full wording overflows this row on 360-392px phones,
              which carry a locale switch the desktop header has room for. */}
          {t.rich("header.dutyNightShort", { b: (c) => <strong>{c}</strong>, ...dutyParts })}
        </div>
        {localeSwitch}
        {locButton}
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
        <div className="mapbtns">{recenterButton}</div>
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
