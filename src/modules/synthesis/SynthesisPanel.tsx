import { memo, useEffect, useMemo, useState } from "react";
import { CheckCircle, ChevronDown, ChevronRight, ChevronUp, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { runSynthesis } from "../../synthesis/synthesisRunner";
import type {
  FeatureRequest,
  MacroState,
  SignalSummary,
  SynthesisMode,
} from "../../types/domain";
import type { ExportRecord } from "../../state/useWallState";
import { APP_AREAS } from "../../state/seedData";
import { copyText } from "../../utils/clipboard";
import type { ThemeSnapshot } from "../../themeSnapshots/types";
import { synthesisModuleApi } from "../../services/synthesisModuleApi";

type SynthesisTimingMetadata = {
  phase1Seconds: number;
  phase2Seconds: number;
  totalSeconds: number;
  generatedAt?: string;
};

type SynthesisErrorState = {
  code?: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
};

interface SynthesisPanelProps {
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
  exportRecords: () => ExportRecord[];
  activeParametersSummary?: string[];
  exportMetadata?: {
    eventName?: string;
    eventSlug?: string;
    ceremonyStartTimeLocal?: string;
    day2RevealTimeLocal?: string;
    synthesisMinSignals?: number;
    themeSnapshots?: ThemeSnapshot[];
  };
  timingMetadata?: SynthesisTimingMetadata | null;
  revealNarrative: string;
  onRevealNarrativeChange: (next: string) => void;
  featureRequests: FeatureRequest[];
  onSynthesisStart: () => void;
  onSynthesisComplete: () => void;
}

const serializeCsv = (rows: ExportRecord[]): string => {
  const headers = [
    "submission_type",
    "app_section",
    "screen_name",
    "feedback_type",
    "freetext",
    "role_label",
    "card_sort_rank",
    "kudos_consent_flag",
    "synthesis_p_tier",
  ];
  const escape = (value: string): string => `"${String(value).replaceAll('"', '""')}"`;
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(String(row[header as keyof ExportRecord] ?? ""))).join(",")),
  ].join("\n");
};

const downloadText = (filename: string, content: string, type: string): void => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const activeMacroCount = (macros: MacroState): number => {
  return [
    Boolean(macros.upweightApp),
    macros.p0Only,
    typeof macros.excludeLowSignalBelow === "number",
    macros.emphasizeMarketingQuotes,
  ].filter(Boolean).length;
};

const SORTED_APP_AREAS = APP_AREAS.slice().sort((a, b) => a.label.localeCompare(b.label));

const PROTOTYPE_DISCLAIMER =
  "All items above are prototype recommendations derived from event feedback. No production commitments are implied.";

const synthesizeMacroLabels = (macros: MacroState): string[] => {
  const active: string[] = [];
  if (macros.upweightApp) active.push(`Upweight: ${macros.upweightApp}`);
  if (macros.p0Only) active.push("P0 focus only");
  if (macros.excludeLowSignalBelow != null) active.push(`Exclude<${macros.excludeLowSignalBelow}`);
  if (macros.emphasizeMarketingQuotes) active.push("Emphasise quotes");
  return active;
};

const buildGeneratedHeader = (generatedAt: string, macros: MacroState): string => {
  const timeLabel = new Date(generatedAt).toLocaleTimeString();
  const active = synthesizeMacroLabels(macros);
  return `Generated: ${timeLabel} · Macros active: ${active.length ? active.join(", ") : "None"}`;
};

const normalizeSynthesisOutput = (text: string, macros: MacroState, generatedAt: string): string => {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return `${buildGeneratedHeader(generatedAt, macros)}\n\n${PROTOTYPE_DISCLAIMER}`;
  }

  const withHeader = trimmed.startsWith("Generated:")
    ? trimmed
    : `${buildGeneratedHeader(generatedAt, macros)}\n\n${trimmed}`;
  if (withHeader.includes(PROTOTYPE_DISCLAIMER)) return withHeader;
  return `${withHeader}\n\n${PROTOTYPE_DISCLAIMER}`;
};

