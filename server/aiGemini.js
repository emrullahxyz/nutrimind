"use strict";

const fs = require("node:fs");
const path = require("node:path");

const GENERATION_URL = "https://generativelanguage.googleapis.com/v1beta/";
const GEMINI_PROBE_INTERVAL_MS = 5 * 60_000;
const PROBE_TIMEOUT_MS = 10_000;
const PROOF_TTL_MS = 24 * 60 * 60_000;
const MODES = ["text", "vision"];

const PROBE_ITEM = {
  name: "Mavrix 7K",
  baseAmount: 100,
  nutrition: { kcal: 273, protein: 13, carbs: 26, fat: 12, fiber: 4 },
};
const PROBE_TEXT =
  "Product: Mavrix 7K\nPer 100 g\nEnergy: 273 kcal\nProtein: 13 g\nCarbohydrate: 26 g\nFat: 12 g\nFiber: 4 g";
const PROBE_INSTRUCTION =
  "Transcribe the supplied nutrition label exactly into one item. Keep the exact product name without adding the weight to it. Include the gram basis in baseAmount. Do not estimate or invent values.";
let probePng;

function failed(kind, startedAt = Date.now(), upstream = null, metadata) {
  return { ok: false, kind, upstream, latencyMs: Date.now() - startedAt, ...metadata };
}

function safeIdentifier(value) {
  return typeof value === "string" && /^[\w./:-]{1,180}$/.test(value) ? value : null;
}

