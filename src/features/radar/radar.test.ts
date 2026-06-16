import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closingApproach,
  frameList,
  MIN_CLOSING_SPEED_KMH,
  radarTileTemplate,
} from "./radar";
import { lonLatToPixel, metresPerPixel } from "./core";
import type { SavedLocation, Settings } from "../../shared/types";

describe("frameList", () => {
  it("concatenates past and nowcast frames in order", () => {
    const data = {
      host: "https://rv.example",
      radar: {
        past: [
          { time: 1, path: "/a" },
          { time: 2, path: "/b" },
        ],
        nowcast: [{ time: 3, path: "/c" }],
      },
    };
    const fl = frameList(data);
    expect(fl.past).toHaveLength(2);
    expect(fl.now).toHaveLength(1);
    expect(fl.all.map((f) => f.path)).toEqual(["/a", "/b", "/c"]);
  });

  it("handles a missing radar block", () => {
    const fl = frameList({ host: "h" });
    expect(fl.past).toEqual([]);
    expect(fl.now).toEqual([]);
    expect(fl.all).toEqual([]);
  });
});

describe("radarTileTemplate", () => {
  it("builds a 512px Leaflet {z}/{x}/{y} tile template with the colour scheme", () => {
    expect(radarTileTemplate("https://rv.example", "/v2/radar/123")).toBe(
      "https://rv.example/v2/radar/123/512/{z}/{x}/{y}/2/0_0.png"
    );
  });
});

describe("closingApproach", () => {
  // 10-minute frame spacing in seconds.
  const MIN = 60;

  it("returns not-closing with fewer than two valid points", () => {
    expect(closingApproach([])).toEqual({ closing: false, etaMin: null });
    expect(closingApproach([{ time: 0, distanceKm: 10 }])).toEqual({
      closing: false,
      etaMin: null,
    });
    expect(closingApproach([null, { time: 0, distanceKm: 10 }, null])).toEqual({
      closing: false,
      etaMin: null,
    });
  });

  it("detects a closing storm and estimates arrival from its closing speed", () => {
    // 18 km → 6 km over 30 min = 0.4 km/min; 6 km left ⇒ ~15 min out.
    const res = closingApproach([
      { time: 0, distanceKm: 18 },
      { time: 30 * MIN, distanceKm: 6 },
    ]);
    expect(res.closing).toBe(true);
    expect(res.etaMin).toBe(15);
  });

  it("ignores point order — sorts by time before measuring", () => {
    const ordered = closingApproach([
      { time: 0, distanceKm: 18 },
      { time: 30 * MIN, distanceKm: 6 },
    ]);
    const shuffled = closingApproach([
      { time: 30 * MIN, distanceKm: 6 },
      { time: 0, distanceKm: 18 },
    ]);
    expect(shuffled).toEqual(ordered);
  });

  it("does not flag a receding storm (distance growing)", () => {
    expect(
      closingApproach([
        { time: 0, distanceKm: 6 },
        { time: 30 * MIN, distanceKm: 18 },
      ]),
    ).toEqual({ closing: false, etaMin: null });
  });

  it("does not flag edge-wobble below the minimum net closing", () => {
    // Fast enough on paper (2 km / 10 min = 12 km/h) but only 2 km net closing —
    // within radar position jitter, so the distance floor rejects it.
    const res = closingApproach([
      { time: 0, distanceKm: 10 },
      { time: 10 * MIN, distanceKm: 8 },
    ]);
    expect(res.closing).toBe(false);
  });

  it("does not flag slow drift below the minimum closing speed", () => {
    // Closes 4 km over 40 min = 6 km/h — too slow to be a storm bearing down.
    const res = closingApproach([
      { time: 0, distanceKm: 24 },
      { time: 40 * MIN, distanceKm: 20 },
    ]);
    expect(res.closing).toBe(false);
    expect(6).toBeLessThan(MIN_CLOSING_SPEED_KMH);
  });

  it("does not flag a storm already overhead (newest distance 0)", () => {
    expect(
      closingApproach([
        { time: 0, distanceKm: 12 },
        { time: 30 * MIN, distanceKm: 0 },
      ]),
    ).toEqual({ closing: false, etaMin: null });
  });

  it("warns about a far storm with no time ceiling — reach is the radius's job", () => {
    // 95 km → 80 km over 30 min = 30 km/h; 80 km left ⇒ 160 min out. A fixed time
    // horizon would have dropped this; with a big alert radius it must still warn.
    const res = closingApproach([
      { time: 0, distanceKm: 95 },
      { time: 30 * MIN, distanceKm: 80 },
    ]);
    expect(res.closing).toBe(true);
    expect(res.etaMin).toBe(160);
  });
});

