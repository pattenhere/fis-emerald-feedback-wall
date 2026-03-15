type AnthropicRole = "system" | "user" | "assistant";

export interface AnthropicTextMessage {
  role: AnthropicRole;
  content: string;
}

export interface AnthropicTextRequest {
  messages: AnthropicTextMessage[];
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface AnthropicTextResponse {
  id?: string;
  model: string;
  text: string;
  raw: unknown;
}

const ANTHROPIC_BASE_URL = (import.meta.env.VITE_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1").replace(
  /\/$/,
  "",
);
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = import.meta.env.VITE_ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";
const ANTHROPIC_VERSION = import.meta.env.VITE_ANTHROPIC_VERSION ?? "2023-06-01";
const AI_DEBUG_LOGS = import.meta.env.DEV;

const ensureConfigured = (): void => {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Anthropic API key is not configured. Set VITE_ANTHROPIC_API_KEY in your environment.");
  }
};

const extractText = (payload: unknown): string => {
  if (typeof payload !== "object" || payload === null) return "";

  const data = payload as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const chunks: string[] = [];
  for (const item of data.content ?? []) {
    if (item.type === "text" && typeof item.text === "string") {
      chunks.push(item.text);
    }
  }
  return chunks.join("");
};

const summarizeMessages = (messages: AnthropicTextMessage[]): string => {
  return messages
    .map((message, index) => {
      const text = message.content.replace(/\s+/g, " ").trim();
      const preview = text.length > 160 ? `${text.slice(0, 157)}...` : text;
      return `${index + 1}. ${message.role.toUpperCase()}: ${preview}`;
    })
    .join("\n");
};

const logAnthropicRequest = (request: AnthropicTextRequest): void => {
  if (!AI_DEBUG_LOGS) return;
  console.groupCollapsed("[AI][Anthropic] text request");
  console.info("Endpoint:", `${ANTHROPIC_BASE_URL}/messages`);
  console.info("Model:", request.model ?? ANTHROPIC_MODEL);
  console.info("Max tokens:", request.maxOutputTokens ?? 1400);
  console.info("Temperature:", request.temperature ?? "(default)");
  console.info("Messages:\n" + summarizeMessages(request.messages));
  console.groupEnd();
};

const logAnthropicResponse = (status: "ok" | "error", details: string): void => {
  if (!AI_DEBUG_LOGS) return;
  if (status === "ok") {
    console.info(`[AI][Anthropic] text request succeeded: ${details}`);
    return;
  }
  console.error(`[AI][Anthropic] text request failed: ${details}`);
};

export const isAnthropicConfigured = (): boolean => Boolean(ANTHROPIC_API_KEY);

export const createAnthropicText = async (
  request: AnthropicTextRequest,
): Promise<AnthropicTextResponse> => {
  ensureConfigured();
  logAnthropicRequest(request);

  const system = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");

  const messages = request.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));

  const response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY ?? "",
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: request.model ?? ANTHROPIC_MODEL,
      system: system || undefined,
      messages,
      max_tokens: request.maxOutputTokens ?? 1400,
      temperature: request.temperature,
    }),
  });

  if (!response.ok) {
    const reason = await response.text();
    logAnthropicResponse("error", `HTTP ${response.status} ${reason}`);
    throw new Error(`Anthropic request failed (${response.status}): ${reason}`);
  }

  const data = (await response.json()) as { id?: string; model?: string };
  logAnthropicResponse("ok", `id=${data.id ?? "n/a"} model=${data.model ?? request.model ?? ANTHROPIC_MODEL}`);
  return {
    id: data.id,
    model: data.model ?? request.model ?? ANTHROPIC_MODEL,
    text: extractText(data),
    raw: data,
  };
};
