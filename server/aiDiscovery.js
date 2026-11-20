"use strict";

const aiModels = require("./aiModels.js");
const { GEMINI_PROBE_INTERVAL_MS } = require("./aiGemini.js");

const MIN_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

const geminiEnabled = () => ["auto", "gemini"].includes(process.env.NUTRIMIND_LLM_PROVIDER);
const backgroundEnabled = () =>
  geminiEnabled() &&
  Boolean(process.env.GEMINI_API_KEY?.trim()) &&
  process.env.NUTRI_AI_AUTOMODEL !== "0";

const GEMINI_STARTUP_RETRY_MS = 60_000;
let geminiSchedule = null;

/** Refresh the authenticated catalog and optionally run a separate synthetic probe cadence. */
function startGeminiDiscovery(intervalMs = DEFAULT_INTERVAL_MS, { probeRound } = {}) {
  if (geminiSchedule || !backgroundEnabled()) return stopGeminiDiscovery;
  const interval = Math.max(MIN_INTERVAL_MS, Number(intervalMs) || DEFAULT_INTERVAL_MS);
  const schedule = { timer: null, probeTimer: null };
  geminiSchedule = schedule;

  const probe = async () => {
    if (geminiSchedule !== schedule || !backgroundEnabled()) return;
    try {
      await probeRound(aiModels.getGeminiCatalog()?.candidates ?? []);
    } catch {
      // A background probe failure leaves the catalog scheduler active.
    } finally {
      if (geminiSchedule === schedule) {
        schedule.probeTimer = setTimeout(probe, GEMINI_PROBE_INTERVAL_MS);
        schedule.probeTimer.unref?.();
      }
    }
  };

  const tick = async () => {
    if (geminiSchedule !== schedule || !backgroundEnabled()) return;
    const { catalog } = await aiModels.refreshGeminiCatalog();
    if (geminiSchedule !== schedule || !backgroundEnabled()) return;
    if (catalog && probeRound && schedule.probeTimer === null) {
      schedule.probeTimer = setTimeout(probe, 0);
      schedule.probeTimer.unref?.();
    }
    schedule.timer = setTimeout(tick, catalog ? interval : GEMINI_STARTUP_RETRY_MS);
    schedule.timer.unref?.();
  };
  void tick();
  return stopGeminiDiscovery;
}

function stopGeminiDiscovery() {
  if (!geminiSchedule) return;
  clearTimeout(geminiSchedule.timer);
  clearTimeout(geminiSchedule.probeTimer);
  geminiSchedule = null;
}

module.exports = {
  geminiEnabled,
  startGeminiDiscovery,
  stopGeminiDiscovery,
  _aiModels: aiModels,
};
