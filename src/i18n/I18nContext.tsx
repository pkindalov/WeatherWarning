/* ============================================================
   I18nContext.tsx — language state + translation/formatting helpers.
   Replaces the original vanilla `I18n` namespace. React re-renders on
   language change, so the manual applyStatic/applyView machinery from
   the original ui.js is no longer needed.
   ============================================================ */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { LEGEND } from "../lib/core";
import { COMPASS, DICT, type Lang } from "./dict";

const LANG_KEY = "ww.lang";

export type TParams = Record<string, string | number>;

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: TParams) => string;
  compass: (deg: number) => string;
  dbzLabel: (dbz: number | null) => string;
  fmtTimeAgo: (ts: number) => string;
  fmtClock: (ts: number) => string;
  fmtKm: (km: number | null) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLang(): Lang {
  const stored = localStorage.getItem(LANG_KEY) as Lang | null;
  return stored && DICT[stored] ? stored : "bg";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((l: Lang) => {
    if (!DICT[l]) return;
    localStorage.setItem(LANG_KEY, l);
    document.documentElement.lang = l;
    setLangState(l);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const t = (key: string, params?: TParams) => {
      let s =
        DICT[lang] && DICT[lang][key] != null
          ? DICT[lang][key]
          : DICT.en[key] != null
            ? DICT.en[key]
            : key;
      if (params) for (const k in params) s = s.split("{" + k + "}").join(String(params[k]));
      return s;
    };

    const compass = (deg: number) => COMPASS[lang][Math.round(deg / 45) % 8];

    const dbzLabel = (dbz: number | null) => {
      if (dbz == null) return t("lbl_none");
      let key = LEGEND[0].key;
      for (const s of LEGEND) if (dbz >= s.dbz) key = s.key;
      return t("lbl_" + key);
    };

    const fmtTimeAgo = (ts: number) => {
      const s = Math.round((Date.now() - ts * 1000) / 1000);
      if (s < 60) return t("just_now");
      return t("min_ago", { m: Math.round(s / 60) });
    };

    const fmtClock = (ts: number) => {
      const locale = lang === "bg" ? "bg-BG" : "en-GB"; // both 24h
      return new Date(ts * 1000).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    };

    const fmtKm = (km: number | null) => {
      if (km == null) return "—";
      const u = lang === "bg" ? { km: "км", m: "м" } : { km: "km", m: "m" };
      if (km < 1) return Math.round(km * 1000) + " " + u.m;
      if (km < 10) return km.toFixed(1) + " " + u.km;
      return Math.round(km) + " " + u.km;
    };

    return { lang, setLang, t, compass, dbzLabel, fmtTimeAgo, fmtClock, fmtKm };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
