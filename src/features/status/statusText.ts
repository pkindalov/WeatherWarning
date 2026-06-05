import { hailChance } from "../radar/core";
import type { TParams } from "../../shared/i18n/I18nContext";
import type { AnalysisResult, SavedLocation } from "../../shared/types";

// Subset of AnalysisResult that buildStatusText needs — lets the
// "Test alert" button pass a synthetic result without the heavy fields.
export type ResultLike = Pick<
  AnalysisResult,
  "level" | "centerDbz" | "trend" | "nearest" | "maxDbz" | "eta" | "etaDbz" | "radiusKm"
>;

export interface StatusHelpers {
  t: (key: string, params?: TParams) => string;
  compass: (deg: number) => string;
  dbzLabel: (dbz: number | null) => string;
  fmtKm: (km: number | null) => string;
}

export function buildStatusText(
  loc: SavedLocation,
  res: ResultLike,
  { t, compass, dbzLabel, fmtKm }: StatusHelpers,
): { title: string; sub: string } {
  const name = loc.name;

  if (res.level === "danger") {
    const dangerDbz = Math.round(res.centerDbz ?? 0);
    const dangerHailPct = hailChance(dangerDbz);
    return {
      title: t("danger_title"),
      sub: t("danger_sub", {
        name,
        dbz: dangerDbz,
        tail: res.trend === "receding" ? t("tail_easing") : t("tail_dot"),
        hail: dangerHailPct != null ? t("hail_hint", { pct: dangerHailPct }) : "",
      }),
    };
  }

  if (res.level === "warning") {
    if (res.eta && !res.nearest) {
      const isHailEta = res.etaDbz != null && res.etaDbz >= 50;
      return {
        title: isHailEta ? t("hail_approaching_title") : t("warn_eta_title"),
        sub: isHailEta
          ? t("hail_eta_sub", { name, eta: res.eta })
          : t("warn_eta_sub", { name, eta: res.eta }),
      };
    }

    const n = res.nearest;
    const dir = n ? compass(n.bearing) : "";
    const trendBit =
      res.trend === "approaching" ? t("trend_in") : res.trend === "receding" ? t("trend_out") : "";
    const warnDbz = n ? n.dbz : (res.maxDbz ?? 0);
    const warnHailPct = hailChance(warnDbz);
    const isHailApproaching = res.trend === "approaching" && warnDbz >= 50;
    return {
      title: isHailApproaching
        ? t("hail_approaching_title")
        : res.trend === "approaching"
          ? t("warn_title_closing")
          : t("warn_title"),
      sub: t("warn_sub", {
        label: dbzLabel(n ? n.dbz : res.maxDbz),
        dist: n ? fmtKm(n.distanceKm) : "",
        dir,
        trend: trendBit,
        name,
        hail: warnHailPct != null ? t("hail_hint", { pct: warnHailPct }) : "",
      }),
    };
  }

  return { title: t("safe_title"), sub: t("safe_sub", { radius: res.radiusKm, name }) };
}
