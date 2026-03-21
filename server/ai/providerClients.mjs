import { aiCall } from "../api/aiCall.mjs";
import { AI_PROVIDER_CONFIG } from "../config/aiProvider.mjs";

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

const toSystemPrompt = (messages) =>
  messages
    .filter((message) => message.role === "system")
    .map((message) => String(message.content ?? "").trim())
    .filter(Boolean)
    .join("\n\n");

const toUserPrompt = (messages) =>
  messages
    .filter((message) => message.role !== "system")
    .map((message) => `[${String(message.role ?? "user").toUpperCase()}]\n${String(message.content ?? "").trim()}`)
    .join("\n\n");

const toSafeNumber = (value, fallback, min, max) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
};

export const runServerTextCompletion = async ({ messages, maxOutputTokens, temperature }) => {
  assertMessages(messages);
  const result = await aiCall({
    systemPrompt: toSystemPrompt(messages),
    userPrompt: toUserPrompt(messages),
    model: AI_PROVIDER_CONFIG.defaultModel,
    maxTokens: toSafeNumber(maxOutputTokens, 700, 1, 4096),
    temperature: toSafeNumber(temperature, 0.1, 0, 1),
  });
  return {
    provider: result.provider,
    model: result.model,
    text: result.content,
  };
};
