import "./lib/sentry";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./i18n/i18n";
import "./index.css";
import { initIosEmulation } from "./lib/iosEmulate";
import { startLongTaskProbe } from "./lib/perfProbe";

// DEV-ONLY: masaüstü Preview'da iPhone koşullarını taklit eder (`?emulate=island`).
// Üretimde gövdesi `import.meta.env.DEV` ile ağaçtan düşer.
initIosEmulation();

// Uzun görev probu: iPhone'dan gelen geri bildirime "ne kadar takılıyor"
// sorusunun sayısını ekler (desteklemeyen tarayıcıda hiçbir şey yapmaz).
startLongTaskProbe();

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// PWA: yalnızca üretimde service worker kaydı (dev'de HMR/önbellek çakışmasın).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
