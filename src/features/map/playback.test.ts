import { describe, expect, it } from "vitest";
import { lastPastIndex, nowMarkerPercent } from "./playback";
import type { RadarFrame } from "../../shared/types";

const frames = (times: number[]): RadarFrame[] => times.map((time) => ({ time, path: "/" + time }));

describe("lastPastIndex", () => {
  it("returns the last frame at or before baseTime", () => {
    // past 10,20,30 (base=30) + nowcast 40,50 -> index 2
    expect(lastPastIndex(frames([10, 20, 30, 40, 50]), 30)).toBe(2);
  });

  it("treats a frame exactly at baseTime as past", () => {
    expect(lastPastIndex(frames([10, 20, 30]), 20)).toBe(1);
  });

  it("falls back to 0 when every frame is in the future", () => {
    expect(lastPastIndex(frames([40, 50, 60]), 30)).toBe(0);
  });

  it("returns 0 for an empty list", () => {
    expect(lastPastIndex([], 30)).toBe(0);
  });
});

describe("nowMarkerPercent", () => {
  it("places the now boundary by index across the track", () => {
    // index 2 of 5 frames -> 2/4 = 50%
    expect(nowMarkerPercent(frames([10, 20, 30, 40, 50]), 30)).toBe(50);
  });

  it("puts a past-only list at the far right", () => {
    // index 2 of 3 frames -> 2/2 = 100%
    expect(nowMarkerPercent(frames([10, 20, 30]), 30)).toBe(100);
  });

  it("collapses to 0 with fewer than two frames", () => {
    expect(nowMarkerPercent(frames([10]), 10)).toBe(0);
    expect(nowMarkerPercent([], 10)).toBe(0);
  });
});
