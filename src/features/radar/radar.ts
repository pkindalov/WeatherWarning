/* ============================================================
   radar.ts — RainViewer data + tile pixel sampling + analysis.
   Provides both the display tiles (radarTileTemplate, drawn by Leaflet)
   and the under-the-hood "warning engine": the dBZ math that drives
   alerts samples RainViewer tiles pixel-by-pixel.
   Ported from the original vanilla `Radar` namespace.
   ============================================================ */
import L from "leaflet";
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
// Static false echoes: RainViewer's composite occasionally "freezes" a patch of
// pixels (clutter/interference baked in from one source radar) that then repeats
// byte-for-byte in every frame — e.g. the phantom 55 dBZ cell south of Tryavna
// on 2026-06-11 that sat pixel-identical for 30+ minutes while real echoes moved.
// Real precipitation never reproduces the exact same dBZ at the exact same pixel
// in a later frame, so a candidate pixel that matches the reference frame (~30
// min back) or the previous frame (~10 min back) exactly is treated as clutter
// and skipped. Worst case for real weather is a slow-updating source radar whose
// scan RainViewer repeats across consecutive 10-min frames — that delays a real
// alert by one frame, which is the accepted 2-scan-persistence tradeoff.
export const STATIC_ECHO_LOOKBACK_FRAMES = 3;
// Newborn-cell rule (2-scan persistence): a cell that materializes at full
// strength where the previous frame showed no echo at all is almost always an
// injected artifact, not weather — e.g. the phantom 59 dBZ core SW of Yambol on
// 2026-06-11 that appeared after 12 consecutive clear frames. Real storms grow
// through a weak-echo stage first, so a candidate pixel is only trusted when the
// previous frame had at least a PRECURSOR_DBZ echo within PRECURSOR_RADIUS_KM.
// If the cell is real, the next frame (~10 min) confirms it and the alert fires.
export const PRECURSOR_DBZ = 20;
export const PRECURSOR_RADIUS_KM = 10;
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

// Canvas tile layer that strips sub-20 dBZ (noise/clear-air echoes) from the
// rendered tiles before Leaflet displays them.
export function createFilteredRadarLayer(urlTemplate: string): L.GridLayer {
  const FilteredLayer = L.GridLayer.extend({
    createTile(this: L.GridLayer, coords: L.Coords, done: L.DoneCallback) {
      const display = document.createElement("canvas");
      display.width = 256;
      display.height = 256;
      const displayCtx = display.getContext("2d")!;

      const url = urlTemplate
        .replace("{z}", String(coords.z))
        .replace("{x}", String(coords.x))
        .replace("{y}", String(coords.y));

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        // Process at the image's native 512px resolution so colorToDbz sees
        // unblended palette colours, then downscale to the 256px tile slot.
        const proc = document.createElement("canvas");
        proc.width = 512;
        proc.height = 512;
        const procCtx = proc.getContext("2d", { willReadFrequently: true })!;
        procCtx.drawImage(img, 0, 0, 512, 512);
        const frame = procCtx.getImageData(0, 0, 512, 512);
        const px = frame.data;
        for (let i = 0; i < px.length; i += 4) {
          const dbz = C.colorToDbz(px[i], px[i + 1], px[i + 2], px[i + 3]);
          if (dbz !== null && dbz < 20) px[i + 3] = 0;
        }
        procCtx.putImageData(frame, 0, 0);
        displayCtx.drawImage(proc, 0, 0, 256, 256);
        done(undefined, display);
      };
      img.onerror = () => done(new Error("tile failed"), display);
      img.src = url;
      return display;
    },
  });
  return new (FilteredLayer as any)({
    tileSize: 256,
    opacity: 0.72,
    maxNativeZoom: 7,
    maxZoom: 19,
    zIndex: 5,
  }) as L.GridLayer;
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
// FrameSample plus the frame's raw pixel evidence, used as reference data for
// the false-echo rules. Internal only — stripped before samples land in
// AnalysisResult.
//   echoes:    ≥threshold pixels as "px,py,dbz" keys (frozen-echo rejection)
//   wetPixels: ≥PRECURSOR_DBZ pixel positions (newborn-cell rejection)
interface SampledFrame extends FrameSample {
  echoes: Set<string>;
  wetPixels: Array<{ px: number; py: number }>;
}

