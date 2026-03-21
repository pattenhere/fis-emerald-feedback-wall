import { aiCall, AICallError } from "../api/aiCall";
import { AI_PROVIDER_CONFIG } from "../config/aiProvider";
import { dataApi } from "../services/dataApi";
import { synthesisModuleApi, type Phase1Analysis, type SynthesisMetadata } from "../services/synthesisModuleApi";
import {
  SynthesisValidationError,
  applyExclusionFilter,
  applyUpweighting,
  computeAggregates,
  detectCompetingPerspectives,
  partitionKudos,
  validateMacros,
} from "./preprocessor";
import {
  SYNTHESIS_SYSTEM_PROMPT,
  applyTokenGuard,
  buildCompetingPerspectivesBlock,
  buildFeatureRequestsBlock,
  buildKudosBlocks,
  buildMacroInstructionsBlock,
  buildScreenFeedbackBlock,
  buildSignalSummaryBlock,
  estimateTokenCount,
} from "./promptAssembler";

export type SynthesisErrorCode = "ERR-01" | "ERR-02" | "ERR-03" | "ERR-04" | "ERR-05" | "ERR-06";
export type SynthesisError = { code: SynthesisErrorCode; message: string; details?: string };

const PHASE1_SCHEMA_TEXT = `{
  "p0Items":[{"title":"string","rationale":"string","evidenceSources":["string"],"feasibilityNote":"string","conflictContext":"string|null","roleContext":"string|null"}],
  "p1Items":[{"title":"string","rationale":"string","signalCount":0}],
  "p2Themes":[{"theme":"string","description":"string"}],
  "crossCuttingInsights":[{"insight":"string","rolesAffected":["string"]|null,"screenCount":0}],
  "selectedQuotes":[{"text":"string","role":"string|null"}],
  "competingPerspectivesNotes":[{"screenName":"string","interpretation":"string","recommendation":"string"}],
  "macroApplicationLog":["string"]
}`;

const DEFAULT_PHASE1_TIMEOUT_MS = 180_000;

