import { useI18n } from "../i18n/I18nContext";
import { useStore } from "../store/StoreContext";

interface LocationTabsProps {
  onSelect: (id: string) => void;
  onAdd: () => void;
}

export default function LocationTabs({ onSelect, onAdd }: LocationTabsProps) {
  const { t } = useI18n();
  const { locations, activeId, lastAlert } = useStore();

  return (
    <div className="loc-tabs">
      {locations.map((loc) => {
        const level = lastAlert[loc.id]?.level || "";
        return (
          <button
            key={loc.id}
            className={"loc-tab" + (loc.id === activeId ? " active" : "")}
            onClick={() => onSelect(loc.id)}
          >
            <span className={"dot " + level} />
            {loc.name}
          </button>
        );
      })}
      <button className="loc-tab add" onClick={onAdd}>
        {t("tab_add")}
      </button>
    </div>
  );
}
