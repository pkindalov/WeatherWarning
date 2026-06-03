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

/* ---------- colour → dBZ ----------
   RainViewer renders radar reflectivity with the "Universal Blue" palette
   (it serves this palette for the radar tiles regardless of the requested
   colour-scheme id). Rather than guess dBZ from hue, we look the sampled
   pixel up in RainViewer's own authoritative dBZ↔RGBA table, so the reported
   value is the real reflectivity for that colour.
   Source: https://www.rainviewer.com/files/rainviewer_api_colors_table.csv
   Returns null for "no echo" (transparent / near-transparent).          */

// [dBZ, r, g, b] for every opaque-enough Universal Blue rain colour. The faint
// −10…14 dBZ band is a semi-transparent tan ramp; 65 dBZ and up render white.
const UB_PALETTE: ReadonlyArray<readonly [number, number, number, number]> = [
  [-10, 99, 97, 89], [-9, 102, 99, 90], [-8, 105, 102, 92], [-7, 108, 104, 93],
  [-6, 111, 107, 95], [-5, 114, 110, 97], [-4, 117, 112, 98], [-3, 120, 115, 100],
  [-2, 124, 117, 101], [-1, 127, 120, 103], [0, 130, 123, 105], [1, 133, 125, 106],
  [2, 136, 128, 108], [3, 139, 130, 109], [4, 142, 133, 111], [5, 146, 136, 113],
  [6, 158, 147, 117], [7, 170, 158, 121], [8, 182, 169, 126], [9, 194, 180, 130],
  [10, 206, 192, 135], [11, 210, 196, 139], [12, 214, 200, 143], [13, 218, 204, 147],
  [14, 222, 208, 151], [15, 136, 221, 238], [16, 108, 209, 235], [17, 81, 197, 232],
  [18, 54, 186, 229], [19, 27, 174, 226], [20, 0, 163, 224], [21, 0, 154, 213],
  [22, 0, 145, 202], [23, 0, 136, 191], [24, 0, 127, 180], [25, 0, 119, 170],
  [26, 0, 112, 163], [27, 0, 105, 156], [28, 0, 98, 149], [29, 0, 91, 142],
  [30, 0, 85, 136], [31, 0, 81, 128], [32, 0, 78, 120], [33, 0, 74, 112],
  [34, 0, 71, 104], [35, 255, 238, 0], [36, 255, 224, 0], [37, 255, 210, 0],
  [38, 255, 197, 0], [39, 255, 183, 0], [40, 255, 170, 0], [41, 255, 159, 0],
  [42, 255, 149, 0], [43, 255, 139, 0], [44, 255, 129, 0], [45, 255, 68, 0],
  [46, 242, 54, 0], [47, 230, 40, 0], [48, 217, 27, 0], [49, 205, 13, 0],
  [50, 193, 0, 0], [51, 168, 0, 0], [52, 143, 0, 0], [53, 118, 0, 0],
  [54, 93, 0, 0], [55, 255, 170, 255], [56, 255, 159, 255], [57, 255, 149, 255],
  [58, 255, 139, 255], [59, 255, 129, 255], [60, 255, 119, 255], [61, 255, 108, 255],
  [62, 255, 98, 255], [63, 255, 88, 255], [64, 255, 78, 255], [65, 255, 255, 255],
];

const ALPHA_NO_ECHO = 40; // below this the pixel is transparent ⇒ no precip

export function colorToDbz(r: number, g: number, b: number, a: number): number | null {
  if (a < ALPHA_NO_ECHO) return null;
  let bestDbz = UB_PALETTE[0][0];
  let bestDist = Infinity;
  for (const [dbz, pr, pg, pb] of UB_PALETTE) {
    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestDbz = dbz;
    }
  }
  return bestDbz;
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
  { dbz: 0, color: "#74c7ec", label: "Light rain / mist", key: "mist" }, //  0–20: light rain / mist
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

// The dBZ range a legend band covers, e.g. "20–40" for the rain band or
// "60+" for the open-ended top band. Used by the legend's hover/tap tooltip.
export function dbzBandRange(index: number): string {
  const lo = LEGEND[index].dbz;
  const hi = LEGEND[index + 1] ? LEGEND[index + 1].dbz : null;
  return hi != null ? `${lo}–${hi}` : `${lo}+`;
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
