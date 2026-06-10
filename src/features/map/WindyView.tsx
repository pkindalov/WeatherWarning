import type { CSSProperties } from "react";
import { useStore } from "../../shared/store/StoreContext";

const EMBED_ZOOM = 10;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
const TILE_SIZE_PX = 256;

// Pixel radius of the alert circle at the embed's fixed zoom, using the
// standard web-mercator metres-per-pixel at the given latitude. Lets us draw
// the same radius circle as the Leaflet view on top of the Windy iframe.
export const alertRadiusPx = (latDeg: number, radiusKm: number, zoom: number) => {
  const metersPerPixel =
    (EARTH_CIRCUMFERENCE_M * Math.cos((latDeg * Math.PI) / 180)) / (TILE_SIZE_PX * 2 ** zoom);
  return (radiusKm * 1000) / metersPerPixel;
};

export default function WindyView() {
  const { locations, activeId, settings } = useStore();
  const loc = locations.find((l) => l.id === activeId);
  const lat = loc?.lat ?? 20;
  const lon = loc?.lon ?? 0;

  // overlay=radar alone is not enough: the embed stays on its default
  // forecast product unless product=radar is selected too, and calendar=now
  // pins the timeline to the present instead of the forecast calendar.
  const src =
    `https://embed.windy.com/embed2.html` +
    `?lat=${lat}&lon=${lon}&zoom=${EMBED_ZOOM}&level=surface&overlay=radar&product=radar&calendar=now` +
    `&type=map&location=coordinates&metricWind=default&metricTemp=default&radarRange=-1`;

  const circleDiameterPx = 2 * alertRadiusPx(lat, settings.radiusKm, EMBED_ZOOM);

  return (
    <div className="mapwrap">
      <iframe
        key={activeId ?? `${lat},${lon}`}
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
            style={{ "--d": `${Math.round(circleDiameterPx)}px` } as CSSProperties}
          />
          <div className="windy-city-pin" aria-hidden="true">
            <span className="windy-city-pin__name">{loc.name}</span>
          </div>
        </>
      )}
    </div>
  );
}
