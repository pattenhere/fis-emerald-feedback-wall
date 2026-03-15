import type { MacroState, SynthesisMode } from "./domain";

export interface SynthesisRequest {
  outputMode: SynthesisMode;
  pin: string;
  macros?: MacroState;
  context?: {
    summary?: {
      totalFeatureVotes?: number;
      screenFeedbackCount?: number;
      kudosCount?: number;
    };
    diagnostics?: Record<string, unknown>;
  };
}

export interface SynthesisResponse {
  mode: SynthesisMode;
  markdown: string;
  generatedAt: string;
}

export type SynthesisStreamEvent =
  | {
      type: "phase1_started";
      summary?: {
        totalFeatureVotes: number;
        totalScreenFeedback: number;
        totalKudos: number;
        totalCardSortResponses: number;
      };
    }
  | {
      type: "phase1_completed";
      macroApplicationLog?: string[];
      phase1AnalysisSummary?: { p0: number; p1: number; p2: number };
    }
  | { type: "phase2_started"; outputMode: SynthesisMode }
  | { type: "phase2_token"; token: string }
  | {
      type: "provider_call";
      phase: "phase1" | "phase2";
      provider: "openai" | "anthropic" | "none";
      model: string;
      endpoint: string;
      maxTokens: number;
      temperature: number;
    }
  | {
      type: "debug_prompt";
      phase: "phase1" | "phase2";
      provider: "openai" | "anthropic";
      payload: unknown;
    }
  | { type: "warning"; code?: string; message: string }
  | { type: "error"; code?: string; message: string }
  | {
      type: "done";
      outputMode: SynthesisMode;
      generatedAt: string;
      finalOutput: string;
      redactions?: number;
    };

export interface SynthesisStreamChunk {
  token: string;
  done: boolean;
  event?: SynthesisStreamEvent;
}
