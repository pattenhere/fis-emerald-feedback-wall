import type { SignalSummary, SynthesisMode } from "./domain";

export interface SynthesisContext {
  summary: SignalSummary;
  promptBody: string;
}

export interface SynthesisRequest {
  mode: SynthesisMode;
  pin: string;
  context: SynthesisContext;
}

export interface SynthesisResponse {
  mode: SynthesisMode;
  markdown: string;
  generatedAt: string;
}

export interface SynthesisStreamChunk {
  token: string;
  done: boolean;
}
