import { describe, it, expect } from "vitest";
import { buildUpdatedText } from "./FootBar";
import type { AnalysisResult } from "../../shared/types";

// Minimal stubs that echo their inputs, so assertions can see exactly which
// timestamp/params the builder fed each helper.
const deps = {
  t: (key: string, params?: Record<string, string | number>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
  fmtTimeAgo: (ts: number) => `ago:${ts}`,
  fmtClock: (ts: number) => `clock:${ts}`,
};

const makeResult = (over: Partial<AnalysisResult> = {}): AnalysisResult => ({
  level: "safe",
  trend: "steady",
  eta: null,
  etaDbz: null,
  centerDbz: null,
  maxDbz: null,
  nearest: null,
  threshold: 35,
  radiusKm: 20,
  frameTime: 1000,
  tainted: false,
  future: [],
  ...over,
});

describe("buildUpdatedText", () => {
  it("returns a dash when there is no result", () => {
    expect(buildUpdatedText(null, 5000, false, 5, deps)).toBe("—");
  });

  it("uses the refresh time, not the radar frame time", () => {
    // The bug being fixed: frameTime (1000) lags, refreshedAt (5000) is now.
    const result = makeResult({ frameTime: 1000 });
    const text = buildUpdatedText(result, 5000, false, 5, deps);
    expect(text).toContain("ago:5000");
    expect(text).toContain("clock:5000");
    expect(text).not.toContain("1000");
  });

  it("appends the auto-refresh hint only when autoRefresh is on", () => {
    const result = makeResult();
    expect(buildUpdatedText(result, 5000, true, 7, deps)).toContain('auto_hint({"n":7})');
    expect(buildUpdatedText(result, 5000, false, 7, deps)).not.toContain("auto_hint");
  });

  it("falls back to frame time when no refresh time is known yet", () => {
    const result = makeResult({ frameTime: 1000 });
    expect(buildUpdatedText(result, null, false, 5, deps)).toContain("ago:1000");
  });

  it("shows the radar frame clock for tainted results", () => {
    const result = makeResult({ tainted: true, frameTime: 2000 });
    expect(buildUpdatedText(result, 5000, false, 5, deps)).toBe('radar_at({"clock":"clock:2000"})');
  });
});
