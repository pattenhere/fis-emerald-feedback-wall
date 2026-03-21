export type AIProvider = "anthropic" | "openai";

export type AIProviderConfig = {
  provider: AIProvider;
  apiKey: string;
  defaultModel: string;
  fastModel: string;
  healthEndpoint: string;
  baseURL: string;
};

const normalizeProvider = (value: unknown): AIProvider => {
  const candidate = String(value ?? "").trim().toLowerCase();
  return candidate === "anthropic" || candidate === "openai" ? candidate : "anthropic";
};

const normalizeBaseUrl = (value: unknown, fallback: string): string => {
  const raw = String(value ?? fallback).trim();
  if (!raw) return fallback;
  const trimmed = raw.replace(/\/+$/u, "");
  return trimmed.endsWith("/v1") ? trimmed.slice(0, -3) : trimmed;
};

const PROVIDER = normalizeProvider(
  import.meta.env.VITE_SYNTHESIS_API_PROVIDER ?? "anthropic",
);

const resolveModel = (value: unknown, fallback: string): string => {
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
};

const anthropicDefault = resolveModel(
  import.meta.env.VITE_ANTHROPIC_MODEL ??
    (PROVIDER === "anthropic" ? import.meta.env.VITE_SYNTHESIS_MODEL : undefined),
  "claude-sonnet-4-6",
);
const anthropicFastModel = resolveModel(
  import.meta.env.VITE_ANTHROPIC_FAST_MODEL,
  "claude-haiku-4-5-20251001",
);
const openaiDefault = resolveModel(
  import.meta.env.VITE_OPENAI_MODEL ??
    (PROVIDER === "openai" ? import.meta.env.VITE_SYNTHESIS_MODEL : undefined),
  "gpt-4o",
);
const openaiFastModel = resolveModel(
  import.meta.env.VITE_OPENAI_FAST_MODEL,
  "gpt-4o-mini",
);

const CONFIGS: Record<AIProvider, Omit<AIProviderConfig, "provider" | "apiKey">> = {
  anthropic: {
    defaultModel: anthropicDefault,
    fastModel: anthropicFastModel,
    baseURL: normalizeBaseUrl(import.meta.env.VITE_ANTHROPIC_BASE_URL, "https://api.anthropic.com"),
    healthEndpoint: "https://api.anthropic.com/v1/models",
  },
  openai: {
    defaultModel: openaiDefault,
    fastModel: openaiFastModel,
    baseURL: normalizeBaseUrl(import.meta.env.VITE_OPENAI_BASE_URL, "https://api.openai.com"),
    healthEndpoint: "https://api.openai.com/v1/models",
  },
};

const API_KEY =
  PROVIDER === "anthropic" ? (import.meta.env.VITE_ANTHROPIC_API_KEY ?? "") : (import.meta.env.VITE_OPENAI_API_KEY ?? "");

export const AI_PROVIDER_CONFIG: AIProviderConfig = Object.freeze({
  provider: PROVIDER,
  apiKey: API_KEY,
  ...CONFIGS[PROVIDER],
});

console.log(
  "[aiProvider] Provider:",
  AI_PROVIDER_CONFIG.provider,
  "| Key set:",
  AI_PROVIDER_CONFIG.apiKey.length > 0,
  "| Model:",
  AI_PROVIDER_CONFIG.defaultModel,
);
