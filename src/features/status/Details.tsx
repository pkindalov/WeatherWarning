import { useI18n } from "../../shared/i18n/I18nContext";
import type { AnalysisResult } from "../../shared/types";

interface DetailsProps {
  result: AnalysisResult | null;
}

export default function Details({ result }: DetailsProps) {
  const { t, fmtKm, compass, dbzLabel } = useI18n();

  // before any analysis
  if (!result) {
    return (
      <section className="details">
        <Stat k={t("d_overhead")} v="—" x="&nbsp;" />
        <Stat k={t("d_nearest")} v="—" x="&nbsp;" />
        <Stat k={t("d_trend")} v="—" x="&nbsp;" small />
      </section>
    );
  }

  // map rendered but per-pixel detection blocked (CORS-tainted tiles)
  if (result.tainted) {
    return (
      <section className="details">
        <Stat k={t("d_overhead")} v="—" x={t("d_detection_off")} />
        <Stat k={t("d_nearest")} v="—" x="&nbsp;" />
        <Stat k={t("d_trend")} v="—" x="&nbsp;" small />
      </section>
    );
  }

  const overheadV =
    result.centerDbz != null
      ? `${Math.round(result.centerDbz)}<small> dBZ</small>`
      : t("d_clear");
  const overheadX = result.centerDbz != null ? dbzLabel(result.centerDbz) : t("d_no_echo");

  const nearestV = result.nearest ? fmtKm(result.nearest.distanceKm) : t("d_none");
  const nearestX = result.nearest
    ? `${compass(result.nearest.bearing)} · ${Math.round(result.nearest.dbz)} dBZ`
    : t("d_within", { radius: result.radiusKm });

  const trendText: Record<AnalysisResult["trend"], [string, string]> = {
    approaching: [`<span class="trend-up">${t("trend_approaching")}</span>`, t("trend_sub_in")],
    receding: [`<span class="trend-down">${t("trend_receding")}</span>`, t("trend_sub_out")],
    steady: [t("trend_steady"), t("trend_sub_steady")],
  };
  const [trendV, trendSub] = trendText[result.trend];
  const trendX = result.eta ? t("eta_away", { eta: result.eta }) : trendSub;

  return (
    <section className="details">
      <Stat k={t("d_overhead")} v={overheadV} x={overheadX} />
      <Stat k={t("d_nearest")} v={nearestV} x={nearestX} />
      <Stat k={t("d_trend")} v={trendV} x={trendX} small />
    </section>
  );
}

function Stat({ k, v, x, small }: { k: string; v: string; x: string; small?: boolean }) {
  return (
    <div className="stat">
      <div className="stat-k">{k}</div>
      <div className="stat-v" style={small ? { fontSize: 15 } : undefined} dangerouslySetInnerHTML={{ __html: v }} />
      <div className="stat-x" dangerouslySetInnerHTML={{ __html: x }} />
    </div>
  );
}
