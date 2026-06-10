import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import WindyView, { alertRadiusPx, fitEmbedZoom } from "./WindyView";
import { StoreProvider } from "../../shared/store/StoreContext";

const TRYAVNA = { id: "l1", name: "Tryavna", kind: "other", lat: 42.8667, lon: 25.5 };

const seedLocation = () => {
  localStorage.setItem(
    "wheatherwarning.v1",
    JSON.stringify({ locations: [TRYAVNA], activeId: TRYAVNA.id }),
  );
};

describe("alertRadiusPx", () => {
  it("matches the web-mercator scale at the equator", () => {
    // zoom 10 at the equator: ~152.87 m/px, so 10 km ≈ 65.4 px
    expect(alertRadiusPx(0, 10, 10)).toBeCloseTo(65.41, 1);
  });

  it("grows with latitude for the same km radius", () => {
    expect(alertRadiusPx(43, 25, 10)).toBeGreaterThan(alertRadiusPx(0, 25, 10));
  });
});

describe("fitEmbedZoom", () => {
  it("keeps the city-level zoom 10 when the circle fits (desktop)", () => {
    // 25 km circle at Tryavna is ~446px at zoom 10 — plenty of room here
    expect(fitEmbedZoom(TRYAVNA.lat, 25, 800, 700)).toBe(10);
  });

  it("zooms out on a phone-sized map so the circle fits on screen", () => {
    // 446px circle would overflow a 360px-wide map; zoom 9 halves it to ~223px
    expect(fitEmbedZoom(TRYAVNA.lat, 25, 360, 500)).toBe(9);
  });

  it("never zooms out past the floor, even in absurdly small boxes", () => {
    expect(fitEmbedZoom(TRYAVNA.lat, 25, 10, 10)).toBe(5);
  });

  it("falls back to the default zoom when the box has no size yet", () => {
    expect(fitEmbedZoom(TRYAVNA.lat, 25, 0, 0)).toBe(10);
  });
});

describe("WindyView", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const renderView = () => {
    const { container } = render(
      <StoreProvider>
        <WindyView />
      </StoreProvider>,
    );
    return container;
  };

  it("requests the radar overlay on the radar product pinned to now", () => {
    const src = renderView().querySelector<HTMLIFrameElement>(".windy-iframe")!.src;
    // Windy's embed only engages the radar layer when the radar *product* is
    // selected too; overlay=radar alone leaves the default forecast product.
    expect(src).toContain("overlay=radar");
    expect(src).toContain("product=radar");
    expect(src).toContain("calendar=now");
  });

  it("falls back to the world view when no location is saved", () => {
    const container = renderView();
    const src = container.querySelector<HTMLIFrameElement>(".windy-iframe")!.src;
    expect(src).toContain("lat=20");
    expect(src).toContain("lon=0");
    expect(container.querySelector(".windy-radius")).toBeNull();
  });

  it("draws the alert-radius circle sized for the embed zoom", () => {
    seedLocation();
    const circle = renderView().querySelector<HTMLElement>(".windy-radius");
    expect(circle).not.toBeNull();
    const diameter = parseFloat(circle!.style.getPropertyValue("--d"));
    // default 25 km radius around Tryavna at the embed's zoom 10
    expect(diameter).toBeCloseTo(2 * alertRadiusPx(TRYAVNA.lat, 25, 10), 0);
  });

  it("colours the circle with the dark default for contrast on the embed", () => {
    seedLocation();
    const circle = renderView().querySelector<HTMLElement>(".windy-radius");
    expect(circle!.style.getPropertyValue("--c")).toBe("#14532d");
  });

  it("shows the town-name pin by default", () => {
    seedLocation();
    expect(renderView().querySelector(".windy-city-pin")).not.toBeNull();
  });

  it("hides the town-name pin when showWindyPin is off, keeping the circle", () => {
    localStorage.setItem(
      "wheatherwarning.v1",
      JSON.stringify({
        settings: { showWindyPin: false },
        locations: [TRYAVNA],
        activeId: TRYAVNA.id,
      }),
    );
    const container = renderView();
    expect(container.querySelector(".windy-city-pin")).toBeNull();
    expect(container.querySelector(".windy-radius")).not.toBeNull();
  });

  it("colours the circle from the radiusColorWindy setting", () => {
    localStorage.setItem(
      "wheatherwarning.v1",
      JSON.stringify({
        settings: { radiusColorWindy: "#112233" },
        locations: [TRYAVNA],
        activeId: TRYAVNA.id,
      }),
    );
    const circle = renderView().querySelector<HTMLElement>(".windy-radius");
    expect(circle!.style.getPropertyValue("--c")).toBe("#112233");
  });
});
