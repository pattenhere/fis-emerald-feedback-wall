import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4000,
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
});
