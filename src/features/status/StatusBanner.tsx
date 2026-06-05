import type { Level } from "../../shared/types";

const ICONS: Record<Level, JSX.Element> = {
  safe: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  warning: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  ),
  danger: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
};

interface StatusBannerProps {
  level: Level;
  title: string;
  sub: string;
}

export default function StatusBanner({ level, title, sub }: StatusBannerProps) {
  return (
    <section className={"status " + level}>
      <div className="status-emoji">{ICONS[level]}</div>
      <div className="status-main">
        <div className="status-title">{title}</div>
        <div className="status-sub">{sub}</div>
      </div>
    </section>
  );
}
