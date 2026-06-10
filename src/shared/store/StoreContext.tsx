/* ============================================================
   StoreContext.tsx — persistent settings + saved locations.
   Replaces the original vanilla `Store` namespace. State is kept in
   a ref (for fresh imperative reads inside async callbacks) mirrored
   into React state (for rendering); every mutation persists to
   localStorage immediately, matching the original's save-on-write.
   ============================================================ */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { AlertRecord, Level, PersistState, SavedLocation, Settings } from "../types";

const KEY = "wheatherwarning.v1";
const MIGRATION_KEY = "wheatherwarning.migrations";

const DEFAULTS: PersistState = {
  settings: {
    threshold: 50, // dBZ
    radiusKm: 25, // alert radius
    notify: false, // browser notifications enabled
    sound: true,
    vibrate: true,
    autoRefresh: true,
    autoRefreshMin: 20,
    // dark green: the pale --safe green washes out on the Windy embed's basemap
    radiusColorWindy: "#14532d",
    radiusColorMap: "#1f9d72", // the map's original safe-level green
  },
  locations: [],
  activeId: null,
  lastAlert: {},
};

function load(): PersistState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<PersistState> | null;
    if (!raw) return structuredClone(DEFAULTS);
    const settings = { ...DEFAULTS.settings, ...(raw.settings || {}) };
    // one-time migration: bump old default of 5 min to 20 for existing users,
    // but only once so a user who explicitly wants 5 min can still choose it.
    const migrations = JSON.parse(localStorage.getItem(MIGRATION_KEY) || "{}") as Record<string, boolean>;
    if (!migrations.autoRefreshMin20) {
      settings.autoRefreshMin = 20;
      localStorage.setItem(MIGRATION_KEY, JSON.stringify({ ...migrations, autoRefreshMin20: true }));
    }
    return {
      settings,
      locations: Array.isArray(raw.locations) ? raw.locations : [],
      activeId: raw.activeId || null,
      lastAlert: raw.lastAlert || {},
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function uid() {
  return "l" + Math.random().toString(36).slice(2, 9);
}

interface StoreValue {
  settings: Settings;
  locations: SavedLocation[];
  activeId: string | null;
  lastAlert: Record<string, AlertRecord>;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  addLocation: (loc: Omit<SavedLocation, "id">) => SavedLocation;
  updateLocation: (id: string, patch: Partial<SavedLocation>) => void;
  removeLocation: (id: string) => void;
  setActive: (id: string) => void;
  getActive: () => SavedLocation | null;
  getLastAlert: (id: string) => AlertRecord | null;
  setLastAlert: (id: string, level: Level) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistState>(load);
  const ref = useRef(state);

  const commit = useCallback((next: PersistState) => {
    ref.current = next;
    setState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, []);

  const value = useMemo<StoreValue>(() => {
    const setSetting: StoreValue["setSetting"] = (k, v) => {
      const cur = ref.current;
      commit({ ...cur, settings: { ...cur.settings, [k]: v } });
    };

    const addLocation: StoreValue["addLocation"] = (loc) => {
      const cur = ref.current;
      const item: SavedLocation = { id: uid(), ...loc };
      let locations: SavedLocation[];
      if (item.auto) {
        // replace an existing auto-detected location instead of duplicating
        locations = [item, ...cur.locations.filter((l) => !l.auto)];
      } else {
        locations = [...cur.locations, item];
      }
      const activeId = cur.activeId || item.id;
      commit({ ...cur, locations, activeId });
      return item;
    };

    const updateLocation: StoreValue["updateLocation"] = (id, patch) => {
      const cur = ref.current;
      commit({
        ...cur,
        locations: cur.locations.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      });
    };

    const removeLocation: StoreValue["removeLocation"] = (id) => {
      const cur = ref.current;
      const locations = cur.locations.filter((l) => l.id !== id);
      const activeId = cur.activeId === id ? (locations[0] ? locations[0].id : null) : cur.activeId;
      const lastAlert = { ...cur.lastAlert };
      delete lastAlert[id];
      commit({ ...cur, locations, activeId, lastAlert });
    };

    const setActive: StoreValue["setActive"] = (id) => {
      commit({ ...ref.current, activeId: id });
    };

    const getActive: StoreValue["getActive"] = () => {
      const cur = ref.current;
      return cur.locations.find((l) => l.id === cur.activeId) || cur.locations[0] || null;
    };

    const getLastAlert: StoreValue["getLastAlert"] = (id) => ref.current.lastAlert[id] || null;

    const setLastAlert: StoreValue["setLastAlert"] = (id, level) => {
      const cur = ref.current;
      commit({ ...cur, lastAlert: { ...cur.lastAlert, [id]: { level, ts: Date.now() } } });
    };

    return {
      settings: state.settings,
      locations: state.locations,
      activeId: state.activeId,
      lastAlert: state.lastAlert,
      setSetting,
      addLocation,
      updateLocation,
      removeLocation,
      setActive,
      getActive,
      getLastAlert,
      setLastAlert,
    };
  }, [state, commit]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
