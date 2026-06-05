import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StoreProvider, useStore } from "./StoreContext";

function setup() {
  return renderHook(() => useStore(), { wrapper: StoreProvider });
}

describe("StoreProvider", () => {
  it("starts from defaults", () => {
    const { result } = setup();
    expect(result.current.settings.threshold).toBe(50);
    expect(result.current.settings.radiusKm).toBe(25);
    expect(result.current.locations).toEqual([]);
    expect(result.current.activeId).toBeNull();
  });

  it("adds a location and makes it active when none was set", () => {
    const { result } = setup();
    let id = "";
    act(() => {
      id = result.current.addLocation({ name: "Home", kind: "home", lat: 1, lon: 2 }).id;
    });
    expect(result.current.locations).toHaveLength(1);
    expect(result.current.activeId).toBe(id);
    expect(result.current.getActive()?.name).toBe("Home");
  });

  it("replaces a previous auto-detected location instead of duplicating", () => {
    const { result } = setup();
    act(() => {
      result.current.addLocation({ name: "Home", kind: "home", lat: 0, lon: 0 });
    });
    act(() => {
      result.current.addLocation({ name: "Here1", kind: "current", lat: 1, lon: 1, auto: true });
    });
    act(() => {
      result.current.addLocation({ name: "Here2", kind: "current", lat: 2, lon: 2, auto: true });
    });
    const names = result.current.locations.map((l) => l.name);
    expect(names).toEqual(["Here2", "Home"]); // auto unshifted, old auto removed
  });

  it("updates a location", () => {
    const { result } = setup();
    let id = "";
    act(() => {
      id = result.current.addLocation({ name: "A", kind: "home", lat: 0, lon: 0 }).id;
    });
    act(() => result.current.updateLocation(id, { name: "B" }));
    expect(result.current.locations[0].name).toBe("B");
  });

  it("removes a location and reassigns the active id", () => {
    const { result } = setup();
    let a = "";
    let b = "";
    act(() => {
      a = result.current.addLocation({ name: "A", kind: "home", lat: 0, lon: 0 }).id;
    });
    act(() => {
      b = result.current.addLocation({ name: "B", kind: "work", lat: 1, lon: 1 }).id;
    });
    act(() => result.current.setActive(a));
    act(() => result.current.setLastAlert(a, "danger"));
    act(() => result.current.removeLocation(a));

    expect(result.current.locations).toHaveLength(1);
    expect(result.current.activeId).toBe(b);
    expect(result.current.getLastAlert(a)).toBeNull(); // alert record cleaned up
  });

  it("persists settings and last-alert records", () => {
    const { result } = setup();
    let id = "";
    act(() => {
      id = result.current.addLocation({ name: "A", kind: "home", lat: 0, lon: 0 }).id;
    });
    act(() => result.current.setSetting("threshold", 60));
    act(() => result.current.setLastAlert(id, "warning"));

    expect(result.current.settings.threshold).toBe(60);
    expect(result.current.getLastAlert(id)?.level).toBe("warning");

    // a fresh provider should load the same persisted state from localStorage
    const second = setup();
    expect(second.result.current.settings.threshold).toBe(60);
    expect(second.result.current.locations.map((l) => l.name)).toEqual(["A"]);
  });
});
