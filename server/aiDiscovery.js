// ============================================================================
// Nutrimind — periyodik AI model taraması (klavye dışı bakım).
//
// MOTİVASYON: ücretsiz modeller (OpenRouter `:free`, OpenCode `-free`, Gemini,
// Ollama Cloud, Cloudflare LoRA) sağlayıcılar tarafından habersizce emekliye
// ayrılıyor (403/404/410/429). `aiModels.refreshOnFailure` yalnızca BİR istek
// model-seviyesinde düşünce keşfi tetikler — yani bozuk model, ilk kullanıcı
// denemesini 40 sn bekletir. Bu modül ARKA PLANDA sağlayıcı listelerini düzenli
// aralıkla tarar, canlı yoklanan sağlıklı modeli `setDiscovered` ile cache'e
// yazar. Böylece istek anında ölü modele düşülmez.
//
// KURAL: asla throw etmez. Her hata sessizce atlanır (gözlem katmanı davranışı
// değiştirmez). Süreç içinde setInterval ile yaşar; `server/ai.js` bunu
// `NODE_ENV !== "test"` iken başlatır (test izolasyonu korunur).
//
// TETİKLEME: açılışta ilk tur + `NUTRI_AI_DISCOVER_INTERVAL_MS` kadar sonra.
// Minimum aralık 15 dk (sağlayıcı listelerini boşuna çekmemek için); env daha
// kısaysa clamp edilir.
// ============================================================================

"use strict";

const aiModels = require("./aiModels.js");

/** Taramada kaç aday yoklanır (ağ bütçesi). */
const MAX_PROBES_PER_PROVIDER = 3;
/** Tek adayın yoklama süresi (ms). */
const PROBE_TIMEOUT_MS = 4000;
const MIN_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

let timer = null;

/** 1×1 PNG için OpenAI uyumlu gövde (metin modunda düz `ok`). */
function probeBody(cfg, model) {
  if (cfg.native) {
    return { model, messages: [{ role: "user", content: "ok" }], stream: false };
  }
  return { model, max_tokens: 1, messages: [{ role: "user", content: "ok" }] };
}

/** `chatUrl` string ya da (acct) => string olabilir (Cloudflare). */
function resolveChatUrl(cfg) {
  if (typeof cfg.chatUrl === "function") {
    return cfg.chatUrl(cfg.accountId?.() || "");
  }
  return cfg.chatUrl || "";
}

/** Tek adayı canlı yoklar: 200 → true. Ollama native body farklı. */
async function probeProvider(provider, model) {
  try {
    const cfg = aiModels.PROVIDERS[provider];
    if (!cfg) return false;
    const key = cfg.key?.() || "";
    const url = resolveChatUrl(cfg);
    if (!key || !url) return false;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(probeBody(cfg, model)),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!r.ok) return false;
    await r.text();
    return true;
  } catch {
    return false;
  }
}

/** Sağlayıcı başına: listeyi çek, `pick` süz, ilk `MAX_PROBES` adayı yokla. */
async function scanProvider(provider, mode) {
  try {
    const cfg = aiModels.PROVIDERS[provider];
    if (!cfg) return;
    const ids = await aiModels.listModelIds(provider, PROBE_TIMEOUT_MS);
    if (ids.length === 0) return;
    const candidates = (cfg.pick?.(ids, mode) || []).slice(0, MAX_PROBES_PER_PROVIDER);
    for (const id of candidates) {
      if (await probeProvider(provider, id)) {
        aiModels.setDiscovered(provider, mode, id);
        console.log(
          `[ai] ${JSON.stringify({
            kind: "discover",
            provider,
            model: id,
            state: "refreshed",
          })}`,
        );
        return;
      }
    }
  } catch {
    // gözlem katmanı her hatayı yutar (kural)
  }
}

/** Periyodik taramayı başlatır. `timer` zaten çalışıyorsa no-op.
 *  @returns {() => void} durdurma fonksiyonu */
function startDiscovery(intervalMs = DEFAULT_INTERVAL_MS) {
  if (timer) return stopDiscovery;
  const interval = Math.max(MIN_INTERVAL_MS, Number(intervalMs) || DEFAULT_INTERVAL_MS);

  const tick = () =>
    Promise.all(
      ["openrouter", "opencode", "ollama", "cloudflare"].map((p) =>
        scanProvider(p, "text").catch(() => {}),
      ),
    );
  tick().catch(() => {}); // açılışta ilk tur (hata yutulur)
  timer = setInterval(tick, interval);
  timer.unref?.();
  return stopDiscovery;
}

/** Testler ve süreç kapanışı için timer'ı temizler. */
function stopDiscovery() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startDiscovery, stopDiscovery, _aiModels: aiModels };