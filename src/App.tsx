/* ============================================================
   App.tsx — orchestration: boot, geolocation, refresh, alerting.
   Replaces the original vanilla ui.js controller. The big win from
   React: status/details/footer re-render on language change, so the
   original applyStatic/applyView/view-remembering machinery is gone.
   ============================================================ */
import { useEffect, useRef, useState } from "react";
import { useI18n } from "./shared/i18n/I18nContext";
import { useStore } from "./shared/store/StoreContext";
import * as R from "./features/radar/radar";
import * as N from "./features/alerts/notify";
import { buildStatusText, type ResultLike } from "./features/status/statusText";
import { reverseName } from "./shared/lib/geo";
import type { AnalysisResult, Level, NearestCell, RadarFrame, SavedLocation } from "./shared/types";

import AppBar from "./shared/components/AppBar";
import LocationTabs from "./features/locations/LocationTabs";
import StatusBanner from "./features/status/StatusBanner";
import MapView from "./features/map/MapView";
import WindyView from "./features/map/WindyView";
import Details from "./features/status/Details";
import FootBar from "./features/status/FootBar";
import AlertPop, { type AlertPopState } from "./features/alerts/AlertPop";
import Toast from "./shared/components/Toast";
import SettingsSheet from "./features/settings/SettingsSheet";
import LocationsSheet from "./features/locations/LocationsSheet";

type AppStatus =
  | { kind: "system"; level: Level; titleKey: string; subKey: string; params?: Record<string, string | number> }
  | { kind: "result"; loc: SavedLocation; res: AnalysisResult };

const RANK: Record<Level, number> = { safe: 0, warning: 1, danger: 2 };

