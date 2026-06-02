import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bearingDeg,
  colorToDbz,
  compass,
  dbzColor,
  dbzLabel,
  fmtClock,
  fmtKm,
  fmtTimeAgo,
  haversineKm,
  lonLatToPixel,
  metresPerPixel,
  pixelToLonLat,
  rgbToHsl,
} from "./core";

describe("Web Mercator", () => {
  it("round-trips lon/lat through pixel space", () => {
    const z = 5;
    const { px, py } = lonLatToPixel(45, 30, z);
    const back = pixelToLonLat(px, py, z);
    expect(back.lat).toBeCloseTo(45, 6);
    expect(back.lon).toBeCloseTo(30, 6);
  });

  it("metresPerPixel matches the known equator/zoom-0 constant", () => {
    expect(metresPerPixel(0, 0)).toBeCloseTo(156543.03392, 3);
  });
});

describe("distance & bearing", () => {
  it("haversine of identical points is zero", () => {
    expect(haversineKm(10, 20, 10, 20)).toBe(0);
  });

  it("one degree of longitude at the equator is ~111 km", () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19, 1);
  });

  it("bearing points north and east correctly", () => {
    expect(bearingDeg(0, 0, 1, 0)).toBeCloseTo(0, 5); // due north
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 5); // due east
  });

  it("compass maps degrees to the 8-point rose", () => {
    expect(compass(0)).toBe("N");
    expect(compass(45)).toBe("NE");
    expect(compass(90)).toBe("E");
    expect(compass(180)).toBe("S");
    expect(compass(350)).toBe("N"); // wraps back to north
  });
});

describe("rgbToHsl", () => {
  it("converts pure red", () => {
    const { h, s, l } = rgbToHsl(255, 0, 0);
    expect(h).toBeCloseTo(0, 5);
    expect(s).toBeCloseTo(1, 5);
    expect(l).toBeCloseTo(0.5, 5);
  });
});

describe("colorToDbz (radar colour classifier)", () => {
  it("returns null for transparent pixels", () => {
    expect(colorToDbz(255, 0, 0, 0)).toBeNull();
  });

  it("returns null for greyish artefacts", () => {
    expect(colorToDbz(128, 128, 128, 255)).toBeNull();
  });

  it("treats near-white as an extreme core", () => {
    expect(colorToDbz(255, 255, 255, 255)).toBe(67);
  });

  it("maps the colour ramp to ascending dBZ bands", () => {
    const blue = colorToDbz(0, 0, 255, 255)!;
    const green = colorToDbz(0, 255, 0, 255)!;
    const yellow = colorToDbz(255, 255, 0, 255)!;
    const orange = colorToDbz(255, 140, 0, 255)!;
    const red = colorToDbz(255, 0, 0, 255)!;
    const magenta = colorToDbz(255, 0, 255, 255)!;

    expect(blue).toBeCloseTo(16, 1);
    expect(yellow).toBe(38);
    expect(orange).toBe(45);
    expect(red).toBe(52);
    expect(magenta).toBe(62);
    // bands should increase along the ramp
    expect(blue).toBeLessThan(green);
    expect(green).toBeLessThan(yellow);
    expect(yellow).toBeLessThan(orange);
    expect(orange).toBeLessThan(red);
  });

  it("reads darker red as stronger than bright red", () => {
    expect(colorToDbz(120, 0, 0, 255)).toBe(57);
    expect(colorToDbz(255, 0, 0, 255)).toBe(52);
  });
});

describe("dBZ labels & colours", () => {
  it("labels by threshold band", () => {
    expect(dbzLabel(null)).toBe("No echo");
    expect(dbzLabel(5)).toBe("Drizzle");
    expect(dbzLabel(25)).toBe("Light");
    expect(dbzLabel(50)).toBe("Storm core");
    expect(dbzLabel(63)).toBe("Hail / extreme");
  });

  it("returns the neutral colour for no echo", () => {
    expect(dbzColor(null)).toBe("#cfd8e0");
    expect(dbzColor(50)).toBe("#e53935");
  });
});

describe("formatting", () => {
  it("fmtKm switches units by distance", () => {
    expect(fmtKm(null)).toBe("—");
    expect(fmtKm(0.5)).toBe("500 m");
    expect(fmtKm(5.25)).toBe("5.3 km");
    expect(fmtKm(25)).toBe("25 km");
  });

  describe("fmtTimeAgo (clock-dependent)", () => {
    afterEach(() => vi.useRealTimers());

    it("reports just-now and minutes ago", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
      const now = Date.now() / 1000;
      expect(fmtTimeAgo(now - 30)).toBe("just now");
      expect(fmtTimeAgo(now - 120)).toBe("2 min ago");
    });
  });

  it("fmtClock produces a time string", () => {
    expect(fmtClock(1_700_000_000)).toMatch(/\d/);
  });
});
