export type Level = "safe" | "warning" | "danger";
export type Trend = "approaching" | "receding" | "steady";

export interface Settings {
  threshold: number; // dBZ
  radiusKm: number; // alert radius
  notify: boolean; // browser notifications enabled
  sound: boolean;
  vibrate: boolean;
  autoRefresh: boolean;
  autoRefreshMin: number;
}

export type LocationKind = "home" | "work" | "family" | "park" | "current" | "other";

export interface SavedLocation {
  id: string;
  name: string;
  kind: LocationKind;
  lat: number;
  lon: number;
  auto?: boolean;
}

export interface AlertRecord {
  level: Level;
  ts: number;
}

export interface PersistState {
  settings: Settings;
  locations: SavedLocation[];
  activeId: string | null;
  lastAlert: Record<string, AlertRecord>;
}

export interface NearestCell {
  distanceKm: number;
  bearing: number;
  dbz: number;
  lat: number;
  lon: number;
}

export interface FrameSample {
  centerDbz: number | null;
  maxDbz: number | null;
  nearest: NearestCell | null;
  tainted: boolean;
}

export interface FutureFrame extends FrameSample {
  time: number;
}

export interface AnalysisResult {
  level: Level;
  trend: Trend;
  eta: number | null;
  centerDbz: number | null;
  maxDbz: number | null;
  nearest: NearestCell | null;
  threshold: number;
  radiusKm: number;
  frameTime: number;
  tainted: boolean;
  future: FutureFrame[];
}

export interface RadarFrame {
  time: number;
  path: string;
}

export interface FrameList {
  past: RadarFrame[];
  now: RadarFrame[];
  all: RadarFrame[];
}
