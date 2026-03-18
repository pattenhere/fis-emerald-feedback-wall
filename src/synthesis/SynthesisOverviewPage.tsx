import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { synthesisModuleApi, type SessionConfigResponse } from "../services/synthesisModuleApi";

interface SynthesisOverviewPageProps {
  onNavigate: (path: string) => void;
}

interface OverviewStatsState {
  featureRequestsTotal: number;
  featureRequestsUnique: number;
  screenFeedbackTotal: number;
  distinctScreensCovered: number;
  kudosTotal: number;
  consentApprovedKudos: number;
  totalVotesCast: number;
  uniqueInputs: number;
  synthesisMinSignals: number;
}

interface CardLoadingState {
  features: boolean;
  screenFeedback: boolean;
  kudos: boolean;
  votes: boolean;
}

interface SessionToggleState {
  wallWindowOpen: boolean;
  mobileWindowOpen: boolean;
  themesViewActive: boolean;
  mobileWindowCloseLabel: string;
}

const DEFAULT_MIN_SIGNALS = 30;

const initialStatsState: OverviewStatsState = {
  featureRequestsTotal: 0,
  featureRequestsUnique: 0,
  screenFeedbackTotal: 0,
  distinctScreensCovered: 0,
  kudosTotal: 0,
  consentApprovedKudos: 0,
  totalVotesCast: 0,
  uniqueInputs: 0,
  synthesisMinSignals: DEFAULT_MIN_SIGNALS,
};

const initialCardLoadingState: CardLoadingState = {
  features: true,
  screenFeedback: true,
  kudos: true,
  votes: true,
};

const toInteger = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
};

const formatInt = (value: number): string => toInteger(value).toLocaleString();

