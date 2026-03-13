import { useEffect, useState } from "react";
import type { SignalSummary } from "../types/domain";
import { formatCountdown } from "../utils/time";

interface TopBarProps {
  summary: SignalSummary;
  countdownTarget: string;
}

export const TopBar = ({ summary, countdownTarget }: TopBarProps): JSX.Element => {
  const [countdown, setCountdown] = useState(formatCountdown(countdownTarget));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdown(formatCountdown(countdownTarget));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [countdownTarget]);

  return (
    <header className="top-bar">
      <div className="top-bar-title">
        <h1>Emerald Feedback Wall</h1>
        <button
          type="button"
          className="universe-launch"
          onClick={() => {
            window.open("/universe.html", "_blank", "noopener,noreferrer");
          }}
          aria-label="Open FIS lending universe"
          title="Open FIS Lending Universe"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M4.5 12c1.8-2.8 4.7-4.2 7.5-4.2s5.7 1.4 7.5 4.2" />
            <path d="M4.5 12c1.8 2.8 4.7 4.2 7.5 4.2s5.7-1.4 7.5-4.2" />
          </svg>
          <span>Universe</span>
        </button>
      </div>
      <div className="top-bar-metrics">
        <div className="metric-card">
          <span className="metric-label">Live Responses</span>
          <strong>{summary.totalResponses}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Synthesis Countdown</span>
          <strong>{countdown}</strong>
        </div>
      </div>
    </header>
  );
};
