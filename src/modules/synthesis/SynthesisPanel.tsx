import { memo, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { runSynthesis } from "../../synthesis/synthesisRunner";
import type {
  MacroState,
  SignalSummary,
  SynthesisMode,
} from "../../types/domain";
import type { Cap11ExportRecord } from "../../services/synthesisModuleApi";
import { copyText } from "../../utils/clipboard";
import type { ThemeSnapshot } from "../../themeSnapshots/types";
import { synthesisModuleApi, type Phase1Analysis, type SynthesisHistoryRecord } from "../../services/synthesisModuleApi";
import { exportSynthesisOutputDocx } from "../../synthesis/exportDocx";

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
  exportRecords: () => Promise<Cap11ExportRecord[]>;
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
  revealNarrative?: string;
  onRevealNarrativeChange?: (next: string) => void;
  featureRequests?: { id: string | number; title: string }[];
  onSynthesisStart: () => void;
  onSynthesisComplete: () => void;
}

const CSV_HEADERS = [
  "type",
  "id",
  "created_at",
  "app_section",
  "screen_name",
  "feedback_type",
  "title",
  "text",
  "votes",
  "workflow_context",
  "role",
  "consent_public",
  "reaction",
  "tier",
  "origin",
  "status",
] as const;
type CsvHeader = typeof CSV_HEADERS[number];

const csvValue = (row: Cap11ExportRecord, header: CsvHeader): string => {
  switch (header) {
    case "type":
      return String(row.type ?? "");
    case "id":
      return row.id == null ? "" : String(row.id);
    case "created_at":
      return row.created_at ? String(row.created_at) : "";
    case "app_section":
      return row.app_section == null ? "" : String(row.app_section);
    case "screen_name":
      return row.screen_name == null ? "" : String(row.screen_name);
    case "feedback_type":
      return row.feedback_type == null ? "" : String(row.feedback_type);
    case "title":
      if (row.type === "card_sort") return row.concept_title == null ? "" : String(row.concept_title);
      return row.title == null ? "" : String(row.title);
    case "text":
      if (row.type === "feature_request") return row.description == null ? "" : String(row.description);
      return row.text == null ? "" : String(row.text);
    case "votes":
      return typeof row.votes === "number" && Number.isFinite(row.votes) ? String(row.votes) : "";
    case "workflow_context":
      return row.workflow_context == null ? "" : String(row.workflow_context);
    case "role":
      return row.role == null ? "" : String(row.role);
    case "consent_public":
      return typeof row.consent_public === "boolean" ? String(row.consent_public) : "";
    case "reaction":
      return row.reaction == null ? "" : String(row.reaction);
    case "tier":
      return row.tier == null ? "" : String(row.tier);
    case "origin":
      return row.origin == null ? "" : String(row.origin);
    case "status":
      return row.status == null ? "" : String(row.status);
    default:
      return "";
  }
};

const escapeCsv = (value: string): string => {
  const flattened = String(value ?? "").replace(/\r?\n|\r/gu, " ");
  if (/[",\n\r]/u.test(flattened)) {
    return `"${flattened.replaceAll('"', '""')}"`;
  }
  return flattened;
};

const serializeCsv = (rows: Cap11ExportRecord[]): string => {
  const headers = [
    ...CSV_HEADERS,
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(csvValue(row, header as CsvHeader))).join(",")),
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

const PROTOTYPE_DISCLAIMER =
  "All items above are prototype recommendations derived from event feedback. No production commitments are implied.";
const RUN_HISTORY_PAGE_SIZE = 5;

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

const buildHistoryExcerpt = (value: string): string => {
  const body = splitOutputHeader(value).body;
  const flattened = body.replace(/\s+/gu, " ").trim();
  if (!flattened) return "Generated output";
  if (flattened.length <= 140) return flattened;
  return `${flattened.slice(0, 139)}…`;
};

const formatHistoryTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatHistoryCardTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).replace(",", " ·");
};

