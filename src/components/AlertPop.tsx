import type { Level } from "../types";

export interface AlertPopState {
  show: boolean;
  level: Level;
  title: string;
  sub: string;
}

interface AlertPopProps {
  state: AlertPopState;
  onClose: () => void;
}

export default function AlertPop({ state, onClose }: AlertPopProps) {
  const cls =
    "alert-pop " + (state.level === "danger" ? "" : "warn") + (state.show ? " show" : "");
  return (
    <div className={cls}>
      <div className="ap-i">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      </div>
      <div>
        <div className="ap-t">{state.title}</div>
        <div className="ap-s">{state.sub}</div>
      </div>
      <button className="ap-x" aria-label="Dismiss" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
