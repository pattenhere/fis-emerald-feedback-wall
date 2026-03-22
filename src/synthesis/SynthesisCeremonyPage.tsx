import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateDay2Narrative, type Day2NarrativeContext, type Day2NarrativeSections } from "../api/day2Narrative";
import { APP_AREAS } from "../state/seedData";
import type { AppArea, FeatureRequest, MacroState, ScreenFeedback, SignalSummary, SynthesisMode } from "../types/domain";
import type { ThemeSnapshot } from "../themeSnapshots/types";
import { SynthesisPanel } from "../modules/synthesis/SynthesisPanel";
import { synthesisModuleApi } from "../services/synthesisModuleApi";
import type { Cap11ExportRecord, Day2Narrative } from "../services/synthesisModuleApi";
import type { TShirtSizingResultsPayload } from "./tshirt/sizingResultsStore";
import { patchAdminBootstrapCache } from "./adminBootstrapCache";

type CeremonyTab = "live" | "day2";

type NarrativeDraft = Day2NarrativeSections;

interface SynthesisCeremonyPageProps {
  summary: SignalSummary;
  competingPerspectivesStatus: "not_analyzed" | "none_detected" | "detected";
  competingPerspectivesCount: number;
  readinessThreshold: number;
  mode: SynthesisMode;
  onModeChange: (mode: SynthesisMode) => void;
  unlocked: boolean;
  onUnlock: (pin: string) => Promise<boolean>;
  pinLengthRange: { min: number; max: number };
  output: string;
  onOutputChange: (next: string) => void;
  buildPromptBody: (macros?: MacroState) => string;
  onClearOutput: () => void;
  exportRecords: () => Promise<Cap11ExportRecord[]>;
  activeParametersSummary: string[];
  exportMetadata: {
    eventName?: string;
    eventSlug?: string;
    ceremonyStartTimeLocal?: string;
    day2RevealTimeLocal?: string;
    synthesisMinSignals?: number;
    themeSnapshots?: ThemeSnapshot[];
  };
  revealNarrative: string;
  onRevealNarrativeChange: (next: string) => void;
  featureRequests: FeatureRequest[];
  onSynthesisStart: () => void;
  onSynthesisComplete: () => void;
  eventName: string;
  day2RevealTimeLocal: string;
  totalInputs: number;
  screenFeedbackRecords: ScreenFeedback[];
}

const NARRATIVE_FIELDS: Array<{ key: keyof Day2NarrativeSections; label: string }> = [
  { key: "opening", label: "Opening" },
  { key: "what_we_heard", label: "What we heard" },
  { key: "what_we_built", label: "What we built" },
  { key: "what_we_deferred", label: "What we deferred" },
  { key: "closing", label: "Closing" },
];

const APP_LABEL_BY_ID = Object.fromEntries(APP_AREAS.map((area) => [area.id, area.label])) as Record<AppArea, string>;

const formatCeremonyDate = (date: Date): string =>
  date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

const truncate = (value: string, maxLength: number): string => {
  const normalized = String(value ?? "").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
};

const coerceNarrative = (value: Day2Narrative | null): NarrativeDraft | null => {
  if (!value) return null;
  const opening = String(value.opening ?? "").trim();
  const whatWeHeard = String(value.what_we_heard ?? "").trim();
  const whatWeBuilt = String(value.what_we_built ?? "").trim();
  const whatWeDeferred = String(value.what_we_deferred ?? "").trim();
  const closing = String(value.closing ?? "").trim();
  if (!opening || !whatWeHeard || !whatWeBuilt || !whatWeDeferred || !closing) return null;
  return {
    opening,
    what_we_heard: whatWeHeard,
    what_we_built: whatWeBuilt,
    what_we_deferred: whatWeDeferred,
    closing,
  };
};

const getTopAreaLabel = (records: ScreenFeedback[]): string => {
  const counts = new Map<AppArea, number>();
  for (const row of records) {
    counts.set(row.app, (counts.get(row.app) ?? 0) + 1);
  }
  if (counts.size === 0) return "Unknown";
  const [topArea] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  return APP_LABEL_BY_ID[topArea] ?? topArea;
};

