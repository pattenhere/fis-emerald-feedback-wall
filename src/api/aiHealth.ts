import type { AIProvider } from "../config/aiProvider";
import { AI_PROVIDER_CONFIG } from "../config/aiProvider";
import { buildSynthesisAuthHeaders } from "../services/synthesisAuth";
import { toApiUrl } from "../services/apiBase";

export type AIProviderHealth = {
  reachable: boolean;
  provider: AIProvider;
  checkedAt: string;
  reason?: string;
  error?: string;
};

const API_BASE = import.meta.env.VITE_SYNTHESIS_API_BASE_URL;

export async function getAIProviderHealth(): Promise<AIProviderHealth> {
  const response = await fetch(toApiUrl("/api/synthesis/providers/health", API_BASE), {
    headers: buildSynthesisAuthHeaders(),
  });
  let payload: {
    reachable?: unknown;
    provider?: unknown;
    checkedAt?: unknown;
    reason?: unknown;
    error?: unknown;
  } = {};
  try {
    payload = (await response.json()) as {
      reachable?: unknown;
      provider?: unknown;
      checkedAt?: unknown;
      reason?: unknown;
      error?: unknown;
    };
  } catch {
    payload = {};
  }

  const responseReason =
    typeof payload.reason === "string"
      ? payload.reason
      : !response.ok && response.status === 401
        ? "not_authenticated"
        : undefined;
  const responseError =
    typeof payload.error === "string"
      ? payload.error
      : !response.ok
        ? `Request failed (${response.status})`
        : undefined;

  return {
    reachable: Boolean(payload.reachable),
    provider: payload.provider === "openai" || payload.provider === "anthropic" ? payload.provider : AI_PROVIDER_CONFIG.provider,
    checkedAt: typeof payload.checkedAt === "string" ? payload.checkedAt : new Date().toISOString(),
    reason: responseReason,
    error: responseError,
  };
}
