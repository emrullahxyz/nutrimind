// ============================================================================
// Nutrimind — ücretsiz/kullanılabilir AI modelini otomatik bulma (izole modül).
//
// MOTİVASYON (2026-09-21 canlı olay, kanıtlı): zincirdeki model adları koda sabit
// yazılıydı ve sağlayıcılar onları habersizce emekliye ayırıyor:
//   - `meta/llama-3.1-8b-instruct`            → HTTP 410 Gone (artık listede yok)
//   - `deepseek-v4-flash-free` (OpenCode Zen) → HTTP 400 "Model is unavailable"
//   - `meta/llama-3.2-90b-vision-instruct`    → 90 sn'de hâlâ yanıt yok
// Sonuç: yedek zincir "var" görünüyordu ama hiçbir kademesi çalışmıyordu; her
// istek 40 sn bekleyip yine düşüyordu.
//
// Bu yüzden model adı artık sabit DEĞİL: sağlayıcının kendi model listesinden
// adaylar süzülür, ucuz bir canlı yoklamayla doğrulanır ve seçim 6 saat
// önbelleğe alınır. Model adı değişirse uygulama kendi kendine uyum sağlar.
//
// TETİKLENME: ağ çağrısı YALNIZCA bir kademe model seviyesinde (401/403/404/410)
// veya zaman aşımıyla düştüğünde yapılır. Sağlıklı akışta sıfır ek istek —
// böylece sıcak yolda gecikme ve kota harcaması olmaz. (Soğuk başlangıçta
// yapılandırılmış model kullanılır; bu bilinçli: üretimde öngörülebilirlik.)
//
// KURAL: asla throw etmez, PII tutmaz, dosyaya yazmaz. Her hata sessizce
// "model bulunamadı" sonucuna döner — çağıran adım da o zaman atlanır.
// ============================================================================

"use strict";

// Ayarlar ÇAĞRI ANINDA okunur (modül yüklenirken değil): süreç içinde değişen
// env'e göre davranış öngörülebilir kalsın ve testler modül yeniden yüklemesine
// bağımlı olmasın (2026-09-21: paylaşılan modül durumu testleri yanıltıyordu).
/** Keşif varsayılan olarak AÇIK; `NUTRI_AI_AUTOMODEL=0` ile kapatılabilir. */
const automodelOn = () => process.env.NUTRI_AI_AUTOMODEL !== "0";
const cacheTtlMs = () => Number(process.env.NUTRI_AI_MODEL_TTL_MS || 6 * 60 * 60 * 1000);
const negativeTtlMs = () =>
  Number(process.env.NUTRI_AI_MODEL_NEGATIVE_TTL_MS || 15 * 60 * 1000);
const discoverBudgetMs = () => Number(process.env.NUTRI_AI_DISCOVER_BUDGET_MS || 8000);
const probeTimeoutMs = () => Number(process.env.NUTRI_AI_PROBE_TIMEOUT_MS || 4000);
const maxProbes = () => Number(process.env.NUTRI_AI_MAX_PROBES || 3);

/** Keşif yoklamasında kullanılan 1×1 PNG (gerçek görsel göndermeden "vision
 *  yeteneği var mı + yanıt veriyor mu" sorusunu tek küçük istekle yanıtlar). */
const PROBE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

/** Sağlayıcı tanımları. Yeni bir sağlayıcı eklemek = buraya bir kayıt eklemek;
 *  zincir kodu (ai.js) sağlayıcı adıyla konuşur, URL/model bilmez. */
