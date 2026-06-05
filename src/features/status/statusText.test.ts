import { describe, expect, it } from "vitest";
import { buildStatusText, type ResultLike, type StatusHelpers } from "./statusText";
import { DICT } from "../../shared/i18n/dict";
import type { SavedLocation } from "../../shared/types";

const LOC: SavedLocation = { id: "1", name: "Sofia", kind: "other", lat: 42.7, lon: 23.3 };

// Use real English strings so assertions test actual rendered content.
const helpers: StatusHelpers = {
  t: (key, params) => {
    let s = DICT.en[key] ?? key;
    if (params) for (const k in params) s = s.split("{" + k + "}").join(String(params[k]));
    return s;
  },
  compass: (deg) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8],
  dbzLabel: (dbz) => (dbz == null ? "no echo" : `label(${dbz})`),
  fmtKm: (km) => (km == null ? "—" : `${km}km`),
};

const base: ResultLike = {
  level: "safe",
  trend: "steady",
  eta: null,
  etaDbz: null,
  centerDbz: null,
  maxDbz: null,
  nearest: null,
  radiusKm: 25,
};

describe("buildStatusText — safe", () => {
  it("returns all clear title and sub with radius and location name", () => {
    const { title, sub } = buildStatusText(LOC, base, helpers);
    expect(title).toBe("All clear");
    expect(sub).toContain("25");
    expect(sub).toContain("Sofia");
  });
});

describe("buildStatusText — danger", () => {
  it("returns take-cover title and sub with dBZ and location name", () => {
    const res: ResultLike = { ...base, level: "danger", centerDbz: 55, trend: "steady" };
    const { title, sub } = buildStatusText(LOC, res, helpers);
    expect(title).toBe("Take cover now");
    expect(sub).toContain("55");
    expect(sub).toContain("Sofia");
  });

  it("appends easing-off tail when receding", () => {
    const res: ResultLike = { ...base, level: "danger", centerDbz: 55, trend: "receding" };
    const { sub } = buildStatusText(LOC, res, helpers);
    expect(sub).toContain("easing off");
  });

  it("appends hail probability when dBZ >= 50", () => {
    const res: ResultLike = { ...base, level: "danger", centerDbz: 55, trend: "steady" };
    const { sub } = buildStatusText(LOC, res, helpers);
    expect(sub).toContain("Hail probability");
    expect(sub).toContain("%");
  });

  it("does not append hail probability when dBZ < 50", () => {
    const res: ResultLike = { ...base, level: "danger", centerDbz: 40, trend: "steady" };
    const { sub } = buildStatusText(LOC, res, helpers);
    expect(sub).not.toContain("Hail probability");
  });
});

describe("buildStatusText — warning: ETA path", () => {
  it("uses generic storm title and sub when etaDbz < 50", () => {
    const res: ResultLike = { ...base, level: "warning", eta: 8, etaDbz: 40, nearest: null };
    const { title, sub } = buildStatusText(LOC, res, helpers);
    expect(title).toBe("Storm approaching");
    expect(sub).toContain("8");
    expect(sub).toContain("Sofia");
  });

  it("uses hail-approaching title and sub when etaDbz >= 50", () => {
    const res: ResultLike = { ...base, level: "warning", eta: 8, etaDbz: 55, nearest: null };
    const { title, sub } = buildStatusText(LOC, res, helpers);
    expect(title).toBe("Hail approaching your area");
    expect(sub).toContain("Hail could reach");
    expect(sub).toContain("8");
    expect(sub).toContain("Sofia");
  });
});

describe("buildStatusText — warning: nearest cell path", () => {
  const nearest = { distanceKm: 5, bearing: 0, dbz: 40, lat: 42.8, lon: 23.3 };

  it("uses heads-up title when steady and dBZ < 50", () => {
    const res: ResultLike = { ...base, level: "warning", nearest, trend: "steady" };
    const { title } = buildStatusText(LOC, res, helpers);
    expect(title).toBe("Heads up");
  });

  it("uses closing-in title when approaching and dBZ < 50", () => {
    const res: ResultLike = { ...base, level: "warning", nearest, trend: "approaching" };
    const { title } = buildStatusText(LOC, res, helpers);
    expect(title).toBe("Heads up — closing in");
  });

  it("uses hail-approaching title when approaching and dBZ >= 50", () => {
    const hailNearest = { ...nearest, dbz: 55 };
    const res: ResultLike = { ...base, level: "warning", nearest: hailNearest, trend: "approaching" };
    const { title } = buildStatusText(LOC, res, helpers);
    expect(title).toBe("Hail approaching your area");
  });

  it("includes hail probability in sub when nearest dBZ >= 50", () => {
    const hailNearest = { ...nearest, dbz: 55 };
    const res: ResultLike = { ...base, level: "warning", nearest: hailNearest, trend: "steady" };
    const { sub } = buildStatusText(LOC, res, helpers);
    expect(sub).toContain("Hail probability");
    expect(sub).toContain("%");
  });

  it("does not include hail probability when dBZ < 50", () => {
    const res: ResultLike = { ...base, level: "warning", nearest, trend: "steady" };
    const { sub } = buildStatusText(LOC, res, helpers);
    expect(sub).not.toContain("Hail probability");
  });

  it("includes distance and direction in sub", () => {
    const res: ResultLike = { ...base, level: "warning", nearest, trend: "steady" };
    const { sub } = buildStatusText(LOC, res, helpers);
    expect(sub).toContain("5km");
    expect(sub).toContain("N");
    expect(sub).toContain("Sofia");
  });
});
