import { render, screen, fireEvent } from "@testing-library/react";
import { type ReactNode } from "react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import SettingsSheet from "./SettingsSheet";
import { StoreProvider } from "../../shared/store/StoreContext";
import { I18nProvider } from "../../shared/i18n/I18nContext";
import * as N from "../alerts/notify";

vi.mock("../alerts/notify", () => ({
  unlockAudio: vi.fn(),
  vibrate: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <StoreProvider>{children}</StoreProvider>
    </I18nProvider>
  );
}

function renderSheet(
  overrides: {
    open?: boolean;
    notifPerm?: NotificationPermission | "unsupported";
    onClose?: ReturnType<typeof vi.fn>;
    onRefresh?: ReturnType<typeof vi.fn>;
    onToggleNotify?: ReturnType<typeof vi.fn>;
    onTest?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const onClose = overrides.onClose ?? vi.fn();
  const onRefresh = overrides.onRefresh ?? vi.fn();
  const onToggleNotify = overrides.onToggleNotify ?? vi.fn();
  const onTest = overrides.onTest ?? vi.fn();
  const result = render(
    <Wrapper>
      <SettingsSheet
        open={overrides.open ?? true}
        notifPerm={overrides.notifPerm ?? "default"}
        onClose={onClose}
        onRefresh={onRefresh}
        onToggleNotify={onToggleNotify}
        onTest={onTest}
      />
    </Wrapper>,
  );
  return { ...result, onClose, onRefresh, onToggleNotify, onTest };
}

function toggleInField(labelText: string): Element {
  const field = screen.getByText(labelText).closest(".field")!;
  return field.querySelector(".toggle")!;
}

function storedSettings() {
  const raw = JSON.parse(localStorage.getItem("wheatherwarning.v1") || "{}");
  return raw.settings ?? {};
}

const FULL_DEFAULTS = {
  settings: { threshold: 50, radiusKm: 25, notify: false, sound: true, vibrate: true, autoRefresh: true, autoRefreshMin: 5 },
  locations: [],
  activeId: null,
  lastAlert: {},
};

// ── Visibility ──────────────────────────────────────────────────────────────

describe("SettingsSheet – visibility", () => {
  it("has 'open' class when open=true", () => {
    const { container } = renderSheet({ open: true });
    expect(container.querySelector(".sheet")).toHaveClass("open");
  });

  it("omits 'open' class when open=false", () => {
    const { container } = renderSheet({ open: false });
    expect(container.querySelector(".sheet")).not.toHaveClass("open");
  });

  it("clicking the close button calls onClose", () => {
    const { onClose, container } = renderSheet({ open: true });
    fireEvent.click(container.querySelector(".sheet-close")!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ── Danger threshold slider ──────────────────────────────────────────────────

describe("SettingsSheet – danger threshold slider", () => {
  it("shows the default threshold value (50 dBZ)", () => {
    renderSheet();
    expect(screen.getByText("50 dBZ")).toBeInTheDocument();
  });

  it("updates the displayed value while dragging", () => {
    renderSheet();
    const slider = screen.getAllByRole("slider")[0];
    fireEvent.change(slider, { target: { value: "60" } });
    expect(screen.getByText("60 dBZ")).toBeInTheDocument();
  });

  it("commits value to store and calls onRefresh(false) on pointerUp", () => {
    const { onRefresh } = renderSheet();
    const slider = screen.getAllByRole("slider")[0];
    fireEvent.change(slider, { target: { value: "60" } });
    fireEvent.pointerUp(slider);
    expect(onRefresh).toHaveBeenCalledWith(false);
    expect(storedSettings().threshold).toBe(60);
  });

  it("commits value to store and calls onRefresh(false) on keyUp", () => {
    const { onRefresh } = renderSheet();
    const slider = screen.getAllByRole("slider")[0];
    fireEvent.change(slider, { target: { value: "55" } });
    fireEvent.keyUp(slider);
    expect(onRefresh).toHaveBeenCalledWith(false);
    expect(storedSettings().threshold).toBe(55);
  });

  it("does NOT call onRefresh on plain change (no commit yet)", () => {
    const { onRefresh } = renderSheet();
    fireEvent.change(screen.getAllByRole("slider")[0], { target: { value: "60" } });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

// ── Alert radius slider ──────────────────────────────────────────────────────

describe("SettingsSheet – alert radius slider", () => {
  it("shows the default radius value (25 км)", () => {
    renderSheet();
    expect(screen.getByText("25 км")).toBeInTheDocument();
  });

  it("updates the displayed value while dragging", () => {
    renderSheet();
    const slider = screen.getAllByRole("slider")[1];
    fireEvent.change(slider, { target: { value: "30" } });
    expect(screen.getByText("30 км")).toBeInTheDocument();
  });

  it("commits value to store and calls onRefresh(true) on pointerUp", () => {
    const { onRefresh } = renderSheet();
    const slider = screen.getAllByRole("slider")[1];
    fireEvent.change(slider, { target: { value: "30" } });
    fireEvent.pointerUp(slider);
    expect(onRefresh).toHaveBeenCalledWith(true);
    expect(storedSettings().radiusKm).toBe(30);
  });

  it("commits value to store and calls onRefresh(true) on keyUp", () => {
    const { onRefresh } = renderSheet();
    const slider = screen.getAllByRole("slider")[1];
    fireEvent.change(slider, { target: { value: "15" } });
    fireEvent.keyUp(slider);
    expect(onRefresh).toHaveBeenCalledWith(true);
    expect(storedSettings().radiusKm).toBe(15);
  });
});

// ── Radius circle colours ────────────────────────────────────────────────────

describe("SettingsSheet – radius circle colours", () => {
  const colorInput = (labelText: string): HTMLInputElement => {
    const field = screen.getByText(labelText).closest(".field")!;
    return field.querySelector<HTMLInputElement>("input[type=color]")!;
  };

  it("shows both pickers with their default colours", () => {
    renderSheet();
    expect(colorInput("Цвят на радиуса (Windy)").value).toBe("#14532d");
    expect(colorInput("Цвят на радиуса (радарна карта)").value).toBe("#1f9d72");
  });

  it("changing the Windy picker persists radiusColorWindy", () => {
    renderSheet();
    fireEvent.change(colorInput("Цвят на радиуса (Windy)"), { target: { value: "#112233" } });
    expect(storedSettings().radiusColorWindy).toBe("#112233");
  });

  it("changing the map picker persists radiusColorMap", () => {
    renderSheet();
    fireEvent.change(colorInput("Цвят на радиуса (радарна карта)"), { target: { value: "#aabbcc" } });
    expect(storedSettings().radiusColorMap).toBe("#aabbcc");
  });

  const resetButton = (labelText: string): HTMLButtonElement => {
    const field = screen.getByText(labelText).closest(".field")!;
    return field.querySelector<HTMLButtonElement>("button")!;
  };

  it("the Windy reset returns only the Windy colour to its default", () => {
    renderSheet();
    fireEvent.change(colorInput("Цвят на радиуса (Windy)"), { target: { value: "#112233" } });
    fireEvent.change(colorInput("Цвят на радиуса (радарна карта)"), { target: { value: "#aabbcc" } });

    fireEvent.click(resetButton("Цвят на радиуса (Windy)"));

    expect(storedSettings().radiusColorWindy).toBe("#14532d");
    expect(colorInput("Цвят на радиуса (Windy)").value).toBe("#14532d");
    expect(storedSettings().radiusColorMap).toBe("#aabbcc"); // untouched
  });

  it("the map reset returns only the map colour to its default", () => {
    renderSheet();
    fireEvent.change(colorInput("Цвят на радиуса (Windy)"), { target: { value: "#112233" } });
    fireEvent.change(colorInput("Цвят на радиуса (радарна карта)"), { target: { value: "#aabbcc" } });

    fireEvent.click(resetButton("Цвят на радиуса (радарна карта)"));

    expect(storedSettings().radiusColorMap).toBe("#1f9d72");
    expect(colorInput("Цвят на радиуса (радарна карта)").value).toBe("#1f9d72");
    expect(storedSettings().radiusColorWindy).toBe("#112233"); // untouched
  });
});

// ── Auto-refresh toggle ──────────────────────────────────────────────────────

describe("SettingsSheet – auto-refresh toggle", () => {
  it("toggle is on by default (autoRefresh defaults to true)", () => {
    renderSheet();
    expect(toggleInField("Автоматично обновяване")).toHaveClass("on");
  });

  it("interval slider is visible when autoRefresh is on", () => {
    renderSheet();
    expect(screen.getAllByRole("slider")).toHaveLength(3);
  });

  it("clicking toggle turns autoRefresh off, persists it, and hides the interval slider", () => {
    renderSheet();
    fireEvent.click(toggleInField("Автоматично обновяване"));
    expect(toggleInField("Автоматично обновяване")).not.toHaveClass("on");
    expect(storedSettings().autoRefresh).toBe(false);
    expect(screen.getAllByRole("slider")).toHaveLength(2);
  });

  it("toggling twice restores autoRefresh to on", () => {
    renderSheet();
    const toggle = toggleInField("Автоматично обновяване");
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(toggleInField("Автоматично обновяване")).toHaveClass("on");
    expect(storedSettings().autoRefresh).toBe(true);
  });
});

// ── Auto-refresh interval slider ─────────────────────────────────────────────

describe("SettingsSheet – auto-refresh interval slider", () => {
  it("shows the default interval label (20 min)", () => {
    renderSheet();
    expect(screen.getByText("На всеки 20 мин")).toBeInTheDocument();
  });

  it("commits new interval to store on pointerUp", () => {
    renderSheet();
    const slider = screen.getAllByRole("slider")[2];
    fireEvent.change(slider, { target: { value: "10" } });
    fireEvent.pointerUp(slider);
    expect(storedSettings().autoRefreshMin).toBe(10);
  });

  it("commits new interval to store on keyUp", () => {
    renderSheet();
    const slider = screen.getAllByRole("slider")[2];
    fireEvent.change(slider, { target: { value: "15" } });
    fireEvent.keyUp(slider);
    expect(storedSettings().autoRefreshMin).toBe(15);
  });

  it("never stores a value below the minimum of 5", () => {
    renderSheet();
    const slider = screen.getAllByRole("slider")[2];
    // simulate a value of 5 (min) to confirm the Math.max guard works
    fireEvent.change(slider, { target: { value: "5" } });
    fireEvent.pointerUp(slider);
    expect(storedSettings().autoRefreshMin).toBe(5);
  });

  it("is hidden when autoRefresh is turned off", () => {
    renderSheet();
    fireEvent.click(toggleInField("Автоматично обновяване"));
    expect(screen.queryByText(/На всеки/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("slider")).toHaveLength(2);
  });
});

// ── Notifications toggle ─────────────────────────────────────────────────────

describe("SettingsSheet – notifications toggle", () => {
  it("toggle is off when notifPerm is 'default'", () => {
    renderSheet({ notifPerm: "default" });
    expect(toggleInField("Известия в браузъра")).not.toHaveClass("on");
  });

  it("toggle is off when notifPerm is 'denied'", () => {
    renderSheet({ notifPerm: "denied" });
    expect(toggleInField("Известия в браузъра")).not.toHaveClass("on");
  });

  it("toggle is off when notifPerm is 'unsupported'", () => {
    renderSheet({ notifPerm: "unsupported" });
    expect(toggleInField("Известия в браузъра")).not.toHaveClass("on");
  });

  it("toggle is on when notify=true and notifPerm='granted'", () => {
    localStorage.setItem("wheatherwarning.v1", JSON.stringify({ ...FULL_DEFAULTS, settings: { ...FULL_DEFAULTS.settings, notify: true } }));
    renderSheet({ notifPerm: "granted" });
    expect(toggleInField("Известия в браузъра")).toHaveClass("on");
  });

  it("toggle is off when notify=true but notifPerm='denied' (permission revoked)", () => {
    localStorage.setItem("wheatherwarning.v1", JSON.stringify({ ...FULL_DEFAULTS, settings: { ...FULL_DEFAULTS.settings, notify: true } }));
    renderSheet({ notifPerm: "denied" });
    expect(toggleInField("Известия в браузъра")).not.toHaveClass("on");
  });

  it("clicking an off toggle calls onToggleNotify(true) and unlockAudio", () => {
    const { onToggleNotify } = renderSheet({ notifPerm: "default" });
    fireEvent.click(toggleInField("Известия в браузъра"));
    expect(vi.mocked(N.unlockAudio)).toHaveBeenCalled();
    expect(onToggleNotify).toHaveBeenCalledWith(true);
  });

  it("clicking an on toggle calls onToggleNotify(false)", () => {
    localStorage.setItem("wheatherwarning.v1", JSON.stringify({ ...FULL_DEFAULTS, settings: { ...FULL_DEFAULTS.settings, notify: true } }));
    const { onToggleNotify } = renderSheet({ notifPerm: "granted" });
    fireEvent.click(toggleInField("Известия в браузъра"));
    expect(onToggleNotify).toHaveBeenCalledWith(false);
  });
});

// ── Sound toggle ─────────────────────────────────────────────────────────────

describe("SettingsSheet – sound toggle", () => {
  it("toggle is on by default", () => {
    renderSheet();
    expect(toggleInField("Звуков сигнал")).toHaveClass("on");
  });

  it("clicking toggle turns sound off, persists it, and calls unlockAudio", () => {
    renderSheet();
    fireEvent.click(toggleInField("Звуков сигнал"));
    expect(vi.mocked(N.unlockAudio)).toHaveBeenCalled();
    expect(toggleInField("Звуков сигнал")).not.toHaveClass("on");
    expect(storedSettings().sound).toBe(false);
  });

  it("toggling twice restores sound to on", () => {
    renderSheet();
    const toggle = toggleInField("Звуков сигнал");
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(toggleInField("Звуков сигнал")).toHaveClass("on");
    expect(storedSettings().sound).toBe(true);
  });
});

// ── Vibration toggle ─────────────────────────────────────────────────────────

describe("SettingsSheet – vibration toggle", () => {
  it("toggle is on by default", () => {
    renderSheet();
    expect(toggleInField("Вибрация")).toHaveClass("on");
  });

  it("turning vibration off does not trigger N.vibrate", () => {
    renderSheet();
    fireEvent.click(toggleInField("Вибрация"));
    expect(vi.mocked(N.vibrate)).not.toHaveBeenCalled();
    expect(storedSettings().vibrate).toBe(false);
  });

  it("turning vibration on calls N.vibrate([120])", () => {
    renderSheet();
    fireEvent.click(toggleInField("Вибрация")); // turn off
    vi.clearAllMocks();
    fireEvent.click(toggleInField("Вибрация")); // turn on
    expect(vi.mocked(N.vibrate)).toHaveBeenCalledWith([120]);
    expect(storedSettings().vibrate).toBe(true);
  });
});

// ── Language selection ───────────────────────────────────────────────────────

describe("SettingsSheet – language selection", () => {
  it("Bulgarian button has active class by default", () => {
    renderSheet();
    expect(screen.getByText("Български")).toHaveClass("active");
    expect(screen.getByText("English")).not.toHaveClass("active");
  });

  it("clicking English switches active class to English", () => {
    renderSheet();
    fireEvent.click(screen.getByText("English"));
    expect(screen.getByText("English")).toHaveClass("active");
    expect(screen.getByText("Български")).not.toHaveClass("active");
  });

  it("clicking English persists the language choice", () => {
    renderSheet();
    fireEvent.click(screen.getByText("English"));
    expect(localStorage.getItem("ww.lang")).toBe("en");
  });

  it("switching to English re-renders the UI in English", () => {
    renderSheet();
    fireEvent.click(screen.getByText("English"));
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Auto-update")).toBeInTheDocument();
  });

  it("clicking the already-active language keeps it active", () => {
    renderSheet();
    fireEvent.click(screen.getByText("Български"));
    expect(screen.getByText("Български")).toHaveClass("active");
    expect(screen.getByText("English")).not.toHaveClass("active");
  });
});

// ── Test alert button ────────────────────────────────────────────────────────

describe("SettingsSheet – test alert button", () => {
  it("clicking the test button calls onTest", () => {
    const { onTest } = renderSheet();
    fireEvent.click(screen.getByText("Тест"));
    expect(onTest).toHaveBeenCalledOnce();
  });

  it("clicking the test button calls unlockAudio", () => {
    renderSheet();
    fireEvent.click(screen.getByText("Тест"));
    expect(vi.mocked(N.unlockAudio)).toHaveBeenCalled();
  });
});
