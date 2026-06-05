import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "./I18nContext";
import { DICT } from "./dict";

describe("dictionary", () => {
  it("has the same keys in Bulgarian and English", () => {
    const bg = Object.keys(DICT.bg).sort();
    const en = Object.keys(DICT.en).sort();
    expect(bg).toEqual(en);
  });
});

function setup() {
  return renderHook(() => useI18n(), { wrapper: I18nProvider });
}

describe("useI18n", () => {
  it("defaults to Bulgarian and translates keys", () => {
    const { result } = setup();
    expect(result.current.lang).toBe("bg");
    expect(result.current.t("test")).toBe("Тест");
  });

  it("interpolates parameters", () => {
    const { result } = setup();
    expect(result.current.t("every_min", { n: 5 })).toBe("На всеки 5 мин");
  });

  it("falls back to the key when a string is missing", () => {
    const { result } = setup();
    expect(result.current.t("does_not_exist")).toBe("does_not_exist");
  });

  it("switches language at runtime", () => {
    const { result } = setup();
    act(() => result.current.setLang("en"));
    expect(result.current.lang).toBe("en");
    expect(result.current.t("test")).toBe("Test");
    expect(localStorage.getItem("ww.lang")).toBe("en");
  });

  it("localises formatters and the dBZ label", () => {
    const { result } = setup();
    expect(result.current.fmtKm(3.2)).toBe("3.2 км");
    expect(result.current.compass(90)).toBe("И");
    expect(result.current.dbzLabel(60)).toBe("Екстремно · едра градушка");

    act(() => result.current.setLang("en"));
    expect(result.current.fmtKm(3.2)).toBe("3.2 km");
    expect(result.current.compass(90)).toBe("E");
    expect(result.current.dbzLabel(60)).toBe("Extreme · large hail");
  });
});
