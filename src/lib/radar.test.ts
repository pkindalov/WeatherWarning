import { describe, expect, it } from "vitest";
import { frameList, radarTileTemplate } from "./radar";

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
  it("builds a Leaflet {z}/{x}/{y} tile template with the colour scheme", () => {
    expect(radarTileTemplate("https://rv.example", "/v2/radar/123")).toBe(
      "https://rv.example/v2/radar/123/256/{z}/{x}/{y}/4/1_1.png"
    );
  });
});