export default function App() {
  const { t, compass, dbzLabel, fmtKm } = useI18n();
  const store = useStore();
  const { locations, activeId, settings, getActive, getLastAlert, setLastAlert, setActive, addLocation, setSetting } =
    store;

  const [status, setStatus] = useState<AppStatus>({
    kind: "system",
    level: "safe",
    titleKey: "st_locating_title",
    subKey: "st_locating_sub",
  });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [host, setHost] = useState("");
  const [baseTime, setBaseTime] = useState(Date.now() / 1000);
  const [fitToken, setFitToken] = useState(0);
  const [sheet, setSheet] = useState<"settings" | "locations" | null>(null);
  const [mapMode, setMapMode] = useState<"rainviewer" | "windy">("windy");
  const [toastState, setToastState] = useState({ msg: "", show: false });
  const [alertPop, setAlertPop] = useState<AlertPopState>({ show: false, level: "danger", title: "", sub: "" });
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(() => N.permission());

  const toastTimer = useRef<number | undefined>(undefined);
  const alertTimer = useRef<number | undefined>(undefined);

  /* ---- toast ---- */
  function toast(msg: string) {
    setToastState({ msg, show: true });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastState((s) => ({ ...s, show: false })), 2400);
  }

  /* ---- status helpers ---- */
  function sysStatus(level: Level, titleKey: string, subKey: string, params?: Record<string, string | number>) {
    setStatus({ kind: "system", level, titleKey, subKey, params });
  }
  function promptManual() {
    sysStatus("safe", "st_addloc_title", "st_addloc_sub");
    setSheet("locations");
  }

  function statusText(loc: SavedLocation, res: ResultLike): { title: string; sub: string } {
    return buildStatusText(loc, res, { t, compass, dbzLabel, fmtKm });
  }

  /* ---- alerting ---- */
  function showAlertPop(level: Level, title: string, sub: string) {
    setAlertPop({ show: true, level, title, sub });
    window.clearTimeout(alertTimer.current);
    alertTimer.current = window.setTimeout(() => setAlertPop((s) => ({ ...s, show: false })), 9000);
  }

  function fireAlert(loc: SavedLocation, res: ResultLike) {
    const txt = statusText(loc, res);
    showAlertPop(res.level, txt.title, txt.sub);
    if (settings.notify && N.permission() === "granted") {
      void N.show("⚠ " + loc.name + " — " + txt.title, txt.sub, "ww-" + loc.id);
    }
    if (settings.sound) N.alarm(res.level);
    if (settings.vibrate) N.vibrate(res.level === "danger" ? [300, 100, 300, 100, 500] : [200, 120, 200]);
  }

  function maybeAlert(loc: SavedLocation, res: AnalysisResult) {
    const prev = getLastAlert(loc.id);
    const escalated = !prev || RANK[res.level] > RANK[prev.level];
    const stale = !!prev && Date.now() - prev.ts > 10 * 60 * 1000 && RANK[res.level] > 0;
    if (RANK[res.level] > 0 && (escalated || stale)) fireAlert(loc, res);
    setLastAlert(loc.id, res.level);
  }

  function applyResult(loc: SavedLocation, res: AnalysisResult) {
    setStatus({ kind: "result", loc, res });
    if (!res.tainted) maybeAlert(loc, res);
  }

  /* ---- refresh ----
     `force` re-fetches the RainViewer index and the radar frames so a manual
     refresh can actually pull a newer frame; without it analyze() reuses the
     index cached for 60s (and the footer "updated" time, tied to the frame,
     never moves). Mirrors the auto-refresh interval below. */
  async function refresh(opts?: { fit?: boolean; force?: boolean }) {
    const loc = getActive();
    if (!loc) {
      promptManual();
      return;
    }
    setRefreshing(true);
    if (opts?.fit) setFitToken((x) => x + 1);
    try {
      if (opts?.force) {
        const data = await R.loadMaps(true);
        const fl = R.frameList(data);
        setHost(data.host);
        setBaseTime((prev) => (fl.past.length ? fl.past[fl.past.length - 1].time : prev));
        setFrames(fl.all);
      }
      const res = await R.analyze(loc, settings);
      applyResult(loc, res);
      if (!res.tainted) setRefreshedAt(Date.now() / 1000);
    } catch {
      toast(t("t_radar_unavail"));
      sysStatus("safe", "st_unavail_title", "st_unavail_sub");
    } finally {
      setRefreshing(false);
    }
  }

  /* ---- geolocation auto-detect ---- */
  function autoDetect() {
    sysStatus("safe", "st_locating_title", "st_locating_sub");
    if (!navigator.geolocation) {
      promptManual();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const name = await reverseName(latitude, longitude, t("current_location"));
        const loc = addLocation({ name, kind: "current", lat: latitude, lon: longitude, auto: true });
        setActive(loc.id);
        refresh({ fit: true });
      },
      () => promptManual(),
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 60000 }
    );
  }

  /* refs so the once-only boot effect + interval call the latest closures */
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const autoDetectRef = useRef(autoDetect);
  autoDetectRef.current = autoDetect;
  const locationsRef = useRef(locations);
  locationsRef.current = locations;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  /* ---- boot (once) ---- */
  useEffect(() => {
    void N.registerSW();
    let mounted = true;
    (async () => {
      try {
        const data = await R.loadMaps();
        const fl = R.frameList(data);
        const base = fl.past.length ? fl.past[fl.past.length - 1].time : Date.now() / 1000;
        if (!mounted) return;
        setHost(data.host);
        setFrames(fl.all);
        setBaseTime(base);
      } catch {
        toast(t("t_radar_fail"));
      }
      if (!mounted) return;
      if (locationsRef.current.length) {
        if (!activeIdRef.current && locationsRef.current[0]) setActive(locationsRef.current[0].id);
        refreshRef.current({ fit: true });
      } else {
        autoDetectRef.current();
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- auto-refresh timer ---- */
  useEffect(() => {
    if (!settings.autoRefresh) return;
    const min = Math.max(5, settings.autoRefreshMin || 5);
    const id = window.setInterval(async () => {
      try {
        const data = await R.loadMaps(true);
        const fl = R.frameList(data);
        setHost(data.host);
        setBaseTime((prev) => (fl.past.length ? fl.past[fl.past.length - 1].time : prev));
        setFrames(fl.all);
      } catch {
        /* keep previous frames */
      }
      void refreshRef.current({ fit: false });
    }, min * 60 * 1000);
    return () => window.clearInterval(id);
  }, [settings.autoRefresh, settings.autoRefreshMin]);

  /* ---- unlock audio on first interaction (autoplay policy) ---- */
  useEffect(() => {
    const h = () => N.unlockAudio();
    document.body.addEventListener("pointerdown", h, { once: true });
    return () => document.body.removeEventListener("pointerdown", h);
  }, []);

  /* ---- notifications ---- */
  async function toggleNotify(on: boolean) {
    N.unlockAudio();
    if (on) {
      const p = await N.requestPermission();
      setNotifPerm(p);
      if (p !== "granted") {
        toast(t("t_blocked"));
        return;
      }
    }
    setSetting("notify", on);
  }
  async function enableNotif() {
    N.unlockAudio();
    const p = await N.requestPermission();
    setNotifPerm(p);
    if (p === "granted") {
      setSetting("notify", true);
      toast(t("t_alerts_on"));
    } else {
      toast(t("t_blocked"));
    }
  }
  function testAlert() {
    const loc = getActive() || ({ id: "_", name: "your location", kind: "other", lat: 0, lon: 0 } as SavedLocation);
    fireAlert(loc, {
      level: "danger",
      centerDbz: 58,
      trend: "approaching",
      radiusKm: settings.radiusKm,
      maxDbz: 58,
      nearest: { distanceKm: 0, bearing: 0, dbz: 58, lat: loc.lat, lon: loc.lon },
      eta: null,
      etaDbz: null,
    });
  }

  /* ---- derived view data ---- */
  const active = locations.find((l) => l.id === activeId) || locations[0] || null;
  const result = status.kind === "result" ? status.res : null;
  const cell: NearestCell | null =
    status.kind === "result" && !status.res.tainted ? status.res.nearest : null;

  const display = (() => {
    if (status.kind === "system") {
      return { level: status.level, title: t(status.titleKey), sub: t(status.subKey, status.params) };
    }
    const { loc, res } = status;
    if (res.tainted) {
      return { level: "safe" as Level, title: t("st_loaded_title"), sub: t("st_loaded_sub") };
    }
    const txt = statusText(loc, res);
    return { level: res.level, title: txt.title, sub: txt.sub };
  })();

  const showNotifCta = notifPerm !== "granted" && notifPerm !== "unsupported";

  return (
    <div id="app">
      <AppBar
        refreshing={refreshing}
        mapMode={mapMode}
        onRefresh={() => {
          N.unlockAudio();
          void refresh({ fit: false, force: true });
        }}
        onSettings={() => setSheet("settings")}
        onToggleMapMode={() => setMapMode((m) => (m === "rainviewer" ? "windy" : "rainviewer"))}
      />

      {/* workspace: left rail + radar. On desktop (≥900px) .workspace/.sidebar
          become a grid/flex shell; below that they collapse to display:contents
          so the children flow in the original mobile order (set via CSS order). */}
      <div className="workspace">
        <aside className="sidebar">
          <div className="rail-label">{t("loc_title")}</div>

          <LocationTabs
            onSelect={(id) => {
              setActive(id);
              void refresh({ fit: true });
            }}
            onAdd={() => setSheet("locations")}
          />

          <StatusBanner
            level={display.level}
            title={display.title}
            sub={display.sub}
            disclaimer={display.level !== "safe" ? t("forecast_disclaimer") : undefined}
          />

          <Details result={result} />

          <FootBar
            result={result}
            refreshedAt={refreshedAt}
            showNotifCta={showNotifCta}
            onEnableNotif={() => void enableNotif()}
          />
        </aside>

        {mapMode === "windy" ? (
          <WindyView key={activeId ?? "default"} />
        ) : (
          <MapView
            active={active}
            radiusKm={settings.radiusKm}
            radiusColor={settings.radiusColorMap}
            level={display.level}
            cell={cell}
            frames={frames}
            host={host}
            baseTime={baseTime}
            fitToken={fitToken}
          />
        )}
      </div>

      <AlertPop state={alertPop} onClose={() => setAlertPop((s) => ({ ...s, show: false }))} />
      <Toast msg={toastState.msg} show={toastState.show} />

      <div className={"scrim" + (sheet ? " open" : "")} onClick={() => setSheet(null)} />

      <SettingsSheet
        open={sheet === "settings"}
        notifPerm={notifPerm}
        onClose={() => setSheet(null)}
        onRefresh={(fit) => void refresh({ fit })}
        onToggleNotify={(on) => void toggleNotify(on)}
        onTest={testAlert}
      />
      <LocationsSheet
        open={sheet === "locations"}
        onClose={() => setSheet(null)}
        refresh={(fit) => void refresh({ fit })}
        toast={toast}
      />
    </div>
  );
}