// ---------------------------------------------------------------------------
// Cluster filtering — MIN_CELL_PIXELS
// ---------------------------------------------------------------------------
// sampleFrame is private, so we test through analyze() with mocked DOM APIs.
// vi.resetModules() gives each test a fresh module (empty tileCache + mapsData).
//
// Geometry: Sofia area (lat=42, lon=23), zoom=7, radius=20 km.
// At ~909 m/px, radiusPx ≈ 22. Hot pixels are painted 10 px east of center
// (distPx ≈ 9.7, distKm ≈ 8.8 km < 20 km), well outside the center 3×3 kernel.
// All hot pixels are within a single tile so no tile-boundary edge case arises.

const CLUSTER_LOC: SavedLocation = { id: "t", name: "Test", kind: "other", lat: 42.0, lon: 23.0 };
const CLUSTER_SETTINGS: Settings = {
  threshold: 50,
  radiusKm: 20,
  notify: false,
  sound: false,
  vibrate: false,
  autoRefresh: false,
  autoRefreshMin: 5,
  radiusColorWindy: "#14532d",
  radiusColorMap: "#1f9d72",
  showWindyPin: true,
  mapMode: "windy",
};
const HOST = "https://rv.test";
const PATH = "/radar/ct";
const ZOOM = 7;

// Pre-compute center geometry once (these are pure math functions with no side-effects).
const { px: CENTER_PX, py: CENTER_PY } = lonLatToPixel(CLUSTER_LOC.lat, CLUSTER_LOC.lon, ZOOM);
const MPP = metresPerPixel(CLUSTER_LOC.lat, ZOOM);
const TILE_X = Math.floor(CENTER_PX / 256);
const TILE_Y = Math.floor(CENTER_PY / 256);
// Within-tile pixel coordinates of the center point.
const CLX = Math.floor(CENTER_PX) % 256;
const CLY = Math.floor(CENTER_PY) % 256;
// Hot pixels are placed HOT_DX columns to the right of the center within the tile.
// distPx ≈ 9.7, distKm ≈ 8.8 km, well within radiusKm=20 and outside the 3×3 kernel.
const HOT_DX = 10;
// Expected tile URL for the only tile that covers the scan area.
const HOT_TILE_URL = `${HOST}${PATH}/256/${ZOOM}/${TILE_X}/${TILE_Y}/2/0_0.png`;

// 55 dBZ color from RainViewer's Universal Blue palette (UB_PALETTE[55]).
const DBZ_55_RGBA: [number, number, number, number] = [255, 170, 255, 255];
// 20 dBZ color (UB_PALETTE[20]) — a weak "precursor" echo below the alert threshold.
const DBZ_20_RGBA: [number, number, number, number] = [0, 163, 224, 255];

/**
 * Build a 256×256 RGBA pixel buffer with `hotCount` pixels painted with the
 * given color (55 dBZ by default) starting at (CLX + startDx, CLY) and going
 * right. Pixels that would fall outside the scan radius or the tile boundary
 * are skipped. `startDx` defaults to HOT_DX (10 px, ~9 km) when omitted.
 */
