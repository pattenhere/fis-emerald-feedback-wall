import type { AppArea } from "../types/domain";
import type { TShirtSizingResultsPayload } from "../synthesis/tshirt/sizingResultsStore";

export interface InputsCountResponse {
  totalInputs: number;
  featureRequests: number;
  screenFeedback: number;
  kudos: number;
  totalVotesCast?: number;
  updatedAt: string;
}

export interface InputsCountByTypeResponse {
  type: "feature_request" | "screen_feedback" | "kudos";
  count: number;
  updatedAt: string;
}

export interface InputsDedupCountResponse {
  uniqueInputs: number;
  uniqueFeatureRequests: number;
  distinctScreensCovered: number;
  consentApprovedKudos: number;
  totalVotesCast: number;
  updatedAt: string;
}

export interface SessionConfigResponse {
  inputCutoffAt: string;
  inputWindowOpen: boolean;
  countdownSecondsRemaining: number;
  wallWindowOpen?: boolean;
  mobileWindowOpen?: boolean;
  themesViewActive?: boolean;
  synthesisMinSignals?: number;
  mobileWindowCloseTime?: string;
  mobileWindowCloseTimeLocal?: string;
  eventName?: string;
  eventSlug?: string;
  ceremonyStartTimeLocal?: string;
  day2RevealTimeLocal?: string;
  updatedAt?: string;
}

export interface PinAuthResponse {
  ok: boolean;
  authenticated: boolean;
  token?: string;
  expiresAt?: string;
  error?: string;
}

export interface AIProviderHealthResponse {
  reachable: boolean;
  checkedAt: string;
  provider: "anthropic" | "openai";
  reason?: string;
  error?: string;
}

export interface SessionConfigPatchRequest {
  wallWindowOpen?: boolean;
  mobileWindowOpen?: boolean;
  themesViewActive?: boolean;
  synthesisMinSignals?: number;
  inputCutoffAt?: string;
  mobileWindowCloseTime?: string;
  eventName?: string;
  eventSlug?: string;
  ceremonyStartTimeLocal?: string;
  day2RevealTimeLocal?: string;
}

export interface SynthesisParametersResponse {
  parameters: {
    excludeBelowN: number | null;
    upweightSection: AppArea | null;
    upweightMultiplier: number;
    p0FocusOnly: boolean;
    emphasiseQuotes: boolean;
    maxQuotes: number;
    competingMinEach: number;
    competingMinSplitRatio: number;
  };
  updatedAt: string | null;
  usingDefaults: boolean;
}

export type SynthesisParametersPatchRequest = Partial<SynthesisParametersResponse["parameters"]>;

export interface FlaggedInputRecord {
  id: string;
  type: "feature_request" | "screen_feedback" | "kudos";
  text: string;
  flagReason: string;
  submittedAt: string;
}

export interface FlaggedInputsResponse {
  items: FlaggedInputRecord[];
  pendingCount: number;
}

export interface ModerationActionResponse {
  ok: boolean;
  id: string;
  pendingCount: number;
}

export interface Phase1P0Item {
  title: string;
  rationale: string;
  evidenceSources: string[];
  feasibilityNote: string;
  conflictContext: string | null;
  roleContext: string | null;
}

export interface Phase1Analysis {
  p0Items: Phase1P0Item[];
  p1Items: Array<{ title: string; rationale: string; signalCount: number }>;
  p2Themes: Array<{ theme: string; description: string }>;
  crossCuttingInsights: Array<{ insight: string; rolesAffected: string[] | null; screenCount: number }>;
  selectedQuotes: Array<{ text: string; role: string | null }>;
  competingPerspectivesNotes: Array<{ screenName: string; interpretation: string; recommendation: string }>;
  macroApplicationLog: string[];
}

export interface SynthesisMetadata {
  generatedAt: string;
  outputMode: "roadmap" | "prd";
  macrosActive: string[];
  phase1DurationMs: number;
  phase2DurationMs: number;
  totalTokensPhase1: number;
  estimatedTokensPhase2: number;
}

export interface Day2Narrative {
  opening: string;
  what_we_heard: string;
  what_we_built: string;
  what_we_deferred: string;
  closing: string;
  updatedAt?: string;
}

export interface Cap11ExportRecord {
  type: "feature_request" | "screen_feedback" | "kudos" | "card_sort";
  id?: string | number;
  created_at?: string | null;
  app_section?: string | null;
  screen_name?: string | null;
  feedback_type?: string | null;
  title?: string | null;
  description?: string | null;
  text?: string | null;
  votes?: number | null;
  workflow_context?: string | null;
  role?: string | null;
  consent_public?: boolean | null;
  reaction?: string | null;
  tier?: string | null;
  origin?: string | null;
  status?: string | null;
  concept_title?: string | null;
}

