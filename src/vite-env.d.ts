/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SYNTHESIS_API_BASE_URL?: string;
  readonly VITE_SYNTHESIS_PHASE1_TIMEOUT_MS?: string;
  readonly VITE_INSTITUTION_AI_PROVIDER?: "openai" | "anthropic";
  readonly VITE_INSTITUTION_MATCH_THRESHOLD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  glob: <T = unknown>(
    pattern: string,
    options?: {
      eager?: boolean;
      import?: string;
    },
  ) => Record<string, T>;
}
