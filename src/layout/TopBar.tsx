import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ProfileSwitcher } from "../components/ProfileSwitcher";
import type { KudosQuote, SignalSummary } from "../types/domain";
import { formatDurationHhMmSs } from "../utils/time";

const getTimeRemaining = (closeTimeLocal: string): string => {
  const [hoursRaw, minutesRaw] = closeTimeLocal.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return "00:00:00";
  }

  const now = new Date();
  const closeTime = new Date(now);
  closeTime.setHours(hours, minutes, 0, 0);
  const diffMs = closeTime.getTime() - now.getTime();
  const remainingSeconds = Math.max(0, Math.ceil(diffMs / 1000));
  return formatDurationHhMmSs(remainingSeconds);
};

interface TopBarProps {
  summary: SignalSummary;
  publicQuotes: KudosQuote[];
  closeTimeLocal: string;
  compactMode?: boolean;
  selectedProductName?: string | null;
  onOpenLiveResponses?: () => void;
  onOpenSplash?: () => void;
  mobileQrEnabled?: boolean;
}

export const TopBar = memo(({
  summary,
  publicQuotes,
  closeTimeLocal,
  compactMode = false,
  selectedProductName = null,
  onOpenLiveResponses,
  onOpenSplash,
  mobileQrEnabled = true,
}: TopBarProps): JSX.Element => {
  const [timeRemaining, setTimeRemaining] = useState(() => getTimeRemaining(closeTimeLocal));
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const [titleWidthPx, setTitleWidthPx] = useState<number | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    setTimeRemaining(getTimeRemaining(closeTimeLocal));
    const timer = window.setInterval(() => {
      setTimeRemaining(getTimeRemaining(closeTimeLocal));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [closeTimeLocal]);

  useEffect(() => {
    if (publicQuotes.length < 3) {
      return;
    }
    const timer = window.setInterval(() => {
      setQuoteIndex((current) => (current + 1) % publicQuotes.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [publicQuotes]);

  useEffect(() => {
    if (!mobileQrEnabled) {
      setShowQr(false);
    }
  }, [mobileQrEnabled]);

  const activeQuote = publicQuotes.length >= 3 ? publicQuotes[quoteIndex % publicQuotes.length] : null;
  const mobileUrl = useMemo(() => `${window.location.origin}/mobile.html`, []);
  const qrUrl = useMemo(
    () => `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(mobileUrl)}`,
    [mobileUrl],
  );

  useEffect(() => {
    if (!selectedProductName || !titleRef.current) {
      setTitleWidthPx(null);
      return;
    }

    const updateWidth = (): void => {
      if (!titleRef.current) return;
      setTitleWidthPx(Math.round(titleRef.current.getBoundingClientRect().width));
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(titleRef.current);
    window.addEventListener("resize", updateWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [selectedProductName]);

  return (
    <>
      <header className="top-bar">
        <div className="top-bar-title">
          <div className="top-bar-brand">
            <button
              type="button"
              className="top-bar-home-button"
              onClick={onOpenSplash}
              aria-label="Return to splash screen"
            >
              <h1 ref={titleRef}>Emerald Feedback Wall</h1>
            </button>
            {selectedProductName && !compactMode && (
              <p
                className="top-bar-product-name"
                style={titleWidthPx ? { width: `${titleWidthPx}px`, maxWidth: `${titleWidthPx}px` } : undefined}
                title={selectedProductName}
              >
                {selectedProductName}
              </p>
            )}
          </div>
          {!compactMode && (
            <>
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
              <button
                type="button"
                className="universe-launch"
                onClick={() => {
                  if (mobileQrEnabled) {
                    setShowQr(true);
                  }
                }}
                disabled={!mobileQrEnabled}
                title={mobileQrEnabled ? "Open mobile QR" : "Mobile QR is disabled by admin"}
              >
                MOBILE QR
              </button>
            </>
          )}
        </div>
        {!compactMode && (
          activeQuote ? (
            <div className="quote-ticker" aria-live="polite">
              <p>{activeQuote.text}</p>
              <span>{activeQuote.role.toUpperCase()}</span>
            </div>
          ) : (
            <div className="quote-ticker quote-ticker-placeholder">
              <p>Collect 3 consent-approved quotes to activate live ticker</p>
            </div>
          )
        )}
        <div className="top-bar-right">
          {!compactMode ? (
            <div className="top-bar-metrics">
              <button type="button" className="metric-card metric-card-button" onClick={onOpenLiveResponses}>
                <span className="metric-label">Live Responses</span>
                <strong>{summary.totalResponses.toLocaleString()}</strong>
              </button>
              <div className="metric-card">
                <span className="metric-label">Time Remaining</span>
                <strong>{timeRemaining}</strong>
              </div>
            </div>
          ) : null}
          <ProfileSwitcher currentRole="attendee" compact={compactMode} display="initial" />
        </div>
      </header>
      {showQr && mobileQrEnabled && (
        <div className="overlay-modal" role="dialog" aria-modal="true" aria-label="Mobile QR access">
          <div className="overlay-card">
            <h2>Mobile Participation</h2>
            <p>Scan to open Features + Comments mobile view.</p>
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
