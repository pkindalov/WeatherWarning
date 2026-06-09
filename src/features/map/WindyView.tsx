import { useStore } from "../../shared/store/StoreContext";

export default function WindyView() {
  const { locations, activeId } = useStore();
  const loc = locations.find((l) => l.id === activeId);
  const lat = loc?.lat ?? 20;
  const lon = loc?.lon ?? 0;

  const src =
    `https://embed.windy.com/embed2.html` +
    `?lat=${lat}&lon=${lon}&zoom=10&level=surface&overlay=radar` +
    `&type=map&location=coordinates&metricWind=default&metricTemp=default&radarRange=-1`;

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
        <div className="windy-city-pin" aria-hidden="true">
          <span className="windy-city-pin__name">{loc.name}</span>
        </div>
      )}
    </div>
  );
}
