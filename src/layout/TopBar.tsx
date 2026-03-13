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
      <div>
        <h1>Emerald Feedback Wall</h1>
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
