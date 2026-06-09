import { useEffect, useState } from "react";

interface AppBarProps {
  refreshing: boolean;
  mapMode: "rainviewer" | "windy";
  onRefresh: () => void;
  onSettings: () => void;
  onToggleMapMode: () => void;
}

// 12-hour wall clock string for the desktop app bar (e.g. "9:05 PM").
const formatClock = (date: Date): string => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const paddedMinutes = minutes < 10 ? "0" + minutes : String(minutes);
  return `${hour12}:${paddedMinutes} ${ampm}`;
};

export default function AppBar({ refreshing, mapMode, onRefresh, onSettings, onToggleMapMode }: AppBarProps) {
  // Decorative clock shown only in the desktop layout (hidden via CSS on mobile).
  // Re-rendering every 15s is plenty since seconds aren't displayed.
  const [clock, setClock] = useState(() => formatClock(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock(new Date())), 15000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="appbar">
      <div className="brand">
        <div className="brand-mark" />
        <div className="brand-name">
          Sky<span>Watch</span>
        </div>
      </div>
      <div className="clock">{clock}</div>
      <div className="appbar-divider" />
      <div className="appbar-actions">
        <button
          className={"icon-btn" + (mapMode === "windy" ? " icon-btn--active" : "")}
          title={mapMode === "windy" ? "Switch to RainViewer radar" : "Switch to Windy radar"}
          aria-label="Toggle map source"
          onClick={onToggleMapMode}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7l9-5 9 5v10l-9 5-9-5V7z" />
            <path d="M12 2v20" />
            <path d="M3 7l9 5 9-5" />
          </svg>
        </button>
        <button
          className={"icon-btn" + (refreshing ? " spin" : "")}
          title="Refresh radar"
          aria-label="Refresh"
          onClick={onRefresh}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
        <button className="icon-btn" title="Settings" aria-label="Settings" onClick={onSettings}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