const resolvePhase1TimeoutMs = () => {
  const raw = Number(import.meta.env.VITE_SYNTHESIS_PHASE1_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_PHASE1_TIMEOUT_MS;
  return Math.floor(raw);
};

const parseJson = (value: string): unknown => {
  const text = String(value ?? "").trim();
  if (!text) throw new Error("Empty JSON.");
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text.replace(/^```json\s*/iu, "").replace(/^```\s*/u, "").replace(/\s*```$/u, "");
    return JSON.parse(stripped);
  }
};

const toPhase1Analysis = (input: unknown): Phase1Analysis => {
  const row = input as Partial<Phase1Analysis>;
  if (!row || typeof row !== "object" || !Array.isArray(row.p0Items)) {
    throw new Error("Phase 1 analysis has invalid structure.");
  }
  return {
    p0Items: row.p0Items.map((item) => ({
      title: String(item?.title ?? "").trim(),
      rationale: String(item?.rationale ?? "").trim(),
      evidenceSources: Array.isArray(item?.evidenceSources)
        ? item.evidenceSources.map((entry) => String(entry ?? "").trim()).filter(Boolean)
        : [],
      feasibilityNote: String(item?.feasibilityNote ?? "").trim(),
      conflictContext: item?.conflictContext == null ? null : String(item.conflictContext),
      roleContext: item?.roleContext == null ? null : String(item.roleContext),
    })),
    p1Items: Array.isArray(row.p1Items)
      ? row.p1Items.map((item) => ({
          title: String(item?.title ?? "").trim(),
          rationale: String(item?.rationale ?? "").trim(),
          signalCount: Math.max(0, Number(item?.signalCount ?? 0)),
        }))
      : [],
    p2Themes: Array.isArray(row.p2Themes)
      ? row.p2Themes.map((item) => ({
          theme: String(item?.theme ?? "").trim(),
          description: String(item?.description ?? "").trim(),
        }))
      : [],
    crossCuttingInsights: Array.isArray(row.crossCuttingInsights)
      ? row.crossCuttingInsights.map((item) => ({
          insight: String(item?.insight ?? "").trim(),
          rolesAffected: Array.isArray(item?.rolesAffected)
            ? item.rolesAffected.map((role) => String(role ?? "").trim()).filter(Boolean)
            : null,
          screenCount: Math.max(0, Number(item?.screenCount ?? 0)),
        }))
      : [],
    selectedQuotes: Array.isArray(row.selectedQuotes)
      ? row.selectedQuotes.map((item) => ({
          text: String(item?.text ?? "").trim(),
          role: item?.role == null ? null : String(item.role),
        }))
      : [],
    competingPerspectivesNotes: Array.isArray(row.competingPerspectivesNotes)
      ? row.competingPerspectivesNotes.map((item) => ({
          screenName: String(item?.screenName ?? "").trim(),
          interpretation: String(item?.interpretation ?? "").trim(),
          recommendation: String(item?.recommendation ?? "").trim(),
        }))
      : [],
    macroApplicationLog: Array.isArray(row.macroApplicationLog)
      ? row.macroApplicationLog.map((entry) => String(entry ?? "").trim()).filter(Boolean)
      : [],
  };
};

const buildPhase2Prompt = (
  mode: "roadmap" | "prd",
  phase1Analysis: Phase1Analysis,
  macros: { p0Only: boolean; emphasizeMarketingQuotes: boolean },
): string => {
  const phase1Json = JSON.stringify(phase1Analysis);
  if (mode === "prd") {
    const problemStatementInstruction = macros.emphasizeMarketingQuotes
      ? "Open the Problem Statement with a verbatim quote from selectedQuotes. Then provide evidence-based analysis."
      : "Provide an evidence-based Problem Statement.";
    return [
      "You are performing Step 2 of synthesis. Write a Product Requirements Document. Your sole data source is the Phase 1 analysis below.",
      "=== PHASE 1 ANALYSIS ===",
      phase1Json,
      "Write the PRD using this exact structure:",
      "## Overview",
      "## Problem Statement",
      problemStatementInstruction,
      "## Scope — Tonight's Build",
      "## Out of Scope",
      "## User Stories (5-7, role/action/outcome format)",
      "## Acceptance Criteria (per P0 item)",
      "## Design Guidance",
      "## Success Metrics",
    ]
      .filter(Boolean)
      .join("\n");
  }
  const roadmapStructure = [
    "## P0 — Build Tonight",
    "For each p0Item: state what to build and why,",
    "citing evidence sources. Note feasibility.",
    "If conflictContext present, acknowledge competing",
    "user needs. Include every p0Item from Phase 1 exactly once.",
    "",
    ...(!macros.p0Only
      ? [
          "## P1 — Next Sprint",
          "3-4 items with rationale.",
          "",
          "## P2 — Backlog",
          "Remaining themes, briefly.",
          "",
        ]
      : []),
    "## Patterns & Insights",
    "2-3 cross-cutting observations.",
    "",
    ...(!macros.p0Only
      ? [
          "## Marketing Moments",
          macros.emphasizeMarketingQuotes
            ? "Include all selectedQuotes as blockquotes."
            : "Include up to 3 selectedQuotes as blockquotes.",
          'Format: > "quote text" — Role',
        ]
      : []),
  ].join("\n");

  return [
    "You are performing Step 2 of synthesis. Write the final Roadmap output document. Your sole data source is the Phase 1 analysis below.",
    "Do not introduce information not present in the analysis.",
    "Priority lock rules:",
    "- Use every Phase 1 p0Items title exactly once in the P0 section.",
    "- Do not move any p0Items title into P1 or P2.",
    "- When P1 is included, use only Phase 1 p1Items titles in P1.",
    macros.p0Only ? "Output P0 and Patterns only. Omit P1, P2, Marketing Moments." : "",
    "=== PHASE 1 ANALYSIS ===",
    phase1Json,
    "Write the Roadmap using this exact structure:",
    roadmapStructure,
  ]
    .filter(Boolean)
    .join("\n");
};

const toSynthesisError = (error: unknown): SynthesisError => {
  if (error instanceof SynthesisValidationError) return { code: "ERR-01", message: error.message };
  if (error instanceof AICallError && error.code === "timeout") {
    const timeoutSeconds = Math.round(resolvePhase1TimeoutMs() / 1000);
    return {
      code: "ERR-02",
      message: `Analysis timed out after ${timeoutSeconds} seconds. Your data is safe - try again.`,
    };
  }
  if (error instanceof Error) return { code: "ERR-06", message: error.message, details: error.stack };
  return { code: "ERR-06", message: "Unknown synthesis error." };
};

export async function runSynthesis(
  outputMode: "roadmap" | "prd",
  onPhase1Complete: (analysis: Phase1Analysis) => void,
  onToken: (token: string) => void,
  onComplete: (fullOutput: string) => void,
  onError: (error: SynthesisError) => void,
): Promise<void> {
  try {
    console.log("[synthesis] runSynthesis called - NEW VERSION");

    if (!AI_PROVIDER_CONFIG.defaultModel) {
      throw new Error("SYNTHESIS: defaultModel not configured in AI_PROVIDER_CONFIG");
    }

    const [bootstrap, synthesisParameters] = await Promise.all([
      dataApi.getBootstrap(),
      synthesisModuleApi.getSynthesisParameters(),
    ]);
    const macros = validateMacros({
      upweightApp: synthesisParameters.parameters.upweightSection ?? undefined,
      p0Only: synthesisParameters.parameters.p0FocusOnly,
      excludeLowSignalBelow: synthesisParameters.parameters.excludeBelowN ?? undefined,
      emphasizeMarketingQuotes: synthesisParameters.parameters.emphasiseQuotes,
    });

    const featureRequests = bootstrap.featureRequests ?? [];
    const screenFeedbackRaw = bootstrap.screenFeedback ?? [];
    const kudos = bootstrap.kudosQuotes ?? [];
    if (featureRequests.length === 0 && screenFeedbackRaw.length === 0 && kudos.length === 0) {
      onError({ code: "ERR-05", message: "No signals collected yet. Synthesis requires at least one submission." });
      return;
    }

    console.log(
      `[synthesis] Starting. FR=${featureRequests.length} SF=${screenFeedbackRaw.length} K=${kudos.length} Mode=${outputMode}`,
    );

    const preprocessStart = Date.now();
    const filteredFeedback = applyExclusionFilter(screenFeedbackRaw, macros.excludeLowSignalBelow);
    const weightedBase = filteredFeedback.map((item) => ({
      ...item,
      upweighted: macros.upweightApp ? String(item.app) === String(macros.upweightApp) : false,
    }));
    const upweightedFeedback = applyUpweighting(weightedBase, synthesisParameters.parameters.upweightMultiplier ?? 2);
    if (macros.upweightApp && !weightedBase.some((row) => String(row.app) === String(macros.upweightApp))) {
      console.warn(`[synthesis] Upweight section '${macros.upweightApp}' matched 0 records.`);
    }
    const conflicts = detectCompetingPerspectives(upweightedFeedback, {
      minEach: synthesisParameters.parameters.competingMinEach ?? 3,
      minSplitRatio: synthesisParameters.parameters.competingMinSplitRatio ?? 0.4,
    });
    const aggregates = computeAggregates(featureRequests, upweightedFeedback, kudos);
    const kudosPartitions = partitionKudos(kudos);
    console.log(`[synthesis] Preprocessing complete in ${Date.now() - preprocessStart}ms`);

    // Filter to top 10 screens by submission count BEFORE assembling promptInput
    const screensByCount = new Map<string, typeof upweightedFeedback[0][]>();
    for (const sf of upweightedFeedback) {
      //const key = `${String(sf.appSection ?? sf.app)}::${String(sf.screenName ?? "")}`;
      const key = `${String(sf.app)}::${String(sf.screenName ?? "")}`;
      const arr = screensByCount.get(key) ?? [];
      arr.push(sf);
      screensByCount.set(key, arr);
    }
    const top10ScreenFeedback = [...screensByCount.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10)
      .flatMap(([, items]) => items);

    console.log(`[synthesis] Screens passed to prompt: 10 of ${screensByCount.size}`);

    const promptInput = applyTokenGuard({
      aggregates,
      featureRequests: aggregates.topFeatureRequests,
      screenFeedback: top10ScreenFeedback,
      competingPerspectives: conflicts.conflicts,
      kudos: kudosPartitions,
      macros,
    });

    const signalSummaryBlock = buildSignalSummaryBlock(promptInput.aggregates);
    const featureRequestsBlock = buildFeatureRequestsBlock(promptInput.featureRequests, {
      featureLimit: 10,
    });
    const screenFeedbackBlock = buildScreenFeedbackBlock(promptInput.screenFeedback);
    const competingPerspectivesBlock = buildCompetingPerspectivesBlock(promptInput.competingPerspectives);
    const kudosBlocks = buildKudosBlocks(promptInput.kudos);
    const macroInstructionsBlock = buildMacroInstructionsBlock(promptInput.macros);

    const totalScreens = screensByCount.size;
    console.log(`[synthesis] Screens with freetext: ${Math.min(5, totalScreens)} of ${totalScreens}`);

    console.log('[synthesis] Block sizes:',  {
      signalSummary: signalSummaryBlock.length,
      featureRequests: featureRequestsBlock.length,
      screenFeedback: screenFeedbackBlock.length,
      competingPerspectives: competingPerspectivesBlock.length,
      publicKudos: kudosBlocks.publicSafeBlock.length,
      privateKudos: kudosBlocks.privatePoolBlock.length,
      macroInstructions: macroInstructionsBlock.length,
    });

    const phase1UserPrompt = [
      "You are performing Step 1 of a two-step synthesis.",
      "Output ONLY valid JSON conforming exactly to the Phase1Analysis schema. No prose, no markdown.",
      "=== SIGNAL SUMMARY ===",
      signalSummaryBlock,
      "=== FEATURE REQUESTS ===",
      featureRequestsBlock,
      "=== SCREEN FEEDBACK ===",
      screenFeedbackBlock,
      "=== COMPETING PERSPECTIVES ===",
      competingPerspectivesBlock,
      "=== KUDOS (public-safe — may quote verbatim) ===",
      kudosBlocks.publicSafeBlock,
      "=== KUDOS (private — sentiment only, never quote) ===",
      kudosBlocks.privatePoolBlock,
      "=== FACILITATOR INSTRUCTIONS (apply to analysis, do not reproduce in output) ===",
      macroInstructionsBlock,
      "=== REQUIRED OUTPUT SCHEMA ===",
      PHASE1_SCHEMA_TEXT,
    ].join("\n\n");

    const totalTokensPhase1 = estimateTokenCount(phase1UserPrompt);
    console.log(
      "[synthesis] Phase 1 prompt chars:",
      phase1UserPrompt.length,
      "| est. tokens:",
      totalTokensPhase1,
    );
    console.log(`[synthesis] Phase 1 estimated tokens: ${totalTokensPhase1} (target: under 15000)`);
    if (totalTokensPhase1 > 20_000) {
      console.warn("[synthesis] WARNING: token count above target. Consider reducing further if timeouts persist.");
    }

    const phase1Start = Date.now();
    const phase1TimeoutMs = resolvePhase1TimeoutMs();
    let phase1Response: string;
    try {
      const result = await aiCall({
        systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
        userPrompt: phase1UserPrompt,
        model: AI_PROVIDER_CONFIG.defaultModel,
        maxTokens: 4096,
        temperature: 0.3,
        timeoutMs: phase1TimeoutMs,
        stream: false,
      });
      phase1Response = result.content;
    } catch (error) {
      if (error instanceof AICallError && error.code === "timeout") {
        const timeoutSeconds = Math.round(phase1TimeoutMs / 1000);
        onError({
          code: "ERR-02",
          message: `Analysis timed out after ${timeoutSeconds} seconds. Your data is safe - try again.`,
        });
        return;
      }
      throw error;
    }

    let phase1Analysis: Phase1Analysis;
    try {
      phase1Analysis = toPhase1Analysis(parseJson(phase1Response));
    } catch (error) {
      console.error("[synthesis] Phase 1 malformed JSON response:", phase1Response);
      onError({
        code: "ERR-03",
        message: "Analysis returned unexpected format. Try again.",
        details: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const phase1DurationMs = Date.now() - phase1Start;
    await synthesisModuleApi.saveLatestPhase1Analysis(phase1Analysis);
    onPhase1Complete(phase1Analysis);
    console.log(`[synthesis] Phase 1 complete in ${phase1DurationMs}ms. P0: ${phase1Analysis.p0Items.length}`);

    const phase2Prompt = buildPhase2Prompt(outputMode, phase1Analysis, macros);
    const estimatedTokensPhase2 = estimateTokenCount(phase2Prompt);
    console.log(`[synthesis] Phase 2 estimated tokens: ${estimatedTokensPhase2}`);

    const phase2Start = Date.now();
    let fullOutput = "";
    await aiCall({
      systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
      userPrompt: phase2Prompt,
      model: AI_PROVIDER_CONFIG.defaultModel,
      maxTokens: outputMode === "prd" ? 6000 : 3000,
      temperature: 0.7,
      stream: true,
      onToken: (token) => {
        fullOutput += token;
        onToken(token);
      },
    });

    const phase2DurationMs = Date.now() - phase2Start;
    await synthesisModuleApi.saveLatestSynthesisOutput(fullOutput);

    const metadata: SynthesisMetadata = {
      generatedAt: new Date().toISOString(),
      outputMode,
      macrosActive: phase1Analysis.macroApplicationLog,
      phase1DurationMs,
      phase2DurationMs,
      totalTokensPhase1,
      estimatedTokensPhase2,
    };
    await synthesisModuleApi.saveLatestSynthesisMetadata(metadata);
    console.log(`[synthesis] Phase 2 complete in ${phase2DurationMs}ms`);
    onComplete(fullOutput);
  } catch (error) {
    onError(toSynthesisError(error));
  }
}
