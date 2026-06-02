/* ============================================================
   MapView.tsx — Leaflet map with an animated RainViewer radar
   overlay (free, no API key), plus the app's own location pin,
   alert radius, and storm-cell marker. The play button / time pill
   step through the RainViewer past + nowcast frames.
   ============================================================ */
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useI18n } from "../i18n/I18nContext";
import { LEGEND } from "../lib/core";
import { radarTileTemplate } from "../lib/radar";
import type { Level, NearestCell, RadarFrame, SavedLocation } from "../types";

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
  const { t, fmtClock } = useI18n();

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

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap, &copy; CARTO · radar &copy; RainViewer",
    }).addTo(map);

    radarLayerRef.current = L.layerGroup().addTo(map);
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
    cellRef.current = L.marker([cell.lat, cell.lon], {
      icon: L.divIcon({
        className: "ww-cell",
        html: '<div class="ww-cell-x">⚠</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
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
    let startIdx = 0;
    for (let i = 0; i < frames.length; i++) if (frames[i].time <= baseTime) startIdx = i;
    setFrameIdx(startIdx);
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

  return (
    <div className="mapwrap">
      <div id="map" ref={elRef} />

      <div className="legend">
        <div className="legend-title">{t("legend_title")}</div>
        <div className="legend-bar">
          {LEGEND.map((s) => (
            <i key={s.key} style={{ background: s.color }} />
          ))}
        </div>
        <div className="legend-scale">
          <span>10</span>
          <span>30</span>
          <span>50</span>
          <span>65+</span>
        </div>
      </div>

      <div className={"map-time" + (future ? " future" : "")}>
        <span className="pill">{pillLabel}</span>
        <span>{pillVal}</span>
      </div>

      <button
        className="play-btn"
        title="Play radar loop"
        aria-label="Play radar loop"
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
    </div>
  );
}
