import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppBar from "./AppBar";
import { I18nProvider } from "../i18n/I18nContext";
import type { MapMode } from "../../shared/types";

const renderBar = (mapMode: MapMode, onToggleMapMode = vi.fn()) => {
  const utils = render(
    <I18nProvider>
      <AppBar
        refreshing={false}
        mapMode={mapMode}
        onRefresh={vi.fn()}
        onSettings={vi.fn()}
        onToggleMapMode={onToggleMapMode}
      />
    </I18nProvider>,
  );
  return { ...utils, onToggleMapMode };
};

describe("AppBar – map source toggle", () => {
  it("offers the RainViewer switch in the app language while on Windy", () => {
    renderBar("windy");
    // default language is Bulgarian — the tooltip must not be English-only
    expect(screen.getByTitle("Превключи към RainViewer радар")).toBeInTheDocument();
  });

  it("offers the Windy switch in the app language while on RainViewer", () => {
    renderBar("rainviewer");
    expect(screen.getByTitle("Превключи към Windy радар")).toBeInTheDocument();
  });

  it("highlights the button only while the Windy view is active", () => {
    renderBar("windy");
    expect(screen.getByTitle("Превключи към RainViewer радар")).toHaveClass("icon-btn--active");
  });

  it("does not highlight the button on the RainViewer view", () => {
    renderBar("rainviewer");
    expect(screen.getByTitle("Превключи към Windy радар")).not.toHaveClass("icon-btn--active");
  });

  it("clicking the button asks the app to switch map source", () => {
    const { onToggleMapMode } = renderBar("windy");
    fireEvent.click(screen.getByTitle("Превключи към RainViewer радар"));
    expect(onToggleMapMode).toHaveBeenCalledTimes(1);
  });
});
