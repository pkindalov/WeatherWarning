import { useI18n } from "../i18n/I18nContext";
import { useStore } from "../store/StoreContext";
import type { AnalysisResult } from "../types";

interface FootBarProps {
  result: AnalysisResult | null;
  refreshedAt: number | null;
  showNotifCta: boolean;
  onEnableNotif: () => void;
}

// The i18n helpers the footer text needs, passed in so the builder stays a
// pure function (no React/context) and can be unit-tested.
interface UpdatedTextDeps {
  t: (key: string, params?: Record<string, string | number>) => string;
  fmtTimeAgo: (ts: number) => string;
  fmtClock: (ts: number) => string;
}

// Build the footer "updated" line. The time shown is `refreshedAt` — the moment
// the user (or auto-refresh) last pulled data — NOT the radar frame time, which
// lags ~10 min behind RainViewer and made the line look frozen after a refresh.
export function buildUpdatedText(
  result: AnalysisResult | null,
  refreshedAt: number | null,
  autoRefresh: boolean,
  autoRefreshMin: number,
  deps: UpdatedTextDeps
): string {
  if (!result) return "—";
  const { t, fmtTimeAgo, fmtClock } = deps;
  if (result.tainted) return t("radar_at", { clock: fmtClock(result.frameTime) });
  const ts = refreshedAt != null ? refreshedAt : result.frameTime;
  let updated = t("updated", { ago: fmtTimeAgo(ts), clock: fmtClock(ts) });
  if (autoRefresh) updated += " " + t("auto_hint", { n: autoRefreshMin });
  return updated;
}

export default function FootBar({ result, refreshedAt, showNotifCta, onEnableNotif }: FootBarProps) {
  const { t, fmtTimeAgo, fmtClock } = useI18n();
  const { settings } = useStore();

  const updated = buildUpdatedText(result, refreshedAt, settings.autoRefresh, settings.autoRefreshMin, {
    t,
    fmtTimeAgo,
    fmtClock,
  });

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
