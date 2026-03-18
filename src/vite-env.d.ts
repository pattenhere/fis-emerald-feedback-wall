/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SYNTHESIS_API_BASE_URL?: string;
  readonly VITE_INSTITUTION_AI_PROVIDER?: "openai" | "anthropic";
  readonly VITE_INSTITUTION_MATCH_THRESHOLD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