const autoResize = (element: HTMLTextAreaElement | null): void => {
  if (!element) return;
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
};

export const SynthesisCeremonyPage = ({
  summary,
  competingPerspectivesStatus,
  competingPerspectivesCount,
  readinessThreshold,
  mode,
  onModeChange,
  unlocked,
  onUnlock,
  pinLengthRange,
  output,
  onOutputChange,
  buildPromptBody,
  onClearOutput,
  exportRecords,
  activeParametersSummary,
  exportMetadata,
  revealNarrative,
  onRevealNarrativeChange,
  featureRequests,
  onSynthesisStart,
  onSynthesisComplete,
  eventName,
  day2RevealTimeLocal,
  totalInputs,
  screenFeedbackRecords,
}: SynthesisCeremonyPageProps): JSX.Element => {
  const [activeTab, setActiveTab] = useState<CeremonyTab>("live");
  const [sizingPayload, setSizingPayload] = useState<TShirtSizingResultsPayload | null>(null);
  const [phase1TopSignals, setPhase1TopSignals] = useState<Array<{ title: string; rationale: string }>>([]);
  const [narrativeDraft, setNarrativeDraft] = useState<NarrativeDraft | null>(null);
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);
  const [isSavingNarrative, setIsSavingNarrative] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const [narrativeSavedAt, setNarrativeSavedAt] = useState<string | null>(null);
  const [narrativeGeneratedAt, setNarrativeGeneratedAt] = useState<string | null>(null);
  const textAreaRefs = useRef<Partial<Record<keyof Day2NarrativeSections, HTMLTextAreaElement | null>>>({});

  const refreshCeremonyData = useCallback(async (): Promise<void> => {
    const [sizingResult, phase1Result, narrativeResult] = await Promise.all([
      synthesisModuleApi.getLatestTShirtSizing().catch(() => ({ sizing: null })),
      synthesisModuleApi.getLatestPhase1Analysis().catch(() => ({ phase1Analysis: null })),
      synthesisModuleApi.getSavedNarrative().catch(() => ({ savedNarrative: null })),
    ]);
    setSizingPayload(sizingResult.sizing ?? null);
    const topSignals = Array.isArray(phase1Result.phase1Analysis?.p0Items)
      ? phase1Result.phase1Analysis.p0Items.slice(0, 3).map((item) => ({
          title: String(item.title ?? "").trim(),
          rationale: truncate(String(item.rationale ?? "").trim(), 100),
        }))
      : [];
    setPhase1TopSignals(topSignals);

    const coerced = coerceNarrative(narrativeResult.savedNarrative ?? null);
    if (coerced) {
      setNarrativeDraft(coerced);
      setNarrativeSavedAt(narrativeResult.savedNarrative?.updatedAt ?? null);
    }
  }, []);

  useEffect(() => {
    void refreshCeremonyData().catch(() => undefined);
  }, [refreshCeremonyData]);

  useEffect(() => {
    for (const field of NARRATIVE_FIELDS) {
      autoResize(textAreaRefs.current[field.key] ?? null);
    }
  }, [narrativeDraft]);

  const hasSizingSaved =
    Array.isArray(sizingPayload?.results) &&
    sizingPayload.results.length > 0 &&
    typeof sizingPayload.savedAt === "string" &&
    sizingPayload.savedAt.trim().length > 0;

  const sizingRows = useMemo(() => sizingPayload?.results ?? [], [sizingPayload]);

  const p0ItemsBuilt = useMemo(
    () =>
      sizingRows
        .filter((row) => row.size === "XS" || row.size === "S")
        .map((row) => ({
          title: String(row.p0ItemTitle ?? "").trim(),
          size: String(row.size ?? "").trim(),
          notes: String(row.notes ?? "").trim(),
        }))
        .filter((row) => row.title.length > 0),
    [sizingRows],
  );

  const p0ItemsDeferred = useMemo(
    () =>
      sizingRows
        .filter((row) => row.size === "M" || row.size === "L")
        .map((row) => ({
          title: String(row.p0ItemTitle ?? "").trim(),
          size: String(row.size ?? "").trim(),
          notes: String(row.notes ?? "").trim(),
        }))
        .filter((row) => row.title.length > 0),
    [sizingRows],
  );

  const narrativeContext = useMemo<Day2NarrativeContext>(
    () => ({
      eventName: eventName.trim() || "Emerald Event",
      ceremonyDate: formatCeremonyDate(new Date()),
      day2RevealTime: day2RevealTimeLocal || "TBD",
      totalInputs: Math.max(0, Number(totalInputs ?? 0)),
      topArea: getTopAreaLabel(screenFeedbackRecords),
      p0ItemsBuilt,
      p0ItemsDeferred,
      topSignals: phase1TopSignals,
      competingPerspectivesCount: Math.max(0, Number(competingPerspectivesCount ?? 0)),
    }),
    [competingPerspectivesCount, day2RevealTimeLocal, eventName, p0ItemsBuilt, p0ItemsDeferred, phase1TopSignals, screenFeedbackRecords, totalInputs],
  );

  const runNarrativeGeneration = useCallback(async (): Promise<void> => {
    setNarrativeError(null);
    if (p0ItemsBuilt.length === 0) {
      setNarrativeError("No XS or S items found in sizing. Update sizing and try again.");
      return;
    }
    setIsGeneratingNarrative(true);
    try {
      const generated = await generateDay2Narrative(narrativeContext);
      setNarrativeDraft(generated);
      setNarrativeGeneratedAt(new Date().toISOString());
    } catch (error) {
      setNarrativeError(error instanceof Error ? error.message : "Failed to generate narrative.");
    } finally {
      setIsGeneratingNarrative(false);
    }
  }, [narrativeContext, p0ItemsBuilt.length]);

  const handleRegenerate = useCallback((): void => {
    if (!window.confirm("Regenerate will replace your edits. Continue?")) return;
    void runNarrativeGeneration();
  }, [runNarrativeGeneration]);

  const handleSaveNarrative = useCallback(async (): Promise<void> => {
    if (!narrativeDraft) return;
    setIsSavingNarrative(true);
    setNarrativeError(null);
    try {
      const payload: Day2Narrative = {
        ...narrativeDraft,
        updatedAt: new Date().toISOString(),
      };
      const response = await synthesisModuleApi.saveSavedNarrative(payload);
      patchAdminBootstrapCache({ savedNarrative: response.savedNarrative });
      setNarrativeSavedAt(response.savedNarrative.updatedAt ?? payload.updatedAt ?? null);
    } catch (error) {
      setNarrativeError(error instanceof Error ? error.message : "Failed to save narrative.");
    } finally {
      setIsSavingNarrative(false);
    }
  }, [narrativeDraft]);

  const updateNarrativeField = useCallback((key: keyof Day2NarrativeSections, value: string): void => {
    setNarrativeDraft((current) => {
      if (!current) return current;
      return { ...current, [key]: value };
    });
  }, []);

  return (
    <section className="synthesis-ceremony-page">
      <header className="synthesis-page-card synthesis-ceremony-header">
        <h2>Ceremony</h2>
        <p>Run live synthesis in-room, then prepare the Day 2 reveal narrative after sizing is complete.</p>
      </header>

      <div className="synthesis-page-card synthesis-ceremony-tabs" role="tablist" aria-label="Ceremony sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "live"}
          className={activeTab === "live" ? "overview-theme-primary-btn synthesis-ceremony-tab-button" : "overview-theme-secondary-btn synthesis-ceremony-tab-button"}
          onClick={() => setActiveTab("live")}
        >
          Live synthesis
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "day2"}
          className={activeTab === "day2" ? "overview-theme-primary-btn synthesis-ceremony-tab-button" : "overview-theme-secondary-btn synthesis-ceremony-tab-button"}
          onClick={() => setActiveTab("day2")}
        >
          Day 2 narrative
        </button>
      </div>

      {activeTab === "live" ? (
        <>
          <section className="synthesis-ceremony-live-summary synthesis-overview-grid">
            <article className="overview-stat-card synthesis-ceremony-summary-card">
              <p>Active parameters</p>
              {activeParametersSummary.length > 0 ? (
                <ul className="list-reset synthesis-active-parameters-list">
                  {activeParametersSummary.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <span>No parameters active.</span>
              )}
            </article>
            <article className="overview-stat-card synthesis-ceremony-summary-card">
              <p>Competing perspectives</p>
              <strong>{competingPerspectivesCount}</strong>
              <span>screen(s) flagged.</span>
              <a className="synthesis-ceremony-inline-link" href="/facilitator/synthesis/competing-views">
                Open Competing views →
              </a>
            </article>
          </section>
          <section className="synthesis-page-card synthesis-ceremony-live-panel">
            <SynthesisPanel
              summary={summary}
              competingPerspectivesStatus={competingPerspectivesStatus}
              competingPerspectivesCount={competingPerspectivesCount}
              readinessThreshold={readinessThreshold}
              mode={mode}
              onModeChange={onModeChange}
              unlocked={unlocked}
              onUnlock={onUnlock}
              pinLengthRange={pinLengthRange}
              output={output}
              onOutputChange={onOutputChange}
              buildPromptBody={buildPromptBody}
              onClearOutput={onClearOutput}
              exportRecords={exportRecords}
              activeParametersSummary={activeParametersSummary}
              exportMetadata={exportMetadata}
              revealNarrative={revealNarrative}
              onRevealNarrativeChange={onRevealNarrativeChange}
              featureRequests={featureRequests}
              onSynthesisStart={onSynthesisStart}
              onSynthesisComplete={onSynthesisComplete}
            />
          </section>
        </>
      ) : (
          <section className="synthesis-page-card synthesis-ceremony-day2">
            {!hasSizingSaved ? (
              <div className="synthesis-ceremony-locked">
                <p>Complete T-shirt sizing first.</p>
                <a className="synthesis-ceremony-inline-link" href="/facilitator/t-shirt-sizing">
                  Go to T-shirt sizing →
                </a>
              </div>
            ) : (
              <>
                <div className="synthesis-ceremony-day2-actions">
                  <button
                    type="button"
                    className="overview-theme-primary-btn"
                    disabled={isGeneratingNarrative}
                    onClick={() => void runNarrativeGeneration()}
                  >
                  {isGeneratingNarrative ? "Generating..." : "Generate Day 2 narrative"}
                </button>
                {narrativeDraft && (
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={isGeneratingNarrative}
                    onClick={handleRegenerate}
                  >
                    Regenerate
                  </button>
                )}
              </div>
              {narrativeError && <p className="error-text">{narrativeError}</p>}
              {narrativeDraft && (
                <>
                  <div className="synthesis-ceremony-save-row">
                  <button
                    type="button"
                    className="overview-theme-secondary-btn"
                    onClick={() => void handleSaveNarrative()}
                    disabled={isSavingNarrative}
                  >
                      {isSavingNarrative ? "Saving..." : "Save narrative"}
                    </button>
                    <p className="helper-copy">
                      {narrativeSavedAt
                        ? `Saved at ${new Date(narrativeSavedAt).toLocaleTimeString()}`
                        : narrativeGeneratedAt
                          ? `Generated at ${new Date(narrativeGeneratedAt).toLocaleTimeString()}`
                          : "Not yet saved."}
                    </p>
                  </div>
                  <div className="synthesis-ceremony-editor">
                    {NARRATIVE_FIELDS.map((field) => (
                      <label key={field.key} className="synthesis-ceremony-field">
                        <strong>{field.label}</strong>
                        <textarea
                          ref={(node) => {
                            textAreaRefs.current[field.key] = node;
                          }}
                          value={narrativeDraft[field.key]}
                          onChange={(event) => {
                            updateNarrativeField(field.key, event.target.value);
                            autoResize(event.target);
                          }}
                          rows={2}
                        />
                      </label>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}
    </section>
  );
};
