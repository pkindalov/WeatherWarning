/* ============================================================
   MapView.tsx — Leaflet map with an animated RainViewer radar
   overlay (free, no API key), plus the app's own location pin,
   alert radius, and storm-cell marker. The play button / time pill
   step through the RainViewer past + nowcast frames.
   ============================================================ */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useI18n } from "../../shared/i18n/I18nContext";
import { LEGEND, dbzColor, dbzBandRange } from "../radar/core";
import { radarTileTemplate, samplePointDbz } from "../radar/radar";
import { lastPastIndex, nowMarkerPercent } from "./playback";
import type { Level, NearestCell, RadarFrame, SavedLocation } from "../../shared/types";

interface MapViewProps {
  active: SavedLocation | null;
  radiusKm: number;
  level: Level;
  cell: NearestCell | null;
  frames: RadarFrame[];
  host: string;
  baseTime: number; // most recent observed (past) frame time, in seconds
  fitToken: number; // bump to recenter/fit the active location
}

const LEVEL_COLOR: Record<Level, string> = {
  danger: "#e53935",
  warning: "#f0972b",
  safe: "#1f9d72",
};

function pinIcon(color: string) {
  return L.divIcon({
    className: "ww-pin",
    html:
      '<div class="ww-pin-dot" style="--c:' +
      color +
      '"></div><div class="ww-pin-ring" style="--c:' +
      color +
      '"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export default function MapView({
  active,
  radiusKm,
  level,
  cell,
  frames,
  host,
  baseTime,
  fitToken,
}: MapViewProps) {
  const { t, fmtClock, dbzLabel } = useI18n();

  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const radarLayerRef = useRef<L.LayerGroup | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const cellRef = useRef<L.Marker | null>(null);
  const [ready, setReady] = useState(false);

  const activeRef = useRef(active);
  const radiusRef = useRef(radiusKm);
  activeRef.current = active;
  radiusRef.current = radiusKm;

  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pick, setPick] = useState<{ dbz: number | null; x: number; y: number } | null>(null);

  // legend: which band's tooltip is showing, whether it's open, and its dragged
  // position (null = the default CSS bottom-left corner).
  const [legendTip, setLegendTip] = useState<number | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const [legendPos, setLegendPos] = useState<{ x: number; y: number } | null>(null);
  const [legendDrag, setLegendDrag] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // refs so the (once-attached) picker handlers always read the live frame
  const hostRef = useRef(host);
  hostRef.current = host;
  const frameRef = useRef<RadarFrame | undefined>(frames[frameIdx]);
  frameRef.current = frames[frameIdx];

  /* ---- init map once ---- */
  useEffect(() => {
    if (!elRef.current) return;
    const map = L.map(elRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
      touchZoom: true,
      doubleClickZoom: true,
      zoomSnap: 0.5,
    }).setView([20, 0], 3);

    map.zoomControl.setPosition("topleft");

    // Base map without text so the radar overlay can sit between the terrain
    // and the place names.
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap, &copy; CARTO · radar &copy; RainViewer",
    }).addTo(map);

    radarLayerRef.current = L.layerGroup().addTo(map);

    // Place names painted on top of the radar so town/village labels stay
    // readable instead of being washed out by the cloud overlay.
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
      zIndex: 10,
    }).addTo(map);
    mapRef.current = map;
    setReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
      radarLayerRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      cellRef.current = null;
      setReady(false);
    };
  }, []);

  /* ---- location pin + alert radius ---- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !active) return;
    const ll: L.LatLngTuple = [active.lat, active.lon];
    const color = LEVEL_COLOR[level];

    if (!markerRef.current) {
      markerRef.current = L.marker(ll, { icon: pinIcon(color), zIndexOffset: 1000 }).addTo(map);
    } else {
      markerRef.current.setLatLng(ll);
      markerRef.current.setIcon(pinIcon(color));
    }

    if (!circleRef.current) {
      circleRef.current = L.circle(ll, {
        radius: radiusKm * 1000,
        color,
        weight: 1.5,
        opacity: 0.65,
        fillColor: color,
        fillOpacity: 0.06,
        dashArray: "4 5",
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(ll);
      circleRef.current.setRadius(radiusKm * 1000);
      circleRef.current.setStyle({ color, fillColor: color });
    }
  }, [ready, active, radiusKm, level]);

  /* ---- storm-cell marker ---- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (cellRef.current) {
      map.removeLayer(cellRef.current);
      cellRef.current = null;
    }
    if (!cell) return;
    // colour the cell marker by its own intensity so hail cells (red → magenta)
    // jump out from ordinary rain, not just by the overall alert level
    const color = dbzColor(cell.dbz);
    cellRef.current = L.marker([cell.lat, cell.lon], {
      icon: L.divIcon({
        className: "ww-cell",
        html:
          '<div class="ww-cell-ring" style="--c:' +
          color +
          '"></div><div class="ww-cell-x" style="--c:' +
          color +
          '">⚠</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
      zIndexOffset: 900,
    }).addTo(map);
  }, [ready, cell]);

  /* ---- recenter / fit on the active location ---- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const loc = activeRef.current;
    if (!loc) return;
    const bounds = L.latLng(loc.lat, loc.lon).toBounds(radiusRef.current * 2200);
    map.fitBounds(bounds, { animate: true, padding: [20, 20] });
  }, [ready, fitToken]);

  /* ---- default to the most recent observed frame when frames load ---- */
  useEffect(() => {
    if (!frames.length) return;
    setFrameIdx(lastPastIndex(frames, baseTime));
    setPlaying(false);
  }, [frames, baseTime]);

  /* ---- render the radar overlay for the current frame ---- */
  useEffect(() => {
    const group = radarLayerRef.current;
    if (!group || !ready || !frames.length || !host) return;
    const f = frames[(frameIdx + frames.length) % frames.length];
    group.clearLayers();
    L.tileLayer(radarTileTemplate(host, f.path), {
      opacity: 0.72,
      // RainViewer's global radar tiles only exist up to zoom 7; past that the
      // server returns a "Zoom Level Not Supported" placeholder. Cap the native
      // zoom so Leaflet upscales the z7 tile instead of requesting that placeholder.
      maxNativeZoom: 7,
      maxZoom: 19,
      zIndex: 5,
      tileSize: 256,
    }).addTo(group);
  }, [ready, frames, host, frameIdx]);

  /* ---- play loop ---- */
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const id = window.setInterval(() => {
      setFrameIdx((i) => (i + 1) % frames.length);
    }, 700);
    return () => window.clearInterval(id);
  }, [playing, frames.length]);

  /* ---- dBZ picker: read the radar value under the pointer/tap ---- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let raf = 0;
    let last: L.LeafletMouseEvent | null = null;

    const read = (e: L.LeafletMouseEvent) => {
      const f = frameRef.current;
      const h = hostRef.current;
      const { x, y } = e.containerPoint;
      if (!f || !h) {
        setPick({ dbz: null, x, y });
        return;
      }
      void samplePointDbz(h, f.path, e.latlng.lat, e.latlng.lng).then((dbz) =>
        setPick({ dbz, x, y })
      );
    };
    const onMove = (e: L.LeafletMouseEvent) => {
      last = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (last) read(last);
      });
    };
    const onOut = () => setPick(null);

    map.on("mousemove", onMove);
    map.on("mouseout", onOut);
    map.on("click", read);

    // Touch: show measurement while finger moves across the map (mirrors desktop hover)
    const container = map.getContainer();
    let lastTouch: { x: number; y: number; lat: number; lng: number } | null = null;
    let touchRaf = 0;

    const readTouch = () => {
      if (!lastTouch) return;
      const { x, y, lat, lng } = lastTouch;
      const f = frameRef.current;
      const h = hostRef.current;
      if (!f || !h) {
        setPick({ dbz: null, x, y });
        return;
      }
      void samplePointDbz(h, f.path, lat, lng).then((dbz) => setPick({ dbz, x, y }));
    };

    const getTouchPos = (touch: Touch) => {
      const rect = container.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      const latlng = map.containerPointToLatLng(L.point(x, y));
      return { x, y, lat: latlng.lat, lng: latlng.lng };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      lastTouch = getTouchPos(e.touches[0]);
      readTouch();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      lastTouch = getTouchPos(e.touches[0]);
      if (touchRaf) return;
      touchRaf = requestAnimationFrame(() => {
        touchRaf = 0;
        readTouch();
      });
    };

    const clearTouch = () => {
      lastTouch = null;
      setPick(null);
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: true });
    container.addEventListener("touchend", clearTouch);
    container.addEventListener("touchcancel", clearTouch);

    return () => {
      map.off("mousemove", onMove);
      map.off("mouseout", onOut);
      map.off("click", read);
      if (raf) cancelAnimationFrame(raf);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", clearTouch);
      container.removeEventListener("touchcancel", clearTouch);
      if (touchRaf) cancelAnimationFrame(touchRaf);
    };
  }, [ready]);

  /* ---- time pill label ---- */
  const f = frames[frameIdx];
  let pillLabel = t("pill_now");
  let pillVal = "—";
  let future = false;
  if (f) {
    if (f.time > baseTime + 60) {
      future = true;
      const diffMin = Math.max(1, Math.round((f.time - baseTime) / 60));
      pillLabel = t("pill_forecast");
      pillVal = t("forecast_val", { n: diffMin, clock: fmtClock(f.time) });
    } else {
      const behind = Math.round((baseTime - f.time) / 60);
      pillLabel = behind > 4 ? t("pill_past") : t("pill_now");
      pillVal = fmtClock(f.time);
    }
  }

  // Escalate the picker readout in step with the legend bands, so the pill's
  // colour always matches the cell's colour on the map. Reading the thresholds
  // from LEGEND stops them drifting the way the old hard-coded 50/60 did, which
  // left a 55 dBZ magenta cell wearing a red "storm" pill.
  const smallHailDbz = LEGEND.find((s) => s.key === "hail_small")!.dbz;
  const largeHailDbz = LEGEND.find((s) => s.key === "hail_large")!.dbz;
  const pickHail = pick?.dbz != null && pick.dbz >= smallHailDbz; // red band and up
  const pickBigHail = pick?.dbz != null && pick.dbz >= largeHailDbz; // magenta band
  const pickClass =
    "map-pick" + (pickBigHail ? " map-pick--hail" : pickHail ? " map-pick--storm" : "");

  /* ---- drag the legend around the map (pointer = mouse + touch) ---- */
  const onLegendDragStart = (e: React.PointerEvent) => {
    const wrap = wrapRef.current;
    const leg = legendRef.current;
    if (!wrap || !leg) return;
    const wr = wrap.getBoundingClientRect();
    const lr = leg.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - lr.left, y: e.clientY - lr.top };
    setLegendPos({ x: lr.left - wr.left, y: lr.top - wr.top });
    setLegendDrag(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onLegendDragMove = (e: React.PointerEvent) => {
    if (!legendDrag) return;
    const wrap = wrapRef.current;
    const leg = legendRef.current;
    if (!wrap || !leg) return;
    const wr = wrap.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - wr.left - dragOffset.current.x, wr.width - leg.offsetWidth));
    const y = Math.max(0, Math.min(e.clientY - wr.top - dragOffset.current.y, wr.height - leg.offsetHeight));
    setLegendPos({ x, y });
  };
  const onLegendDragEnd = (e: React.PointerEvent) => {
    setLegendDrag(false);
    // pointercancel already releases capture; calling release again throws.
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <>
      <div className="mapwrap" ref={wrapRef}>
        <div id="map" ref={elRef} />

      {pick && (
        <>
          <div className="map-pick-dot" style={{ left: pick.x, top: pick.y }} />
          <div className={pickClass} style={{ left: pick.x, top: pick.y }}>
            {pick.dbz != null
              ? `${pickHail ? "⚠ " : ""}${Math.round(pick.dbz)} dBZ · ${dbzLabel(pick.dbz)}`
              : t("d_no_echo")}
          </div>
        </>
      )}

      {legendOpen ? (
        <div
          ref={legendRef}
          className={"legend" + (legendDrag ? " legend--dragging" : "")}
          style={legendPos ? { left: legendPos.x, top: legendPos.y, bottom: "auto" } : undefined}
        >
          <div
            className="legend-head"
            onPointerDown={onLegendDragStart}
            onPointerMove={onLegendDragMove}
            onPointerUp={onLegendDragEnd}
            onPointerCancel={onLegendDragEnd}
          >
            <span className="legend-title">{t("legend_title")}</span>
            <button
              className="legend-btn"
              aria-label={t("legend_hide")}
              title={t("legend_hide")}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                setLegendTip(null); // don't reopen with a stale tooltip showing
                setLegendOpen(false);
              }}
            >
              ×
            </button>
          </div>
          <div className="legend-bar">
            {LEGEND.map((s, i) => (
              <i
                key={s.key}
                className="legend-seg"
                style={{ background: s.color }}
                // Hover preview for mouse only. Touch fires a synthetic
                // pointerenter + click together; ignoring the touch enter lets
                // the click below toggle the tip on instead of cancelling it.
                onPointerEnter={(e) => e.pointerType === "mouse" && setLegendTip(i)}
                onPointerLeave={(e) =>
                  e.pointerType === "mouse" && setLegendTip((c) => (c === i ? null : c))
                }
                onClick={() => setLegendTip((c) => (c === i ? null : i))}
              />
            ))}
          </div>
          <div className="legend-scale">
            <span>0</span>
            <span>20</span>
            <span>35</span>
            <span>50</span>
            <span>60+</span>
          </div>
          {legendTip != null && (
            <div className="legend-tip">
              {dbzBandRange(legendTip)} dBZ · {t("lbl_" + LEGEND[legendTip].key)}
            </div>
          )}
        </div>
      ) : (
        <button
          className="legend-show"
          aria-label={t("legend_show")}
          title={t("legend_show")}
          onClick={() => setLegendOpen(true)}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4 6h16v2H4zM4 11h16v2H4zM4 16h16v2H4z" />
          </svg>
        </button>
      )}

      <div className={"map-time" + (future ? " future" : "")}>
        <span className="pill">{pillLabel}</span>
        <span>{pillVal}</span>
      </div>
      </div>

      <div className="scrubber">
        <button
          className="scrubber__play"
          title={t("play_title")}
          aria-label={t("play_title")}
          onClick={() => setPlaying((p) => !p)}
          disabled={frames.length < 2}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="scrubber__track">
          <input
            className="scrubber__range"
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            step={1}
            value={frameIdx}
            onChange={(e) => {
              setPlaying(false);
              setFrameIdx(Number(e.target.value));
            }}
            disabled={frames.length < 2}
            aria-label={t("scrub_aria")}
          />
          {frames.length > 1 && (
            // "now" boundary: everything to its right is forecast (nowcast).
            // Passed as a 0–1 fraction so the CSS can offset by the slider
            // thumb radius and line the marker up with the thumb at the ends.
            <span
              className="scrubber__now"
              style={{ "--p": nowMarkerPercent(frames, baseTime) / 100 } as CSSProperties}
            />
          )}
        </div>
      </div>
    </>
  );
}
