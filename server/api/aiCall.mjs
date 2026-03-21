import { AI_PROVIDER_CONFIG } from "../config/aiProvider.mjs";

export class AICallError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AICallError";
    this.code = code;
  }
}

const toPositiveInt = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.floor(numeric);
};

const parseSseStream = async ({ stream, onToken, provider }) => {
  if (!stream) throw new AICallError("MALFORMED_RESPONSE", "Missing stream body.");
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = "";
  let aggregated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          continue;
        }

        const token =
          provider === "anthropic"
            ? data?.type === "content_block_delta" && typeof data?.delta?.text === "string"
              ? data.delta.text
              : ""
            : typeof data?.choices?.[0]?.delta?.content === "string"
              ? data.choices[0].delta.content
              : "";

        if (token) {
          aggregated += token;
          if (typeof onToken === "function") onToken(token);
        }
      }
    }
  }

  return aggregated;
};

const normalizeMessageContent = (systemPrompt, userPrompt) => {
  const system = String(systemPrompt ?? "").trim();
  const user = String(userPrompt ?? "").trim();
  if (!user) throw new AICallError("MALFORMED_REQUEST", "userPrompt is required.");
  return { system, user };
};

export const aiCall = async ({
  systemPrompt,
  userPrompt,
  model,
  maxTokens,
  temperature,
  stream = false,
  signal,
  onToken,
}) => {
  if (!AI_PROVIDER_CONFIG.apiKey) {
    throw new AICallError("NOT_CONFIGURED", "Provider API key is not configured.");
  }
  if (!Number.isFinite(Number(maxTokens)) || Number(maxTokens) <= 0) {
    throw new AICallError("MALFORMED_REQUEST", "maxTokens is required.");
  }
  if (!Number.isFinite(Number(temperature))) {
    throw new AICallError("MALFORMED_REQUEST", "temperature is required.");
  }
  if (stream && typeof onToken !== "function") {
    throw new AICallError("MALFORMED_REQUEST", "onToken is required when stream=true.");
  }

  const selectedModel = String(model ?? AI_PROVIDER_CONFIG.defaultModel).trim() || AI_PROVIDER_CONFIG.defaultModel;
  const { system, user } = normalizeMessageContent(systemPrompt, userPrompt);
  const nonStreamTimeoutMs = toPositiveInt(process.env.AI_PROVIDER_NON_STREAM_TIMEOUT_MS, 240_000);

  // For non-streaming calls: enforce a single end-to-end timeout budget.
  // For streaming: no timeout here; the caller controls lifecycle via abort.
  const controller = new AbortController();
  let detachExternalAbort = null;
  if (signal && typeof signal === "object") {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else if (typeof signal.addEventListener === "function") {
      const onAbort = () => controller.abort(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      detachExternalAbort = () => signal.removeEventListener("abort", onAbort);
    }
  }
  const timeout = !stream
    ? setTimeout(() => controller.abort(new Error("AI_PROVIDER_TIMEOUT")), nonStreamTimeoutMs)
    : null;

  try {
    if (AI_PROVIDER_CONFIG.provider === "anthropic") {
      console.log("[server/aiCall] fetch dispatched, awaiting response...");
      const response = await fetch(`${AI_PROVIDER_CONFIG.baseURL}/v1/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": AI_PROVIDER_CONFIG.apiKey,
          "anthropic-version": AI_PROVIDER_CONFIG.anthropicVersion,
        },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: Math.max(1, Math.floor(Number(maxTokens))),
          temperature: Number(temperature),
          stream,
          system: system || undefined,
          messages: [{ role: "user", content: user }],
        }),
      });
      console.log("[server/aiCall] response received, status:", response.status);

      console.log("[server/aiCall] Anthropic response status:", response.status);

      if (response.status === 401 || response.status === 403) {
        throw new AICallError("AUTH_FAILED", "API key rejected by provider.");
      }
      if (!response.ok) {
        const errorText = await response.text();
        console.log("[server/aiCall] Anthropic error body:", errorText);
        throw new AICallError("UNREACHABLE", `Provider request failed (${response.status}): ${errorText}`);
      }

      let content;
      if (stream) {
        content = await parseSseStream({ stream: response.body, onToken, provider: "anthropic" });
      } else {
        const payload = await response.json();
        content = Array.isArray(payload?.content)
          ? payload.content
              .filter((item) => item?.type === "text" && typeof item?.text === "string")
              .map((item) => item.text)
              .join("")
          : "";
        if (!content) throw new AICallError("MALFORMED_RESPONSE", "Provider returned empty content.");
      }

      return { content, provider: AI_PROVIDER_CONFIG.provider, model: selectedModel };
    }

    // OpenAI-compatible path
    const response = await fetch(`${AI_PROVIDER_CONFIG.baseURL}/v1/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${AI_PROVIDER_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: Math.max(1, Math.floor(Number(maxTokens))),
        temperature: Number(temperature),
        stream,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: user },
        ],
      }),
    });

    if (response.status === 401 || response.status === 403) {
      throw new AICallError("AUTH_FAILED", "API key rejected by provider.");
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new AICallError("UNREACHABLE", `Provider request failed (${response.status}): ${errorText}`);
    }

    let content;
    if (stream) {
      content = await parseSseStream({ stream: response.body, onToken, provider: "openai" });
    } else {
      const payload = await response.json();
      content = String(payload?.choices?.[0]?.message?.content ?? "");
      if (!content.trim()) throw new AICallError("MALFORMED_RESPONSE", "Provider returned empty content.");
    }

    return { content, provider: AI_PROVIDER_CONFIG.provider, model: selectedModel };

  } catch (error) {
    if (error instanceof AICallError) throw error;
    if (error?.name === "AbortError") {
      throw new AICallError("TIMEOUT", "Provider request timed out or was cancelled.");
    }
    console.error("[server/aiCall] Unexpected error:", error?.name, error?.message, error?.cause);
    throw new AICallError("UNREACHABLE", `Cannot reach provider: ${error?.message ?? "unknown"}`);
  } finally {
    if (timeout) clearTimeout(timeout);
    if (detachExternalAbort) detachExternalAbort();
  }
};