const PROVIDERS = {
  nim: {
    listUrl: "https://integrate.api.nvidia.com/v1/models",
    chatUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
    key: () => process.env.NVIDIA_NIM_API_KEY || "",
    /** NIM listesi çok geniş (guard/embed/retriever modelleri de var). Yedek
     *  olarak İŞE YARAYAN ve görece HIZLI olanları öne alıyoruz: 90B bir model
     *  yedek olarak anlamsız — bugün 90 sn'de yanıt vermedi. */
    pick: (ids, mode) =>
      ids
        .filter((id) => !/guard|safety|embed|rerank|retriev|parse|deplot/i.test(id))
        .filter((id) => (mode === "vision" ? /vision/i.test(id) : !/vision/i.test(id)))
        .sort((a, b) => score(a) - score(b) || a.localeCompare(b)),
  },
  opencode: {
    listUrl: "https://opencode.ai/zen/v1/models",
    chatUrl: "https://opencode.ai/zen/v1/chat/completions",
    key: () => process.env.OPENCODE_API_KEY || "",
    /** OpenCode Zen'de ücretsizler `-free` sonekiyle gelir ve SIK DEĞİŞİR
     *  (bugün `deepseek-v4-flash-free` listede duruyor ama 400 "Model is
     *  unavailable" dönüyor — bu yüzden liste yetmez, canlı yoklama şart). */
    pick: (ids, mode) => {
      const free = ids.filter((id) => /-free/i.test(id));
      const pool = free.length > 0 ? free : ids;
      return pool
        .filter((id) => (mode === "vision" ? /vision/i.test(id) : !/vision/i.test(id)))
        .sort((a, b) => score(a) - score(b) || a.localeCompare(b));
    },
  },
  openrouter: {
    listUrl: "https://openrouter.ai/api/v1/models",
    chatUrl: "https://openrouter.ai/api/v1/chat/completions",
    key: () => process.env.OPENROUTER_API_KEY || "",
    /** OpenRouter free modelleri `:free` soneki ya da `openrouter/free` yönlendiricisidir.
     *  Ücretsiz önce; günlük 50 istek limiti (kredi yoksa) → kova/429 üstten zaten handle edilir.
     *  Kara liste: prod'da ölçülen başarısız adaylar (kod-odaklı/küçük modeller besin
     *  çıkarımında timeout ya da bozuk JSON veriyor) keşifte ASLA seçilmez. */
    pick: (ids, mode) => {
      const BLOCKED = /north-mini|code|reasoning/i;
      const sorted = ids
        .filter((id) => /:free-?:?\d*$/.test(id) || id === "openrouter/free")
        .filter((id) => !BLOCKED.test(id))
        .filter((id) => (mode === "vision" ? /vision/i.test(id) : !/vision/i.test(id)))
        .sort((a, b) => score(a) - score(b) || a.localeCompare(b));
      // `openrouter/free` genel yönlendirici — ücretsiz güvenilir, her zaman önde.
      const router = sorted.find((id) => id === "openrouter/free");
      return router ? [router, ...sorted.filter((id) => id !== router)] : sorted;
    },
  },
  ollama: {
    listUrl: "https://ollama.com/api/tags",
    chatUrl: "https://ollama.com/api/chat",
    key: () => process.env.OLLAMA_CLOUD_API_KEY || "",
    /** Ollama Cloud native `/api/chat` kullanır (OpenAI-uyumsuz).
     *  2026-09-24 canlı yoklamada plan-dahili (ücretsiz sayılan) küme:
     *  gemma4:31b, gpt-oss:120b/20b, nemotron-3-{ultra,super,nano:30b}. */
    native: true,
    pick: (ids, mode) =>
      ids
        .filter((id) => /gemma4|gpt-oss|nemotron-3/i.test(id))
        .filter((id) => (mode === "vision" ? /vision|llava/i.test(id) : true))
        .sort((a, b) => score(a) - score(b) || a.localeCompare(b)),
  },
  cloudflare: {
    listUrl: (acct) =>
      `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/models/search`,
    chatUrl: (acct) =>
      `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/v1/chat/completions`,
    key: () => process.env.CLAUDEFLARE_API_KEY || "",
    accountId: () => process.env.CLAUDEFLARE_ACCOUNT_ID || "",
    /** Cloudflare Workers AI — ücretsiz LoRA'lar (gemma-2b, mistral-7b).
     *  Deneysel: tek tutarlı JSON üreten `@cf/google/gemma-2b-it-lora`. */
    pick: (ids, mode) =>
      ids
        .filter((id) => /gemma-2b-it-lora|mistral-7b-instruct-v0.2-lora/i.test(id))
        .filter((id) => (mode === "vision" ? /vision/i.test(id) : !/vision/i.test(id)))
        .sort((a, b) => score(a) - score(b) || a.localeCompare(b)),
  },
};

