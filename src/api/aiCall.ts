import { AI_PROVIDER_CONFIG, type AIProvider } from "../config/aiProvider";
import { toApiUrl } from "../services/apiBase";

export type AICallParams = {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  stream?: boolean;
  onToken?: (token: string) => void;
};

export type AICallResult = {
  content: string;
  provider: AIProvider;
  model: string;
};

export class AICallError extends Error {
  code: "timeout" | "auth_failed" | "malformed_response" | "unreachable";
  status?: number;

  constructor(code: AICallError["code"], message: string, status?: number) {
    super(message);
    this.name = "AICallError";
    this.code = code;
    this.status = status;
  }
}

const API_BASE = import.meta.env.VITE_SYNTHESIS_API_BASE_URL;

const parseSse = async (response: Response, onToken?: (token: string) => void): Promise<string> => {
  if (!response.body) throw new AICallError("malformed_response", "Missing stream body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let aggregated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        if (raw === "[DONE]") return aggregated;
        let data: unknown;
        try {
          data = JSON.parse(raw);
        } catch {
          continue;
        }
        if (typeof (data as { error?: unknown }).error === "string") {
          throw new AICallError("unreachable", (data as { error: string }).error);
        }
        const token = typeof (data as { token?: unknown }).token === "string"
          ? (data as { token: string }).token
          : "";
        if (token.length > 0) {
          aggregated += token;
          if (typeof onToken === "function") onToken(token);
        }
      }
    }
  }

  return aggregated;
};

export async function aiCall(params: AICallParams): Promise<AICallResult> {
  const model = String(params.model ?? AI_PROVIDER_CONFIG.defaultModel).trim() || AI_PROVIDER_CONFIG.defaultModel;
  const maxTokens = Number(params.maxTokens);
  const temperature = Number(params.temperature);
  const stream = Boolean(params.stream);

  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    throw new AICallError("malformed_response", "maxTokens is required.");
  }
  if (!Number.isFinite(temperature)) {
    throw new AICallError("malformed_response", "temperature is required.");
  }
  if (stream && typeof params.onToken !== "function") {
    throw new AICallError("malformed_response", "onToken is required when stream=true.");
  }

  const controller = new AbortController();
  const hasExplicitTimeout = Number.isFinite(Number(params.timeoutMs));
  const timeoutMs = hasExplicitTimeout
    ? Math.max(1, Math.floor(Number(params.timeoutMs)))
    : 60_000;
  const shouldUseTimeout = stream ? hasExplicitTimeout : true;
  const timeout = shouldUseTimeout ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const endpoint = stream ? "/api/ai/stream" : "/api/ai/complete";
    // eslint-disable-next-line no-console
    console.log("[aiCall] Sending to proxy:", {
      model: params.model ?? AI_PROVIDER_CONFIG.defaultModel,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      systemPromptLength: String(params.systemPrompt ?? "").length,
      userPromptLength: String(params.userPrompt ?? "").length,
    });
    const response = await fetch(toApiUrl(endpoint, API_BASE), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        systemPrompt: params.systemPrompt,
        userPrompt: params.userPrompt,
        maxTokens: Math.floor(maxTokens),
        temperature,
      }),
    });

    if (response.status === 401 || response.status === 403) {
      throw new AICallError("auth_failed", "API request was not authorized.", response.status);
    }
    if (!response.ok) {
      let message = `Request failed (${response.status}).`;
      try {
        const payload = (await response.json()) as { error?: unknown };
        if (typeof payload.error === "string" && payload.error.trim().length > 0) {
          message = payload.error;
        }
      } catch {
        // keep default error message
      }
      throw new AICallError("unreachable", message, response.status);
    }

    if (stream) {
      const content = await parseSse(response, params.onToken);
      return { content, provider: AI_PROVIDER_CONFIG.provider, model };
    }

    const payload = (await response.json()) as { content?: unknown; provider?: unknown; model?: unknown };
    const content = typeof payload.content === "string" ? payload.content : "";
    const provider = payload.provider === "openai" || payload.provider === "anthropic"
      ? payload.provider
      : AI_PROVIDER_CONFIG.provider;
    const resolvedModel = typeof payload.model === "string" && payload.model.trim().length > 0 ? payload.model : model;
    if (!content.trim()) {
      throw new AICallError("malformed_response", "Proxy returned empty content.");
    }
    return { content, provider: provider as AIProvider, model: resolvedModel };
  } catch (error) {
    if (error instanceof AICallError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AICallError("timeout", "AI request timed out.");
    }
    throw new AICallError("unreachable", "Cannot reach local AI proxy.");
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
