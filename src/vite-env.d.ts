/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SYNTHESIS_API_BASE_URL?: string;
  readonly VITE_INSTITUTION_AI_PROVIDER?: "openai" | "anthropic";
  readonly VITE_INSTITUTION_MATCH_THRESHOLD?: string;
  readonly VITE_ANTHROPIC_API_KEY?: string;
  readonly VITE_ANTHROPIC_MODEL?: string;
  readonly VITE_ANTHROPIC_BASE_URL?: string;
  readonly VITE_ANTHROPIC_VERSION?: string;
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_OPENAI_MODEL?: string;
  readonly VITE_OPENAI_BASE_URL?: string;
  readonly VITE_OPENAI_PROJECT?: string;
  readonly VITE_OPENAI_ORGANIZATION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
