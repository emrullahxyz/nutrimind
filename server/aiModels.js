"use strict";

const { classifyError, quotaWait } = require("./aiGemini.js");
const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const discoverBudgetMs = () => Number(process.env.NUTRI_AI_DISCOVER_BUDGET_MS || 8000);
const MAX_TIMER_MS = 2_147_483_647;

let geminiCatalog = null;
let geminiRefresh = null;
let geminiRefreshFailure = null;
let geminiKey;
let credentialGeneration = 0;

function getGeminiCredentialGeneration() {
  const key = process.env.GEMINI_API_KEY || "";
  if (geminiKey !== key) {
    geminiKey = key;
    resetGeminiCatalog();
  }
  return credentialGeneration;
}

function getGeminiCatalog() {
  getGeminiCredentialGeneration();
  return geminiCatalog;
}

function getGeminiCatalogWait(now = Date.now()) {
  getGeminiCredentialGeneration();
  const wait = geminiRefreshFailure?.wait;
  return wait?.retryAt > now ? wait : null;
}

async function fetchGeminiPages(key, generation, signal) {
  const models = new Map();
  const seenTokens = new Set();
  const url = new URL(GEMINI_MODELS_URL);
  while (true) {
    if (generation !== getGeminiCredentialGeneration()) return { reason: "credential-changed" };
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "x-goog-api-key": key },
      redirect: "error",
      signal,
    });
    if (!response.ok) {
      const failure = { reason: "http-error", status: response.status };
      let json;
      try {
        json = await response.json();
      } catch {
        // HTTP status and Retry-After are useful even without a JSON error body.
      }
      signal.throwIfAborted();
      const { kind, retryAfterMs, quota } = classifyError(response, json, Date.now());
      return kind === "rate-limit" || kind === "invalid-key"
        ? { ...failure, kind, retryAfterMs, quota }
        : failure;
    }

    let page;
    try {
      page = await response.json();
    } catch {
      return { reason: "invalid-response" };
    }
    signal.throwIfAborted();
    if (!page || typeof page !== "object" || Array.isArray(page)) {
      return { reason: "invalid-response" };
    }
    const { models: entries = [], nextPageToken = "" } = page;
    if (!Array.isArray(entries) || typeof nextPageToken !== "string") {
      return { reason: "invalid-response" };
    }
    for (const entry of entries) {
      if (typeof entry?.name !== "string" || !/^models\/[^/?#]+$/.test(entry.name)) {
        return { reason: "invalid-response" };
      }
      const methods = entry.supportedGenerationMethods ?? [];
      if (!Array.isArray(methods) || methods.some((method) => typeof method !== "string")) {
        return { reason: "invalid-response" };
      }
      const inputModalities = normalizeModalities(entry.supportedInputModalities ?? entry.inputModalities);
      const outputModalities = normalizeModalities(entry.supportedOutputModalities ?? entry.outputModalities);
      models.set(entry.name, {
        id: entry.name,
        version: typeof entry.version === "string" ? entry.version : null,
        methods: [...new Set(methods)].sort(),
        ...(inputModalities && { inputModalities }),
        ...(outputModalities && { outputModalities }),
      });
    }
    if (!nextPageToken) return { models };
    if (seenTokens.has(nextPageToken)) return { reason: "repeated-page-token" };
    seenTokens.add(nextPageToken);
    url.searchParams.set("pageToken", nextPageToken);
  }
}

function normalizeModalities(values) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) return null;
  return Object.freeze([...new Set(values.map((value) => value.trim().toUpperCase()))].sort());
}

function equalModalities(previous, next) {
  if (!previous || !next) return previous === next;
  return previous.length === next.length && previous.every((value, index) => value === next[index]);
}

function commitGeminiCatalog(entries) {
  const previous = new Map(geminiCatalog?.models.map((model) => [model.id, model]));
  const models = [...entries.values()].map((model) => {
    const prior = previous.get(model.id);
    if (
      prior &&
      prior.version === model.version &&
      prior.methods.length === model.methods.length &&
      prior.methods.every((method, index) => method === model.methods[index]) &&
      equalModalities(prior.inputModalities, model.inputModalities) &&
      equalModalities(prior.outputModalities, model.outputModalities)
    ) {
      return prior;
    }
    // Capability and routing caches can use a WeakMap keyed by this record.
    Object.freeze(model.methods);
    return Object.freeze(model);
  });
  geminiCatalog = Object.freeze({
    revision: (geminiCatalog?.revision ?? 0) + 1,
    refreshedAt: Date.now(),
    models: Object.freeze(models),
    candidates: Object.freeze(models.filter(({ methods }) => methods.includes("generateContent"))),
  });
  return geminiCatalog;
}