/** Küçük/hızlı modeller öne: yedek adım saniyelerle ölçülür (bkz. bütçe).
 *  DİKKAT: boyut regex'i `\b` ile sınırlanmalı — yoksa "51b" içindeki "1b"
 *  eşleşir ve 51B'lik bir model "küçük/hızlı" sanılır (testte yakalandı). */
function score(id) {
  if (/lite|flash|mini|small|lightning/i.test(id)) return 0;
  if (/\b(11b|12b|8b|7b|4b|3b|1b)\b/i.test(id)) return 1;
  return 2;
}

/** `${provider}:${mode}` → { model, at, negative } */
const cache = new Map();

function cacheKey(provider, mode) {
  return `${provider}:${mode}`;
}

/** Önbellekteki taze seçim. Ağ yok. */
function getModel(provider, mode, fallback = null) {
  try {
    const hit = cache.get(cacheKey(provider, mode));
    const ttl = hit?.negative ? negativeTtlMs() : cacheTtlMs();
    if (hit && Date.now() - hit.at < ttl) {
      return { model: hit.model ?? fallback, source: hit.negative ? "fallback" : "cached" };
    }
    return { model: fallback, source: fallback ? "env" : "none" };
  } catch {
    return { model: fallback, source: "env" };
  }
}

function headersFor(provider) {
  const cfg = PROVIDERS[provider];
  const key = cfg?.key?.() || "";
  return key ? { "Content-Type": "application/json", Authorization: `Bearer ${key}` } : null;
}

/** Cloudflare gibi hesap-id gerektiren endpoinlerin URL'sini çözer.
 *  `listUrl`/`chatUrl` string ya da `(acct) => string` olabilir; hesap id
 *  yoksa boş döner (adım sessizce devre dışı kalır — deneysel sağlayıcı). */
function resolveUrl(cfg, field) {
  const v = cfg?.[field];
  if (typeof v === "function") {
    const acct = cfg.accountId?.() || "";
    return acct ? v(acct) : "";
  }
  return v || "";
}

async function fetchJson(url, init, timeoutMs) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const text = await r.text();
    if (!r.ok) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/** Sağlayıcının model listesi → id dizisi (OpenAI uyumlu `data[].id`). */
async function listModelIds(provider, timeoutMs) {
  const cfg = PROVIDERS[provider];
  const headers = cfg && headersFor(provider);
  const url = cfg && resolveUrl(cfg, "listUrl");
  if (!cfg || !headers || !url) return [];
  const json = await fetchJson(url, { method: "GET", headers }, timeoutMs);
  // Cloudflare `/ai/models/search` → `result[]`; OpenAI-uyumlu → `data[]`.
  const data = Array.isArray(json?.data) ? json.data : Array.isArray(json?.result) ? json.result : [];
  return data.map((m) => (typeof m?.id === "string" ? m.id : "")).filter(Boolean);
}

/** Tek adayı en küçük istekle yokla: 200 → kullanılabilir. */
async function probe(provider, model, mode, timeoutMs) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return false;
  const headers = headersFor(provider);
  const url = resolveUrl(cfg, "chatUrl");
  if (!headers || !url) return false;

  // Ollama Cloud native `/api/chat`; diğerleri OpenAI-uyumlu `/chat/completions`.
  const body = cfg.native
    ? { model, messages: [{ role: "user", content: "ok" }], stream: false }
    : mode === "vision"
      ? {
          model,
          max_tokens: 1,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "ok" },
                { type: "image_url", image_url: { url: `data:image/png;base64,${PROBE_PNG}` } },
              ],
            },
          ],
        }
      : { model, max_tokens: 1, messages: [{ role: "user", content: "ok" }] };

  const json = await fetchJson(
    url,
    { method: "POST", headers, body: JSON.stringify(body) },
    timeoutMs,
  );
  return json !== null;
}

/**
 * Model seviyesinde (401/403/404/410) ya da zaman aşımıyla düşen adım için
 * YENİ bir model bulmayı dener. Ağ çağrısı yalnızca burada yapılır.
 *
 * @returns {Promise<{ model: string|null, source: string, probed: string[], reason: string }>}
 */