export interface SynthesisHistoryRecord {
  id: string;
  outputMode: "roadmap" | "prd";
  output: string;
  phase1Analysis: Phase1Analysis | null;
  metadata: SynthesisMetadata | null;
  macrosActive: string;
  parametersSnapshot: SynthesisParametersResponse["parameters"] | null;
  generatedAt: string;
}

const jsonHeaders = { "content-type": "application/json" };

const readJson = async <T,>(response: Response): Promise<T> => {
  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      if (!response.ok) {
        const short = text.slice(0, 140).replace(/\s+/gu, " ").trim();
        throw new Error(`Request failed (${response.status}): non-JSON response (${short || "empty body"})`);
      }
      throw new Error("Server returned non-JSON success response.");
    }
  }
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body != null &&
      "error" in body &&
      typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
};

export const synthesisModuleApi = {
  getInputsCount: async (): Promise<InputsCountResponse> => {
    const response = await fetch("/api/inputs/count", { headers: buildSynthesisAuthHeaders() });
    return readJson<InputsCountResponse>(response);
  },

  getInputsCountByType: async (type: "feature_request" | "screen_feedback" | "kudos"): Promise<InputsCountByTypeResponse> => {
    const response = await fetch(`/api/inputs/count?type=${encodeURIComponent(type)}`, {
      headers: buildSynthesisAuthHeaders(),
    });
    return readJson<InputsCountByTypeResponse>(response);
  },

  getDedupCounts: async (): Promise<InputsDedupCountResponse> => {
    const response = await fetch("/api/inputs/dedup-count", { headers: buildSynthesisAuthHeaders() });
    return readJson<InputsDedupCountResponse>(response);
  },

  getSessionConfig: async (): Promise<SessionConfigResponse> => {
    const response = await fetch("/api/session/config", { headers: buildSynthesisAuthHeaders() });
    return readJson<SessionConfigResponse>(response);
  },

  patchSessionConfig: async (payload: SessionConfigPatchRequest): Promise<SessionConfigResponse> => {
    const response = await fetch("/api/session/config", {
      method: "PATCH",
      headers: buildSynthesisAuthHeaders(jsonHeaders),
      body: JSON.stringify(payload),
    });
    return readJson<SessionConfigResponse>(response);
  },

  getFlaggedInputs: async (): Promise<FlaggedInputsResponse> => {
    const response = await fetch("/api/inputs/flagged", { headers: buildSynthesisAuthHeaders() });
    const payload = await readJson<unknown>(response);
    const items = Array.isArray(payload) ? payload : [];
    const normalized = items.map((item) => {
      const row = item as Partial<FlaggedInputRecord>;
      return {
        id: String(row.id ?? ""),
        type:
          row.type === "feature_request" || row.type === "screen_feedback" || row.type === "kudos"
            ? row.type
            : "feature_request",
        text: String(row.text ?? ""),
        flagReason: String(row.flagReason ?? ""),
        submittedAt: String(row.submittedAt ?? ""),
      } satisfies FlaggedInputRecord;
    });
    return {
      items: normalized,
      pendingCount: normalized.length,
    };
  },

  keepFlaggedInput: async (id: string): Promise<ModerationActionResponse> => {
    const response = await fetch(`/api/inputs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: buildSynthesisAuthHeaders(jsonHeaders),
      body: JSON.stringify({ flagged: false }),
    });
    return readJson<ModerationActionResponse>(response);
  },

  removeFlaggedInput: async (id: string): Promise<ModerationActionResponse> => {
    const response = await fetch(`/api/inputs/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: buildSynthesisAuthHeaders(jsonHeaders),
    });
    return readJson<ModerationActionResponse>(response);
  },

  verifyPin: async (pin: string): Promise<PinAuthResponse> => {
    const response = await fetch("/api/synthesis/auth", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ pin }),
    });
    let payload: PinAuthResponse;
    try {
      payload = await readJson<PinAuthResponse>(response);
    } catch (error) {
      clearSynthesisAuthSession();
      throw error;
    }
    if (payload.authenticated && payload.token) {
      writeSynthesisAuthToken(payload.token);
      writeSynthesisAuthFlag(true);
      return payload;
    }
    clearSynthesisAuthSession();
    return payload;
  },

  getAIProviderHealth: async (): Promise<AIProviderHealthResponse> => {
    return fetchAIProviderHealth();
  },

  getSynthesisParameters: async (): Promise<SynthesisParametersResponse> => {
    const response = await fetch("/api/synthesis/parameters", { headers: buildSynthesisAuthHeaders() });
    return readJson<SynthesisParametersResponse>(response);
  },

  patchSynthesisParameters: async (payload: SynthesisParametersPatchRequest): Promise<SynthesisParametersResponse> => {
    const response = await fetch("/api/synthesis/parameters", {
      method: "PATCH",
      headers: buildSynthesisAuthHeaders(jsonHeaders),
      body: JSON.stringify(payload),
    });
    return readJson<SynthesisParametersResponse>(response);
  },

  getLatestPhase1Analysis: async (): Promise<{ phase1Analysis: Phase1Analysis | null }> => {
    const response = await fetch("/api/synthesis/phase1", { headers: buildSynthesisAuthHeaders() });
    return readJson<{ phase1Analysis: Phase1Analysis | null }>(response);
  },

  saveLatestPhase1Analysis: async (phase1Analysis: Phase1Analysis): Promise<{ phase1Analysis: Phase1Analysis }> => {
    const response = await fetch("/api/synthesis/phase1", {
      method: "POST",
      headers: buildSynthesisAuthHeaders(jsonHeaders),
      body: JSON.stringify({ phase1Analysis }),
    });
    return readJson<{ phase1Analysis: Phase1Analysis }>(response);
  },

  getLatestSynthesisOutput: async (): Promise<{ output: string | null }> => {
    const response = await fetch("/api/synthesis/output", { headers: buildSynthesisAuthHeaders() });
    return readJson<{ output: string | null }>(response);
  },

  saveLatestSynthesisOutput: async (output: string): Promise<{ output: string }> => {
    const response = await fetch("/api/synthesis/output", {
      method: "POST",
      headers: buildSynthesisAuthHeaders(jsonHeaders),
      body: JSON.stringify({ output }),
    });
    return readJson<{ output: string }>(response);
  },

  getLatestSynthesisMetadata: async (): Promise<{ metadata: SynthesisMetadata | null }> => {
    const response = await fetch("/api/synthesis/metadata", { headers: buildSynthesisAuthHeaders() });
    return readJson<{ metadata: SynthesisMetadata | null }>(response);
  },

  saveLatestSynthesisMetadata: async (metadata: SynthesisMetadata): Promise<{ metadata: SynthesisMetadata }> => {
    const response = await fetch("/api/synthesis/metadata", {
      method: "POST",
      headers: buildSynthesisAuthHeaders(jsonHeaders),
      body: JSON.stringify({ metadata }),
    });
    return readJson<{ metadata: SynthesisMetadata }>(response);
  },

  getLatestTShirtSizing: async (): Promise<{ sizing: TShirtSizingResultsPayload | null }> => {
    const response = await fetch("/api/synthesis/sizing", { headers: buildSynthesisAuthHeaders() });
    return readJson<{ sizing: TShirtSizingResultsPayload | null }>(response);
  },

  saveLatestTShirtSizing: async (sizing: TShirtSizingResultsPayload): Promise<{ sizing: TShirtSizingResultsPayload }> => {
    const response = await fetch("/api/synthesis/sizing", {
      method: "POST",
      headers: buildSynthesisAuthHeaders(jsonHeaders),
      body: JSON.stringify({ sizing }),
    });
    return readJson<{ sizing: TShirtSizingResultsPayload }>(response);
  },

  getSavedNarrative: async (): Promise<{ savedNarrative: Day2Narrative | null }> => {
    const response = await fetch("/api/synthesis/narrative", { headers: buildSynthesisAuthHeaders() });
    return readJson<{ savedNarrative: Day2Narrative | null }>(response);
  },

  saveSavedNarrative: async (savedNarrative: Day2Narrative): Promise<{ savedNarrative: Day2Narrative }> => {
    const response = await fetch("/api/synthesis/narrative", {
      method: "POST",
      headers: buildSynthesisAuthHeaders(jsonHeaders),
      body: JSON.stringify({ savedNarrative }),
    });
    return readJson<{ savedNarrative: Day2Narrative }>(response);
  },

  getExportRecords: async (): Promise<{ records: Cap11ExportRecord[] }> => {
    const response = await fetch("/api/synthesis/export/records", { headers: buildSynthesisAuthHeaders() });
    return readJson<{ records: Cap11ExportRecord[] }>(response);
  },

  getSynthesisHistory: async (): Promise<{ records: SynthesisHistoryRecord[]; total: number }> => {
    const response = await fetch("/api/synthesis/history", { headers: buildSynthesisAuthHeaders() });
    return readJson<{ records: SynthesisHistoryRecord[]; total: number }>(response);
  },

  getSynthesisHistoryRecord: async (id: string): Promise<{ record: SynthesisHistoryRecord }> => {
    const response = await fetch(`/api/synthesis/history/${encodeURIComponent(id)}`, {
      headers: buildSynthesisAuthHeaders(),
    });
    return readJson<{ record: SynthesisHistoryRecord }>(response);
  },

};
import {
  buildSynthesisAuthHeaders,
  clearSynthesisAuthSession,
  writeSynthesisAuthFlag,
  writeSynthesisAuthToken,
} from "./synthesisAuth";
import { getAIProviderHealth as fetchAIProviderHealth } from "../api/aiHealth";
