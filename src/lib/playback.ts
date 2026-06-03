/* ============================================================
   playback.ts — pure helpers for the radar timeline scrubber.
   Kept free of React/Leaflet so the index math is unit-testable.
   ============================================================ */
import type { RadarFrame } from "../types";

// Index of the most recent observed (past) frame: the last frame whose time is
// at or before `baseTime`. Falls back to 0 when nothing qualifies (or no frames).
export const lastPastIndex = (frames: RadarFrame[], baseTime: number): number => {
  let idx = 0;
  for (let i = 0; i < frames.length; i++) if (frames[i].time <= baseTime) idx = i;
  return idx;
};

// Horizontal position (0–100%) of the "now" boundary on a scrubber track that
// maps frame index linearly to width. A single frame collapses the track to 0.
export const nowMarkerPercent = (frames: RadarFrame[], baseTime: number): number => {
  if (frames.length < 2) return 0;
  return (lastPastIndex(frames, baseTime) / (frames.length - 1)) * 100;
};
