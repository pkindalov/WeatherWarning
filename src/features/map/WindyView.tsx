import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useStore } from "../../shared/store/StoreContext";

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

export default function WindyView() {
  const { locations, activeId, settings } = useStore();
  const loc = locations.find((l) => l.id === activeId);
  const lat = loc?.lat ?? 20;
  const lon = loc?.lon ?? 0;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(MAX_EMBED_ZOOM);

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

  return (
    <div className="mapwrap" ref={wrapRef}>
      <iframe
        key={`${activeId ?? `${lat},${lon}`}@${zoom}`}
        src={src}
        className="windy-iframe"
        title="Windy radar"
        allowFullScreen
      />
      {loc && (
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
          <div className="windy-city-pin" aria-hidden="true">
            <span className="windy-city-pin__name">{loc.name}</span>
          </div>
        </>
      )}
    </div>
  );
}