function buildPixelData(
  hotCount: number,
  startDx = HOT_DX,
  rgba: readonly [number, number, number, number] = DBZ_55_RGBA
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(256 * 256 * 4); // all transparent
  const radiusPx = (CLUSTER_SETTINGS.radiusKm * 1000) / MPP;

  for (let i = 0; i < hotCount; i++) {
    const x = CLX + startDx + i;
    const y = CLY;
    if (x < 0 || x >= 256 || y < 0 || y >= 256) continue;

    // Global pixel coordinates of this candidate.
    const gpx = TILE_X * 256 + x;
    const gpy = TILE_Y * 256 + y;
    const dx = gpx - CENTER_PX;
    const dy = gpy - CENTER_PY;
    if (Math.sqrt(dx * dx + dy * dy) > radiusPx) continue;

    const idx = (y * 256 + x) * 4;
    [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]] = rgba;
  }
  return data;
}

/**
 * Stub Image and document.createElement('canvas') so that loadTile() resolves
 * with hot pixel data for tiles whose URL contains any of hotPathSubstrings,
 * and transparent data for all others.
 */
function stubDomTilesForPaths(pixelData: Uint8ClampedArray, hotPathSubstrings: string[]): void {
  const urlQueue: string[] = [];

  vi.stubGlobal(
    "Image",
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      set src(url: string) {
        urlQueue.push(url);
        queueMicrotask(() => this.onload?.());
      }
    },
  );

  const origCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(
    (tag: string, options?: ElementCreationOptions) => {
      if (tag !== "canvas") return origCreateElement(tag, options);
      const url = urlQueue.shift() ?? "";
      const isHot = hotPathSubstrings.some((p) => url.includes(p));
      const data = isHot ? pixelData : new Uint8ClampedArray(256 * 256 * 4);
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: () => {},
          getImageData: () => ({ data }),
        }),
      } as unknown as HTMLCanvasElement;
    },
  );
}

/**
 * Like stubDomTilesForPaths but accepts a map of path-substring → pixel data,
 * allowing different frames to carry different cell positions.
 */
function stubDomTilesForPathMap(pathDataMap: Record<string, Uint8ClampedArray>): void {
  const urlQueue: string[] = [];

  vi.stubGlobal(
    "Image",
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      set src(url: string) {
        urlQueue.push(url);
        queueMicrotask(() => this.onload?.());
      }
    },
  );

  const origCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(
    (tag: string, options?: ElementCreationOptions) => {
      if (tag !== "canvas") return origCreateElement(tag, options);
      const url = urlQueue.shift() ?? "";
      const matchingKey = Object.keys(pathDataMap).find((p) => url.includes(p));
      const data = matchingKey ? pathDataMap[matchingKey] : new Uint8ClampedArray(256 * 256 * 4);
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: () => {},
          getImageData: () => ({ data }),
        }),
      } as unknown as HTMLCanvasElement;
    },
  );
}

/**
 * Stub Image and document.createElement('canvas') so that loadTile() resolves
 * with pixel data for the hot tile URL and transparent data for all others.
 * Returns are ordered via a FIFO queue: Image.src sets push the URL, and
 * createElement('canvas') shifts the next URL to select the right buffer.
 */
function stubDomTiles(hotCount: number): void {
  const pixelData = buildPixelData(hotCount);
  const urlQueue: string[] = [];

  vi.stubGlobal(
    "Image",
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      set src(url: string) {
        urlQueue.push(url);
        queueMicrotask(() => this.onload?.());
      }
    },
  );

  const origCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(
    (tag: string, options?: ElementCreationOptions) => {
      if (tag !== "canvas") return origCreateElement(tag, options);
      const url = urlQueue.shift() ?? "";
      const data = url === HOT_TILE_URL ? pixelData : new Uint8ClampedArray(256 * 256 * 4);
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: () => {},
          getImageData: () => ({ data }),
        }),
      } as unknown as HTMLCanvasElement;
    },
  );
}

