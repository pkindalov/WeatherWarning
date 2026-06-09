/* ============================================================
   radar.ts — RainViewer data + tile pixel sampling + analysis.
   Provides both the display tiles (radarTileTemplate, drawn by Leaflet)
   and the under-the-hood "warning engine": the dBZ math that drives
   alerts samples RainViewer tiles pixel-by-pixel.
   Ported from the original vanilla `Radar` namespace.
   ============================================================ */
import * as C from "./core";
import type {
  AnalysisResult,
  FrameList,
  FrameSample,
  FutureFrame,
  NearestCell,
  Settings,
  SavedLocation,
} from "../../shared/types";

const MAPS_URL = "https://api.rainviewer.com/public/weather-maps.json";
// RainViewer's global radar tiles only exist up to zoom 7; zoom 8+ returns a
// "Zoom Level Not Supported" placeholder image, which the sampler would otherwise
// misread as junk echoes. Sample at the deepest real level. (~1.2 km/px at equator.)
const SAMPLE_ZOOM = 7;
// "Universal Blue" — the palette RainViewer actually renders for radar tiles,
// and the one core.colorToDbz reverse-maps to recover real dBZ values.
const COLOR_SCHEME = 2;
// Minimum number of pixels above threshold required to treat a return as a real
// storm cell. Single-pixel returns are frequently anomalous propagation (AP) or
// ground clutter — they are invisible on the smoothed display tiles but still
// show up in the unsmoothed sample tiles used by the warning engine.
export const MIN_CELL_PIXELS = 4;
const tileCache = new Map<string, Promise<HTMLCanvasElement | null>>();

interface MapsData {
  host: string;
  radar?: {
    past?: { time: number; path: string }[];
    nowcast?: { time: number; path: string }[];
  };
}

let mapsData: MapsData | null = null;
let mapsFetchedAt = 0;