const toLocalTimeLabel = (payload: SessionConfigResponse): string => {
  if (typeof payload.mobileWindowCloseTimeLocal === "string" && payload.mobileWindowCloseTimeLocal.trim()) {
    return payload.mobileWindowCloseTimeLocal.trim();
  }
  const source = payload.mobileWindowCloseTime ?? payload.inputCutoffAt;
  const parsed = new Date(String(source ?? ""));
  if (!Number.isFinite(parsed.getTime())) return "--:--";
  return parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

export const SynthesisOverviewPage = ({ onNavigate }: SynthesisOverviewPageProps): JSX.Element => {
  const [stats, setStats] = useState<OverviewStatsState>(initialStatsState);
  const [cardLoading, setCardLoading] = useState<CardLoadingState>(initialCardLoadingState);
  const [sessionToggles, setSessionToggles] = useState<SessionToggleState>({
    wallWindowOpen: true,
    mobileWindowOpen: true,
    themesViewActive: false,
    mobileWindowCloseLabel: "--:--",
  });
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState("--");
  const [togglePending, setTogglePending] = useState({
    wallWindowOpen: false,
    mobileWindowOpen: false,
    themesViewActive: false,
  });
  const isFirstLoad = useRef(true);

  const applySessionConfig = useCallback((payload: SessionConfigResponse): void => {
    setSessionToggles((current) => ({
      ...current,
      wallWindowOpen: payload.wallWindowOpen ?? current.wallWindowOpen,
      mobileWindowOpen: payload.mobileWindowOpen ?? current.mobileWindowOpen,
      themesViewActive: payload.themesViewActive ?? current.themesViewActive,
      mobileWindowCloseLabel: toLocalTimeLabel(payload),
    }));
    if (payload.synthesisMinSignals != null) {
      setStats((current) => ({
        ...current,
        synthesisMinSignals: Math.max(1, toInteger(payload.synthesisMinSignals)),
      }));
    }
  }, []);

  const refreshOverviewData = useCallback(async (): Promise<void> => {
    const nextUpdatedAt = new Date();
    try {
      const [featureCount, screenCount, kudosCount, dedupCounts, sessionConfig] = await Promise.all([
        synthesisModuleApi.getInputsCountByType("feature_request"),
        synthesisModuleApi.getInputsCountByType("screen_feedback"),
        synthesisModuleApi.getInputsCountByType("kudos"),
        synthesisModuleApi.getDedupCounts(),
        synthesisModuleApi.getSessionConfig(),
      ]);

      setStats((current) => ({
        ...current,
        featureRequestsTotal: toInteger(featureCount.count),
        featureRequestsUnique: toInteger(dedupCounts.uniqueFeatureRequests),
        screenFeedbackTotal: toInteger(screenCount.count),
        distinctScreensCovered: toInteger(dedupCounts.distinctScreensCovered),
        kudosTotal: toInteger(kudosCount.count),
        consentApprovedKudos: toInteger(dedupCounts.consentApprovedKudos),
        totalVotesCast: toInteger(dedupCounts.totalVotesCast),
        uniqueInputs: toInteger(dedupCounts.uniqueInputs),
        synthesisMinSignals: Math.max(1, toInteger(sessionConfig.synthesisMinSignals ?? current.synthesisMinSignals)),
      }));
      applySessionConfig(sessionConfig);
      setLastUpdatedLabel(nextUpdatedAt.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }));
      if (isFirstLoad.current) {
        setCardLoading({
          features: false,
          screenFeedback: false,
          kudos: false,
          votes: false,
        });
        isFirstLoad.current = false;
      }
    } catch (error) {
      if (isFirstLoad.current) {
        setCardLoading({
          features: false,
          screenFeedback: false,
          kudos: false,
          votes: false,
        });
        isFirstLoad.current = false;
      }
      setToggleError(error instanceof Error ? error.message : "Unable to refresh overview metrics.");
    }
  }, [applySessionConfig]);

  useEffect(() => {
    void refreshOverviewData();
    const timer = window.setInterval(() => {
      void refreshOverviewData();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refreshOverviewData]);

  const patchToggle = useCallback(async (
    key: "wallWindowOpen" | "mobileWindowOpen" | "themesViewActive",
    value: boolean,
  ): Promise<void> => {
    setToggleError(null);
    const previousValue = sessionToggles[key];
    setSessionToggles((current) => ({ ...current, [key]: value }));
    setTogglePending((current) => ({ ...current, [key]: true }));
    try {
      const updated = await synthesisModuleApi.patchSessionConfig({ [key]: value });
      applySessionConfig(updated);
    } catch (error) {
      setSessionToggles((current) => ({ ...current, [key]: previousValue }));
      setToggleError(error instanceof Error ? error.message : "Unable to save session settings.");
    } finally {
      setTogglePending((current) => ({ ...current, [key]: false }));
    }
  }, [applySessionConfig, sessionToggles]);

  const readinessDelta = stats.synthesisMinSignals - stats.uniqueInputs;
  const readinessProgressPercent = useMemo(() => {
    if (stats.synthesisMinSignals <= 0) return 0;
    const ratio = stats.uniqueInputs / stats.synthesisMinSignals;
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  }, [stats.synthesisMinSignals, stats.uniqueInputs]);
  const readinessToneClass = stats.uniqueInputs >= stats.synthesisMinSignals
    ? "is-good"
    : readinessDelta <= 10
      ? "is-near"
      : "is-low";

  return (
    <section className="synthesis-overview">
      <div className="synthesis-overview-grid">
        <article className="overview-stat-card accent-feature">
          <p>Feature requests</p>
          <strong>{formatInt(stats.featureRequestsTotal)}</strong>
          <span>Unique after de-dup: {formatInt(stats.featureRequestsUnique)}</span>
          {cardLoading.features && <div className="overview-card-skeleton" aria-hidden="true" />}
        </article>
        <article className="overview-stat-card accent-screen">
          <p>Screen feedback</p>
          <strong>{formatInt(stats.screenFeedbackTotal)}</strong>
          <span>Distinct screens covered: {formatInt(stats.distinctScreensCovered)}</span>
          {cardLoading.screenFeedback && <div className="overview-card-skeleton" aria-hidden="true" />}
        </article>
        <article className="overview-stat-card accent-kudos">
          <p>Comments</p>
          <strong>{formatInt(stats.kudosTotal)}</strong>
          <span>Consent-approved: {formatInt(stats.consentApprovedKudos)}</span>
          {cardLoading.kudos && <div className="overview-card-skeleton" aria-hidden="true" />}
        </article>
        <article className="overview-stat-card accent-votes">
          <p>Total votes cast</p>
          <strong>{formatInt(stats.totalVotesCast)}</strong>
          <span>Across all captured inputs</span>
          {cardLoading.votes && <div className="overview-card-skeleton" aria-hidden="true" />}
        </article>
      </div>

      <p className="overview-last-updated">Last updated: {lastUpdatedLabel}</p>

      <div className="overview-bottom-grid">
        <section className="overview-panel">
          <h2>Session controls</h2>
          <div className="overview-toggle-row">
            <div>
              <p>Wall input window</p>
            </div>
            <button
              type="button"
              className={`overview-toggle ${sessionToggles.wallWindowOpen ? "is-on" : ""}`}
              aria-pressed={sessionToggles.wallWindowOpen}
              onClick={() => void patchToggle("wallWindowOpen", !sessionToggles.wallWindowOpen)}
              disabled={togglePending.wallWindowOpen}
            >
              <span />
            </button>
          </div>
          <div className="overview-toggle-row">
            <div>
              <p>Mobile QR window</p>
              <span>Closes at {sessionToggles.mobileWindowCloseLabel}</span>
            </div>
            <button
              type="button"
              className={`overview-toggle ${sessionToggles.mobileWindowOpen ? "is-on" : ""}`}
              aria-pressed={sessionToggles.mobileWindowOpen}
              onClick={() => void patchToggle("mobileWindowOpen", !sessionToggles.mobileWindowOpen)}
              disabled={togglePending.mobileWindowOpen}
            >
              <span />
            </button>
          </div>
          <div className="overview-toggle-row">
            <div>
              <p>Themes view on wall</p>
              <span>Auto-switches after synthesis.</span>
            </div>
            <button
              type="button"
              className={`overview-toggle ${sessionToggles.themesViewActive ? "is-on" : ""}`}
              aria-pressed={sessionToggles.themesViewActive}
              onClick={() => void patchToggle("themesViewActive", !sessionToggles.themesViewActive)}
              disabled={togglePending.themesViewActive}
            >
              <span />
            </button>
          </div>
          {toggleError && <p className="overview-toggle-error">{toggleError}</p>}
        </section>

        <section className="overview-panel">
          <h2>Readiness</h2>
          <p className="overview-readiness-numbers">
            <strong>{formatInt(stats.uniqueInputs)}</strong>
            <span>/</span>
            <strong>{formatInt(stats.synthesisMinSignals)}</strong>
          </p>
          <div className={`overview-readiness-bar ${readinessToneClass}`}>
            <div style={{ width: `${readinessProgressPercent}%` }} />
          </div>
          <button type="button" className="overview-synthesis-link" onClick={() => onNavigate("/synthesis/run")}>
            Go to synthesis →
          </button>
          {stats.uniqueInputs < stats.synthesisMinSignals && (
            <p className="overview-readiness-warning">
              We recommend at least {formatInt(stats.synthesisMinSignals)} signals for best synthesis results.
            </p>
          )}
        </section>
      </div>
    </section>
  );
};
