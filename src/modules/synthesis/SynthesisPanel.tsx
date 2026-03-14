import { memo, useMemo, useState } from "react";
import { getSynthesisEndpointInfo, streamSynthesis } from "../../services/synthesisService";
import type {
  AppArea,
  ConflictEntry,
  FeatureRequest,
  MacroState,
  SignalSummary,
  SynthesisMode,
} from "../../types/domain";
import type { ExportRecord } from "../../state/useWallState";
import { APP_AREAS } from "../../state/seedData";
import { copyText } from "../../utils/clipboard";

interface SynthesisPanelProps {
  summary: SignalSummary;
  activeApp: AppArea;
  conflicts: ConflictEntry[];
  readinessThreshold: number;
  onReadinessThresholdChange: (next: number) => void;
  mode: SynthesisMode;
  onModeChange: (mode: SynthesisMode) => void;
  unlocked: boolean;
  onUnlock: (pin: string) => boolean;
  pinLengthRange: { min: number; max: number };
  output: string;
  onOutputChange: (next: string) => void;
  buildPromptBody: (macros?: MacroState) => string;
  onClearOutput: () => void;
  exportRecords: () => ExportRecord[];
  revealNarrative: string;
  onRevealNarrativeChange: (next: string) => void;
  featureRequests: FeatureRequest[];
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

export const SynthesisPanel = memo(({
  summary,
  activeApp,
  conflicts,
  readinessThreshold,
  onReadinessThresholdChange,
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
  revealNarrative,
  onRevealNarrativeChange,
  featureRequests,
}: SynthesisPanelProps): JSX.Element => {
  const [pinAttempt, setPinAttempt] = useState("");
  const [pinError, setPinError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
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
      { label: "Feature votes", value: summary.totalFeatureVotes },
      { label: "Screen feedback", value: summary.screenFeedbackCount },
      { label: "Kudos", value: summary.kudosCount },
    ],
    [summary],
  );

  const totalSignals = summary.totalFeatureVotes + summary.screenFeedbackCount + summary.kudosCount;
  const progress = Math.min(totalSignals / readinessThreshold, 1);
  const readinessTone =
    totalSignals >= readinessThreshold ? "ready" : totalSignals >= readinessThreshold - 10 ? "near" : "low";

  const p0Candidates = featureRequests.slice(0, 5);

  const updateMacros = (next: MacroState): void => {
    if (activeMacroCount(next) > 2) {
      setMacroError("Up to two macros can be active at once.");
      return;
    }
    setMacroError("");
    setMacros(next);
  };

  const handleUnlock = (): void => {
    if (!/^\d+$/.test(pinAttempt)) {
      setPinError("PIN must contain only digits.");
      return;
    }
    if (pinAttempt.length < pinLengthRange.min || pinAttempt.length > pinLengthRange.max) {
      setPinError(`PIN must be ${pinLengthRange.min}-${pinLengthRange.max} digits.`);
      return;
    }

    const ok = onUnlock(pinAttempt);
    setPinError(ok ? "" : "Invalid PIN");
    if (ok) {
      setPinAttempt("");
    }
  };

  const handleGenerate = async (): Promise<void> => {
    setIsGenerating(true);
    setCopyState("");
    onOutputChange("");
    let streamedOutput = "";

    try {
      const stream = streamSynthesis({
        mode,
        pin: "unlocked",
        context: {
          summary,
          promptBody: buildPromptBody(macros),
        },
      });

      for await (const chunk of stream) {
        streamedOutput += chunk.token;
        onOutputChange(streamedOutput);
      }
    } catch {
      onOutputChange("Synthesis failed. Check API connectivity and try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (): Promise<void> => {
    const ok = await copyText(output);
    setCopyState(ok ? "copied" : "failed");
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
          event_id: "emerald-2026",
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
        <div className="inline-form">
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
          <button type="button" className="primary-btn" onClick={handleUnlock}>
            Unlock
          </button>
          {pinError && <p className="error-text">{pinError}</p>}
        </div>
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
    <section className="panel-stack">
      <header>
        <h2>Synthesis</h2>
        <p>{getSynthesisEndpointInfo()}</p>
      </header>

      <div className="stats-grid">
        {stats.map((item) => (
          <article key={item.label} className="stat-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>

      <article className={`readiness-gate is-${readinessTone}`}>
        <div className="readiness-head">
          <strong>Synthesis Readiness</strong>
          <span>
            {totalSignals}/{readinessThreshold}
          </span>
        </div>
        <div className="readiness-track">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="helper-copy">
          {summary.screenFeedbackCount} screen items · {summary.totalFeatureVotes} feature votes · {summary.kudosCount} kudos
        </p>
        {totalSignals < readinessThreshold && (
          <p className="error-text">
            Signal volume is below recommended threshold. Synthesis quality may be reduced.
          </p>
        )}
        <label className="threshold-row">
          <span>Threshold</span>
          <input
            type="number"
            min={10}
            max={80}
            value={readinessThreshold}
            onChange={(event) => onReadinessThresholdChange(Number(event.target.value) || 30)}
          />
        </label>
      </article>

      <article className="conflict-panel">
        <strong>Competing Perspectives Detected</strong>
        <p className="helper-copy">Included in synthesis context automatically.</p>
        {conflicts.length === 0 ? (
          <p className="helper-copy">No conflicting sentiment patterns yet.</p>
        ) : (
          <ul className="list-reset">
            {conflicts.slice(0, 5).map((entry) => (
              <li key={entry.screenId} className="conflict-row">
                <span>{entry.screenName}</span>
                <span>
                  +{entry.positiveCount} / -{entry.negativeCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>

      <details className="macro-panel" open={macroOpen} onToggle={(event) => setMacroOpen(event.currentTarget.open)}>
        <summary>Facilitator Prompt Macros</summary>
        <div className="macro-grid">
          <label className="macro-card">
            <span>Upweight app section 2x</span>
            <select
              value={macros.upweightApp ?? ""}
              onChange={(event) =>
                updateMacros({
                  ...macros,
                  upweightApp: (event.target.value || undefined) as AppArea | undefined,
                })
              }
            >
              <option value="">Off</option>
              {APP_AREAS.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.label}
                </option>
              ))}
            </select>
          </label>

          <label className="macro-card checkbox-row">
            <input
              type="checkbox"
              checked={macros.p0Only}
              onChange={(event) => updateMacros({ ...macros, p0Only: event.target.checked })}
            />
            <span>P0 focus only</span>
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

          <label className="macro-card checkbox-row">
            <input
              type="checkbox"
              checked={macros.emphasizeMarketingQuotes}
              onChange={(event) =>
                updateMacros({ ...macros, emphasizeMarketingQuotes: event.target.checked })
              }
            />
            <span>Emphasize marketing-safe quotes</span>
          </label>
        </div>
        {macroError && <p className="error-text">{macroError}</p>}
        <p className="helper-copy">Active macros: {activeMacroCount(macros)} / 2 · upweight default app: {activeApp}</p>
      </details>

      <div className="mode-toggle">
        <button
          type="button"
          className={mode === "roadmap" ? "is-active" : ""}
          onClick={() => onModeChange("roadmap")}
        >
          Roadmap
        </button>
        <button
          type="button"
          className={mode === "prd" ? "is-active" : ""}
          onClick={() => onModeChange("prd")}
        >
          PRD
        </button>
      </div>

      <div className="feedback-actions">
        <button type="button" className="primary-btn" onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? "Generating..." : "Generate"}
        </button>
        <button type="button" className="secondary-btn" onClick={handleCopy}>
          Copy Output
        </button>
        <button type="button" className="secondary-btn" onClick={onClearOutput} disabled={!output}>
          Clear
        </button>
        <button type="button" className="secondary-btn" onClick={() => handleExport("csv")}>
          Export CSV
        </button>
        <button type="button" className="secondary-btn" onClick={() => handleExport("json")}>
          Export JSON
        </button>
        <button type="button" className="secondary-btn" onClick={() => setRevealMode(true)}>
          Day 2 Reveal
        </button>
      </div>
      {copyState === "copied" && <p className="helper-copy">Output copied to clipboard.</p>}
      {copyState === "failed" && <p className="error-text">Copy failed on this browser.</p>}

      <pre className="synthesis-output">{output || "Output will stream here."}</pre>
    </section>
  );
});