/* ---------- weather-maps index ---------- */
export async function loadMaps(force?: boolean): Promise<MapsData> {
  if (mapsData && !force && Date.now() - mapsFetchedAt < 60000) return mapsData;
  const res = await fetch(MAPS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("radar index unavailable");
  mapsData = (await res.json()) as MapsData;
  mapsFetchedAt = Date.now();
  return mapsData;
}

// Build the ordered list of frames we care about (past + nowcast).
export function frameList(data: MapsData): FrameList {
  const past = (data.radar && data.radar.past) || [];
  const now = (data.radar && data.radar.nowcast) || [];
  return { past, now, all: past.concat(now) };
}

// Sampling tiles: smoothing OFF so colours stay on the palette.
function sampleTileUrl(host: string, path: string, z: number, x: number, y: number) {
  return `${host}${path}/256/${z}/${x}/${y}/${COLOR_SCHEME}/0_0.png`;
}

// Display tiles for the Leaflet overlay: a {z}/{x}/{y} template.
// Using 0_0 (no smoothing) so the displayed colours exactly match the UB palette
// that colorToDbz was calibrated against. Smoothed (1_1) tiles spatially blend
// small intense cells with surrounding rain, making a 55 dBZ cell appear cyan
// instead of red — the 512px retina size provides enough pixel density to keep
// it readable without needing smoothing. Sampling stays 256/0_0.
export function radarTileTemplate(host: string, path: string) {
  return `${host}${path}/512/{z}/{x}/{y}/${COLOR_SCHEME}/0_0.png`;
}

/* ---------- load one tile into a canvas (CORS) ---------- */
function loadTile(url: string): Promise<HTMLCanvasElement | null> {
  const cached = tileCache.get(url);
  if (cached) return cached;
  const p = new Promise<HTMLCanvasElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const cv = document.createElement("canvas");
        cv.width = 256;
        cv.height = 256;
        cv.getContext("2d", { willReadFrequently: true })!.drawImage(img, 0, 0);
        resolve(cv);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  tileCache.set(url, p);
  return p;
}

/* ---------- read dBZ at a single point (for the map picker) ----------
   Uses the same smoothing-off sample tiles the analyzer reads, so the
   reported value matches the warning engine. Caches decoded pixel data
   per tile so repeated hovers over one tile are instant.                */
const pointDataCache = new Map<string, Uint8ClampedArray | null>();

export async function samplePointDbz(
  host: string,
  path: string,
  lat: number,
  lon: number
): Promise<number | null> {
  const z = SAMPLE_ZOOM;
  const { px, py } = C.lonLatToPixel(lat, lon, z);
  const nTiles = Math.pow(2, z);
  const ty = Math.floor(py / 256);
  if (ty < 0 || ty >= nTiles) return null;
  const tx = Math.floor(px / 256);
  const wx = ((tx % nTiles) + nTiles) % nTiles;
  const url = sampleTileUrl(host, path, z, wx, ty);

  let data = pointDataCache.get(url);
  if (data === undefined) {
    const cv = await loadTile(url);
    data = cv ? cv.getContext("2d")!.getImageData(0, 0, 256, 256).data : null;
    pointDataCache.set(url, data);
  }
  if (!data) return null;

  const lx = ((Math.floor(px) % 256) + 256) % 256;
  const ly = ((Math.floor(py) % 256) + 256) % 256;
  const i = (ly * 256 + lx) * 4;
  return C.colorToDbz(data[i], data[i + 1], data[i + 2], data[i + 3]);
}

/* ---------- sample one radar frame around a point ---------- */
async function sampleFrame(
  host: string,
  path: string,
  lat: number,
  lon: number,
  radiusKm: number,
  threshold: number
): Promise<FrameSample> {
  const z = SAMPLE_ZOOM;
  const center = C.lonLatToPixel(lat, lon, z);
  const mpp = C.metresPerPixel(lat, z);
  const radiusPx = (radiusKm * 1000) / mpp;

  const minPx = Math.floor(center.px - radiusPx);
  const maxPx = Math.ceil(center.px + radiusPx);
  const minPy = Math.floor(center.py - radiusPx);
  const maxPy = Math.ceil(center.py + radiusPx);

  const minTx = Math.floor(minPx / 256),
    maxTx = Math.floor(maxPx / 256);
  const minTy = Math.floor(minPy / 256),
    maxTy = Math.floor(maxPy / 256);
  const nTiles = Math.pow(2, z);

  // gather imagedata per tile
  const tiles: Record<string, Uint8ClampedArray | null> = {};
  const jobs: Promise<void>[] = [];
  for (let tx = minTx; tx <= maxTx; tx++) {
    for (let ty = minTy; ty <= maxTy; ty++) {
      const wx = ((tx % nTiles) + nTiles) % nTiles;
      if (ty < 0 || ty >= nTiles) continue;
      const url = sampleTileUrl(host, path, z, wx, ty);
      jobs.push(
        loadTile(url).then((cv) => {
          tiles[tx + "_" + ty] = cv
            ? cv.getContext("2d")!.getImageData(0, 0, 256, 256).data
            : null;
        })
      );
    }
  }
  let tainted = false;
  try {
    await Promise.all(jobs);
  } catch {
    tainted = true;
  }

  function dbzAt(px: number, py: number): number | null {
    const tx = Math.floor(px / 256),
      ty = Math.floor(py / 256);
    const data = tiles[tx + "_" + ty];
    if (!data) return null;
    const lx = ((Math.floor(px) % 256) + 256) % 256;
    const ly = ((Math.floor(py) % 256) + 256) % 256;
    const i = (ly * 256 + lx) * 4;
    return C.colorToDbz(data[i], data[i + 1], data[i + 2], data[i + 3]);
  }

  // value directly overhead (max of a small kernel for robustness)
  let centerDbz: number | null = null;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const v = dbzAt(center.px + dx, center.py + dy);
      if (v != null && (centerDbz == null || v > centerDbz)) centerDbz = v;
    }

  // scan the disc for max dBZ + nearest cell over threshold
  let maxDbz: number | null = centerDbz;
  let nearest: NearestCell | null = null;
  let cellPixels = 0;
  const step = 1;
  for (let px = minPx; px <= maxPx; px += step) {
    for (let py = minPy; py <= maxPy; py += step) {
      const ddx = px - center.px,
        ddy = py - center.py;
      const distPx = Math.sqrt(ddx * ddx + ddy * ddy);
      if (distPx > radiusPx) continue;
      const v = dbzAt(px, py);
      if (v == null) continue;
      if (maxDbz == null || v > maxDbz) maxDbz = v;
      if (v >= threshold) {
        cellPixels++;
        const distKm = (distPx * mpp) / 1000;
        if (!nearest || distKm < nearest.distanceKm) {
          const ll = C.pixelToLonLat(px, py, z);
          const brg = (Math.atan2(ddx, -ddy) / C.DEG + 360) % 360;
          nearest = { distanceKm: distKm, bearing: brg, dbz: v, lat: ll.lat, lon: ll.lon };
        }
      }
    }
  }
  // Suppress single-pixel AP artifacts: a real cell needs spatial extent.
  if (cellPixels < MIN_CELL_PIXELS) nearest = null;
  return { centerDbz, maxDbz, nearest, tainted };
}

