/* ============================================================
   core.ts — math, geo, and the radar colour → dBZ classifier
   Ported from the original vanilla `Core` namespace.
   ============================================================ */

export const DEG = Math.PI / 180;
export const TILE = 256;

/* ---------- Web Mercator (global pixel space at a zoom) ---------- */
export function lonLatToPixel(lat: number, lon: number, z: number) {
  const scale = TILE * Math.pow(2, z);
  const x = ((lon + 180) / 360) * scale;
  const s = Math.sin(lat * DEG);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
  return { px: x, py: y };
}

export function pixelToLonLat(px: number, py: number, z: number) {
  const scale = TILE * Math.pow(2, z);
  const lon = (px / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * py) / scale;
  const lat = Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))) / DEG;
  return { lat, lon };
}

// metres per pixel at a latitude/zoom (256px tiles)
export function metresPerPixel(lat: number, z: number) {
  return (156543.03392 * Math.cos(lat * DEG)) / Math.pow(2, z);
}

/* ---------- distance & bearing ---------- */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371;
  const dLat = (bLat - aLat) * DEG;
  const dLon = (bLon - aLon) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function bearingDeg(aLat: number, aLon: number, bLat: number, bLon: number) {
  const y = Math.sin((bLon - aLon) * DEG) * Math.cos(bLat * DEG);
  const x =
    Math.cos(aLat * DEG) * Math.sin(bLat * DEG) -
    Math.sin(aLat * DEG) * Math.cos(bLat * DEG) * Math.cos((bLon - aLon) * DEG);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function compass(deg: number) {
  return COMPASS[Math.round(deg / 45) % 8];
}

/* ---------- colour helpers ---------- */
export function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s, l };
}

/* ---------- colour → estimated dBZ ----------
   Works on any standard perceptual reflectivity ramp
   (light blue/green → yellow → orange → red → magenta → white).
   We read a rendered radar pixel and map it to a dBZ band.
   Returns null for "no echo" (transparent / near-transparent).        */
export function colorToDbz(r: number, g: number, b: number, a: number): number | null {
  if (a < 40) return null; // transparent => no precip
  const { h, s, l } = rgbToHsl(r, g, b);
  if (s < 0.12 && l > 0.85) return 67; // near-white = extreme core
  if (s < 0.1) return null; // greyish artefact, ignore

  // hue families along the ramp
  if (h >= 170 && h < 250) {
    // cyan / blue  (drizzle-light)
    return 12 + l * 8; // ~12–20
  }
  if (h >= 80 && h < 170) {
    // green
    return 22 + ((170 - h) / 90) * 12; // ~22–34
  }
  if (h >= 55 && h < 80) {
    // yellow
    return 38;
  }
  if (h >= 30 && h < 55) {
    // orange
    return 45;
  }
  if (h >= 345 || h < 30) {
    // red family
    return l < 0.42 ? 57 : 52; // darker red = stronger
  }
  if (h >= 290 && h < 345) {
    // magenta / pink
    return 62;
  }
  if (h >= 250 && h < 290) {
    // violet / purple
    return 66;
  }
  return 40; // fallback mid value
}

/* ---------- dBZ → label & legend ramp ---------- */
export interface LegendStop {
  dbz: number;
  color: string;
  label: string;
  key: string;
}

// 5 bands following the standard dBZ interpretation. The two hail bands use
// deliberately alarming colours (red, then vivid magenta) so dangerous cells
// stand out from ordinary rain.
export const LEGEND: LegendStop[] = [
  { dbz: 0, color: "#74c7ec", label: "Very light", key: "mist" }, //  0–20: very light / mist
  { dbz: 20, color: "#40b15f", label: "Rain / snow", key: "rain" }, // 20–40: light–moderate rain/snow
  { dbz: 40, color: "#f5a623", label: "Heavy rain", key: "downpour" }, // 40–50: heavy downpours
  { dbz: 50, color: "#e53935", label: "Storm · small hail", key: "hail_small" }, // 50–60: storms, small hail
  { dbz: 60, color: "#c026d3", label: "Extreme · large hail", key: "hail_large" }, // 60+: large, damaging hail
];

export function dbzLabel(dbz: number | null) {
  if (dbz == null) return "No echo";
  let out = LEGEND[0].label;
  for (const stop of LEGEND) if (dbz >= stop.dbz) out = stop.label;
  return out;
}

export function dbzColor(dbz: number | null) {
  if (dbz == null) return "#cfd8e0";
  let out = LEGEND[0].color;
  for (const stop of LEGEND) if (dbz >= stop.dbz) out = stop.color;
  return out;
}

/* ---------- formatting ---------- */
export function fmtKm(km: number | null) {
  if (km == null) return "—";
  if (km < 1) return Math.round(km * 1000) + " m";
  if (km < 10) return km.toFixed(1) + " km";
  return Math.round(km) + " km";
}

export function fmtTimeAgo(ts: number) {
  const s = Math.round((Date.now() - ts * 1000) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return m + " min ago";
}

export function fmtClock(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
