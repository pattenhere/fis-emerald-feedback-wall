import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(function (_a) {
    var _b, _c, _d, _e;
    var mode = _a.mode;
    var env = loadEnv(mode, ".", "");
    var apiBase = (_b = env.VITE_SYNTHESIS_API_BASE_URL) === null || _b === void 0 ? void 0 : _b.trim();
    var apiPort = (_c = env.API_PORT) === null || _c === void 0 ? void 0 : _c.trim();
    var apiTarget = apiBase || "http://localhost:".concat(apiPort || "8794");
    return {
        plugins: [react()],
        define: {
            "process.env.EMERALD_UI_VARIANT": JSON.stringify((_d = env.EMERALD_UI_VARIANT) !== null && _d !== void 0 ? _d : "legacy"),
            "process.env.EMERALD_FEEDBACK_PANEL_STAY_OPEN": JSON.stringify((_e = env.EMERALD_FEEDBACK_PANEL_STAY_OPEN) !== null && _e !== void 0 ? _e : "false"),
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