const mapSynthesisError = (error: unknown): SynthesisErrorState => {
  const rawMessage = error instanceof Error ? error.message : "Synthesis failed. Please try again.";
  const codeMatch = rawMessage.match(/\bERR-\d{2}\b/);
  const code = (error as { code?: unknown } | null)?.code;
  const normalizedCode = typeof code === "string" ? code : codeMatch?.[0];
  switch (normalizedCode) {
    case "ERR-01":
      return {
        code: "ERR-01",
        message: "Too many parameters active — maximum is 2. Deactivate one in Synthesis parameters and try again.",
        actionHref: "/facilitator/synthesis/parameters",
        actionLabel: "Go to Parameters",
      };
    case "ERR-02":
      return {
        code: "ERR-02",
        message: "Analysis timed out. Your data is safe — try again.",
      };
    case "ERR-03":
      return {
        code: "ERR-03",
        message: "Analysis returned an unexpected format. A fallback analysis was used.",
      };
    case "ERR-04":
      return {
        code: "ERR-04",
        message: "Output generation stalled. The stream remains open and partial output is still available.",
      };
    case "ERR-05":
      return {
        code: "ERR-05",
        message: "No signals collected yet. Synthesis requires at least one submission.",
      };
    default:
      return {
        code: normalizedCode,
        message: rawMessage.replace(/^\s*ERR-\d{2}:\s*/u, ""),
      };
  }
};

const roundSeconds = (value: number): number => Math.max(0, Math.round(value * 10) / 10);

const formatElapsedSeconds = (ms: number | null): string => {
  if (ms == null || !Number.isFinite(ms)) return "0s";
  return `${Math.max(0, Math.floor(ms / 1000))}s`;
};

const formatSeconds = (value: number | null): string => {
  if (value == null || !Number.isFinite(value)) return "0.0s";
  return `${Math.max(0, value).toFixed(1)}s`;
};

const formatInt = (value: number): string => Math.max(0, Number(value) || 0).toLocaleString();

const splitOutputHeader = (value: string): { meta: string | null; body: string } => {
  const text = String(value ?? "");
  if (!text.startsWith("Generated:")) return { meta: null, body: text };
  const [firstLine, ...rest] = text.split("\n");
  return {
    meta: firstLine.trim() || null,
    body: rest.join("\n").replace(/^\s*\n/u, ""),
  };
};

const estimateSynthesisTiming = ({
  summary,
  mode,
  competingPerspectivesStatus,
  competingPerspectivesCount,
  macroCount,
}: {
  summary: SignalSummary;
  mode: SynthesisMode;
  competingPerspectivesStatus: "not_analyzed" | "none_detected" | "detected";
  competingPerspectivesCount: number;
  macroCount: number;
}): SynthesisTimingMetadata => {
  const totalSignals = summary.totalFeatureVotes + summary.screenFeedbackCount + summary.kudosCount;
  const phase1 =
    4.2 +
    totalSignals * 0.12 +
    summary.screenFeedbackCount * 0.08 +
    summary.totalFeatureVotes * 0.06 +
    summary.kudosCount * 0.03 +
    macroCount * 1.1 +
    (competingPerspectivesStatus === "detected"
      ? Math.min(4, competingPerspectivesCount * 0.75)
      : competingPerspectivesStatus === "not_analyzed"
        ? 2.4
        : 0.8);
  const phase2 =
    (mode === "prd" ? 11.2 : 8.4) +
    totalSignals * 0.07 +
    summary.screenFeedbackCount * 0.04 +
    macroCount * 0.85 +
    (competingPerspectivesStatus === "detected"
      ? 2.8
      : competingPerspectivesStatus === "not_analyzed"
        ? 1.4
        : 0.9);
  return {
    phase1Seconds: roundSeconds(phase1),
    phase2Seconds: roundSeconds(phase2),
    totalSeconds: roundSeconds(phase1 + phase2),
  };
};

