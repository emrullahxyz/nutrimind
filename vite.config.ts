import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Yerel geliştirmede /api istekleri aynı makinedeki Node backend'ine gider.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8790",
        changeOrigin: true,
      },
    },
  },
});