/* ---------- full analysis for a location ---------- */
export async function analyze(loc: SavedLocation, settings: Settings): Promise<AnalysisResult> {
  const data = await loadMaps();
  const host = data.host;
  const frames = frameList(data);
  if (!frames.past.length) throw new Error("no radar frames");

  const threshold = settings.threshold;
  const radiusKm = settings.radiusKm;

  const currentFrame = frames.past[frames.past.length - 1];
  const cur = await sampleFrame(host, currentFrame.path, loc.lat, loc.lon, radiusKm, threshold);

  // sample a couple of nowcast frames for the trend
  const future: FutureFrame[] = [];
  const nowFrames = frames.now.slice(0, 3);
  for (const f of nowFrames) {
    const r = await sampleFrame(host, f.path, loc.lat, loc.lon, radiusKm, threshold);
    future.push({ time: f.time, ...r });
  }

  // ---- derive status ----
  let level: AnalysisResult["level"] = "safe"; // safe | warning | danger
  if (cur.centerDbz != null && cur.centerDbz >= threshold) level = "danger";
  else if (cur.nearest) level = "warning";

  // ---- trend from nowcast nearest-distance ----
  let trend: AnalysisResult["trend"] = "steady";
  let eta: number | null = null;
  const curDist = cur.nearest ? cur.nearest.distanceKm : Infinity;
  // futureBest: minimum distance the cell will reach (for approaching detection).
  // futureWorst: maximum distance the cell will reach (for receding detection).
  // Using the min for approaching captures the "will it ever get close?" question.
  // Using the max for receding captures "has it clearly moved further away over the
  // full window?" — using the min here would miss slow recession because the first
  // nowcast frame is only slightly farther, staying within the hysteresis band.
  let futureBest = Infinity;
  let futureWorst = 0;
  let firstHitFrame: FutureFrame | null = null;
  for (const f of future) {
    const d =
      f.centerDbz != null && f.centerDbz >= threshold
        ? 0
        : f.nearest
          ? f.nearest.distanceKm
          : Infinity;
    if (d < futureBest) futureBest = d;
    if (d > futureWorst) futureWorst = d;
    if (firstHitFrame == null && f.nearest && f.nearest.distanceKm <= radiusKm) firstHitFrame = f;
    if (firstHitFrame == null && f.centerDbz != null && f.centerDbz >= threshold) firstHitFrame = f;
  }
  // Only determine trend when nowcast data is available. With no future frames we
  // have no basis for a direction prediction, so "steady" is the correct default.
  if (future.length > 0 && (isFinite(futureBest) || isFinite(curDist))) {
    if (futureBest < curDist - 1.5) trend = "approaching";
    else if (futureWorst > curDist + 1.5) trend = "receding";
    else trend = "steady";
  }
  // ETA: if currently safe but a cell enters the radius in nowcast
  let etaDbz: number | null = null;
  if (level === "safe" && firstHitFrame) {
    eta = Math.max(1, Math.round((firstHitFrame.time - currentFrame.time) / 60));
    etaDbz = firstHitFrame.nearest?.dbz ?? firstHitFrame.centerDbz ?? firstHitFrame.maxDbz ?? null;
    level = "warning"; // pre-warn
  }

  return {
    level,
    trend,
    eta,
    etaDbz,
    centerDbz: cur.centerDbz,
    maxDbz: cur.maxDbz,
    nearest: cur.nearest,
    threshold,
    radiusKm,
    frameTime: currentFrame.time,
    tainted: cur.tainted,
    future,
  };
}
