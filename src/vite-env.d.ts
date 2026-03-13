/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SYNTHESIS_API_BASE_URL?: string;
  readonly VITE_ANTHROPIC_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