describe("cluster filtering (MIN_CELL_PIXELS)", () => {
  let analyze: (loc: SavedLocation, settings: Settings) => Promise<import("../../shared/types").AnalysisResult>;
  let MIN_CELL_PIXELS: number;

  beforeEach(async () => {
    // Fresh module each test: clears tileCache and resets mapsData.
    vi.resetModules();
    const mod = await import("./radar");
    analyze = mod.analyze;
    MIN_CELL_PIXELS = mod.MIN_CELL_PIXELS;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          host: HOST,
          radar: { past: [{ time: 1000, path: PATH }], nowcast: [] },
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("MIN_CELL_PIXELS is a positive integer", () => {
    expect(MIN_CELL_PIXELS).toBeGreaterThan(0);
    expect(Number.isInteger(MIN_CELL_PIXELS)).toBe(true);
  });

  it("returns nearest=null and level=safe when there are no pixels above threshold", async () => {
    stubDomTiles(0);
    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.nearest).toBeNull();
    expect(res.maxDbz).toBeNull();
    expect(res.level).toBe("safe");
  });

  it("suppresses nearest for a single isolated pixel (AP artifact)", async () => {
    stubDomTiles(1);
    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.nearest).toBeNull();
    expect(res.level).toBe("safe");
    // maxDbz still reflects the detected peak so the raw value isn't lost.
    expect(res.maxDbz).toBe(55);
  });

  it("suppresses nearest when pixel count is below MIN_CELL_PIXELS", async () => {
    stubDomTiles(MIN_CELL_PIXELS - 1);
    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.nearest).toBeNull();
    expect(res.level).toBe("safe");
    expect(res.maxDbz).toBe(55);
  });

  it("reports nearest when pixel count exactly meets MIN_CELL_PIXELS", async () => {
    stubDomTiles(MIN_CELL_PIXELS);
    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.nearest).not.toBeNull();
    expect(res.nearest!.dbz).toBe(55);
    expect(res.level).toBe("warning");
  });

  it("reports nearest when pixel count exceeds MIN_CELL_PIXELS", async () => {
    stubDomTiles(MIN_CELL_PIXELS + 2);
    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.nearest).not.toBeNull();
    expect(res.level).toBe("warning");
  });

  it("nearest points toward the hot pixels, not the center", async () => {
    stubDomTiles(MIN_CELL_PIXELS);
    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    // Hot pixels are east of center (HOT_DX > 0, same latitude row).
    // Bearing to due-east is ~90°; allow generous tolerance for pixel rounding.
    expect(res.nearest!.bearing).toBeGreaterThan(60);
    expect(res.nearest!.bearing).toBeLessThan(120);
    expect(res.nearest!.distanceKm).toBeGreaterThan(0);
    expect(res.nearest!.distanceKm).toBeLessThan(CLUSTER_SETTINGS.radiusKm);
  });

  it("reports trend=receding when a cell is present now but absent from all nowcast frames", async () => {
    const CURRENT_PATH = "/past_receding";
    const FUTURE_PATH = "/nowcast_receding";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          host: HOST,
          radar: {
            past: [{ time: 1000, path: CURRENT_PATH }],
            nowcast: [{ time: 1600, path: FUTURE_PATH }],
          },
        }),
      }),
    );

    // Serve hot pixels only for the current (past) frame; future frame is all-transparent.
    stubDomTilesForPaths(buildPixelData(MIN_CELL_PIXELS), [CURRENT_PATH]);

    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.nearest).not.toBeNull();
    expect(res.trend).toBe("receding");
  });

  it("reports trend=steady when cell is present but no nowcast data is available", async () => {
    // beforeEach stubs fetch with nowcast: [] — no future frames to predict from.
    // Previously this was bugged: futureBest defaulted to Infinity which always
    // compared > curDist + 1.5, producing "receding" with no real evidence.
    stubDomTiles(MIN_CELL_PIXELS);
    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.nearest).not.toBeNull();
    expect(res.trend).toBe("steady");
  });

  it("reports trend=overhead when a steady cell is raining directly over the location", async () => {
    // Screenshot bug: a cell parked on top of the town (rain overhead) that
    // isn't getting any closer was reported as "steady / not closing in" — false
    // reassurance when the storm is already on you. Distance is steady, but with
    // rain overhead the trend should read "overhead".
    const CURRENT_PATH = "/past_overhead";
    const FUTURE_PATH = "/nowcast_overhead";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          host: HOST,
          radar: {
            past: [{ time: 1000, path: CURRENT_PATH }],
            nowcast: [{ time: 1300, path: FUTURE_PATH }],
          },
        }),
      }),
    );

    // startDx=0 puts a hot pixel in the center 3×3 kernel → centerDbz is set
    // (cell overhead). Same position in the nowcast → distance is steady.
    const overhead = buildPixelData(MIN_CELL_PIXELS, 0);
    stubDomTilesForPathMap({ [CURRENT_PATH]: overhead, [FUTURE_PATH]: overhead });

    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.centerDbz).not.toBeNull();
    expect(res.trend).toBe("overhead");
  });

  it("keeps trend=steady when a cell holds nearby but nothing is overhead", async () => {
    // Cell parked ~9 km away (no echo overhead) that isn't closing in: "holding"
    // is the honest read here — the overhead override must NOT fire.
    const CURRENT_PATH = "/past_nearby";
    const FUTURE_PATH = "/nowcast_nearby";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          host: HOST,
          radar: {
            past: [{ time: 1000, path: CURRENT_PATH }],
            nowcast: [{ time: 1300, path: FUTURE_PATH }],
          },
        }),
      }),
    );

    const nearby = buildPixelData(MIN_CELL_PIXELS, HOT_DX);
    stubDomTilesForPathMap({ [CURRENT_PATH]: nearby, [FUTURE_PATH]: nearby });

    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.centerDbz).toBeNull();
    expect(res.trend).toBe("steady");
  });

  it("warns early (approaching + ETA) when a real cell closes in across past frames", async () => {
    // The core early-warning case: no nowcast at all, but the storm's own history
    // shows it marching toward the location — 16 km out ~30 min ago, ~11 km ~20
    // min ago, ~5.5 km now. The app must say "approaching" and estimate arrival,
    // instead of sitting on "Holding" until it's overhead.
    const PAST = ["/closing_0", "/closing_1", "/closing_2", "/closing_3", "/closing_4"];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          host: HOST,
          radar: {
            past: PAST.map((path, i) => ({ time: 1000 + i * 600, path })),
            nowcast: [],
          },
        }),
      }),
    );

    // ref = past[1] (16 km), prev = past[3] (11 km), cur = past[4] (5.5 km).
    stubDomTilesForPathMap({
      [PAST[1]]: buildPixelData(MIN_CELL_PIXELS, 18),
      [PAST[3]]: buildPixelData(MIN_CELL_PIXELS, 12),
      [PAST[4]]: buildPixelData(MIN_CELL_PIXELS, 6),
    });

    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.nearest).not.toBeNull();
    expect(res.level).toBe("warning");
    expect(res.trend).toBe("approaching");
    expect(res.eta).toBeGreaterThan(0);
    expect(res.eta).toBeLessThanOrEqual(60);
  });

  it("reports trend=approaching when a cell moves closer in future frames", async () => {
    const CURRENT_PATH = "/past_approaching";
    const FUTURE_PATH = "/nowcast_approaching";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          host: HOST,
          radar: {
            past: [{ time: 1000, path: CURRENT_PATH }],
            nowcast: [{ time: 1300, path: FUTURE_PATH }],
          },
        }),
      }),
    );

    // Current: cell at dx=10 (~9 km). Future: same cell at dx=5 (~4.5 km) — clearly closer.
    stubDomTilesForPathMap({
      [CURRENT_PATH]: buildPixelData(MIN_CELL_PIXELS, 10),
      [FUTURE_PATH]: buildPixelData(MIN_CELL_PIXELS, 5),
    });

    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.trend).toBe("approaching");
  });

  it("reports trend=steady (not approaching) when there is no current cell but nowcast shows one", async () => {
    // Bug: curDist=Infinity meant futureBest < curDist-1.5 was always true for any
    // finite nowcast distance, producing trend="approaching" even with no current cell.
    // The ETA path owns that case; trend should stay "steady".
    const CURRENT_PATH = "/past_empty";
    const FUTURE_PATH = "/nowcast_appears";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          host: HOST,
          radar: {
            past: [{ time: 1000, path: CURRENT_PATH }],
            nowcast: [{ time: 1300, path: FUTURE_PATH }],
          },
        }),
      }),
    );

    // Current frame: no cell. Future frame: cell appears at dx=5 (~4.5 km).
    stubDomTilesForPathMap({
      [CURRENT_PATH]: buildPixelData(0),
      [FUTURE_PATH]: buildPixelData(MIN_CELL_PIXELS, 5),
    });

    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.nearest).toBeNull();
    expect(res.trend).toBe("steady");
  });

  it("reports trend=receding via futureWorst when the cell drifts past the hysteresis by the last nowcast frame", async () => {
    // Bug: the old code used futureBest (min distance) for receding detection.
    // A cell barely farther in frame 1 but clearly farther in frame 2 was classified
    // "steady" because frame-1 distance was within the 1.5 km hysteresis band.
    // The fix tracks futureWorst (max distance) for the receding check.
    const CURRENT_PATH = "/past_recede_slow";
    const FUTURE_PATH_1 = "/nowcast_recede_1";
    const FUTURE_PATH_2 = "/nowcast_recede_2";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          host: HOST,
          radar: {
            past: [{ time: 1000, path: CURRENT_PATH }],
            nowcast: [
              { time: 1300, path: FUTURE_PATH_1 },
              { time: 1600, path: FUTURE_PATH_2 },
            ],
          },
        }),
      }),
    );

    // dx=10 ≈ 9.1 km current; dx=11 ≈ 10.0 km (barely outside — futureBest alone won't trigger);
    // dx=14 ≈ 12.7 km (clearly past curDist + 1.5 km in the last frame — futureWorst triggers).
    stubDomTilesForPathMap({
      [CURRENT_PATH]: buildPixelData(MIN_CELL_PIXELS, 10),
      [FUTURE_PATH_1]: buildPixelData(MIN_CELL_PIXELS, 11),
      [FUTURE_PATH_2]: buildPixelData(MIN_CELL_PIXELS, 14),
    });

    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.trend).toBe("receding");
  });

  it("suppresses a cell that is pixel-identical to the reference frame (static false echo)", async () => {
    // Reproduces the 2026-06-11 Tryavna incident: a 55 dBZ blob appeared in
    // RainViewer's composite and repeated byte-for-byte in every frame for 30+
    // minutes (real precipitation never freezes in place). The same frozen
    // pixels must not fire a warning, and the nowcast extrapolation of the
    // artifact must not trigger an ETA pre-warn either.
    const PAST_PATHS = ["/static_p0", "/static_p1", "/static_p2", "/static_p3"];
    const NOWCAST_PATH = "/static_n0";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          host: HOST,
          radar: {
            past: PAST_PATHS.map((path, i) => ({ time: 1000 + i * 600, path })),
            nowcast: [{ time: 1000 + 4 * 600, path: NOWCAST_PATH }],
          },
        }),
      }),
    );

    const artifact = buildPixelData(MIN_CELL_PIXELS + 2);
    stubDomTilesForPathMap({
      [PAST_PATHS[0]]: artifact, // reference frame, 3 frames (~30 min) back
      [PAST_PATHS[2]]: artifact, // previous frame: identical pixels
      [PAST_PATHS[3]]: artifact, // current frame: identical pixels
      [NOWCAST_PATH]: artifact, // nowcast: static artifact extrapolates in place
    });

    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.nearest).toBeNull();
    expect(res.level).toBe("safe");
    expect(res.eta).toBeNull();
    expect(res.trend).toBe("steady");
    // The raw peak is still reported, same rule as MIN_CELL_PIXELS suppression.
    expect(res.maxDbz).toBe(55);
  });

  it("keeps the warning for a real cell that moved since the reference frame", async () => {
    const PAST_PATHS = ["/moving_p0", "/moving_p1", "/moving_p2", "/moving_p3"];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          host: HOST,
          radar: {
            past: PAST_PATHS.map((path, i) => ({ time: 1000 + i * 600, path })),
            nowcast: [],
          },
        }),
      }),
    );

    // 30 min ago (reference) and 10 min ago (previous) the cell sat at dx=15;
    // now it sits at dx=10 — no pixel overlap with either, but the previous
    // frame's echo is close enough (~4.5 km) to count as a precursor.
    stubDomTilesForPathMap({
      [PAST_PATHS[0]]: buildPixelData(MIN_CELL_PIXELS, 15),
      [PAST_PATHS[2]]: buildPixelData(MIN_CELL_PIXELS, 15),
      [PAST_PATHS[3]]: buildPixelData(MIN_CELL_PIXELS, 10),
    });

    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.nearest).not.toBeNull();
    expect(res.nearest!.dbz).toBe(55);
    expect(res.level).toBe("warning");
  });

  it("suppresses when the current frame is pixel-identical to the previous frame", async () => {
    // Even without 30 min of history, a cell that repeats byte-for-byte in two
    // consecutive frames is a frozen echo, not weather. Real precipitation never
    // reproduces identical pixels; at worst a slow-updating source radar delays
    // a real alert by one frame (~10 min).
    const PAST_PATHS = ["/short_p0", "/short_p1"];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          host: HOST,
          radar: {
            past: PAST_PATHS.map((path, i) => ({ time: 1000 + i * 600, path })),
            nowcast: [],
          },
        }),
      }),
    );

    const artifact = buildPixelData(MIN_CELL_PIXELS);
    stubDomTilesForPathMap({
      [PAST_PATHS[0]]: artifact,
      [PAST_PATHS[1]]: artifact,
    });

    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.nearest).toBeNull();
    expect(res.level).toBe("safe");
  });

  it("suppresses a strong cell born from completely clear sky (no precursor echo)", async () => {
    // Reproduces the 2026-06-11 Yambol incident: 12 consecutive clear frames,
    // then a 37-px 59 dBZ core materializes from nothing. Real storms grow
    // through a weak-echo stage first, so a full-strength cell with no echo at
    // all in the previous frame is held back for one frame (2-scan persistence).
    // The nowcast extrapolation of the newborn blob must not pre-warn either.
    const PAST_PATHS = ["/newborn_p0", "/newborn_p1"];
    const NOWCAST_PATH = "/newborn_n0";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          host: HOST,
          radar: {
            past: PAST_PATHS.map((path, i) => ({ time: 1000 + i * 600, path })),
            nowcast: [{ time: 1000 + 2 * 600, path: NOWCAST_PATH }],
          },
        }),
      }),
    );

    const cell = buildPixelData(MIN_CELL_PIXELS + 2);
    stubDomTilesForPathMap({
      // PAST_PATHS[0] (previous frame) intentionally absent — fully transparent.
      [PAST_PATHS[1]]: cell,
      [NOWCAST_PATH]: cell,
    });

    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.nearest).toBeNull();
    expect(res.level).toBe("safe");
    expect(res.eta).toBeNull();
    expect(res.maxDbz).toBe(55);
  });

  it("keeps the warning for a cell that grew out of a weak precursor echo", async () => {
    // The legit version of the newborn case: 10 min ago there was a 20 dBZ
    // shower at the same spot, now it intensified to 55 dBZ. Different pixel
    // values, so the frozen check passes; the precursor satisfies the newborn
    // check — the warning must fire.
    const PAST_PATHS = ["/grown_p0", "/grown_p1"];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          host: HOST,
          radar: {
            past: PAST_PATHS.map((path, i) => ({ time: 1000 + i * 600, path })),
            nowcast: [],
          },
        }),
      }),
    );

    stubDomTilesForPathMap({
      [PAST_PATHS[0]]: buildPixelData(MIN_CELL_PIXELS, HOT_DX, DBZ_20_RGBA),
      [PAST_PATHS[1]]: buildPixelData(MIN_CELL_PIXELS),
    });

    const res = await analyze(CLUSTER_LOC, CLUSTER_SETTINGS);
    expect(res.nearest).not.toBeNull();
    expect(res.nearest!.dbz).toBe(55);
    expect(res.level).toBe("warning");
  });

  it("throws when past frames are empty even if nowcast frames are present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          host: HOST,
          radar: { past: [], nowcast: [{ time: 2000, path: "/nowcast_only" }] },
        }),
      }),
    );
    await expect(analyze(CLUSTER_LOC, CLUSTER_SETTINGS)).rejects.toThrow("no radar frames");
  });
});
