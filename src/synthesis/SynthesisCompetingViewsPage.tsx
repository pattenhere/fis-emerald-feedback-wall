import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { SynthesisParameters } from "./parameters/types";
import { readCompetingPerspectivesCache, writeCompetingPerspectivesCache } from "./competingViewsCache";
import { detectCompetingPerspectives, type CompetingViewConflictEntry, type CompetingViewScreenFeedback } from "./detectCompetingPerspectives";
import type { ScreenFeedback } from "../types/domain";

type SynthesisCompetingViewsPageProps = {
  parameters: SynthesisParameters;
  screenFeedbackRecords: ScreenFeedback[];
};

const POSITIVE_TYPES = new Set(["works_well"]);
const NEGATIVE_TYPES = new Set(["pain_point", "confusing", "missing_element"]);

const toPercent = (ratio: number): number => Math.round(Number(ratio ?? 0) * 100);

export const SynthesisCompetingViewsPage = ({
  parameters,
  screenFeedbackRecords,
}: SynthesisCompetingViewsPageProps): JSX.Element => {
  const [conflicts, setConflicts] = useState<CompetingViewConflictEntry[]>([]);
  const [screenFeedback, setScreenFeedback] = useState<CompetingViewScreenFeedback[]>([]);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [thresholdsStale, setThresholdsStale] = useState(false);
  const [detectionError, setDetectionError] = useState<string | null>(null);

  const thresholdLabel = `Minimum per polarity: ${parameters.competingMinEach}  · Minimum split ratio: ${toPercent(parameters.competingMinSplitRatio)}%`;
  const emptyThresholdLabel = `Minimum per polarity: ${parameters.competingMinEach}  ·  Minimum split: ${toPercent(parameters.competingMinSplitRatio)}%`;
  const currentThresholds = useMemo(
    () => ({
      competingMinEach: parameters.competingMinEach,
      competingMinSplitRatio: parameters.competingMinSplitRatio,
    }),
    [parameters.competingMinEach, parameters.competingMinSplitRatio],
  );
  const currentThresholdsRef = useRef(currentThresholds);
  useEffect(() => {
    currentThresholdsRef.current = currentThresholds;
  }, [currentThresholds]);

  const evaluateThresholdDrift = useCallback(() => {
    const cache = readCompetingPerspectivesCache();
    if (!cache) {
      setThresholdsStale(false);
      return;
    }
    const drifted =
      cache.thresholdsUsed.minEach !== currentThresholds.competingMinEach ||
      cache.thresholdsUsed.minSplitRatio !== currentThresholds.competingMinSplitRatio;
    setThresholdsStale(drifted);
  }, [currentThresholds.competingMinEach, currentThresholds.competingMinSplitRatio]);

  const runDetection = useCallback((): void => {
    setIsComputing(true);
    setDetectionError(null);
    try {
      const records = screenFeedbackRecords;
      console.log("[competing-views] Records loaded:", records.length);
      const { conflicts: detected, normalizedFeedback } = detectCompetingPerspectives(records, {
        minEach: currentThresholdsRef.current.competingMinEach,
        minSplitRatio: currentThresholdsRef.current.competingMinSplitRatio,
      });
      const sorted = [...detected].sort((a, b) => b.totalCount - a.totalCount);
      setConflicts(sorted);
      setScreenFeedback(normalizedFeedback);
      const computedAtIso = new Date().toISOString();
      setComputedAt(computedAtIso);
      writeCompetingPerspectivesCache({
        result: sorted,
        screenFeedback: normalizedFeedback,
        computedAt: computedAtIso,
        thresholdsUsed: {
          minEach: currentThresholdsRef.current.competingMinEach,
          minSplitRatio: currentThresholdsRef.current.competingMinSplitRatio,
        },
      });
      setThresholdsStale(false);
    } catch (error) {
      console.error("[competing-views] Detection failed:", error);
      setComputedAt(null);
      setDetectionError("Computation failed — check console for details.");
    } finally {
      setIsComputing(false);
    }
  }, [screenFeedbackRecords]);

  useEffect(() => {
    const cache = readCompetingPerspectivesCache();
    if (cache) {
      const sorted = [...cache.result].sort((a, b) => b.totalCount - a.totalCount);
      setConflicts(sorted);
      setScreenFeedback(cache.screenFeedback);
      setComputedAt(cache.computedAt);
      evaluateThresholdDrift();
      return;
    }
    runDetection();
  }, []);

  useEffect(() => {
    evaluateThresholdDrift();
  }, [evaluateThresholdDrift]);

  useEffect(() => {
    const onFocus = (): void => {
      evaluateThresholdDrift();
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        evaluateThresholdDrift();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [evaluateThresholdDrift]);

  const computedLabel = detectionError
    ? detectionError
    : computedAt
      ? new Date(computedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })
      : "Not yet computed";

  const groupedFeedback = useMemo(() => {
    const groups = new Map<string, { positive: CompetingViewScreenFeedback[]; negative: CompetingViewScreenFeedback[] }>();
    for (const row of screenFeedback) {
      const key = `${row.appSection}::${row.screenName}`;
      const existing = groups.get(key) ?? { positive: [], negative: [] };
      if (POSITIVE_TYPES.has(row.typeTag)) existing.positive.push(row);
      if (NEGATIVE_TYPES.has(row.typeTag)) existing.negative.push(row);
      groups.set(key, existing);
    }
    return groups;
  }, [screenFeedback]);

  return (
    <section className="synthesis-competing-page">
      <header className="synthesis-page-card synthesis-competing-header">
        <h2>Competing views</h2>
        <p>
          Screens where attendees gave both positive and negative feedback. Surfaced as context in synthesis
          — not errors to resolve.
        </p>
        <div className="synthesis-competing-threshold-row">
          <span>{thresholdLabel}</span>
          <a href="/facilitator/synthesis/parameters">Edit in Synthesis parameters →</a>
        </div>
        <div className="synthesis-competing-meta-row">
          <span>Last computed: {computedLabel}</span>
          <button type="button" onClick={runDetection} disabled={isComputing}>
            {isComputing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {thresholdsStale && (
          <div className="synthesis-competing-threshold-warning">
            <p>Thresholds have changed since last computation. Refresh to update results.</p>
            <button type="button" onClick={runDetection} disabled={isComputing}>
              {isComputing ? "Refreshing..." : "Refresh now"}
            </button>
          </div>
        )}
        {isComputing && <p className="synthesis-competing-loading">Computing competing views...</p>}
      </header>

      <section className="synthesis-page-card synthesis-competing-framing">
        <p>
          ℹ Competing perspectives are automatically included as context in synthesis. They represent genuine
          disagreement between attendees — not data errors.
        </p>
      </section>

      <section className="synthesis-competing-cards">
        {conflicts.length === 0 ? (
          <article className="synthesis-page-card synthesis-competing-empty">
            <p>No competing perspectives detected with current thresholds.</p>
            <p>{emptyThresholdLabel}</p>
            <a href="/facilitator/synthesis/parameters">Adjust thresholds in Synthesis parameters →</a>
          </article>
        ) : (
          conflicts.map((entry) => {
            const key = `${entry.appSection}::${entry.screenName}`;
            const positivePct = entry.totalCount > 0 ? (entry.positiveCount / entry.totalCount) * 100 : 0;
            const negativePct = entry.totalCount > 0 ? (entry.negativeCount / entry.totalCount) * 100 : 0;
            const expanded = Boolean(expandedKeys[key]);
            const grouped = groupedFeedback.get(key) ?? { positive: [], negative: [] };
            return (
              <article key={key} className="synthesis-page-card synthesis-competing-card">
                <p className="synthesis-competing-title">
                  <strong>{entry.screenName}</strong>
                  <span> — {entry.appSection}</span>
                </p>
                <div className="synthesis-competing-splitbar" aria-hidden="true">
                  <span className="is-positive" style={{ width: `${positivePct}%` }} />
                  <span className="is-negative" style={{ width: `${negativePct}%` }} />
                </div>
                <p className="synthesis-competing-stats">
                  {entry.positiveCount} positive  ·  {entry.negativeCount} negative  ·  {entry.totalCount} total  ·  {toPercent(entry.splitRatio)}% split
                </p>
                <button
                  type="button"
                  className="synthesis-competing-toggle"
                  onClick={() => setExpandedKeys((current) => ({ ...current, [key]: !expanded }))}
                >
                  {expanded ? (<><span>Hide</span> <ChevronUp size={13} /></>) : (<><span>View submissions</span> <ChevronDown size={13} /></>)}
                </button>
                {expanded && (
                  <div className="synthesis-competing-submissions">
                    <section>
                      <h4>Positive feedback</h4>
                      <ul className="list-reset">
                        {grouped.positive
                          .filter((row) => String(row.freetext ?? "").trim() || row.typeTag)
                          .map((row, index) => (
                            <li key={`${key}-positive-${index}`} className="synthesis-competing-item">
                              <span className="synthesis-competing-chip">{row.typeTag}</span>
                              {String(row.freetext ?? "").trim() && <p>{String(row.freetext ?? "").trim()}</p>}
                            </li>
                          ))}
                      </ul>
                    </section>
                    <section>
                      <h4>Negative feedback</h4>
                      <ul className="list-reset">
                        {grouped.negative
                          .filter((row) => String(row.freetext ?? "").trim() || row.typeTag)
                          .map((row, index) => (
                            <li key={`${key}-negative-${index}`} className="synthesis-competing-item">
                              <span className="synthesis-competing-chip">{row.typeTag}</span>
                              {String(row.freetext ?? "").trim() && <p>{String(row.freetext ?? "").trim()}</p>}
                            </li>
                          ))}
                      </ul>
                    </section>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>
    </section>
  );
};
