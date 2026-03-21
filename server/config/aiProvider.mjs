import { loadConfigEnv } from "./loadConfigEnv.mjs";

loadConfigEnv();

const AI_PROVIDERS = new Set(["anthropic", "openai"]);

const normalizeProvider = (value) => {
  const normalized = String(value ?? "anthropic").trim().toLowerCase();
  return AI_PROVIDERS.has(normalized) ? normalized : "anthropic";
};

const normalizeBaseUrl = (value, fallback) => {
  const raw = String(value ?? fallback).trim().replace(/\/+$/u, "");
  return raw.endsWith("/v1") ? raw.slice(0, -3) : raw;
};

const provider = normalizeProvider(
  process.env.SYNTHESIS_API_PROVIDER ??
  process.env.VITE_SYNTHESIS_API_PROVIDER ??
  "anthropic",
);

const resolveModel = (value, fallback) => {
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
};

const anthropicDefault = resolveModel(
  process.env.ANTHROPIC_MODEL ??
    process.env.VITE_ANTHROPIC_MODEL ??
    (provider === "anthropic" ? process.env.SYNTHESIS_MODEL : undefined),
  "claude-sonnet-4-6",
);
const anthropicFastModel = resolveModel(
  process.env.ANTHROPIC_FAST_MODEL ?? process.env.VITE_ANTHROPIC_FAST_MODEL,
  "claude-haiku-4-5-20251001",
);
const openaiDefault = resolveModel(
  process.env.OPENAI_MODEL ??
    process.env.VITE_OPENAI_MODEL ??
    (provider === "openai" ? process.env.SYNTHESIS_MODEL : undefined),
  "gpt-4o",
);
const openaiFastModel = resolveModel(
  process.env.OPENAI_FAST_MODEL ?? process.env.VITE_OPENAI_FAST_MODEL,
  "gpt-4o-mini",
);

const CONFIGS = {
  anthropic: {
    defaultModel: anthropicDefault,
    fastModel: anthropicFastModel,
    healthEndpoint: String(process.env.ANTHROPIC_HEALTH_ENDPOINT ?? "https://api.anthropic.com/v1/models").trim(),
    baseURL: normalizeBaseUrl(process.env.ANTHROPIC_BASE_URL ?? process.env.VITE_ANTHROPIC_BASE_URL, "https://api.anthropic.com"),
    anthropicVersion: String(process.env.ANTHROPIC_VERSION ?? process.env.VITE_ANTHROPIC_VERSION ?? "2023-06-01").trim() || "2023-06-01",
  },
  openai: {
    defaultModel: openaiDefault,
    fastModel: openaiFastModel,
    healthEndpoint: String(process.env.OPENAI_HEALTH_ENDPOINT ?? "https://api.openai.com/v1/models").trim(),
    baseURL: normalizeBaseUrl(process.env.OPENAI_BASE_URL ?? process.env.VITE_OPENAI_BASE_URL, "https://api.openai.com"),
    anthropicVersion: "2023-06-01",
  },
};

const apiKey =
  provider === "anthropic"
    ? String(process.env.ANTHROPIC_API_KEY ?? process.env.VITE_ANTHROPIC_API_KEY ?? "").trim()
    : String(process.env.OPENAI_API_KEY ?? process.env.VITE_OPENAI_API_KEY ?? "").trim();

export const AI_PROVIDER_CONFIG = Object.freeze({
  provider,
  apiKey,
  ...CONFIGS[provider],
});

// eslint-disable-next-line no-console
console.log(
  "[aiProvider] Server config:",
  "provider:", AI_PROVIDER_CONFIG.provider,
  "| model:", AI_PROVIDER_CONFIG.defaultModel,
  "| fastModel:", AI_PROVIDER_CONFIG.fastModel,
  "| keyLength:", AI_PROVIDER_CONFIG.apiKey?.length ?? 0,
);
