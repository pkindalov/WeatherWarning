import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../shared/i18n/I18nContext";
import { useStore } from "../../shared/store/StoreContext";
import { reverseName } from "../../shared/lib/geo";
import type { LocationKind } from "../../shared/types";

interface LocationsSheetProps {
  open: boolean;
  onClose: () => void;
  refresh: (fit: boolean) => void;
  toast: (msg: string) => void;
}

const KIND_ICON: Record<string, JSX.Element> = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  ),
  work: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  ),
  family: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    </svg>
  ),
  park: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22v-7" />
      <path d="M9 9a3 3 0 0 1 6 0c2 0 3 1.5 3 3a3 3 0 0 1-3 3H9a3 3 0 0 1 0-6z" />
    </svg>
  ),
  current: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  ),
  other: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
};

interface GeoItem {
  lat: string;
  lon: string;
  display_name: string;
}
type GeoState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "empty" }
  | { status: "error" }
  | { status: "ok"; items: GeoItem[] };

export default function LocationsSheet({ open, onClose, refresh, toast }: LocationsSheetProps) {
  const { t } = useI18n();
  const { locations, addLocation, removeLocation, setActive } = useStore();

  const [pendingKind, setPendingKind] = useState<LocationKind>("home");
  const [addName, setAddName] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [locDenied, setLocDenied] = useState(false);
  const pickedRef = useRef<{ lat: number; lon: number; label: string } | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (open) setLocDenied(false);
  }, [open]);

  function doGeoSearch(q: string) {
    if (!q || q.trim().length < 3) {
      setGeo({ status: "idle" });
      return;
    }
    setGeo({ status: "searching" });
    fetch("https://nominatim.openstreetmap.org/search?format=json&limit=5&q=" + encodeURIComponent(q), {
      headers: { Accept: "application/json" },
    })
      .then((r) => r.json())
      .then((arr: GeoItem[]) => {
        if (!arr.length) setGeo({ status: "empty" });
        else setGeo({ status: "ok", items: arr });
      })
      .catch(() => setGeo({ status: "error" }));
  }

  function onSearchChange(v: string) {
    setAddSearch(v);
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => doGeoSearch(v), 450);
  }

  function commitAdd(name: string) {
    const picked = pickedRef.current;
    if (!picked) {
      toast(t("t_pick"));
      return;
    }
    const finalName = name.trim() || picked.label || "New place";
    const loc = addLocation({ name: finalName, kind: pendingKind, lat: picked.lat, lon: picked.lon });
    setActive(loc.id);
    pickedRef.current = null;
    setAddName("");
    setAddSearch("");
    setGeo({ status: "idle" });
    refresh(true);
    onClose();
    toast(t("t_added", { name: finalName }));
  }

  function pickResult(item: GeoItem) {
    const parts = item.display_name.split(",");
    const label = parts[0].trim();
    pickedRef.current = { lat: parseFloat(item.lat), lon: parseFloat(item.lon), label };
    const nextName = addName.trim() || label;
    setAddName(nextName);
    setAddSearch(parts.slice(0, 2).join(", "));
    setGeo({ status: "idle" });
    commitAdd(nextName);
  }

  function addCurrentLocation() {
    if (!navigator.geolocation) {
      toast(t("t_no_geo"));
      return;
    }
    setLocDenied(false);
    toast(t("t_locating"));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const name = await reverseName(latitude, longitude, t("current_location"));
        const loc = addLocation({ name, kind: "current", lat: latitude, lon: longitude, auto: true });
        setActive(loc.id);
        refresh(true);
        onClose();
      },
      (error) => {
        if (error.code === 1) {
          setLocDenied(true);
        } else {
          toast(t("t_no_loc"));
        }
      },
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 60000 }
    );
  }

  function selectLoc(id: string) {
    setActive(id);
    refresh(true);
    onClose();
  }

  function removeLoc(id: string) {
    removeLocation(id);
    refresh(true); // App re-prompts if nothing is left active
  }

  return (
    <div className={"sheet" + (open ? " open" : "")}>
      <button className="sheet-close" type="button" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <div className="sheet-grip" />
      <h2>{t("loc_title")}</h2>
      <p className="muted">{t("loc_sub")}</p>

      <div className="loc-list">
        {!locations.length && <p className="muted" style={{ margin: 0 }}>{t("loc_empty")}</p>}
        {locations.map((loc) => (
          <div className="loc-item" key={loc.id}>
            <div className="lk" onClick={() => selectLoc(loc.id)}>
              {KIND_ICON[loc.kind] || KIND_ICON.other}
            </div>
            <div onClick={() => selectLoc(loc.id)} style={{ cursor: "pointer" }}>
              <div className="ln">{loc.name}</div>
              <div className="lc">
                {loc.lat.toFixed(3)}, {loc.lon.toFixed(3)}
              </div>
            </div>
            <button
              className="del"
              title={t("remove")}
              onClick={(e) => {
                e.stopPropagation();
                removeLoc(loc.id);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 15 }}>{t("loc_add")}</h2>
        <div className="add-form">
          <div className="chip-row">
            {(["home", "work", "family", "park", "other"] as LocationKind[]).map((k) => (
              <button
                key={k}
                className={"chip" + (pendingKind === k ? " active" : "")}
                onClick={() => setPendingKind(k)}
              >
                {t("kind_" + k)}
              </button>
            ))}
          </div>
          <input
            className="input"
            placeholder={t("ph_name")}
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
          />
          <input
            className="input"
            placeholder={t("ph_search")}
            value={addSearch}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <div className="geo-results">
            {geo.status === "searching" && <p className="muted" style={{ margin: "6px 0" }}>{t("searching")}</p>}
            {geo.status === "empty" && <p className="muted" style={{ margin: "6px 0" }}>{t("no_matches")}</p>}
            {geo.status === "error" && <p className="muted" style={{ margin: "6px 0" }}>{t("search_failed")}</p>}
            {geo.status === "ok" &&
              geo.items.map((item, i) => {
                const parts = item.display_name.split(",");
                return (
                  <button className="geo-result" key={i} onClick={() => pickResult(item)}>
                    <b>{parts[0]}</b> <span>{parts.slice(1, 3).join(",")}</span>
                  </button>
                );
              })}
          </div>
          <button className="btn primary btn--full" onClick={addCurrentLocation}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
            <span>{t("use_current")}</span>
          </button>
          {locDenied && (
            <div className="loc-denied">
              <svg className="loc-denied__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="loc-denied__msg">{t("t_loc_denied")}</p>
              <button className="btn loc-denied__btn" onClick={addCurrentLocation}>{t("t_try_again")}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