function nonnegativeNumber(value) {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function errorDetails(error, type) {
  const details = Array.isArray(error?.details) ? error.details : [];
  return details.filter((detail) => detail?.["@type"] === "type.googleapis.com/google.rpc." + type);
}

function quotaEvidence(error) {
  const violations = errorDetails(error, "QuotaFailure").flatMap(({ violations }) =>
    Array.isArray(violations) ? violations : [],
  );
  return violations
    .filter((entry) => entry && typeof entry === "object")
    .slice(0, 30)
    .map((entry) => {
      const quotaId = safeIdentifier(entry.quotaId);
      const quotaMetric = safeIdentifier(entry.quotaMetric);
      const quotaValue = nonnegativeNumber(entry.quotaValue);
      const model = safeIdentifier(entry.quotaDimensions?.model);
      const scope = safeIdentifier(entry.quotaDimensions?.scope);
      return {
        ...(quotaId && { quotaId }),
        ...(quotaMetric && { quotaMetric }),
        ...(quotaValue !== null && { quotaValue }),
        ...((model || scope) && {
          quotaDimensions: { ...(model && { model }), ...(scope && { scope }) },
        }),
      };
    });
}

function retryAfterMs(error, headers) {
  const header = headers?.get("Retry-After")?.trim();
  const seconds = nonnegativeNumber(header);
  const date = header && seconds === null ? Date.parse(header) - Date.now() : 0;
  const upstreamDelays = errorDetails(error, "RetryInfo").map(({ retryDelay }) => {
    const seconds =
      typeof retryDelay === "string" && retryDelay.endsWith("s")
        ? nonnegativeNumber(retryDelay.slice(0, -1))
        : null;
    return seconds === null ? 0 : seconds * 1_000;
  });
  return Math.ceil(
    Math.max((seconds ?? 0) * 1_000, Number.isFinite(date) ? date : 0, ...upstreamDelays),
  );
}

function classifyError(response, json, startedAt) {
  const { status } = response;
  const error = json?.error;
  const message = typeof error?.message === "string" ? error.message : "";
  const reject = (kind, metadata) => failed(kind, startedAt, status, metadata);
  if (status === 429) {
    const delay = retryAfterMs(error, response.headers);
    const violations = quotaEvidence(error);
    return reject("rate-limit", {
      ...(delay > 0 && { retryAfterMs: delay }),
      ...(violations.length > 0 && { quota: { violations } }),
    });
  }
  if (status === 404 || status === 410) return reject("missing-model");
  if (status >= 500)
    return reject("unavailable", {
      retryAfterMs: retryAfterMs(error, response.headers) || undefined,
    });
  if (
    status === 401 ||
    errorDetails(error, "ErrorInfo").some(
      ({ reason }) =>
        typeof reason === "string" &&
        /^API_KEY_(?:INVALID|EXPIRED|REVOKED|.+_BLOCKED)$/.test(reason),
    ) ||
    /api key (?:not valid|is invalid|has expired)/i.test(message)
  )
    return reject("invalid-key");
  if (status === 403) return reject("forbidden");
  if (status === 400 || status === 422) {
    const rejectsFeature =
      /not supported|does not support|unsupported|not enabled|unknown (?:name|field)|not available|cannot process/i.test(
        message,
      );
    if (
      rejectsFeature &&
      /response[_ ]?(?:schema|mime[_ ]?type)|structured (?:output|json)|json (?:mode|output)/i.test(
        message,
      )
    ) {
      return reject("schema-rejected");
    }
    if (
      (rejectsFeature &&
        /(?:input|output|requested) modalit|(?:image|vision|text) (?:input|output)|input images?|image capability|multimodal/i.test(
          message,
        )) ||
      /(?:does not support images|only supports text input)/i.test(message)
    )
      return reject("unsupported-modality");
    if (
      /(?:invalid|malformed|corrupt(?:ed)?) (?:input )?(?:image|base64)|(?:unable|failed) to (?:decode|process|read) (?:the )?(?:input )?image|image (?:could not be decoded|is invalid)/i.test(
        message,
      )
    )
      return reject("invalid-image");
  }
  return reject("provider-error");
}

function declaredCompatible(model, mode) {
  return (
    (!model.inputModalities ||
      model.inputModalities.includes(mode === "vision" ? "IMAGE" : "TEXT")) &&
    (!model.outputModalities || model.outputModalities.includes("TEXT"))
  );
}

const UNTESTED = Object.freeze({ state: "untested" });
const INCOMPATIBLE = Object.freeze({ state: "incompatible" });

function createGeminiGeneration({
  schema,
  buildJsonModePrompt,
  parseAiItem,
  stripMarkdownFence,
  getCatalog,
  getApiKey,
}) {
  const records = new WeakMap();
  let cursor = 0;
  let runningRound = false;
  let nextRoundAt = 0;

  function currentModel(model) {
    return getCatalog()?.candidates.includes(model);
  }

  function getGeminiCapability(model, mode) {
    if (!MODES.includes(mode) || !declaredCompatible(model, mode)) return INCOMPATIBLE;
    const proof = records.get(model)?.get(mode)?.proof;
    if (!proof || (proof.state === "verified" && Date.now() - proof.verifiedAt >= PROOF_TTL_MS))
      return UNTESTED;
    return proof;
  }

  function slotFor(model, mode) {
    let modes = records.get(model);
    if (!modes) records.set(model, (modes = new Map()));
    if (!modes.has(mode)) modes.set(mode, {});
    return modes.get(mode);
  }

  function parseResponse(json) {
    const parts = json?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    const text = parts
      .filter((part) => !part?.thought && typeof part?.text === "string")
      .map(({ text }) => text)
      .join("");
    let output;
    try {
      output = JSON.parse(stripMarkdownFence(text));
    } catch {
      return null;
    }
    if (!Array.isArray(output?.items)) return null;
    const items = output.items.map(parseAiItem);
    if (items.includes(null)) return null;
    const { healthNote } = output;
    return { items, ...(typeof healthNote === "string" && healthNote && { healthNote }) };
  }

  async function generate(
    model,
    format,
    { prompt, lang, imageBase64, mimeType, deadlineAt },
    accept,
  ) {
    const startedAt = Date.now();
    const key = getApiKey();
    if (!key) return failed("invalid-key", startedAt);
    if (!currentModel(model)) return failed("missing-model", startedAt);
    const remaining = deadlineAt - startedAt;
    if (remaining <= 0) return failed("timeout", startedAt);
    const parts = [{ text: format === "schema" ? prompt : buildJsonModePrompt(prompt, lang) }];
    if (imageBase64) parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
    const request = {
      contents: [{ parts }],
      ...(format === "schema" && {
        generationConfig: { responseMimeType: "application/json", responseSchema: schema },
      }),
    };
    const signal = AbortSignal.timeout(remaining);
    try {
      const response = await fetch(GENERATION_URL + model.id + ":generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(request),
        redirect: "error",
        signal,
      });
      const raw = await response.text();
      signal.throwIfAborted();
      if (Date.now() >= deadlineAt) return failed("timeout", startedAt);
      let json;
      try {
        json = JSON.parse(raw);
      } catch {
        // HTTP metadata remains useful even if Google or an intermediary sent no JSON.
      }
      if (!response.ok) return classifyError(response, json, startedAt);
      const body = parseResponse(json);
      return body && (!accept || accept(body))
        ? {
            ok: true,
            body,
            modelVersion: safeIdentifier(json.modelVersion),
            latencyMs: Date.now() - startedAt,
          }
        : failed("bad-response", startedAt, response.status);
    } catch (error) {
      const timedOut = signal.aborted || ["TimeoutError", "AbortError"].includes(error?.name);
      return failed(timedOut ? "timeout" : "network", startedAt);
    }
  }

  function stamp(slot, format, result) {
    slot.proof = Object.freeze({
      state: "verified",
      format,
      verifiedAt: Date.now(),
      modelVersion: result.modelVersion,
      latencyMs: result.latencyMs,
    });
    slot.preferred = format;
    return slot.proof;
  }

  function isKnownLabel({ items }) {
    const [item] = items;
    return (
      items.length === 1 &&
      item.name.toLowerCase() === PROBE_ITEM.name.toLowerCase() &&
      item.baseAmount === PROBE_ITEM.baseAmount &&
      Object.entries(PROBE_ITEM.nutrition).every(([key, number]) => item.nutrition[key] === number)
    );
  }

  async function probe(model, mode, slot, deadlineAt, takeAttempt) {
    if (mode === "vision" && !probePng) {
      try {
        probePng = fs.readFileSync(path.join(__dirname, "aiProbeLabel.png"), "base64");
      } catch {
        return failed("probe-fixture");
      }
    }
    const input = {
      prompt: mode === "text" ? PROBE_INSTRUCTION + "\n\n" + PROBE_TEXT : PROBE_INSTRUCTION,
      lang: "en",
      deadlineAt,
      ...(mode === "vision" && { imageBase64: probePng, mimeType: "image/png" }),
    };
    async function attempt(format) {
      if (!takeAttempt()) return failed("probe-deferred");
      return generate(model, format, input, isKnownLabel);
    }
    let format = slot.preferred ?? "schema";
    let result = await attempt(format);
    if (format === "schema" && result.kind === "schema-rejected") {
      // Remember the explicit rejection even if the retry has to wait for another round.
      slot.preferred = format = "json";
      result = await attempt(format);
    }
    if (result.ok) return { ok: true, ...stamp(slot, format, result) };
    if (["schema-rejected", "unsupported-modality", "bad-response"].includes(result.kind)) {
      slot.proof = INCOMPATIBLE;
    }
    return result;
  }

  function awaitProbe(inFlight, deadlineAt) {
    const startedAt = Date.now();
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(
        () => resolve(failed("timeout", startedAt)),
        Math.max(0, deadlineAt - startedAt),
      );
    });
    return Promise.race([inFlight, timeout]).finally(() => clearTimeout(timer));
  }

  async function ensureGeminiCapability(
    model,
    mode,
    { deadlineAt = Infinity, maxMs = PROBE_TIMEOUT_MS, takeAttempt = () => true } = {},
  ) {
    if (!currentModel(model)) return failed("missing-model");
    const capability = getGeminiCapability(model, mode);
    if (capability.state === "incompatible") return failed("incompatible");
    if (capability.state === "verified") return { ok: true, ...capability };
    const stopAt = Math.min(deadlineAt, Date.now() + maxMs);
    if (stopAt <= Date.now()) return failed("timeout");
    const slot = slotFor(model, mode);
    if (slot.inFlight) return awaitProbe(slot.inFlight, stopAt);
    slot.inFlight = probe(model, mode, slot, stopAt, takeAttempt).finally(() => {
      slot.inFlight = null;
    });
    return slot.inFlight;
  }

  async function runVerifiedGemini(
    model,
    mode,
    { deadlineAt = Infinity, maxMs = 15_000, ...input } = {},
  ) {
    if (!currentModel(model)) return failed("missing-model");
    const capability = getGeminiCapability(model, mode);
    if (capability.state !== "verified")
      return failed(capability.state === "incompatible" ? "incompatible" : "unverified");
    // A text proof can never authorize image input.
    if (mode === "vision" && (!input.imageBase64 || !input.mimeType))
      return failed("invalid-image");
    if (mode === "text" && input.imageBase64) return failed("unsupported-modality");
    const deadline = Math.min(deadlineAt, Date.now() + maxMs);
    const result = await generate(model, capability.format, { ...input, deadlineAt: deadline });
    const slot = slotFor(model, mode);
    if (result.ok) stamp(slot, capability.format, result);
    if (result.kind === "unsupported-modality") slot.proof = INCOMPATIBLE;
    if (result.kind === "schema-rejected" && capability.format === "schema") {
      slot.proof = null;
      slot.preferred = "json";
    }
    return result;
  }

  async function runGeminiProbeRound(candidates, { allow = () => true, onResult = () => {} } = {}) {
    if (runningRound || Date.now() < nextRoundAt || !getApiKey() || !candidates.length) return;
    runningRound = true;
    nextRoundAt = Date.now() + GEMINI_PROBE_INTERVAL_MS;
    let attemptsLeft = 2;
    const pairs = MODES.flatMap((_, offset) =>
      candidates.map((model, index) => [model, MODES[(index + offset) % MODES.length]]),
    );
    try {
      for (let scanned = 0; scanned < pairs.length && attemptsLeft > 0; scanned += 1) {
        const [model, mode] = pairs[cursor % pairs.length];
        cursor = (cursor + 1) % pairs.length;
        if (
          !currentModel(model) ||
          getGeminiCapability(model, mode).state !== "untested" ||
          records.get(model)?.get(mode)?.inFlight ||
          !allow(model, mode)
        )
          continue;
        const result = await ensureGeminiCapability(model, mode, {
          takeAttempt: () => {
            if (attemptsLeft <= 0 || !allow(model, mode)) return false;
            attemptsLeft -= 1;
            return true;
          },
        });
        if (result.kind !== "probe-deferred") onResult(model, mode, result);
      }
    } finally {
      runningRound = false;
    }
  }

  return { getGeminiCapability, ensureGeminiCapability, runVerifiedGemini, runGeminiProbeRound };
}

module.exports = { createGeminiGeneration, GEMINI_PROBE_INTERVAL_MS };
