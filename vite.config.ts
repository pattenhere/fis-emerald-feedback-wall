import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

declare const process: {
  env: Record<string, string | undefined>;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiBase = env.VITE_SYNTHESIS_API_BASE_URL?.trim();
  const apiPort = env.API_PORT?.trim();
  const apiTarget = apiBase || `http://localhost:${apiPort || "8794"}`;

  return {
    plugins: [react()],
    define: {
      "process.env.EMERALD_UI_VARIANT": JSON.stringify(env.EMERALD_UI_VARIANT ?? "legacy"),
      "process.env.EMERALD_FEEDBACK_PANEL_STAY_OPEN": JSON.stringify(env.EMERALD_FEEDBACK_PANEL_STAY_OPEN ?? "false"),
      "process.env.SYNTHESIS_API_PROVIDER": JSON.stringify(
        env.SYNTHESIS_API_PROVIDER ??
          env.SYNTHESIS_AI_PROVIDER ??
          process.env.SYNTHESIS_API_PROVIDER ??
          process.env.SYNTHESIS_AI_PROVIDER ??
          "anthropic",
      ),
      "process.env.GREETER_IDLE_RESET_MINUTES": JSON.stringify(env.GREETER_IDLE_RESET_MINUTES ?? "3"),
    },
    server: {
      port: 4000,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        input: {
          main: "index.html",
          mobile: "mobile.html",
          universe: "universe.html",
        },
      },
    },
  };
});
