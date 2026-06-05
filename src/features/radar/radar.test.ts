import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { frameList, radarTileTemplate } from "./radar";
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
      "https://rv.example/v2/radar/123/512/{z}/{x}/{y}/2/1_1.png"
    );
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

/**
 * Build a 256×256 RGBA pixel buffer with `hotCount` pixels painted with the
 * 55 dBZ color starting at (CLX + HOT_DX, CLY) and going right. Pixels that
 * would fall outside the scan radius or the tile boundary are skipped.
 */
function buildPixelData(hotCount: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(256 * 256 * 4); // all transparent
  const radiusPx = (CLUSTER_SETTINGS.radiusKm * 1000) / MPP;

  for (let i = 0; i < hotCount; i++) {
    const x = CLX + HOT_DX + i;
    const y = CLY;
    if (x < 0 || x >= 256 || y < 0 || y >= 256) continue;

    // Global pixel coordinates of this candidate.
    const gpx = TILE_X * 256 + x;
    const gpy = TILE_Y * 256 + y;
    const dx = gpx - CENTER_PX;
    const dy = gpy - CENTER_PY;
    if (Math.sqrt(dx * dx + dy * dy) > radiusPx) continue;

    const idx = (y * 256 + x) * 4;
    [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]] = DBZ_55_RGBA;
  }
  return data;
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
});
