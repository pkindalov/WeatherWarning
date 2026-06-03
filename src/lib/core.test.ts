import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bearingDeg,
  colorToDbz,
  compass,
  dbzBandRange,
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

describe("colorToDbz (RainViewer Universal Blue lookup)", () => {
  it("returns null for transparent pixels", () => {
    expect(colorToDbz(255, 0, 0, 0)).toBeNull();
  });

  it("reads exact palette colours as their true dBZ", () => {
    // values straight from RainViewer's Universal Blue rain table
    expect(colorToDbz(130, 123, 105, 73)).toBe(0); // faint tan = light precip
    expect(colorToDbz(206, 192, 135, 150)).toBe(10); // brighter tan
    expect(colorToDbz(136, 221, 238, 255)).toBe(15); // light cyan
    expect(colorToDbz(0, 71, 104, 255)).toBe(34); // deep blue
    expect(colorToDbz(255, 238, 0, 255)).toBe(35); // yellow
    expect(colorToDbz(255, 170, 0, 255)).toBe(40); // orange
    expect(colorToDbz(193, 0, 0, 255)).toBe(50); // red
    expect(colorToDbz(255, 170, 255, 255)).toBe(55); // magenta
    expect(colorToDbz(255, 255, 255, 255)).toBe(65); // white = extreme core
  });

  it("does NOT read the faint tan low band as heavy rain (phantom-overhead fix)", () => {
    // these tan pixels are the lightest precip; the old hue guesser called them 45 dBZ
    expect(colorToDbz(130, 123, 105, 73)).toBeLessThan(20);
    expect(colorToDbz(222, 208, 151, 190)).toBeLessThan(20);
  });

  it("orders deeper blue as stronger than light cyan", () => {
    const lightCyan = colorToDbz(136, 221, 238, 255)!;
    const deepBlue = colorToDbz(0, 71, 104, 255)!;
    expect(deepBlue).toBeGreaterThan(lightCyan);
  });

  it("snaps near-palette colours to the closest dBZ", () => {
    expect(colorToDbz(252, 235, 5, 255)).toBe(35); // ~yellow → 35
    expect(colorToDbz(190, 5, 5, 255)).toBe(50); // ~red → 50
  });
});

describe("dBZ labels & colours", () => {
  it("labels by threshold band", () => {
    expect(dbzLabel(null)).toBe("No echo");
    expect(dbzLabel(5)).toBe("Very light");
    expect(dbzLabel(25)).toBe("Rain / snow");
    expect(dbzLabel(45)).toBe("Heavy rain");
    expect(dbzLabel(55)).toBe("Storm · small hail");
    expect(dbzLabel(63)).toBe("Extreme · large hail");
  });

  it("uses alarming colours for hail bands", () => {
    expect(dbzColor(null)).toBe("#cfd8e0");
    expect(dbzColor(55)).toBe("#e53935"); // small hail → red
    expect(dbzColor(63)).toBe("#c026d3"); // large hail → magenta
  });

  it("describes each legend band's dBZ range", () => {
    expect(dbzBandRange(0)).toBe("0–20");
    expect(dbzBandRange(2)).toBe("40–50");
    expect(dbzBandRange(4)).toBe("60+"); // open-ended top band
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
