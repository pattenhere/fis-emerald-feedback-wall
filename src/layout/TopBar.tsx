import { memo, useEffect, useMemo, useState } from "react";
import type { KudosQuote, SessionRole, SignalSummary } from "../types/domain";
import { formatCountdown } from "../utils/time";

interface TopBarProps {
  summary: SignalSummary;
  countdownTarget: string;
  sessionRole: SessionRole;
  onSessionRoleChange: (role: SessionRole) => void;
  publicQuotes: KudosQuote[];
}

const ROLE_OPTIONS: Array<{ id: SessionRole; label: string }> = [
  { id: "unspecified", label: "I am..." },
  { id: "ops", label: "Ops" },
  { id: "eng", label: "Eng" },
  { id: "product", label: "Product" },
  { id: "finance", label: "Finance" },
  { id: "exec", label: "Exec" },
];

export const TopBar = memo(({
  summary,
  countdownTarget,
  sessionRole,
  onSessionRoleChange,
  publicQuotes,
}: TopBarProps): JSX.Element => {
  const [countdown, setCountdown] = useState(formatCountdown(countdownTarget));
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdown(formatCountdown(countdownTarget));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [countdownTarget]);

  useEffect(() => {
    if (publicQuotes.length < 3) {
      return;
    }
    const timer = window.setInterval(() => {
      setQuoteIndex((current) => (current + 1) % publicQuotes.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [publicQuotes]);

  const activeQuote = publicQuotes.length >= 3 ? publicQuotes[quoteIndex % publicQuotes.length] : null;
  const mobileUrl = useMemo(() => `${window.location.origin}/mobile.html`, []);
  const qrUrl = useMemo(
    () => `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(mobileUrl)}`,
    [mobileUrl],
  );

  return (
    <>
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
          <button type="button" className="universe-launch" onClick={() => setShowQr(true)}>
            QR Mobile
          </button>
          <select
            className="role-chip"
            value={sessionRole}
            onChange={(event) => onSessionRoleChange(event.target.value as SessionRole)}
            aria-label="Session role"
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role.id} value={role.id}>
                {role.label}
              </option>
            ))}
          </select>
        </div>
        {activeQuote ? (
          <div className="quote-ticker" aria-live="polite">
            <p>{activeQuote.text}</p>
            <span>{activeQuote.role.toUpperCase()}</span>
          </div>
        ) : (
          <div className="quote-ticker quote-ticker-placeholder">
            <p>Collect 3 consent-approved quotes to activate live ticker</p>
          </div>
        )}
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
      {showQr && (
        <div className="overlay-modal" role="dialog" aria-modal="true" aria-label="Mobile QR access">
          <div className="overlay-card">
            <h2>Mobile Participation</h2>
            <p>Scan to open Features + Kudos mobile view.</p>
            <img src={qrUrl} alt="QR code for mobile feedback view" width={220} height={220} />
            <a href={mobileUrl} target="_blank" rel="noreferrer">
              {mobileUrl}
            </a>
            <div className="feedback-actions">
              <button type="button" className="secondary-btn" onClick={() => setShowQr(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
