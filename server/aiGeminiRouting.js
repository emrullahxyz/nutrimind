"use strict";

const { quotaWait, nextPacificMidnight } = require("./aiGemini.js");

const BUDGET_MS = 25_000;
const MAX_CANDIDATES = 10;
const MAX_GENERATION_OR_SLOW_ATTEMPTS = 3;
const MISSING_WAIT_MS = 5 * 60_000;
const TRANSIENT_WAIT_MS = 15_000;
function modelId(value) {
  return value ? "models/" + value.replace(/^models\//, "") : null;
}

function isProjectLimit({ quotaDimensions, quotaId = "", quotaMetric = "" }) {
  if (quotaDimensions?.model) return false;
  const scope = quotaDimensions?.scope?.toLowerCase();
  if (scope) return scope === "project";
  const dimension = quotaId.replace(/[^a-z]/gi, "").toLowerCase();
  const metric = quotaMetric.replace(/[^a-z]/gi, "").toLowerCase();
  return (
    (dimension.includes("perproject") || metric.includes("perproject")) &&
    !dimension.includes("permodel") &&
    !metric.includes("permodel")
  );
}

function failure(kind, retryAt, now = Date.now()) {
  if (kind === "rate-limit")
    return {
      status: 429,
      body: {
        error: "AI rate limit protected",
        code: "ai_rate_limit",
        retryAfter: Math.max(1, Math.ceil((retryAt - now) / 1000)),
      },
    };
  const [status, code, error] = {
    "missing-key": [500, "ai_not_configured", "AI service not configured"],
    timeout: [504, "ai_timeout", "AI service timed out"],
    network: [504, "ai_unreachable", "AI service unreachable"],
    "bad-response": [502, "ai_bad_response", "AI service returned an unexpected response"],
    "invalid-image": [400, "ai_bad_request", "AI service could not process this image"],
  }[kind] || [502, "ai_provider_error", "AI service error"];
  return { status, body: { error, code } };
}

function failurePriority(kind) {
  return (
    {
      "bad-response": 4,
      "provider-error": 4,
      unavailable: 4,
      timeout: 3,
      network: 2,
      "rate-limit": 0,
    }[kind] ?? (kind ? 1 : 0)
  );
}

function createGeminiRouting({
  getGeminiCatalog,
  refreshGeminiCatalog,
  createGeminiCatalogRecovery,
  getGeminiCapability,
  ensureGeminiCapability,
  runVerifiedGemini,
  runGeminiProbeRound,
  getApiKey,
  getCredentialGeneration = getApiKey,
  getGeminiCatalogWait = () => null,
}) {
  let observed = new WeakMap();
  const quotaById = new Map();
  const activeByMode = new Map();
  const lastTried = { text: new Map(), vision: new Map() };
  let sequence = 0;
  let projectWait;
  let keyWait;
  let generation;

  function currentCredential() {
    const current = getCredentialGeneration();
    if (current !== generation) {
      generation = current;
      observed = new WeakMap();
      activeByMode.clear();
      lastTried.text.clear();
      lastTried.vision.clear();
      sequence = 0;
      keyWait = null;
      projectWait = null;
      quotaById.clear();
    }
    return current;
  }

  function stateFor(model) {
    if (!observed.has(model)) observed.set(model, { lastWait: null, actual: null });
    return observed.get(model);
  }

  function actualId(model, capability) {
    return modelId(capability.modelVersion) || stateFor(model).actual;
  }

  function findQuota(model, capability, now) {
    const requested = quotaById.get(model.id);
    const actual = quotaById.get(actualId(model, capability));
    return [requested, actual]
      .filter((wait) => wait?.retryAt > now)
      .sort((a, b) => b.retryAt - a.retryAt)[0];
  }

  function globalWait(now) {
    if (keyWait?.retryAt > now) return keyWait;
    if (projectWait?.retryAt > now) return projectWait;
    const catalogWait = getGeminiCatalogWait(now);
    return !getGeminiCatalog() || catalogWait?.reason === "invalid-key" ? catalogWait : null;
  }

  function rememberWait(previous, next, now) {
    return previous?.retryAt > now
      ? { ...next, retryAt: Math.max(previous.retryAt, next.retryAt) }
      : next;
  }

  function record(model, mode, result, requestCredential) {
    if (requestCredential !== currentCredential()) return;
    const now = Date.now();
    const state = stateFor(model);
    if (result.ok) {
      if (result.modelVersion) state.actual = modelId(result.modelVersion);
      return;
    }
    if (result.kind === "invalid-key") {
      keyWait = { reason: "invalid-key", retryAt: now + 60_000 };
      return;
    }
    if (result.kind === "rate-limit") {
      const limits = result.quota?.violations ?? [];
      const project = limits.filter(isProjectLimit);
      if (project.length)
        projectWait = rememberWait(projectWait, quotaWait(result, project, now), now);
      const scoped = limits.filter((limit) => !isProjectLimit(limit));
      if (project.length && !scoped.length) return;
      const byId = new Map();
      const capability = getGeminiCapability(model, mode);
      for (const limit of scoped) {
        const id = modelId(limit.quotaDimensions?.model) || actualId(model, capability) || model.id;
        const alias = getGeminiCatalog()?.candidates.find((candidate) => candidate.id === id);
        const affected = new Set([id]);
        if (alias) {
          for (const inputMode of ["text", "vision"]) {
            const runtime = actualId(alias, getGeminiCapability(alias, inputMode));
            if (runtime) affected.add(runtime);
          }
        }
        for (const name of affected) {
          const entries = byId.get(name) ?? [];
          entries.push(limit);
          byId.set(name, entries);
        }
      }
      if (!scoped.length) byId.set(actualId(model, capability) || model.id, []);
      for (const [id, evidence] of byId) {
        const wait = quotaWait(result, evidence, now);
        quotaById.set(id, rememberWait(quotaById.get(id), wait, now));
      }
      // The responding path consumed the quota even when this is the first evidence
      // of a runtime name and it differs from the requested catalog name.
      const wait = quotaWait(result, scoped, now);
      quotaById.set(model.id, rememberWait(quotaById.get(model.id), wait, now));
      return;
    }
    const { kind, upstream, retryAfterMs } = result;
    if (
      (kind === "missing-model" && (upstream === 404 || upstream === 410)) ||
      kind === "forbidden"
    ) {
      state.lastWait = { reason: kind, retryAt: now + MISSING_WAIT_MS };
    } else if (
      ["timeout", "unavailable", "network", "bad-response", "provider-error"].includes(kind)
    ) {
      state.lastWait = {
        reason: kind,
        retryAt: now + Math.max(TRANSIENT_WAIT_MS, retryAfterMs ?? 0),
      };
    }
  }

  function candidates(mode, now) {
    return (getGeminiCatalog()?.candidates ?? []).flatMap((model) => {
      const capability = getGeminiCapability(model, mode);
      if (capability.state === "incompatible") return [];
      const state = stateFor(model);
      const quota = findQuota(model, capability, now);
      const waiting = quota || (state.lastWait?.retryAt > now ? state.lastWait : null);
      return [{ model, capability, actual: actualId(model, capability), waiting }];
    });
  }

  function eligible(mode, attemptedNames, attemptedRuntime, now) {
    return candidates(mode, now)
      .filter(
        ({ model, actual, waiting }) =>
          !waiting &&
          !attemptedNames.has(model.id) &&
          !attemptedRuntime.has(model.id) &&
          !(actual && (attemptedRuntime.has(actual) || attemptedNames.has(actual))),
      )
      .sort(
        (a, b) =>
          (a.capability.latencyMs ?? Infinity) - (b.capability.latencyMs ?? Infinity) ||
          (lastTried[mode].get(a.model.id) ?? 0) - (lastTried[mode].get(b.model.id) ?? 0),
      );
  }

  async function routeGemini(
    mode,
    input,
    { deadlineAt = Date.now() + BUDGET_MS, minStepMs = 0 } = {},
  ) {
    const requestCredential = currentCredential();
    if (!getApiKey()) return failure("missing-key");
    const firstWait = globalWait(Date.now());
    if (firstWait) return failure(firstWait.reason, firstWait.retryAt);
    if (!getGeminiCatalog()) {
      const refreshed = await refreshGeminiCatalog({ timeoutMs: deadlineAt - Date.now() });
      if (requestCredential !== currentCredential()) return failure("credential-changed");
      if (!refreshed.ok) {
        const wait = globalWait(Date.now());
        return wait ? failure(wait.reason, wait.retryAt) : failure(refreshed.reason);
      }
    }
    const recover = createGeminiCatalogRecovery(deadlineAt);
    const attemptedNames = new Set();
    const attemptedRuntime = new Set();
    let generationOrSlowAttempts = 0;
    let failureKind;
    const rememberFailure = (kind) => {
      if (failurePriority(kind) > failurePriority(failureKind)) failureKind = kind;
    };
    while (
      attemptedNames.size < MAX_CANDIDATES &&
      generationOrSlowAttempts < MAX_GENERATION_OR_SLOW_ATTEMPTS
    ) {
      const now = Date.now();
      if (now >= deadlineAt || deadlineAt - now < minStepMs) break;
      if (globalWait(now) || requestCredential !== currentCredential()) break;
      const [candidate, fallback] = eligible(mode, attemptedNames, attemptedRuntime, now);
      if (!candidate) break;
      const { model, actual } = candidate;
      const hasFallback =
        fallback &&
        attemptedNames.size + 1 < MAX_CANDIDATES &&
        generationOrSlowAttempts + 1 < MAX_GENERATION_OR_SLOW_ATTEMPTS;
      const attemptDeadline = hasFallback
        ? Math.min(deadlineAt, now + Math.max(minStepMs, Math.ceil((deadlineAt - now) / 2)))
        : deadlineAt;
      attemptedNames.add(model.id);
      lastTried[mode].set(model.id, ++sequence);
      let capability = candidate.capability;
      if (capability.state !== "verified") {
        const proof = await ensureGeminiCapability(model, mode, {
          deadlineAt: attemptDeadline,
          maxMs: Math.min(10_000, Math.ceil((attemptDeadline - now) / 2)),
          takeAttempt: () =>
            requestCredential === currentCredential() &&
            !globalWait(Date.now()) &&
            !findQuota(model, getGeminiCapability(model, mode), Date.now()),
        });
        if (requestCredential !== currentCredential()) return failure("credential-changed");
        record(model, mode, proof, requestCredential);
        if (!proof.ok) {
          if (proof.kind === "timeout" || proof.kind === "network") {
            generationOrSlowAttempts += 1;
          }
          rememberFailure(proof.kind);
          if (proof.upstream === 404 || proof.upstream === 410) {
            await recover(proof.upstream, attemptDeadline);
          }
          continue;
        }
        capability = proof;
      }
      const runtime = actualId(model, capability) || actual;
      const checkedAt = Date.now();
      if (globalWait(checkedAt) || requestCredential !== currentCredential()) break;
      if (checkedAt >= attemptDeadline || findQuota(model, capability, checkedAt)) continue;
      if (
        runtime &&
        (attemptedRuntime.has(runtime) || (runtime !== model.id && attemptedNames.has(runtime)))
      )
        continue;
      if (runtime) attemptedRuntime.add(runtime);
      generationOrSlowAttempts += 1;
      const result = await runVerifiedGemini(model, mode, {
        ...input,
        deadlineAt: attemptDeadline,
      });
      if (requestCredential !== currentCredential()) return failure("credential-changed");
      record(model, mode, result, requestCredential);
      if (result.ok) {
        const previous = activeByMode.get(mode);
        const modelVersion =
          result.modelVersion ??
          getGeminiCapability(model, mode).modelVersion ??
          (previous?.model === model ? previous.modelVersion : null);
        activeByMode.set(mode, { model, modelVersion });
        return { status: 200, body: result.body };
      }
      rememberFailure(result.kind);
      if (result.kind === "invalid-image") return failure(result.kind);
      if (result.upstream === 404 || result.upstream === 410) {
        await recover(result.upstream, attemptDeadline);
      }
    }
    if (requestCredential !== currentCredential()) return failure("credential-changed");
    const now = Date.now();
    const wait = globalWait(now);
    if (wait) return failure(wait.reason, wait.retryAt, now);
    const available = candidates(mode, now).filter(
      ({ waiting }) => waiting?.reason !== "missing-model" && waiting?.reason !== "forbidden",
    );
    if (available.length && available.every(({ waiting }) => waiting?.reason === "rate-limit")) {
      return failure(
        "rate-limit",
        Math.min(...available.map(({ waiting }) => waiting.retryAt)),
        now,
      );
    }
    if (now >= deadlineAt || (!failureKind && deadlineAt - now < minStepMs)) {
      return failure("timeout");
    }
    return failure(failureKind);
  }

  async function probeGeminiRoutingRound(models) {
    const requestCredential = currentCredential();
    if (!getApiKey() || globalWait(Date.now())) return;
    return runGeminiProbeRound(models, {
      allow(model, mode) {
        const now = Date.now();
        return (
          requestCredential === currentCredential() &&
          !globalWait(now) &&
          !findQuota(model, getGeminiCapability(model, mode), now) &&
          !(stateFor(model).lastWait?.retryAt > now)
        );
      },
      onResult(model, mode, result) {
        record(model, mode, result, requestCredential);
      },
    });
  }

  function geminiRoutingSnapshot() {
    const now = Date.now();
    currentCredential();
    const current = getApiKey();
    const catalog = getGeminiCatalog();
    const safe = (value) =>
      typeof value === "string" &&
      /^[\w./:-]{1,180}$/.test(value) &&
      !(current && value.includes(current)) &&
      !/AIza[\w-]{10,}|sk-[\w-]{10,}/.test(value)
        ? value
        : null;
    const sanitizeWait = (wait) =>
      wait
        ? {
            reason: wait.reason,
            retryAt: wait.retryAt,
            ...(wait.limits && {
              limits: wait.limits.map(({ quotaId, quotaMetric, quotaValue, quotaDimensions }) => ({
                quotaId: safe(quotaId),
                quotaMetric: safe(quotaMetric),
                quotaValue: Number.isFinite(quotaValue) ? quotaValue : null,
                model: safe(quotaDimensions?.model),
                scope: ["project", "model"].includes(quotaDimensions?.scope)
                  ? quotaDimensions.scope
                  : null,
              })),
            }),
          }
        : null;
    return {
      catalogRefreshedAt: catalog?.refreshedAt ?? null,
      projectWaiting: sanitizeWait(globalWait(now)),
      active: Object.fromEntries(
        ["text", "vision"].map((mode) => {
          const entry = activeByMode.get(mode);
          const currentEntry = catalog?.candidates.includes(entry?.model) ? entry : null;
          return [
            mode,
            currentEntry
              ? { model: safe(entry.model.id), modelVersion: safe(entry.modelVersion) }
              : null,
          ];
        }),
      ),
      models: (catalog?.candidates ?? []).map((model) => {
        const describe = (mode) => {
          const cap = getGeminiCapability(model, mode);
          return {
            state: cap.state,
            format: cap.format ?? null,
            verifiedAt: cap.verifiedAt ?? null,
            latencyMs: cap.latencyMs ?? null,
            modelVersion: safe(cap.modelVersion),
          };
        };
        const textQuota = findQuota(model, getGeminiCapability(model, "text"), now);
        const visionQuota = findQuota(model, getGeminiCapability(model, "vision"), now);
        const transient = stateFor(model).lastWait;
        const waiting =
          [textQuota, visionQuota].filter(Boolean).sort((a, b) => b.retryAt - a.retryAt)[0] ||
          (transient?.retryAt > now ? transient : null);
        return {
          model: safe(model.id),
          text: describe("text"),
          vision: describe("vision"),
          waiting: sanitizeWait(waiting),
        };
      }),
    };
  }

  return { routeGemini, probeGeminiRoutingRound, geminiRoutingSnapshot };
}

module.exports = { createGeminiRouting, nextPacificMidnight };