async function refreshOnFailure(provider, mode, opts = {}) {
  const out = { model: null, source: "none", probed: [], reason: "" };
  try {
    if (!automodelOn()) {
      out.reason = "automodel-off";
      return out;
    }
    const cfg = PROVIDERS[provider];
    if (!cfg) {
      out.reason = "unknown-provider";
      return out;
    }
    // Taze olumsuz önbellek: az önce denedik ve bulamadık. Aynı listeyi her
    // düşen istekte tekrar çekmek kotayı yakardı.
    const hit = cache.get(cacheKey(provider, mode));
    if (hit && hit.negative && Date.now() - hit.at < negativeTtlMs()) {
      out.reason = "negative-cache";
      return out;
    }
    const budgetMs = Number.isFinite(opts.budgetMs) ? opts.budgetMs : discoverBudgetMs();
    if (budgetMs < probeTimeoutMs()) {
      // Kalan bütçe tek bir yoklamaya bile yetmiyor: boşa ağ açma.
      out.reason = "no-budget";
      return out;
    }
    const current = typeof opts.currentModel === "string" ? opts.currentModel : null;

    const probeMs = probeTimeoutMs();
    const ids = await listModelIds(provider, Math.min(probeMs, budgetMs));
    out.probed = ids.length === 0 ? [] : cfg.pick(ids, mode);
    if (ids.length === 0) {
      out.reason = "list-unavailable";
      cache.set(cacheKey(provider, mode), { model: null, at: Date.now(), negative: true });
      return out;
    }

    const candidates = out.probed.filter((id) => id !== current).slice(0, maxProbes());
    out.probed = candidates;
    for (const id of candidates) {
      // Yoklama zaman aşımı bütçeyi aşmasın: her aday en fazla probeMs.
      if (await probe(provider, id, mode, Math.min(probeMs, budgetMs))) {
        cache.set(cacheKey(provider, mode), { model: id, at: Date.now(), negative: false });
        out.model = id;
        out.source = "discovered";
        out.reason = "probe-ok";
        console.log(
          `[ai] ${JSON.stringify({
            kind: "model",
            provider,
            mode,
            state: "rediscovered",
            model: id,
            replaced: current,
            probed: candidates.length,
          })}`,
        );
        return out;
      }
    }

    out.reason = candidates.length === 0 ? "no-candidates" : "probes-failed";
    cache.set(cacheKey(provider, mode), { model: null, at: Date.now(), negative: true });
    return out;
  } catch {
    out.reason = "error";
    return out;
  }
}

/** Zaman aşımından sonra seçimi geçersiz kıl: bir sonraki istek yeniden keşfeder.
 *  Kayıt SİLİNİR (olumsuz önbellek YAZILMAZ) — yoksa 15 dk boyunca keşif
 *  kilitlenir ve yavaş/asılı model aynı kademede kalmaya devam ederdi. */
function invalidate(provider, mode) {
  try {
    cache.delete(cacheKey(provider, mode));
  } catch {
    // noop
  }
}

/** /api/ai/status için teşhis. */
function snapshot() {
  try {
    const now = Date.now();
    return {
      automodel: automodelOn(),
      entries: [...cache.entries()].map(([key, v]) => ({
        key,
        model: v.model,
        ageMs: v.at === 0 ? null : now - v.at,
        negative: !!v.negative,
      })),
    };
  } catch {
    return { automodel: automodelOn(), entries: [] };
  }
}

/** Yalnızca testler için. */
function reset() {
  cache.clear();
}

/** Arka plan taraması (aiDiscovery) sonucu bulunan modeli cache'e yazar.
 *  `refreshOnFailure` yalnızca bir model hata verdiğinde keşfi tetikler;
 *  periyodik tarama bu bekle-me gerektirmeden olumlu bulguyu otomatik seçer. */
function setDiscovered(provider, mode, model) {
  try {
    if (!model) return;
    cache.set(cacheKey(provider, mode), { model, at: Date.now(), negative: false });
  } catch {
    // noop
  }
}

const { classifyError, quotaWait } = require("./aiGemini.js");
const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";
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
  getModel,
  refreshOnFailure,
  invalidate,
  snapshot,
  reset,
  setDiscovered,
  PROVIDERS,
  listModelIds,
};