export const SynthesisPanel = memo(({
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
  activeParametersSummary = [],
  exportMetadata,
  timingMetadata,
  revealNarrative,
  onRevealNarrativeChange,
  featureRequests,
  onSynthesisStart,
  onSynthesisComplete,
}: SynthesisPanelProps): JSX.Element => {
  const [pinAttempt, setPinAttempt] = useState("");
  const [pinError, setPinError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [phaseStatus, setPhaseStatus] = useState<"idle" | "analyzing" | "generating" | "complete">("idle");
  const [phase1StartedAt, setPhase1StartedAt] = useState<number | null>(null);
  const [phase1CompletedAt, setPhase1CompletedAt] = useState<number | null>(null);
  const [phase2StartedAt, setPhase2StartedAt] = useState<number | null>(null);
  const [firstPhase2TokenAt, setFirstPhase2TokenAt] = useState<number | null>(null);
  const [lastRunTiming, setLastRunTiming] = useState<SynthesisTimingMetadata | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [streamWarnings, setStreamWarnings] = useState<string[]>([]);
  const [streamError, setStreamError] = useState<SynthesisErrorState | null>(null);
  const [macroApplicationLog, setMacroApplicationLog] = useState<string[]>([]);
  const [showMacroLog, setShowMacroLog] = useState(false);
  const [copyState, setCopyState] = useState<"" | "copied" | "failed">("");
  const [macroOpen, setMacroOpen] = useState(false);
  const [revealMode, setRevealMode] = useState(false);
  const [macroError, setMacroError] = useState("");
  const [macros, setMacros] = useState<MacroState>({
    upweightApp: undefined,
    p0Only: false,
    excludeLowSignalBelow: undefined,
    emphasizeMarketingQuotes: false,
  });

  const stats = useMemo(
    () => [
      { label: "Feature Requests", value: summary.totalFeatureVotes, subLabel: "submissions" },
      { label: "Comments", value: summary.kudosCount, subLabel: "submitted" },
      { label: "Screen Feedback", value: summary.screenFeedbackCount, subLabel: "across active screens" },
    ],
    [summary],
  );

  const totalSignals = summary.totalFeatureVotes + summary.screenFeedbackCount + summary.kudosCount;
  const progress = Math.min(totalSignals / readinessThreshold, 1);
  const readinessTone =
    totalSignals >= readinessThreshold ? "ready" : totalSignals >= readinessThreshold - 10 ? "near" : "low";
  const readinessBarToneClass =
    readinessTone === "ready" ? "is-good" : readinessTone === "near" ? "is-near" : "is-low";
  const macroCount = activeMacroCount(macros);
  const timingEstimate = useMemo(
    () =>
      estimateSynthesisTiming({
        summary,
        mode,
        competingPerspectivesStatus,
        competingPerspectivesCount,
        macroCount,
      }),
    [competingPerspectivesCount, competingPerspectivesStatus, macroCount, mode, summary],
  );
  const timingSnapshot = timingMetadata ?? lastRunTiming;
  const showTimingActuals = Boolean(timingSnapshot);
  const phase1ElapsedMs = phase1StartedAt == null ? null : (phase1CompletedAt ?? clockNow) - phase1StartedAt;
  const phase2WaitingMs = phase2StartedAt == null || firstPhase2TokenAt != null ? null : clockNow - phase2StartedAt;
  const showPhase2Starting = phase2WaitingMs != null && phase2WaitingMs >= 3000 && phase2WaitingMs < 10000;
  const showPhase2Warning = phase2WaitingMs != null && phase2WaitingMs >= 10000 && phase2WaitingMs < 60000;
  const showPhase2Stall = phase2WaitingMs != null && phase2WaitingMs >= 60000;

  const p0Candidates = featureRequests.slice(0, 5);
  const competingViewsHref = "/facilitator/synthesis/competing-views";
  const outputSplit = useMemo(() => splitOutputHeader(output), [output]);
  const statAccentClass = (label: string): string => {
    if (label === "Feature Requests") return "accent-feature";
    if (label === "Screen Feedback") return "accent-screen";
    return "accent-kudos";
  };

  useEffect(() => {
    if (!isGenerating && phaseStatus !== "analyzing" && phaseStatus !== "generating") return;
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isGenerating, phaseStatus]);

  useEffect(() => {
    if (copyState === "") return;
    const timeout = window.setTimeout(() => setCopyState(""), 2000);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  useEffect(() => {
    if (timingMetadata) return;
    void synthesisModuleApi
      .getLatestSynthesisMetadata()
      .then((payload) => {
        if (!payload.metadata) return;
        setLastRunTiming({
          phase1Seconds: roundSeconds(Number(payload.metadata.phase1DurationMs ?? 0) / 1000),
          phase2Seconds: roundSeconds(Number(payload.metadata.phase2DurationMs ?? 0) / 1000),
          totalSeconds: roundSeconds(
            (Number(payload.metadata.phase1DurationMs ?? 0) + Number(payload.metadata.phase2DurationMs ?? 0)) / 1000,
          ),
          generatedAt: payload.metadata.generatedAt,
        });
      })
      .catch(() => undefined);
  }, [timingMetadata]);

  const updateMacros = (next: MacroState): void => {
    if (activeMacroCount(next) > 2) {
      setMacroError("Up to two macros can be active at once.");
      return;
    }
    setMacroError("");
    setMacros(next);
  };

  const handleUnlock = async (): Promise<void> => {
    if (!/^\d+$/.test(pinAttempt)) {
      setPinError("PIN must contain only digits.");
      return;
    }
    if (pinAttempt.length < pinLengthRange.min || pinAttempt.length > pinLengthRange.max) {
      setPinError(`PIN must be ${pinLengthRange.min}-${pinLengthRange.max} digits.`);
      return;
    }

    setUnlocking(true);
    try {
      const ok = await onUnlock(pinAttempt);
      setPinError(ok ? "" : "Invalid PIN");
      if (ok) {
        setPinAttempt("");
      }
    } finally {
      setUnlocking(false);
    }
  };

  const handleGenerate = async (nextMode: SynthesisMode = mode): Promise<void> => {
    onSynthesisStart();
    const macrosAtStart = { ...macros };
    const promptPreview = buildPromptBody(macrosAtStart);
    if (promptPreview.length === 0) {
      console.warn("[synthesis] Prompt preview is empty.");
    }
    setIsGenerating(true);
    setPhaseStatus("analyzing");
    let runPhase1StartedAt = Date.now();
    let runPhase1CompletedAt: number | null = null;
    let runPhase2StartedAt: number | null = null;
    let runFirstPhase2TokenAt: number | null = null;
    let runGeneratedAt = "";
    let runCompleted = false;
    setPhase1StartedAt(runPhase1StartedAt);
    setPhase1CompletedAt(null);
    setPhase2StartedAt(null);
    setFirstPhase2TokenAt(null);
    setStreamWarnings([]);
    setStreamError(null);
    setMacroApplicationLog([]);
    setShowMacroLog(false);
    setCopyState("");
    onOutputChange("");
    if (mode !== nextMode) {
      onModeChange(nextMode);
    }
    let streamedOutput = "";

    try {
      await runSynthesis(
        nextMode,
        (analysis) => {
          setPhaseStatus("generating");
          runPhase1CompletedAt = Date.now();
          setPhase1CompletedAt(runPhase1CompletedAt);
          runPhase2StartedAt = Date.now();
          setPhase2StartedAt(runPhase2StartedAt);
          if (Array.isArray(analysis.macroApplicationLog) && analysis.macroApplicationLog.length > 0) {
            setMacroApplicationLog(analysis.macroApplicationLog);
            setShowMacroLog(true);
          }
        },
        (token) => {
          runFirstPhase2TokenAt = runFirstPhase2TokenAt ?? Date.now();
          setFirstPhase2TokenAt((current) => current ?? runFirstPhase2TokenAt);
          streamedOutput += token;
          onOutputChange(streamedOutput);
        },
        (fullOutput) => {
          runGeneratedAt = new Date().toISOString();
          streamedOutput = normalizeSynthesisOutput(fullOutput, macrosAtStart, runGeneratedAt);
          onOutputChange(streamedOutput);
          runCompleted = true;
          setPhaseStatus("complete");
        },
        (error) => {
          setStreamError(mapSynthesisError({ code: error.code, message: error.message }));
          setPhaseStatus("idle");
        },
      );
      const completedAt = Date.now();
      if (runPhase1StartedAt != null && runPhase1CompletedAt != null && runPhase2StartedAt != null) {
        setLastRunTiming({
          phase1Seconds: roundSeconds((runPhase1CompletedAt - runPhase1StartedAt) / 1000),
          phase2Seconds: roundSeconds((completedAt - runPhase2StartedAt) / 1000),
          totalSeconds: roundSeconds((completedAt - runPhase1StartedAt) / 1000),
          generatedAt: runGeneratedAt || new Date(completedAt).toISOString(),
        });
      }
      void synthesisModuleApi
        .getLatestSynthesisMetadata()
        .then((payload) => {
          if (!payload.metadata) return;
          setLastRunTiming({
            phase1Seconds: roundSeconds(Number(payload.metadata.phase1DurationMs ?? 0) / 1000),
            phase2Seconds: roundSeconds(Number(payload.metadata.phase2DurationMs ?? 0) / 1000),
            totalSeconds: roundSeconds(
              (Number(payload.metadata.phase1DurationMs ?? 0) + Number(payload.metadata.phase2DurationMs ?? 0)) / 1000,
            ),
            generatedAt: payload.metadata.generatedAt,
          });
        })
        .catch(() => undefined);
      onSynthesisComplete();
    } catch (error) {
      setStreamError(mapSynthesisError(error));
      setPhaseStatus("idle");
    } finally {
      setIsGenerating(false);
      if (!runCompleted) {
        setPhaseStatus("idle");
      }
    }
  };

  const handleCopy = async (): Promise<void> => {
    const ok = await copyText(output);
    setCopyState(ok ? "copied" : "failed");
  };

  const handleClearOutput = (): void => {
    if (!output) return;
    if (!window.confirm("Clear synthesis output?")) return;
    onClearOutput();
  };

  const handleExport = (format: "csv" | "json"): void => {
    if (!window.confirm("Export data now? This strips session identifiers and keeps consent flags.")) {
      return;
    }
    const rows = exportRecords();
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
    if (format === "csv") {
      downloadText(`emerald-feedback-export-${stamp}.csv`, serializeCsv(rows), "text/csv");
      return;
    }
    downloadText(
      `emerald-feedback-export-${stamp}.json`,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          event_id: exportMetadata?.eventSlug || "emerald-2026",
          event_name: exportMetadata?.eventName || "Event name not set",
          event_slug: exportMetadata?.eventSlug || "emerald-2026",
          ceremony_start_time_local: exportMetadata?.ceremonyStartTimeLocal || "",
          day2_reveal_time_local: exportMetadata?.day2RevealTimeLocal || "",
          synthesis_min_signals: Number(exportMetadata?.synthesisMinSignals ?? readinessThreshold),
          theme_snapshots: Array.isArray(exportMetadata?.themeSnapshots)
            ? exportMetadata.themeSnapshots.map((snapshot) => ({
                id: snapshot.id,
                generatedAt: snapshot.generatedAt,
                publishedAt: snapshot.publishedAt,
                signalCounts: snapshot.signalCounts,
                themes: snapshot.themes,
              }))
            : [],
          records: rows,
        },
        null,
        2,
      ),
      "application/json",
    );
  };

  if (!unlocked) {
    return (
      <section className="panel-stack">
        <h2>Synthesis (Admin)</h2>
        <p>Enter facilitator PIN to access synthesis controls.</p>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleUnlock();
          }}
        >
          <input
            type="password"
            inputMode="numeric"
            value={pinAttempt}
            onChange={(event) => {
              setPinAttempt(event.target.value);
              setPinError("");
            }}
            placeholder={`${pinLengthRange.min}-${pinLengthRange.max} digit PIN`}
            maxLength={pinLengthRange.max}
          />
          <button type="submit" className="primary-btn" disabled={unlocking}>
            {unlocking ? "Checking..." : "Unlock"}
          </button>
          {pinError && <p className="error-text">{pinError}</p>}
        </form>
      </section>
    );
  }

  if (revealMode) {
    return (
      <section className="panel-stack reveal-mode-panel">
        <div className="reveal-head">
          <h2>Day 2 Reveal Mode</h2>
          <button type="button" className="secondary-btn" onClick={() => setRevealMode(false)}>
            Exit Reveal
          </button>
        </div>
        <p>What you asked for yesterday → what we built overnight.</p>

        <div className="reveal-columns">
          <article className="quote-card">
            <h3>Top Day 1 Requests</h3>
            <ul className="list-reset reveal-list">
              {p0Candidates.slice(0, 5).map((item) => (
                <li key={item.id}>{item.title}</li>
              ))}
            </ul>
          </article>
          <article className="quote-card">
            <h3>P0 Built Overnight</h3>
            <ul className="list-reset reveal-list">
              {p0Candidates.slice(0, 2).map((item) => (
                <li key={item.id}>{item.title}</li>
              ))}
            </ul>
          </article>
        </div>

        <label className="helper-copy" htmlFor="reveal-narrative">
          Facilitator narrative
        </label>
        <textarea
          id="reveal-narrative"
          rows={4}
          value={revealNarrative}
          onChange={(event) => onRevealNarrativeChange(event.target.value)}
        />
      </section>
    );
  }

  return (
    <section className="panel-stack synthesis-ceremony-panel">
      <header className="synthesis-ceremony-section-head">
        <h2>Synthesis</h2>
      </header>
      <div className="synthesis-ready-row">
        {phaseStatus === "analyzing" && <p className="helper-copy">Analyzing signals... {formatElapsedSeconds(phase1ElapsedMs)}</p>}
        {phaseStatus === "generating" && <p className="helper-copy">Generating output...</p>}
        {(phaseStatus === "idle" || phaseStatus === "complete") && !isGenerating && (
          <p className="synthesis-ready-indicator">
            <span className="synthesis-ready-dot" aria-hidden="true" />
            <span>Ready to generate.</span>
          </p>
        )}
      </div>
      {phaseStatus === "analyzing" && (
        <div className="synthesis-progress-banner is-analyzing">
          <span className="synthesis-spinner" aria-hidden="true" />
          <span>Analyzing signals...</span>
          <strong>{formatElapsedSeconds(phase1ElapsedMs)}</strong>
        </div>
      )}
      {phase1CompletedAt != null && phaseStatus === "generating" && (
        <div className="synthesis-progress-banner is-complete">
          <span>Analysis complete. Generating output...</span>
        </div>
      )}
      {phaseStatus === "generating" && showPhase2Starting && (
        <div className="synthesis-stream-banner is-starting">Starting...</div>
      )}
      {phaseStatus === "generating" && showPhase2Warning && (
        <div className="synthesis-stream-banner is-warning">
          Output is taking longer than expected...
        </div>
      )}
      {phaseStatus === "generating" && showPhase2Stall && (
        <div className="synthesis-stream-banner is-stalled">
          Output generation stalled. Partial output shown above. Copy what was received or try again.
        </div>
      )}
      {streamWarnings.map((warning, index) => (
        <p key={`${warning}-${index}`} className="helper-copy">
          {warning}
        </p>
      ))}
      {streamError && (
        <div className="synthesis-error-banner">
          <p className="error-text">{streamError.message}</p>
          {streamError.actionHref && streamError.actionLabel && (
            <a className="synthesis-error-link" href={streamError.actionHref}>
              {streamError.actionLabel} →
            </a>
          )}
        </div>
      )}
      {macroApplicationLog.length > 0 && (
        <details className="macro-log-panel" open={showMacroLog} onToggle={(event) => setShowMacroLog(event.currentTarget.open)}>
          <summary>
            <span>What the AI was instructed to do</span>
            <span className="synthesis-chevron-icon" aria-hidden="true">
              {showMacroLog ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </summary>
          <ul className="list-reset">
            {macroApplicationLog.map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="synthesis-overview-grid synthesis-ceremony-stats-grid">
        {stats.map((item) => (
          <article key={item.label} className={`overview-stat-card ${statAccentClass(item.label)}`}>
            <p>{item.label}</p>
            <strong>{formatInt(item.value)}</strong>
            <span>{item.subLabel}</span>
          </article>
        ))}
      </div>

      <section className="overview-panel synthesis-ceremony-readiness">
        <h2>Synthesis Readiness</h2>
        <p className="overview-readiness-numbers">
          <strong>{formatInt(totalSignals)}</strong>
          <span>/</span>
          <strong>{formatInt(readinessThreshold)}</strong>
        </p>
        <div className={`overview-readiness-bar ${readinessBarToneClass}`}>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="overview-readiness-warning">
          {formatInt(totalSignals)} signals collected · Threshold: {formatInt(readinessThreshold)}{" "}
          <a className="threshold-link" href="/facilitator/synthesis/parameters">
            Edit in Parameters →
          </a>
        </p>
        {totalSignals < readinessThreshold && (
          <p className="overview-readiness-warning">Signal volume is below recommended threshold. Synthesis quality may be reduced.</p>
        )}
      </section>

      <article
        className={`conflict-panel ${
          competingPerspectivesStatus === "none_detected" ? "is-none" : competingPerspectivesStatus === "detected" ? "is-detected" : "is-neutral"
        }`}
      >
        {competingPerspectivesStatus === "not_analyzed" ? (
          <>
            <strong>Competing perspectives: not yet analysed</strong>
            <p className="helper-copy">Run competing views analysis before synthesis for best results.</p>
            <a className="threshold-link" href={competingViewsHref}>
              Go to Competing views →
            </a>
          </>
        ) : competingPerspectivesStatus === "none_detected" ? (
          <>
            <strong className="synthesis-competing-none-heading">
              <CheckCircle size={14} className="synthesis-competing-check" />
              No competing perspectives detected
            </strong>
            <p className="helper-copy">
              No screens had conflicting positive and negative feedback above current thresholds.
            </p>
            <a className="threshold-link" href={competingViewsHref}>
              View Competing views →
            </a>
          </>
        ) : (
          <>
            <strong>Competing perspectives detected</strong>
            <p className="helper-copy">
              {competingPerspectivesCount} screen(s) have competing perspectives and will be included as context in synthesis.
            </p>
            <a className="threshold-link" href={competingViewsHref}>
              Review in Competing views →
            </a>
          </>
        )}
      </article>

      <details className="macro-panel synthesis-ceremony-macro-panel" open={macroOpen} onToggle={(event) => setMacroOpen(event.currentTarget.open)}>
        <summary>
          <span className="synthesis-macro-trigger-label">Facilitator Prompt Macros</span>
          <span className={`synthesis-chevron-icon synthesis-chevron-right ${macroOpen ? "is-open" : ""}`} aria-hidden="true">
            <ChevronRight size={16} />
          </span>
        </summary>
        <div className="synthesis-macro-run-summary-label">Last run summary</div>
        <div className="synthesis-macro-run-summary">
          <p>
            Active parameters: {activeParametersSummary.length === 0 ? "None" : activeParametersSummary.join(" | ")}
          </p>
          <p>
            {showTimingActuals ? "Last run" : "Estimated synthesis time"} ·{" "}
            {showTimingActuals && timingSnapshot?.generatedAt ? new Date(timingSnapshot.generatedAt).toLocaleTimeString() : "Pre-run estimate"}
          </p>
          <p>
            Phase 1 {formatSeconds(showTimingActuals ? timingSnapshot?.phase1Seconds ?? null : timingEstimate.phase1Seconds)} · Phase 2{" "}
            {formatSeconds(showTimingActuals ? timingSnapshot?.phase2Seconds ?? null : timingEstimate.phase2Seconds)} · Total{" "}
            {formatSeconds(showTimingActuals ? timingSnapshot?.totalSeconds ?? null : timingEstimate.totalSeconds)}
          </p>
        </div>
        <div className="macro-grid">
          <label className="macro-card">
            <span>Upweight app section 2x</span>
            <select
              value={macros.upweightApp ?? ""}
              onChange={(event) =>
                updateMacros({
                  ...macros,
                  upweightApp: (event.target.value || undefined) as MacroState["upweightApp"],
                })
              }
            >
              <option value="">Off</option>
              {SORTED_APP_AREAS.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.label}
                </option>
              ))}
            </select>
          </label>

          <label className="macro-card macro-checkbox-row">
            <span>P0 focus only</span>
            <input
              type="checkbox"
              checked={macros.p0Only}
              onChange={(event) => updateMacros({ ...macros, p0Only: event.target.checked })}
            />
          </label>

          <label className="macro-card">
            <span>Exclude screens below N submissions</span>
            <select
              value={macros.excludeLowSignalBelow ?? ""}
              onChange={(event) =>
                updateMacros({
                  ...macros,
                  excludeLowSignalBelow: event.target.value
                    ? Number(event.target.value)
                    : undefined,
                })
              }
            >
              <option value="">Off</option>
              {[1, 2, 3, 5].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>

          <label className="macro-card macro-checkbox-row">
            <span>Emphasize marketing-safe quotes</span>
            <input
              type="checkbox"
              checked={macros.emphasizeMarketingQuotes}
              onChange={(event) =>
                updateMacros({ ...macros, emphasizeMarketingQuotes: event.target.checked })
              }
            />
          </label>
        </div>
        {macroError && <p className="error-text">{macroError}</p>}
      </details>

      {(phaseStatus === "idle" || phaseStatus === "complete") && (
        <div className="synthesis-generate-actions synthesis-ceremony-cta-row">
          <button
            type="button"
            className="overview-theme-primary-btn"
            onClick={() => void handleGenerate("roadmap")}
            disabled={isGenerating}
          >
            {isGenerating && mode === "roadmap" && <Loader2 size={14} className="synthesis-button-spinner" />}
            {isGenerating && mode === "roadmap" ? "Synthesizing Roadmap..." : "Synthesize Roadmap"}
          </button>
          <button
            type="button"
            className="overview-theme-secondary-btn synthesis-prd-btn"
            onClick={() => void handleGenerate("prd")}
            disabled={isGenerating}
          >
            {isGenerating && mode === "prd" && <Loader2 size={14} className="synthesis-button-spinner" />}
            {isGenerating && mode === "prd" ? "Synthesizing PRD..." : "Synthesize PRD"}
          </button>
        </div>
      )}

      {(phaseStatus === "generating" || phaseStatus === "complete") && (
        <>
          <section className="overview-panel synthesis-ceremony-output-panel">
            {outputSplit.meta && (
              <p className="overview-last-updated synthesis-output-meta">
                {outputSplit.meta}
              </p>
            )}
            <div className="synthesis-output-markdown">
              <ReactMarkdown
                components={{
                  h2: ({ children }) => <h2>{children}</h2>,
                  h3: ({ children }) => <h3>{children}</h3>,
                  p: ({ children }) => <p>{children}</p>,
                  strong: ({ children }) => <strong>{children}</strong>,
                  ul: ({ children }) => <ul>{children}</ul>,
                  li: ({ children }) => <li>{children}</li>,
                }}
              >
                {(outputSplit.body || output || "Output will stream here.").trim()}
              </ReactMarkdown>
            </div>
          </section>
          {phaseStatus === "complete" && (
            <div className="synthesis-output-actions synthesis-ceremony-output-actions">
              <button
                type="button"
                className="overview-theme-secondary-btn synthesis-action-copy"
                onClick={handleCopy}
              >
                {copyState === "copied" ? "Copied ✓" : "Copy output"}
              </button>
              <button
                type="button"
                className="overview-theme-secondary-btn"
                onClick={() => handleExport("csv")}
              >
                Export CSV
              </button>
              <button
                type="button"
                className="overview-theme-secondary-btn"
                onClick={() => handleExport("json")}
              >
                Export JSON
              </button>
              <button
                type="button"
                className="overview-theme-primary-btn"
                onClick={() => setRevealMode(true)}
              >
                Day 2 Reveal
              </button>
              <button
                type="button"
                className="synthesis-clear-btn synthesis-clear-danger"
                onClick={handleClearOutput}
                disabled={!output}
              >
                Clear
              </button>
            </div>
          )}
          {copyState === "failed" && (
            <p className="error-text">Copy failed — use Ctrl+A / Cmd+A to select output manually.</p>
          )}
        </>
      )}
    </section>
  );
});
