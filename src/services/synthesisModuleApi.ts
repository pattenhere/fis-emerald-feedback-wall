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
  updatedAt?: string;
}

export interface PinAuthResponse {
  ok: boolean;
  authenticated: boolean;
  token?: string;
  expiresAt?: string;
  error?: string;
}

export interface AnthropicHealthResponse {
  reachable: boolean;
  checkedAt: string;
  provider: "anthropic";
  reason?: string;
}

export interface SessionConfigPatchRequest {
  wallWindowOpen?: boolean;
  mobileWindowOpen?: boolean;
  themesViewActive?: boolean;
  synthesisMinSignals?: number;
  inputCutoffAt?: string;
}

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

const jsonHeaders = { "content-type": "application/json" };

const readJson = async <T,>(response: Response): Promise<T> => {
  const body = (await response.json()) as T;
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
  return body;
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

  getAnthropicHealth: async (): Promise<AnthropicHealthResponse> => {
    const response = await fetch("/api/synthesis/providers/anthropic/health", { headers: buildSynthesisAuthHeaders() });
    return readJson<AnthropicHealthResponse>(response);
  },
};
import {
  buildSynthesisAuthHeaders,
  clearSynthesisAuthSession,
  writeSynthesisAuthFlag,
  writeSynthesisAuthToken,
} from "./synthesisAuth";
