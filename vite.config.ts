import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Yerel geliştirmede /api istekleri aynı makinedeki Node backend'ine gider.
const apiProxy = {
  "/api": {
    target: "http://127.0.0.1:8790",
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: apiProxy },
  // `vite preview` ayrı bir vekil ayarı okur. Olmadığı için üretim derlemesi
  // yerelde veri göremiyordu — yani "local-first: uzak işlemden önce localhost'ta
  // doğrula" ilkesi üretim derlemesi için uygulanamıyordu. Dev'de görünmeyen
  // (StrictMode, service worker) davranışlar tam olarak burada ortaya çıkıyor.
  preview: { port: 4173, proxy: apiProxy },
});