const makeHistoryExportStamp = (value: string): string => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return new Date().toISOString().slice(0, 16).replace("T", "-").replaceAll(":", "-");
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}-${h}-${min}`;
};

const isAnalyzingWarning = (value: string): boolean => /^\s*Analyzing signals/i.test(String(value ?? "").trim());

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
  exportRecords,
  activeParametersSummary = [],
  exportMetadata,
  timingMetadata,
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
  const [docxExportState, setDocxExportState] = useState<"" | "exporting" | "success" | "error">("");
  const [docxExportMessage, setDocxExportMessage] = useState("");
  const [historyRecords, setHistoryRecords] = useState<SynthesisHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyViewerRecord, setHistoryViewerRecord] = useState<SynthesisHistoryRecord | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyViewerDocxState, setHistoryViewerDocxState] = useState<"" | "exporting" | "success" | "error">("");
  const [historyViewerMessage, setHistoryViewerMessage] = useState("");
  const [parametersState, setParametersState] = useState<{
    excludeBelowN: number | null;
    upweightSection: string | null;
    upweightMultiplier: number;
    p0FocusOnly: boolean;
    emphasiseQuotes: boolean;
  } | null>(null);

  const stats = useMemo(
    () => [
      { label: "Feature Requests", value: summary.totalFeatureVotes },
      { label: "Comments", value: summary.kudosCount },
      { label: "Screen Feedback", value: summary.screenFeedbackCount },
    ],
    [summary],
  );

  const totalSignals = summary.totalFeatureVotes + summary.screenFeedbackCount + summary.kudosCount;
  const progress = Math.min(totalSignals / readinessThreshold, 1);
  const readinessTone =
    totalSignals >= readinessThreshold ? "ready" : totalSignals >= readinessThreshold - 10 ? "near" : "low";
  const readinessBarToneClass =
    readinessTone === "ready" ? "is-good" : readinessTone === "near" ? "is-near" : "is-low";
  const effectiveMacros = useMemo<MacroState>(() => ({
    upweightApp: parametersState?.upweightSection ? parametersState.upweightSection as MacroState["upweightApp"] : undefined,
    p0Only: Boolean(parametersState?.p0FocusOnly),
    excludeLowSignalBelow: typeof parametersState?.excludeBelowN === "number" ? parametersState.excludeBelowN : undefined,
    emphasizeMarketingQuotes: Boolean(parametersState?.emphasiseQuotes),
  }), [parametersState]);
  const timingSnapshot = timingMetadata ?? lastRunTiming;
  const phase1ElapsedMs = phase1StartedAt == null ? null : (phase1CompletedAt ?? clockNow) - phase1StartedAt;
  const phase2WaitingMs = phase2StartedAt == null || firstPhase2TokenAt != null ? null : clockNow - phase2StartedAt;
  const showPhase2Starting = phase2WaitingMs != null && phase2WaitingMs >= 3000 && phase2WaitingMs < 10000;
  const showPhase2Warning = phase2WaitingMs != null && phase2WaitingMs >= 10000 && phase2WaitingMs < 60000;
  const showPhase2Stall = phase2WaitingMs != null && phase2WaitingMs >= 60000;
  const visibleStreamWarnings = streamWarnings.filter((warning) => !isAnalyzingWarning(warning));

  const competingViewsHref = "/facilitator/synthesis/competing-views";
  const outputSplit = useMemo(() => splitOutputHeader(output), [output]);
  const totalHistoryPages = Math.max(1, Math.ceil(historyRecords.length / RUN_HISTORY_PAGE_SIZE));
  const clampedHistoryPage = Math.min(historyPage, totalHistoryPages);
  const visibleRunHistory = useMemo(() => {
    const start = (clampedHistoryPage - 1) * RUN_HISTORY_PAGE_SIZE;
    return historyRecords.slice(start, start + RUN_HISTORY_PAGE_SIZE);
  }, [clampedHistoryPage, historyRecords]);
  const lastHistoryRecord = historyRecords[0] ?? null;
  const hasOutput = Boolean(String(output ?? "").trim());
  const outputModeBadge = mode === "prd" ? "PRD" : "ROADMAP";
  const macroSummaryText = activeParametersSummary.length > 0 ? activeParametersSummary.join(" | ") : "none";
  const historyPreviewLine = lastHistoryRecord ? buildHistoryExcerpt(lastHistoryRecord.output) : "No synthesis run yet.";
  const macroTiles = useMemo(
    () => [
      { label: "Upweight section 2×", active: Boolean(parametersState?.upweightSection) && Number(parametersState?.upweightMultiplier ?? 1) > 1 },
      { label: "P0 focus only", active: Boolean(parametersState?.p0FocusOnly) },
      { label: "Exclude below N", active: typeof parametersState?.excludeBelowN === "number" },
      { label: "Emphasise quotes", active: Boolean(parametersState?.emphasiseQuotes) },
    ],
    [parametersState],
  );
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
    if (docxExportState !== "success" && docxExportState !== "error") return;
    const timeout = window.setTimeout(() => {
      setDocxExportState("");
      setDocxExportMessage("");
    }, 2400);
    return () => window.clearTimeout(timeout);
  }, [docxExportState]);

  useEffect(() => {
    if (historyViewerDocxState !== "success" && historyViewerDocxState !== "error") return;
    const timeout = window.setTimeout(() => {
      setHistoryViewerDocxState("");
      setHistoryViewerMessage("");
    }, 2400);
    return () => window.clearTimeout(timeout);
  }, [historyViewerDocxState]);

  useEffect(() => {
    setHistoryPage((current) => Math.max(1, Math.min(current, totalHistoryPages)));
  }, [totalHistoryPages]);

  useEffect(() => {
    if (!unlocked) return;
    setHistoryLoading(true);
    void synthesisModuleApi
      .getSynthesisHistory()
      .then((payload) => {
        setHistoryRecords(Array.isArray(payload.records) ? payload.records : []);
      })
      .catch(() => {
        setHistoryRecords([]);
      })
      .finally(() => setHistoryLoading(false));
    void synthesisModuleApi
      .getSynthesisParameters()
      .then((payload) => {
        setParametersState({
          excludeBelowN: payload.parameters.excludeBelowN,
          upweightSection: payload.parameters.upweightSection,
          upweightMultiplier: payload.parameters.upweightMultiplier,
          p0FocusOnly: payload.parameters.p0FocusOnly,
          emphasiseQuotes: payload.parameters.emphasiseQuotes,
        });
      })
      .catch(() => {
        setParametersState(null);
      });
  }, [unlocked]);

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

  const refreshHistory = async (): Promise<void> => {
    const payload = await synthesisModuleApi.getSynthesisHistory();
    setHistoryRecords(Array.isArray(payload.records) ? payload.records : []);
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
    const macrosAtStart = { ...effectiveMacros };
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
      if (runCompleted) {
        void refreshHistory().catch(() => undefined);
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

  const handleExportOutput = async (): Promise<void> => {
    if (!String(output ?? "").trim() || docxExportState === "exporting") return;
    setDocxExportState("exporting");
    setDocxExportMessage("");
    try {
      const result = await exportSynthesisOutputDocx({
        markdown: output,
        mode,
        eventName: exportMetadata?.eventName,
        eventSlug: exportMetadata?.eventSlug,
      });
      setDocxExportState("success");
      setDocxExportMessage(`Downloaded ${result.filename}`);
    } catch {
      setDocxExportState("error");
      setDocxExportMessage("Export failed. Try copying the output instead.");
    }
  };

  const handleExport = async (format: "csv" | "json"): Promise<void> => {
    if (!window.confirm("Export data now? This strips session identifiers and keeps consent flags.")) {
      return;
    }
    let rows: Cap11ExportRecord[] = [];
    try {
      rows = await exportRecords();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to build export records.";
      window.alert(`Export failed: ${message}`);
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
    const modePart = mode === "prd" ? "prd" : "roadmap";
    const baseName = `emerald-synthesis-${modePart}-${stamp}`;
    if (format === "csv") {
      downloadText(`${baseName}.csv`, serializeCsv(rows), "text/csv");
      return;
    }
    downloadText(
      `${baseName}.json`,
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

  const handleOpenHistoryRecord = async (id: string): Promise<void> => {
    try {
      const payload = await synthesisModuleApi.getSynthesisHistoryRecord(id);
      setHistoryViewerRecord(payload.record);
    } catch {
      // Ignore failures and keep modal open.
    }
  };

  const handleRevealFromHistory = async (record: SynthesisHistoryRecord): Promise<void> => {
    const when = formatHistoryCardTimestamp(record.generatedAt);
    const confirmed = window.confirm(
      `This will load P0 items from the ${when} synthesis run into the Day 2 reveal screen. Continue?`,
    );
    if (!confirmed) return;
    try {
      await synthesisModuleApi.saveLatestPhase1Analysis((record.phase1Analysis ?? {}) as Phase1Analysis);
      window.location.assign("/facilitator/day2-reveal");
    } catch {
      window.alert("Unable to load this historical run into Day 2 reveal.");
    }
  };

  const exportHistoryRecord = async (record: SynthesisHistoryRecord, format: "csv" | "json"): Promise<void> => {
    let rows: Cap11ExportRecord[] = [];
    try {
      rows = (await exportRecords()) ?? [];
    } catch {
      rows = [];
    }
    const stamp = makeHistoryExportStamp(record.generatedAt);
    const filenameBase = `emerald-synthesis-${record.outputMode}-${stamp}`;
    if (format === "csv") {
      const note = "Signal data reflects current event store state, not state at time of this synthesis run.";
      const csv = `${note}\n${serializeCsv(rows)}`;
      downloadText(`${filenameBase}.csv`, csv, "text/csv");
      return;
    }
    downloadText(
      `${filenameBase}.json`,
      JSON.stringify(
        {
          generated_at: record.generatedAt,
          event_id: exportMetadata?.eventSlug || "emerald-2026",
          event_name: exportMetadata?.eventName || "Event name not set",
          event_slug: exportMetadata?.eventSlug || "emerald-2026",
          output_mode: record.outputMode,
          macros_active: record.macrosActive || "none",
          note: "Signal data reflects current event store state, not state at time of this synthesis run.",
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

  return (
    <section className="synthesis-run-v2">
      <aside className="synthesis-run-v2-left">
        <div className="synthesis-run-v2-left-scroll">
          <section className="synthesis-run-v2-card">
            <h3>Signal summary</h3>
            <div className="synthesis-run-v2-metrics-grid">
              {stats.map((item) => (
                <article key={item.label} className={`synthesis-run-v2-metric-card ${statAccentClass(item.label)}`}>
                  <p>{item.label}</p>
                  <strong>{formatInt(item.value)}</strong>
                </article>
              ))}
            </div>
            <div className="synthesis-run-v2-readiness-head">
              <span>Synthesis readiness</span>
              <strong>{formatInt(totalSignals)} / {formatInt(readinessThreshold)}</strong>
            </div>
            <div className={`overview-readiness-bar ${readinessBarToneClass}`}>
              <div style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="helper-copy">
              {formatInt(totalSignals)} signals · threshold: {formatInt(readinessThreshold)} ·{" "}
              <a className="threshold-link" href="/facilitator/synthesis/parameters">Edit in parameters →</a>
            </p>
          </section>

          <section className={`synthesis-run-v2-card conflict-panel ${
            competingPerspectivesStatus === "none_detected" ? "is-none" : competingPerspectivesStatus === "detected" ? "is-detected" : "is-neutral"
          }`}>
            {competingPerspectivesCount > 0 ? (
              <>
                <strong>{competingPerspectivesCount} competing perspectives detected</strong>
                <p className="helper-copy">
                  {competingPerspectivesCount} screens have conflicting positive and negative feedback — included as context in synthesis.
                </p>
              </>
            ) : (
              <p className="helper-copy">No competing perspectives detected</p>
            )}
            <a className="threshold-link" href={competingViewsHref}>Review in competing views →</a>
          </section>

          <section className="synthesis-run-v2-card">
            <h3>Facilitator prompt macros</h3>
            <div className="synthesis-run-v2-macro-grid">
              {macroTiles.map((tile) => (
                <article key={tile.label} className="synthesis-run-v2-macro-tile">
                  <span>{tile.label}</span>
                  <strong className={tile.active ? "is-on" : "is-off"}>{tile.active ? "On" : "Off"}</strong>
                </article>
              ))}
            </div>
            <p className="helper-copy">Active macro count: {macroTiles.filter((tile) => tile.active).length}</p>
            <p className="helper-copy">
              {activeParametersSummary.length === 0 ? "No parameters active — default synthesis" : activeParametersSummary.join(" | ")}
            </p>
            <a className="threshold-link" href="/facilitator/synthesis/parameters">Edit in parameters →</a>
          </section>
        </div>
        <div className="synthesis-run-v2-left-actions">
          <button
            type="button"
            className="overview-theme-primary-btn"
            onClick={() => void handleGenerate("roadmap")}
            disabled={isGenerating}
          >
            {isGenerating && mode === "roadmap" && <Loader2 size={14} className="synthesis-button-spinner" />}
            {isGenerating && mode === "roadmap" ? "Synthesizing roadmap..." : "Synthesize roadmap"}
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
      </aside>

      <section className="synthesis-run-v2-right">
        <header className="synthesis-run-v2-output-header">
          <div className="synthesis-run-v2-output-header-meta">
            <span className="synthesis-run-v2-mode-badge">{outputModeBadge}</span>
            <span>{outputSplit.meta ?? (timingSnapshot?.generatedAt ? `Generated ${formatHistoryTimestamp(timingSnapshot.generatedAt)}` : "No output generated yet")}</span>
            <span>Macros active: {macroSummaryText}</span>
          </div>
          <div className="synthesis-run-v2-output-actions">
            <button type="button" className="overview-theme-secondary-btn" onClick={handleCopy} disabled={!hasOutput}>
              {copyState === "copied" ? "Copied ✓" : "Copy output"}
            </button>
            <button
              type="button"
              className="overview-theme-secondary-btn"
              onClick={() => void handleExportOutput()}
              disabled={!hasOutput || docxExportState === "exporting"}
            >
              {docxExportState === "exporting" ? "Exporting..." : "Export docx"}
            </button>
            <button type="button" className="overview-theme-secondary-btn" onClick={() => void handleExport("csv")} disabled={!hasOutput}>Export CSV</button>
            <button type="button" className="overview-theme-secondary-btn" onClick={() => void handleExport("json")} disabled={!hasOutput}>Export JSON</button>
            <button
              type="button"
              className="overview-theme-primary-btn"
              onClick={() => window.location.assign("/facilitator/day2-reveal")}
              disabled={!hasOutput}
            >
              Day 2 reveal →
            </button>
          </div>
        </header>

        <div className="synthesis-run-v2-history-bar">
          <span>Last run</span>
          <p title={historyPreviewLine}>{historyPreviewLine}</p>
          <button type="button" className="threshold-link" onClick={() => setHistoryModalOpen(true)}>
            History ({historyRecords.length}) →
          </button>
        </div>

        <section className="synthesis-run-v2-output-body">
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
            <div className="synthesis-stream-banner is-warning">Output is taking longer than expected...</div>
          )}
          {phaseStatus === "generating" && showPhase2Stall && (
            <div className="synthesis-stream-banner is-stalled">
              Output generation stalled. Partial output shown above. Copy what was received or try again.
            </div>
          )}
          {visibleStreamWarnings.map((warning, index) => (
            <p key={`${warning}-${index}`} className="helper-copy">{warning}</p>
          ))}
          {streamError && (
            <div className="synthesis-error-banner">
              <p className="error-text">{streamError.message}</p>
              {streamError.actionHref && streamError.actionLabel && (
                <a className="synthesis-error-link" href={streamError.actionHref}>{streamError.actionLabel} →</a>
              )}
            </div>
          )}
          {macroApplicationLog.length > 0 && (
            <details className="macro-log-panel" open={showMacroLog} onToggle={(event) => setShowMacroLog(event.currentTarget.open)}>
              <summary><span>What the AI was instructed to do</span></summary>
              <ul className="list-reset">
                {macroApplicationLog.map((line, index) => (
                  <li key={`${line}-${index}`}>{line}</li>
                ))}
              </ul>
            </details>
          )}

          {!hasOutput ? (
            <div className="synthesis-run-v2-empty">
              {isGenerating ? (
                <>
                  <strong>Synthesizing ...</strong>
                  <p>Please wait while output is generated.</p>
                </>
              ) : (
                <>
                  <strong>Run synthesis to generate output</strong>
                  <p>Results will appear here</p>
                </>
              )}
            </div>
          ) : (
            <div className="synthesis-output-markdown">
              <ReactMarkdown
                components={{
                  h2: ({ children }) => <h2>{children}</h2>,
                  h3: ({ children }) => <h3>{children}</h3>,
                  p: ({ children }) => <p>{children}</p>,
                  strong: ({ children }) => <strong>{children}</strong>,
                  blockquote: ({ children }) => <blockquote>{children}</blockquote>,
                  ul: ({ children }) => <ul>{children}</ul>,
                  li: ({ children }) => <li>{children}</li>,
                }}
              >
                {(outputSplit.body || output).trim()}
              </ReactMarkdown>
            </div>
          )}
          {copyState === "failed" && <p className="error-text">Copy failed — use Cmd+A/Ctrl+A and copy manually.</p>}
          {docxExportState === "success" && docxExportMessage && <p className="helper-copy">{docxExportMessage}</p>}
          {docxExportState === "error" && docxExportMessage && <p className="error-text">{docxExportMessage}</p>}
        </section>
      </section>

      {historyModalOpen && (
        <div className="synthesis-history-modal-overlay" onClick={() => setHistoryModalOpen(false)}>
          <div className="synthesis-history-modal" onClick={(event) => event.stopPropagation()}>
            <header className="synthesis-history-modal-head">
              <div>
                <h3>Generated outputs history</h3>
                <p>{historyRecords.length} runs total</p>
              </div>
              <button type="button" className="secondary-btn" onClick={() => setHistoryModalOpen(false)}>×</button>
            </header>
            <div className="synthesis-history-modal-body">
              {historyLoading ? (
                <p className="helper-copy">Loading history…</p>
              ) : visibleRunHistory.length === 0 ? (
                <p className="helper-copy">No synthesis runs yet. Run synthesis to see history here.</p>
              ) : (
                <ul className="list-reset synthesis-history-card-list">
                  {visibleRunHistory.map((record) => (
                    <li key={record.id} className={`synthesis-history-card ${record.outputMode === "prd" ? "is-prd" : "is-roadmap"}`}>
                      <div className="synthesis-history-card-row">
                        <strong>{record.outputMode === "prd" ? "PRD" : "ROADMAP"}</strong>
                        <span>{formatHistoryCardTimestamp(record.generatedAt)}</span>
                      </div>
                      <p className="helper-copy">Macros: {record.macrosActive || "none"}</p>
                      <p>{buildHistoryExcerpt(record.output)}</p>
                      <button type="button" className="threshold-link" onClick={() => void handleOpenHistoryRecord(record.id)}>
                        View full output →
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <footer className="synthesis-history-modal-pagination">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
                disabled={clampedHistoryPage <= 1}
              >
                Previous
              </button>
              <span>Page {clampedHistoryPage} of {totalHistoryPages}</span>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setHistoryPage((current) => Math.min(totalHistoryPages, current + 1))}
                disabled={clampedHistoryPage >= totalHistoryPages}
              >
                Next
              </button>
            </footer>
          </div>
        </div>
      )}

      {historyViewerRecord && (
        <div className="synthesis-history-viewer">
          <header className="synthesis-history-viewer-head">
            <button type="button" className="secondary-btn" onClick={() => setHistoryViewerRecord(null)}>← Back to history</button>
            <div className="synthesis-history-viewer-meta">
              <span className="synthesis-run-v2-mode-badge">{historyViewerRecord.outputMode === "prd" ? "PRD" : "ROADMAP"}</span>
              <span>Generated {formatHistoryCardTimestamp(historyViewerRecord.generatedAt)}</span>
            </div>
            <div className="synthesis-history-viewer-actions">
              <button type="button" className="overview-theme-secondary-btn" onClick={() => void copyText(historyViewerRecord.output)}>Copy output</button>
              <button
                type="button"
                className="overview-theme-secondary-btn"
                onClick={() => {
                  setHistoryViewerDocxState("exporting");
                  setHistoryViewerMessage("");
                  void exportSynthesisOutputDocx({
                    markdown: historyViewerRecord.output,
                    mode: historyViewerRecord.outputMode,
                    eventName: exportMetadata?.eventName,
                    eventSlug: exportMetadata?.eventSlug,
                    generatedAt: historyViewerRecord.generatedAt,
                  }).then((result) => {
                    setHistoryViewerDocxState("success");
                    setHistoryViewerMessage(`Downloaded ${result.filename}`);
                  }).catch(() => {
                    setHistoryViewerDocxState("error");
                    setHistoryViewerMessage("Export failed. Try copying the output instead.");
                  });
                }}
                disabled={historyViewerDocxState === "exporting"}
              >
                {historyViewerDocxState === "exporting" ? "Exporting..." : "Export docx"}
              </button>
              <button type="button" className="overview-theme-secondary-btn" onClick={() => void exportHistoryRecord(historyViewerRecord, "csv")}>Export CSV</button>
              <button type="button" className="overview-theme-secondary-btn" onClick={() => void exportHistoryRecord(historyViewerRecord, "json")}>Export JSON</button>
              <button type="button" className="overview-theme-primary-btn" onClick={() => void handleRevealFromHistory(historyViewerRecord)}>Day 2 reveal →</button>
            </div>
          </header>
          <div className="synthesis-history-viewer-body">
            <div className="synthesis-output-markdown">
              <ReactMarkdown
                components={{
                  h2: ({ children }) => <h2>{children}</h2>,
                  h3: ({ children }) => <h3>{children}</h3>,
                  p: ({ children }) => <p>{children}</p>,
                  strong: ({ children }) => <strong>{children}</strong>,
                  blockquote: ({ children }) => <blockquote>{children}</blockquote>,
                  ul: ({ children }) => <ul>{children}</ul>,
                  li: ({ children }) => <li>{children}</li>,
                }}
              >
                {(splitOutputHeader(historyViewerRecord.output).body || historyViewerRecord.output).trim()}
              </ReactMarkdown>
            </div>
            {historyViewerMessage && (
              <p className={historyViewerDocxState === "error" ? "error-text" : "helper-copy"}>{historyViewerMessage}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
});
