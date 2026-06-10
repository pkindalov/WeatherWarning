import { useEffect, useState } from "react";
import { useI18n } from "../../shared/i18n/I18nContext";
import { DEFAULT_RADIUS_COLORS, useStore } from "../../shared/store/StoreContext";
import * as N from "../alerts/notify";
import type { Lang } from "../../shared/i18n/dict";

interface SettingsSheetProps {
  open: boolean;
  notifPerm: NotificationPermission | "unsupported";
  onClose: () => void;
  onRefresh: (fit: boolean) => void;
  onToggleNotify: (on: boolean) => void;
  onTest: () => void;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <div className={"toggle" + (on ? " on" : "")} onClick={onClick} />;
}

export default function SettingsSheet({
  open,
  notifPerm,
  onClose,
  onRefresh,
  onToggleNotify,
  onTest,
}: SettingsSheetProps) {
  const { t, lang, setLang } = useI18n();
  const { settings, setSetting } = useStore();

  // live slider values (commit to the store on release to avoid refresh spam)
  const [threshold, setThreshold] = useState(settings.threshold);
  const [radius, setRadius] = useState(settings.radiusKm);
  const [autoMin, setAutoMin] = useState(settings.autoRefreshMin);

  useEffect(() => setThreshold(settings.threshold), [settings.threshold]);
  useEffect(() => setRadius(settings.radiusKm), [settings.radiusKm]);
  useEffect(() => setAutoMin(settings.autoRefreshMin), [settings.autoRefreshMin]);

  const kmUnit = lang === "bg" ? " км" : " km";

  return (
    <div className={"sheet" + (open ? " open" : "")}>
      <button className="sheet-close" type="button" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <div className="sheet-grip" />
      <h2>{t("set_title")}</h2>
      <p className="muted">{t("set_sub")}</p>

      {/* danger threshold */}
      <div className="field">
        <div className="field-row">
          <div>
            <div className="field-label">{t("set_threshold")}</div>
            <div className="field-desc">{t("set_threshold_d")}</div>
          </div>
          <div className="field-val">{threshold} dBZ</div>
        </div>
        <input
          type="range"
          min={35}
          max={65}
          step={5}
          value={threshold}
          onChange={(e) => setThreshold(+e.target.value)}
          onPointerUp={() => {
            setSetting("threshold", threshold);
            onRefresh(false);
          }}
          onKeyUp={() => {
            setSetting("threshold", threshold);
            onRefresh(false);
          }}
        />
      </div>

      {/* alert radius */}
      <div className="field">
        <div className="field-row">
          <div>
            <div className="field-label">{t("set_radius")}</div>
            <div className="field-desc">{t("set_radius_d")}</div>
          </div>
          <div className="field-val">
            {radius}
            {kmUnit}
          </div>
        </div>
        <input
          type="range"
          min={2}
          max={50}
          step={1}
          value={radius}
          onChange={(e) => setRadius(+e.target.value)}
          onPointerUp={() => {
            setSetting("radiusKm", radius);
            onRefresh(true);
          }}
          onKeyUp={() => {
            setSetting("radiusKm", radius);
            onRefresh(true);
          }}
        />
      </div>

      {/* radius circle colour — Windy view */}
      <div className="field">
        <div className="field-row">
          <div>
            <div className="field-label">{t("set_circle_windy")}</div>
            <div className="field-desc">{t("set_circle_windy_d")}</div>
          </div>
          <div className="chip-row chip-row--nowrap">
            <input
              type="color"
              className="color-swatch"
              value={settings.radiusColorWindy}
              onChange={(e) => setSetting("radiusColorWindy", e.target.value)}
              aria-label={t("set_circle_windy")}
            />
            <button
              className="chip"
              onClick={() => setSetting("radiusColorWindy", DEFAULT_RADIUS_COLORS.windy)}
            >
              {t("reset")}
            </button>
          </div>
        </div>
      </div>

      {/* radius circle colour — radar map */}
      <div className="field">
        <div className="field-row">
          <div>
            <div className="field-label">{t("set_circle_map")}</div>
            <div className="field-desc">{t("set_circle_map_d")}</div>
          </div>
          <div className="chip-row chip-row--nowrap">
            <input
              type="color"
              className="color-swatch"
              value={settings.radiusColorMap}
              onChange={(e) => setSetting("radiusColorMap", e.target.value)}
              aria-label={t("set_circle_map")}
            />
            <button
              className="chip"
              onClick={() => setSetting("radiusColorMap", DEFAULT_RADIUS_COLORS.map)}
            >
              {t("reset")}
            </button>
          </div>
        </div>
      </div>

      {/* town-name label on the Windy view */}
      <div className="field">
        <div className="field-row">
          <div>
            <div className="field-label">{t("set_windy_pin")}</div>
            <div className="field-desc">{t("set_windy_pin_d")}</div>
          </div>
          <Toggle
            on={settings.showWindyPin}
            onClick={() => setSetting("showWindyPin", !settings.showWindyPin)}
          />
        </div>
      </div>

      {/* auto-update */}
      <div className="field">
        <div className="field-row">
          <div>
            <div className="field-label">{t("set_auto")}</div>
            <div className="field-desc">{t("set_auto_d")}</div>
          </div>
          <Toggle on={settings.autoRefresh} onClick={() => setSetting("autoRefresh", !settings.autoRefresh)} />
        </div>
        {settings.autoRefresh && (
          <div style={{ marginTop: 12 }}>
            <div className="field-row" style={{ marginBottom: 2 }}>
              <div className="field-desc">{t("every_min", { n: autoMin })}</div>
            </div>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={autoMin}
              onChange={(e) => setAutoMin(+e.target.value)}
              onPointerUp={() => setSetting("autoRefreshMin", Math.max(5, autoMin))}
              onKeyUp={() => setSetting("autoRefreshMin", Math.max(5, autoMin))}
            />
          </div>
        )}
      </div>

      {/* browser notifications */}
      <div className="field">
        <div className="field-row">
          <div>
            <div className="field-label">{t("set_notify")}</div>
            <div className="field-desc">{t("set_notify_d")}</div>
          </div>
          <Toggle
            on={settings.notify && notifPerm === "granted"}
            onClick={() => {
              N.unlockAudio();
              onToggleNotify(!(settings.notify && notifPerm === "granted"));
            }}
          />
        </div>
      </div>

      {/* alarm sound */}
      <div className="field">
        <div className="field-row">
          <div>
            <div className="field-label">{t("set_sound")}</div>
            <div className="field-desc">{t("set_sound_d")}</div>
          </div>
          <Toggle
            on={settings.sound}
            onClick={() => {
              N.unlockAudio();
              setSetting("sound", !settings.sound);
            }}
          />
        </div>
      </div>

      {/* vibration */}
      <div className="field">
        <div className="field-row">
          <div>
            <div className="field-label">{t("set_vibrate")}</div>
            <div className="field-desc">{t("set_vibrate_d")}</div>
          </div>
          <Toggle
            on={settings.vibrate}
            onClick={() => {
              const on = !settings.vibrate;
              setSetting("vibrate", on);
              if (on) N.vibrate([120]);
            }}
          />
        </div>
      </div>

      {/* language */}
      <div className="field">
        <div className="field-row">
          <div>
            <div className="field-label">{t("set_lang")}</div>
            <div className="field-desc">{t("set_lang_d")}</div>
          </div>
          <div className="chip-row chip-row--nowrap">
            {(["bg", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                className={"chip" + (lang === l ? " active" : "")}
                onClick={() => setLang(l)}
              >
                {l === "bg" ? "Български" : "English"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* test */}
      <div className="field">
        <div className="field-row">
          <div>
            <div className="field-label">{t("set_test")}</div>
            <div className="field-desc">{t("set_test_d")}</div>
          </div>
          <button
            className="btn"
            onClick={() => {
              N.unlockAudio();
              onTest();
            }}
          >
            {t("test")}
          </button>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 14, fontSize: 11.5, lineHeight: 1.5 }}>
        {t("set_note")}
      </p>
    </div>
  );
}
