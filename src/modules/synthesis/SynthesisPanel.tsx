import { useMemo, useState } from "react";
import { getSynthesisEndpointInfo, streamSynthesis } from "../../services/synthesisService";
import type { SignalSummary, SynthesisMode } from "../../types/domain";
import { copyText } from "../../utils/clipboard";

interface SynthesisPanelProps {
  summary: SignalSummary;
  mode: SynthesisMode;
  onModeChange: (mode: SynthesisMode) => void;
  unlocked: boolean;
  onUnlock: (pin: string) => boolean;
  pinLengthRange: { min: number; max: number };
  output: string;
  onOutputChange: (next: string) => void;
  buildPromptBody: () => string;
  onClearOutput: () => void;
}

export const SynthesisPanel = ({
  summary,
  mode,
  onModeChange,
  unlocked,
  onUnlock,
  pinLengthRange,
  output,
  onOutputChange,
  buildPromptBody,
  onClearOutput,
}: SynthesisPanelProps): JSX.Element => {
  const [pinAttempt, setPinAttempt] = useState("");
  const [pinError, setPinError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copyState, setCopyState] = useState<"" | "copied" | "failed">("");

  const stats = useMemo(
    () => [
      { label: "Feature votes", value: summary.totalFeatureVotes },
      { label: "Screen feedback", value: summary.screenFeedbackCount },
      { label: "Kudos", value: summary.kudosCount },
    ],
    [summary],
  );

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
          promptBody: buildPromptBody(),
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
      </div>
      {copyState === "copied" && <p className="helper-copy">Output copied to clipboard.</p>}
      {copyState === "failed" && <p className="error-text">Copy failed on this browser.</p>}

      <pre className="synthesis-output">{output || "Output will stream here."}</pre>
    </section>
  );
};