function geminiCatalogFailure(reason, generation = getGeminiCredentialGeneration()) {
  return generation === getGeminiCredentialGeneration()
    ? { ok: false, reason, catalog: geminiCatalog }
    : { ok: false, reason: "credential-changed", catalog: null };
}

/** Give each caller its own wait limit, independently of the shared refresh. */
async function waitForGeminiRefresh(promise, timeoutMs, onTimeout) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(onTimeout()), Math.min(timeoutMs, MAX_TIMER_MS));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function loadGeminiCatalog(key, generation, timeoutMs) {
  const controller = new AbortController();
  const pageResult = await waitForGeminiRefresh(
    fetchGeminiPages(key, generation, controller.signal).catch(() => ({ reason: "network-error" })),
    timeoutMs,
    () => {
      controller.abort();
      return { reason: "timeout" };
    },
  );
  if (generation !== getGeminiCredentialGeneration())
    return { ok: false, reason: "credential-changed", catalog: null };
  if (!pageResult.models) {
    const now = Date.now();
    const result = { ok: false, ...pageResult, catalog: geminiCatalog };
    let wait;
    if (pageResult.kind === "rate-limit") {
      wait = quotaWait(pageResult, pageResult.quota?.violations ?? [], now);
    } else if (pageResult.kind === "invalid-key") {
      wait = { reason: "invalid-key", retryAt: now + 60_000 };
    } else if (!geminiCatalog) {
      wait = { reason: result.reason, retryAt: now + 15_000 };
    }
    geminiRefreshFailure = wait ? { result, wait } : null;
    return result;
  }
  geminiRefreshFailure = null;
  return { ok: true, catalog: commitGeminiCatalog(pageResult.models) };
}

/** Load the last complete catalog atomically. Explicit timeouts bound only the caller. */
function refreshGeminiCatalog({ timeoutMs } = {}) {
  const generation = getGeminiCredentialGeneration();
  if (getGeminiCatalogWait()) return Promise.resolve(geminiRefreshFailure.result);
  if (timeoutMs <= 0) return Promise.resolve(geminiCatalogFailure("timeout"));

  if (!geminiRefresh?.pending) {
    if (!geminiKey) return Promise.resolve(geminiCatalogFailure("missing-key"));

    const budgetMs = discoverBudgetMs();
    const refresh = { pending: true };
    geminiRefresh = refresh;
    refresh.promise = loadGeminiCatalog(
      geminiKey,
      generation,
      Number.isFinite(budgetMs) && budgetMs > 0 ? budgetMs : 8000,
    ).finally(() => {
      refresh.pending = false;
    });
  }

  const { promise } = geminiRefresh;
  return Number.isFinite(timeoutMs)
    ? waitForGeminiRefresh(promise, timeoutMs, () => geminiCatalogFailure("timeout", generation))
    : promise;
}

/** Create when the request takes its catalog snapshot. A refresh since that point
 *  (including a failed attempt) satisfies recovery for peers on the same snapshot.
 *  An optional earlier wait boundary reserves part of the request for a fallback. */
function createGeminiCatalogRecovery(deadlineAt) {
  const generation = getGeminiCredentialGeneration();
  const observedRefresh = geminiRefresh;
  const refreshWasPending = observedRefresh?.pending;
  let used = false;
  return (status, waitUntil = deadlineAt) => {
    if (used || (status !== 404 && status !== 410)) return null;
    if (generation !== getGeminiCredentialGeneration()) return null;
    const remainingMs = Math.min(deadlineAt, waitUntil) - Date.now();
    if (!(remainingMs > 0)) return null;
    used = true;
    const promise =
      geminiRefresh && (refreshWasPending || geminiRefresh !== observedRefresh)
        ? geminiRefresh.promise
        : refreshGeminiCatalog();
    return waitForGeminiRefresh(promise, remainingMs, () =>
      geminiCatalogFailure("timeout", generation),
    );
  };
}

/** Retire the current catalog, refresh and failure state together. */
function resetGeminiCatalog() {
  credentialGeneration += 1;
  geminiCatalog = null;
  geminiRefresh = null;
  geminiRefreshFailure = null;
}

module.exports = {
  getGeminiCatalog,
  getGeminiCatalogWait,
  getGeminiCredentialGeneration,
  refreshGeminiCatalog,
  createGeminiCatalogRecovery,
  resetGeminiCatalog,
};
