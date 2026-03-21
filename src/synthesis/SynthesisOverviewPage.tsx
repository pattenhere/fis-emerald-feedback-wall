import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { generateThemeSnapshot } from "../api/themeSnapshot";
import { synthesisModuleApi } from "../services/synthesisModuleApi";
import { makeId } from "../utils/id";
import { THEME_SNAPSHOT_MAX, appendThemeSnapshot, readThemeSnapshots, writePublishedThemeSnapshot } from "../themeSnapshots/store";
import type { ThemeSnapshot } from "../themeSnapshots/types";

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

type ThemeSnapshotThresholds = {
  minEach: number;
  minSplitRatio: number;
};

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

export const SynthesisOverviewPage = (): JSX.Element => {
  const [stats, setStats] = useState<OverviewStatsState>(initialStatsState);
  const [cardLoading, setCardLoading] = useState<CardLoadingState>(initialCardLoadingState);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState("--");
  const [wallWindowOpen, setWallWindowOpen] = useState(true);
  const [eventName, setEventName] = useState("");
  const [themeSnapshotThresholds, setThemeSnapshotThresholds] = useState<ThemeSnapshotThresholds>({ minEach: 3, minSplitRatio: 0.4 });
  const [themeSnapshots, setThemeSnapshots] = useState<ThemeSnapshot[]>(() => readThemeSnapshots());
  const [previewSnapshot, setPreviewSnapshot] = useState<ThemeSnapshot | null>(null);
  const [expandedSnapshotIds, setExpandedSnapshotIds] = useState<Record<string, boolean>>({});
  const [isGeneratingSnapshot, setIsGeneratingSnapshot] = useState(false);
  const [themeSnapshotError, setThemeSnapshotError] = useState<string | null>(null);
  const isFirstLoad = useRef(true);

  const refreshOverviewData = useCallback(async (): Promise<void> => {
    const nextUpdatedAt = new Date();
    try {
      const [
        totalsResult,
        featureCountResult,
        screenCountResult,
        kudosCountResult,
        dedupCountsResult,
        sessionConfigResult,
        synthesisParametersResult,
      ] = await Promise.allSettled([
        synthesisModuleApi.getInputsCount(),
        synthesisModuleApi.getInputsCountByType("feature_request"),
        synthesisModuleApi.getInputsCountByType("screen_feedback"),
        synthesisModuleApi.getInputsCountByType("kudos"),
        synthesisModuleApi.getDedupCounts(),
        synthesisModuleApi.getSessionConfig(),
        synthesisModuleApi.getSynthesisParameters(),
      ]);

      const totals = totalsResult.status === "fulfilled" ? totalsResult.value : null;
      const featureCount = featureCountResult.status === "fulfilled" ? featureCountResult.value : null;
      const screenCount = screenCountResult.status === "fulfilled" ? screenCountResult.value : null;
      const kudosCount = kudosCountResult.status === "fulfilled" ? kudosCountResult.value : null;
      const dedupCounts = dedupCountsResult.status === "fulfilled" ? dedupCountsResult.value : null;
      const sessionConfig = sessionConfigResult.status === "fulfilled" ? sessionConfigResult.value : null;
      const synthesisParameters = synthesisParametersResult.status === "fulfilled" ? synthesisParametersResult.value : null;

      setStats((current) => ({
        ...current,
        featureRequestsTotal: toInteger(featureCount?.count ?? totals?.featureRequests ?? current.featureRequestsTotal),
        featureRequestsUnique: toInteger(dedupCounts?.uniqueFeatureRequests ?? current.featureRequestsUnique),
        screenFeedbackTotal: toInteger(screenCount?.count ?? totals?.screenFeedback ?? current.screenFeedbackTotal),
        distinctScreensCovered: toInteger(dedupCounts?.distinctScreensCovered ?? current.distinctScreensCovered),
        kudosTotal: toInteger(kudosCount?.count ?? totals?.kudos ?? current.kudosTotal),
        consentApprovedKudos: toInteger(dedupCounts?.consentApprovedKudos ?? current.consentApprovedKudos),
        totalVotesCast: toInteger(dedupCounts?.totalVotesCast ?? totals?.totalVotesCast ?? current.totalVotesCast),
        uniqueInputs: toInteger(dedupCounts?.uniqueInputs ?? totals?.totalInputs ?? current.uniqueInputs),
        synthesisMinSignals: Math.max(1, toInteger(sessionConfig?.synthesisMinSignals ?? current.synthesisMinSignals)),
      }));
      if (sessionConfig) {
        setWallWindowOpen(Boolean(sessionConfig.wallWindowOpen ?? true));
        setEventName(String(sessionConfig.eventName ?? ""));
      }
      if (synthesisParameters) {
        setThemeSnapshotThresholds({
          minEach: Math.max(1, toInteger(synthesisParameters.parameters.competingMinEach ?? 3)),
          minSplitRatio: Number.isFinite(Number(synthesisParameters.parameters.competingMinSplitRatio))
            ? Number(synthesisParameters.parameters.competingMinSplitRatio)
            : 0.4,
        });
      }
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
    } catch {
      if (isFirstLoad.current) {
        setCardLoading({
          features: false,
          screenFeedback: false,
          kudos: false,
          votes: false,
        });
        isFirstLoad.current = false;
      }
      // Keep the same fallback behavior while the cards are loading.
    }
  }, []);

  useEffect(() => {
    void refreshOverviewData();
    const timer = window.setInterval(() => {
      void refreshOverviewData();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refreshOverviewData]);

  useEffect(() => {
    setThemeSnapshots(readThemeSnapshots());
  }, []);

  useEffect(() => {
    if (!themeSnapshotError) return;
    const timer = window.setTimeout(() => setThemeSnapshotError(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [themeSnapshotError]);

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
  const readinessStatusLine = stats.uniqueInputs >= stats.synthesisMinSignals
    ? `Ready — ${formatInt(stats.uniqueInputs)} inputs collected, ${formatInt(stats.synthesisMinSignals)} required.`
    : readinessDelta <= 10
      ? `${formatInt(stats.uniqueInputs)} inputs — ${formatInt(readinessDelta)} more to reach threshold.`
      : `${formatInt(stats.uniqueInputs)} inputs collected. Minimum: ${formatInt(stats.synthesisMinSignals)}.`;
  const themeSnapshotCount = themeSnapshots.length;
  const themeSnapshotLimitReached = themeSnapshotCount >= THEME_SNAPSHOT_MAX;
  const themeSnapshotCanGenerate = wallWindowOpen && !themeSnapshotLimitReached;
  const orderedThemeSnapshots = useMemo(
    () => [...themeSnapshots].sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()),
    [themeSnapshots],
  );
  const previewSignalCounts = useMemo(
    () => ({
      featureRequests: stats.featureRequestsTotal,
      screenFeedback: stats.screenFeedbackTotal,
      comments: stats.kudosTotal,
    }),
    [stats.featureRequestsTotal, stats.kudosTotal, stats.screenFeedbackTotal],
  );
  const formatSnapshotTime = useCallback((value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);

  const clearThemeSnapshotError = useCallback(() => {
    setThemeSnapshotError(null);
  }, []);

  const handleGenerateThemeSnapshot = useCallback(async () => {
    if (!themeSnapshotCanGenerate || isGeneratingSnapshot) return;
    clearThemeSnapshotError();
    setIsGeneratingSnapshot(true);
    try {
      const result = await generateThemeSnapshot(eventName || "Emerald Feedback Wall");
      const generatedAt = new Date().toISOString();
      const nextSnapshot: ThemeSnapshot = {
        id: makeId(),
        themes: result.themes.slice(0, 4),
        generatedAt,
        publishedAt: null,
        signalCounts: previewSignalCounts,
        thresholdsAtGeneration: {
          minEach: themeSnapshotThresholds.minEach,
          minSplitRatio: themeSnapshotThresholds.minSplitRatio,
        },
      };
      setPreviewSnapshot(nextSnapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "INVALID_RESPONSE";
      if (message === "TIMEOUT") {
        setThemeSnapshotError("Generation timed out. Try again.");
      } else if (message === "AUTH_FAILED") {
        setThemeSnapshotError("API connection error. Check settings.");
      } else {
        setThemeSnapshotError("Unexpected response. Try again.");
      }
    } finally {
      setIsGeneratingSnapshot(false);
    }
  }, [
    clearThemeSnapshotError,
    eventName,
    isGeneratingSnapshot,
    previewSignalCounts,
    themeSnapshotCanGenerate,
    themeSnapshotThresholds.minEach,
    themeSnapshotThresholds.minSplitRatio,
  ]);

  const handleDiscardPreview = useCallback(() => {
    clearThemeSnapshotError();
    setPreviewSnapshot(null);
  }, [clearThemeSnapshotError]);

  const handlePublishPreview = useCallback(() => {
    if (!previewSnapshot) return;
    const publishedSnapshot: ThemeSnapshot = {
      ...previewSnapshot,
      publishedAt: new Date().toISOString(),
    };
    appendThemeSnapshot(publishedSnapshot);
    writePublishedThemeSnapshot(publishedSnapshot);
    setThemeSnapshots((current) => [...current, publishedSnapshot]);
    setPreviewSnapshot(null);
    clearThemeSnapshotError();
  }, [clearThemeSnapshotError, previewSnapshot]);

  const toggleHistory = useCallback((id: string) => {
    setExpandedSnapshotIds((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  return (
    <section className="synthesis-overview">
      <p className="overview-subheader">Live synthesis metrics and readiness checks at a glance.</p>
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
        <p className="overview-readiness-warning">{readinessStatusLine}</p>
      </section>

      <section className="overview-panel overview-theme-snapshots">
        <h2>Theme snapshots</h2>
        <div className="overview-theme-snapshots-body">
          {!previewSnapshot ? (
            <div className="overview-theme-generator">
              <button
                type="button"
                className="overview-theme-primary-btn"
                disabled={!themeSnapshotCanGenerate || isGeneratingSnapshot}
                onClick={handleGenerateThemeSnapshot}
              >
                {isGeneratingSnapshot ? "Generating..." : "Generate theme snapshot"}
              </button>
              {themeSnapshotLimitReached && (
                <p className="overview-theme-limit-copy">
                  Maximum snapshots reached for this event ({THEME_SNAPSHOT_MAX}).
                </p>
              )}
            </div>
          ) : (
            <article className="overview-theme-preview">
              <div className="overview-theme-preview-head">
                <strong>Preview snapshot</strong>
                <span>{formatSnapshotTime(previewSnapshot.generatedAt)}</span>
              </div>
              <ol className="overview-theme-preview-list">
                {previewSnapshot.themes.map((theme, index) => (
                  <li key={`${previewSnapshot.id}-${index}`}>{theme}</li>
                ))}
              </ol>
              <p className="overview-theme-preview-meta">
                Based on {previewSnapshot.signalCounts.featureRequests} feature requests, {previewSnapshot.signalCounts.screenFeedback} screen feedback items, {previewSnapshot.signalCounts.comments} comments
              </p>
              <div className="overview-theme-preview-actions">
                <button type="button" className="overview-theme-primary-btn" onClick={handlePublishPreview}>
                  Publish to wall
                </button>
                <button type="button" className="overview-theme-secondary-btn" onClick={handleDiscardPreview}>
                  Discard
                </button>
              </div>
            </article>
          )}
          {themeSnapshotError && <p className="overview-theme-error">{themeSnapshotError}</p>}

          <div className="overview-theme-history">
            <strong>Snapshot history</strong>
            {orderedThemeSnapshots.length === 0 ? (
              <p className="overview-theme-empty">No snapshots generated yet.</p>
            ) : (
              <div className="overview-theme-history-list">
                {orderedThemeSnapshots.map((snapshot) => {
                  const expanded = Boolean(expandedSnapshotIds[snapshot.id]);
                  return (
                    <article key={snapshot.id} className="overview-theme-history-item">
                      <button
                        type="button"
                        className="overview-theme-history-row"
                        onClick={() => toggleHistory(snapshot.id)}
                        aria-expanded={expanded}
                      >
                        <span>{formatSnapshotTime(snapshot.generatedAt)}</span>
                        <span className={`overview-theme-history-badge ${snapshot.publishedAt ? "is-published" : "is-draft"}`}>
                          {snapshot.publishedAt ? "Published" : "Not published"}
                        </span>
                        <span className="overview-theme-history-caret" aria-hidden="true">
                          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </span>
                      </button>
                      {expanded && (
                        <ol className="overview-theme-history-themes">
                          {snapshot.themes.map((theme, index) => (
                            <li key={`${snapshot.id}-history-${index}`}>{theme}</li>
                          ))}
                        </ol>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </section>
  );
};
