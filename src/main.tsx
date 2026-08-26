import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./i18n/i18n";
import "./index.css";

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
