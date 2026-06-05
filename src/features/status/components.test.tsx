import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import StatusBanner from "./StatusBanner";
import Toast from "../../shared/components/Toast";
import Details from "./Details";
import { I18nProvider } from "../../shared/i18n/I18nContext";
import type { AnalysisResult } from "../../shared/types";

describe("StatusBanner", () => {
  it("renders the title, subtitle and level class", () => {
    const { container } = render(<StatusBanner level="danger" title="Take cover" sub="Storm core" />);
    expect(screen.getByText("Take cover")).toBeInTheDocument();
    expect(screen.getByText("Storm core")).toBeInTheDocument();
    expect(container.querySelector(".status")).toHaveClass("danger");
  });
});

describe("Toast", () => {
  it("toggles the show class", () => {
    const { container, rerender } = render(<Toast msg="hi" show={false} />);
    expect(container.querySelector(".toast")).not.toHaveClass("show");
    rerender(<Toast msg="hi" show={true} />);
    expect(container.querySelector(".toast")).toHaveClass("show");
    expect(screen.getByText("hi")).toBeInTheDocument();
  });
});

describe("Details", () => {
  const wrap = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

  it("shows placeholders before any analysis", () => {
    const { container } = wrap(<Details result={null} />);
    const values = container.querySelectorAll(".stat-v");
    expect(values).toHaveLength(3);
    values.forEach((v) => expect(v.textContent).toBe("—"));
  });

  it("renders overhead, nearest and trend from a result (Bulgarian default)", () => {
    const result: AnalysisResult = {
      level: "danger",
      trend: "approaching",
      eta: null,
      centerDbz: 50,
      maxDbz: 55,
      nearest: { distanceKm: 3.2, bearing: 90, dbz: 52, lat: 1, lon: 1 },
      threshold: 50,
      radiusKm: 25,
      frameTime: 1_700_000_000,
      tainted: false,
      future: [],
    };
    const { container } = wrap(<Details result={result} />);
    const text = container.textContent ?? "";
    expect(text).toContain("50"); // overhead dBZ
    expect(text).toContain("3.2 км"); // nearest distance, localised
    expect(text).toContain("Приближава"); // trend_approaching (bg)
  });
});
