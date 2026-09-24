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
     *  Ücretsiz önce; günlük 50 istek limiti (kredi yoksa) → kova/429 üstten zaten handle edilir. */
    pick: (ids, mode) =>
      ids
        .filter((id) => /:free-?:?\d*$/.test(id) || id === "openrouter/free")
        .filter((id) => (mode === "vision" ? /vision/i.test(id) : !/vision/i.test(id)))
        .sort((a, b) => score(a) - score(b) || a.localeCompare(b)),
  },
  ollama: {
    listUrl: "https://ollama.com/api/tags",
    chatUrl: "https://ollama.com/api/chat",
    key: () => process.env.OLLAMA_CLOUDE_API_KEY || "",
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

module.exports = {
  getModel,
  refreshOnFailure,
  invalidate,
  snapshot,
  reset,
  setDiscovered,
  PROVIDERS,
  listModelIds,
};
