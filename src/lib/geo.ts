/* Nominatim reverse geocoding — turn coordinates into a short place name. */
export async function reverseName(lat: number, lon: number, fallback: string): Promise<string> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=12&lat=${lat}&lon=${lon}`,
      { headers: { Accept: "application/json" } }
    );
    const j = await r.json();
    const a = j.address || {};
    return a.suburb || a.city || a.town || a.village || a.county || fallback;
  } catch {
    return fallback;
  }
}
