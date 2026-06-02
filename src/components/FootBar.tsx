import { useI18n } from "../i18n/I18nContext";
import { useStore } from "../store/StoreContext";
import type { AnalysisResult } from "../types";

interface FootBarProps {
  result: AnalysisResult | null;
  showNotifCta: boolean;
  onEnableNotif: () => void;
}

export default function FootBar({ result, showNotifCta, onEnableNotif }: FootBarProps) {
  const { t, fmtTimeAgo, fmtClock } = useI18n();
  const { settings } = useStore();

  let updated = "—";
  if (result) {
    if (result.tainted) {
      updated = t("radar_at", { clock: fmtClock(result.frameTime) });
    } else {
      updated = t("updated", { ago: fmtTimeAgo(result.frameTime), clock: fmtClock(result.frameTime) });
      if (settings.autoRefresh) updated += " " + t("auto_hint", { n: settings.autoRefreshMin });
    }
  }

  return (
    <div className="footbar">
      <div className="updated">{updated}</div>
      {showNotifCta && (
        <button className="btn warn-cta" onClick={onEnableNotif}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          <span>{t("enable_alerts")}</span>
        </button>
      )}
    </div>
  );
}
