const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";

const normalizeBaseUrl = (value, fallback) => String(value ?? fallback).replace(/\/+$/u, "");

const openaiBaseUrl = normalizeBaseUrl(process.env.OPENAI_BASE_URL, DEFAULT_OPENAI_BASE_URL);
const anthropicBaseUrl = normalizeBaseUrl(process.env.ANTHROPIC_BASE_URL, DEFAULT_ANTHROPIC_BASE_URL);

const openaiModel = String(process.env.OPENAI_MODEL ?? "gpt-5-mini");
const openaiApiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
const openaiProject = String(process.env.OPENAI_PROJECT ?? "").trim();
const openaiOrganization = String(process.env.OPENAI_ORGANIZATION ?? "").trim();

const anthropicModel = String(process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6");
const anthropicApiKey = String(process.env.ANTHROPIC_API_KEY ?? "").trim();
const anthropicVersion = String(process.env.ANTHROPIC_VERSION ?? DEFAULT_ANTHROPIC_VERSION).trim();

const isOpenAIOrgId = (value) => /^org_[A-Za-z0-9]+$/u.test(String(value ?? ""));
const isOpenAIProjectId = (value) => /^proj_[A-Za-z0-9]+$/u.test(String(value ?? ""));

const extractOpenAIText = (payload) => {
  if (!payload || typeof payload !== "object") return "";

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const chunks = [];
  for (const outputItem of Array.isArray(payload.output) ? payload.output : []) {
    const content = Array.isArray(outputItem?.content) ? outputItem.content : [];
    for (const item of content) {
      if ((item?.type === "output_text" || item?.type === "text") && typeof item?.text === "string") {
        chunks.push(item.text);
      }
    }
  }
  return chunks.join("");
};

const extractAnthropicText = (payload) => {
  if (!payload || typeof payload !== "object") return "";
  const chunks = [];
  const content = Array.isArray(payload.content) ? payload.content : [];
  for (const item of content) {
    if (item?.type === "text" && typeof item?.text === "string") {
      chunks.push(item.text);
    }
  }
  return chunks.join("");
};

const toOpenAIInput = (messages) =>
  messages.map((message) => ({
    role: message.role,
    content: [{ type: "input_text", text: message.content }],
  }));

const toAnthropicMessages = (messages) =>
  messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));

const toAnthropicSystem = (messages) =>
  messages
    .filter((message) => message.role === "system")
    .map((message) => String(message.content ?? "").trim())
    .filter(Boolean)
    .join("\n\n");

const assertMessages = (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }
  for (const message of messages) {
    if (!message || typeof message !== "object") {
      throw new Error("Each message must be an object.");
    }
    const role = String(message.role ?? "");
    const content = String(message.content ?? "");
    if (!["system", "user", "assistant"].includes(role)) {
      throw new Error("Message role must be one of: system, user, assistant.");
    }
    if (!content.trim()) {
      throw new Error("Message content cannot be empty.");
    }
  }
};

const toSafeNumber = (value, fallback, min, max) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
};

const makeOpenAIHeaders = () => {
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${openaiApiKey}`,
  };
  if (openaiProject && isOpenAIProjectId(openaiProject)) {
    headers["OpenAI-Project"] = openaiProject;
  }
  if (openaiOrganization && isOpenAIOrgId(openaiOrganization)) {
    headers["OpenAI-Organization"] = openaiOrganization;
  }
  return headers;
};

const createOpenAIText = async ({ messages, maxOutputTokens, temperature }) => {
  if (!openaiApiKey) {
    throw new Error("OpenAI API key is not configured on the server.");
  }
  const response = await fetch(`${openaiBaseUrl}/responses`, {
    method: "POST",
    headers: makeOpenAIHeaders(),
    body: JSON.stringify({
      model: openaiModel,
      input: toOpenAIInput(messages),
      max_output_tokens: toSafeNumber(maxOutputTokens, 700, 1, 4096),
      temperature: toSafeNumber(temperature, 0.1, 0, 1),
    }),
  });
  if (!response.ok) {
    const reason = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${reason.slice(0, 300)}`);
  }
  const payload = await response.json();
  return {
    provider: "openai",
    model: String(payload?.model ?? openaiModel),
    text: extractOpenAIText(payload),
  };
};

const createAnthropicText = async ({ messages, maxOutputTokens, temperature }) => {
  if (!anthropicApiKey) {
    throw new Error("Anthropic API key is not configured on the server.");
  }
  const response = await fetch(`${anthropicBaseUrl}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": anthropicVersion,
    },
    body: JSON.stringify({
      model: anthropicModel,
      system: toAnthropicSystem(messages) || undefined,
      messages: toAnthropicMessages(messages),
      max_tokens: toSafeNumber(maxOutputTokens, 700, 1, 4096),
      temperature: toSafeNumber(temperature, 0.1, 0, 1),
    }),
  });
  if (!response.ok) {
    const reason = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${reason.slice(0, 300)}`);
  }
  const payload = await response.json();
  return {
    provider: "anthropic",
    model: String(payload?.model ?? anthropicModel),
    text: extractAnthropicText(payload),
  };
};

export const runServerTextCompletion = async ({ provider, messages, maxOutputTokens, temperature }) => {
  assertMessages(messages);
  if (provider === "anthropic") {
    return createAnthropicText({ messages, maxOutputTokens, temperature });
  }
  return createOpenAIText({ messages, maxOutputTokens, temperature });
};
