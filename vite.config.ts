import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

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