// Evidence from earlier frames used to reject false echoes in the frame being
// sampled. prevWetPixels is null when no previous frame exists (fail open).
interface EchoFilters {
  staticEchoes: Set<string>;
  prevWetPixels: Array<{ px: number; py: number }> | null;
}

function hasWetNeighbor(
  wet: Array<{ px: number; py: number }>,
  px: number,
  py: number,
  radiusPx: number
): boolean {
  const r2 = radiusPx * radiusPx;
  for (const w of wet) {
    const dx = w.px - px;
    const dy = w.py - py;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

async function sampleFrame(
  host: string,
  path: string,
  lat: number,
  lon: number,
  radiusKm: number,
  threshold: number,
  filters?: EchoFilters
): Promise<SampledFrame> {
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
  const echoes = new Set<string>();
  const wetPixels: Array<{ px: number; py: number }> = [];
  const precursorRadiusPx = (PRECURSOR_RADIUS_KM * 1000) / mpp;
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
      if (v >= PRECURSOR_DBZ) wetPixels.push({ px, py });
      if (v >= threshold) {
        const key = `${px},${py},${v}`;
        echoes.add(key);
        if (filters) {
          // Identical dBZ at the identical pixel as an earlier frame: a frozen
          // echo is clutter, not weather (see STATIC_ECHO_LOOKBACK_FRAMES).
          if (filters.staticEchoes.has(key)) continue;
          // No echo anywhere near this spot one frame ago: a full-strength
          // newborn cell is held back until the next frame confirms it (see
          // PRECURSOR_DBZ / PRECURSOR_RADIUS_KM).
          if (
            filters.prevWetPixels !== null &&
            !hasWetNeighbor(filters.prevWetPixels, px, py, precursorRadiusPx)
          )
            continue;
        }
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
  return { centerDbz, maxDbz, nearest, tainted, echoes, wetPixels };
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

  // Earlier frames provide the evidence for the false-echo rules: the previous
  // frame (~10 min back) for the newborn + frozen checks, and a reference frame
  // ~30 min back for slow-moving frozen artifacts. With too little history the
  // checks are skipped — better a possible false alarm than a missed storm.
  const prevIndex = frames.past.length - 2;
  const prev =
    prevIndex >= 0
      ? await sampleFrame(host, frames.past[prevIndex].path, loc.lat, loc.lon, radiusKm, threshold)
      : null;
  const refIndex = frames.past.length - 1 - STATIC_ECHO_LOOKBACK_FRAMES;
  const ref =
    refIndex >= 0
      ? await sampleFrame(host, frames.past[refIndex].path, loc.lat, loc.lon, radiusKm, threshold)
      : null;
  let filters: EchoFilters | undefined;
  if (prev !== null || ref !== null) {
    const staticEchoes = new Set([...(prev?.echoes ?? []), ...(ref?.echoes ?? [])]);
    filters = { staticEchoes, prevWetPixels: prev !== null ? prev.wetPixels : null };
  }

  const cur = await sampleFrame(
    host,
    currentFrame.path,
    loc.lat,
    loc.lon,
    radiusKm,
    threshold,
    filters
  );

  // sample a couple of nowcast frames for the trend; a false echo extrapolates
  // into the nowcast too, so the same filters apply there
  const future: FutureFrame[] = [];
  const nowFrames = frames.now.slice(0, 3);
  for (const f of nowFrames) {
    const r = await sampleFrame(host, f.path, loc.lat, loc.lon, radiusKm, threshold, filters);
    future.push({
      time: f.time,
      centerDbz: r.centerDbz,
      maxDbz: r.maxDbz,
      nearest: r.nearest,
      tainted: r.tainted,
    });
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
  // Only determine trend when there is a current cell and nowcast data is available.
  // Without a current cell curDist=Infinity, so futureBest < curDist-1.5 is trivially
  // true for any finite forecast distance — the ETA path handles that case instead.
  if (future.length > 0 && isFinite(curDist)) {
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
