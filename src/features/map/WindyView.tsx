import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useStore } from "../../shared/store/StoreContext";
import { dbzColor, lonLatToPixel } from "../radar/core";
import type { NearestCell } from "../../shared/types";

const MAX_EMBED_ZOOM = 10; // city-level view, used whenever the circle fits
const MIN_EMBED_ZOOM = 5;
// Leave a margin so the circle's edge isn't glued to the map border.
const CIRCLE_FIT_FRACTION = 0.9;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
const TILE_SIZE_PX = 256;

// Pixel radius of the alert circle at a given zoom, using the standard
// web-mercator metres-per-pixel at the given latitude. Lets us draw the same
// radius circle as the Leaflet view on top of the Windy iframe.
export const alertRadiusPx = (latDeg: number, radiusKm: number, zoom: number) => {
  const metersPerPixel =
    (EARTH_CIRCUMFERENCE_M * Math.cos((latDeg * Math.PI) / 180)) / (TILE_SIZE_PX * 2 ** zoom);
  return (radiusKm * 1000) / metersPerPixel;
};

// Largest zoom (capped at MAX_EMBED_ZOOM) at which the alert circle still fits
// inside the map box. On phones the 25 km circle at zoom 10 is wider than the
// whole screen, so the embed zooms out until the circle is visible.
export const fitEmbedZoom = (
  latDeg: number,
  radiusKm: number,
  widthPx: number,
  heightPx: number
) => {
  const fitPx = Math.min(widthPx, heightPx) * CIRCLE_FIT_FRACTION;
  if (fitPx <= 0) return MAX_EMBED_ZOOM; // box not laid out yet
  for (let zoom = MAX_EMBED_ZOOM; zoom > MIN_EMBED_ZOOM; zoom--) {
    if (2 * alertRadiusPx(latDeg, radiusKm, zoom) <= fitPx) return zoom;
  }
  return MIN_EMBED_ZOOM;
};

// Screen offset (px) of a radar cell from the map centre at the embed zoom,
// in the same web-mercator pixel space as alertRadiusPx, so the warning
// marker and the radius circle line up on the overlay.
export const cellOffsetPx = (
  centerLat: number,
  centerLon: number,
  cellLat: number,
  cellLon: number,
  zoom: number
) => {
  const center = lonLatToPixel(centerLat, centerLon, zoom);
  const cell = lonLatToPixel(cellLat, cellLon, zoom);
  return { dx: cell.px - center.px, dy: cell.py - center.py };
};

interface WindyViewProps {
  cell: NearestCell | null;
  fitToken: number; // bump to re-center the iframe on the active location
}

export default function WindyView({ cell, fitToken }: WindyViewProps) {
  const { locations, activeId, settings } = useStore();
  // same "active location" rule as App.tsx / getActive(): a stale or missing
  // activeId falls back to the first saved location, not the world view
  const loc = locations.find((l) => l.id === activeId) ?? locations[0];
  const lat = loc?.lat ?? 20;
  const lon = loc?.lon ?? 0;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(MAX_EMBED_ZOOM);
  const [exploring, setExploring] = useState(false);
  // Bumped each time exploration ends so the iframe remounts at the original location.
  const [snapToken, setSnapToken] = useState(0);
  const wasExploring = useRef(false);

  // The Windy embed is a cross-origin iframe so mousedown inside it never
  // reaches the parent. window.blur fires when focus transfers to the iframe
  // (i.e. the user clicked inside it), and mouseup/focus fire when they're done.
  useEffect(() => {
    const hide = () => setExploring(true);
    const show = () => setExploring(false);
    window.addEventListener("blur", hide);
    window.addEventListener("mouseup", show);
    window.addEventListener("focus", show);
    return () => {
      window.removeEventListener("blur", hide);
      window.removeEventListener("mouseup", show);
      window.removeEventListener("focus", show);
    };
  }, []);

  // When exploration ends, snap the iframe back to the user's location.
  useEffect(() => {
    if (wasExploring.current && !exploring) {
      setSnapToken((t) => t + 1);
    }
    wasExploring.current = exploring;
  }, [exploring]);

  useLayoutEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      setZoom(fitEmbedZoom(lat, settings.radiusKm, el.clientWidth, el.clientHeight));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [lat, settings.radiusKm]);

  // overlay=radar alone is not enough: the embed stays on its default
  // forecast product unless product=radar is selected too, and calendar=now
  // pins the timeline to the present instead of the forecast calendar.
  const src =
    `https://embed.windy.com/embed2.html` +
    `?lat=${lat}&lon=${lon}&zoom=${zoom}&level=surface&overlay=radar&product=radar&calendar=now` +
    `&type=map&location=coordinates&metricWind=default&metricTemp=default&radarRange=-1`;

  const circleDiameterPx = 2 * alertRadiusPx(lat, settings.radiusKm, zoom);
  const cellOffset = loc && cell ? cellOffsetPx(lat, lon, cell.lat, cell.lon, zoom) : null;

  return (
    <div
      className="mapwrap"
      ref={wrapRef}
      onMouseDown={() => setExploring(true)}
    >
      <iframe
        key={`${activeId ?? `${lat},${lon}`}@${zoom}@${fitToken}@${snapToken}`}
        src={src}
        className="windy-iframe"
        title="Windy radar"
        allowFullScreen
      />
      {loc && !exploring && (
        <>
          <div
            className="windy-radius"
            aria-hidden="true"
            style={
              {
                "--d": `${Math.round(circleDiameterPx)}px`,
                "--c": settings.radiusColorWindy,
              } as CSSProperties
            }
          />
          {settings.showWindyPin && (
            <div className="windy-city-pin" aria-hidden="true">
              <span className="windy-city-pin__name">{loc.name}</span>
            </div>
          )}
          {cell && cellOffset && (
            <div
              className="windy-cell"
              aria-hidden="true"
              style={
                {
                  "--dx": `${Math.round(cellOffset.dx)}px`,
                  "--dy": `${Math.round(cellOffset.dy)}px`,
                  // coloured by the cell's own intensity, same rule as the
                  // Leaflet storm-cell marker (red storm vs magenta hail)
                  "--c": dbzColor(cell.dbz),
                } as CSSProperties
              }
            >
              <span className="windy-cell__ring" />
              <span className="windy-cell__mark">⚠</span>
              <span className="windy-cell__dbz">{Math.round(cell.dbz)} dBZ</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
