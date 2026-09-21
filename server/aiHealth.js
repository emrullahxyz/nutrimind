// ============================================================================
// Nutrimind — AI sağlayıcı adımları için devre kesici (izole modül).
//
// MOTİVASYON (2026-09-21 canlı olay): görsel zinciri, ölü bir yedeğe düşünce her
// istekte 40 sn bekliyordu. Kanıt: `meta/llama-3.2-90b-vision-instruct` 90 sn'de
// hâlâ yanıt vermiyordu ve `meta/llama-3.1-8b-instruct` 410 Gone dönüyordu —
// yani zincir her seferinde süre yakıyor, hiçbir şansı yoktu. Üstelik toplam
// süre nginx'in `/api/` penceresini (30 sn) aştığı için kullanıcı tarafında
// yanıt hiç görünmüyordu (bkz. docs/operations/ai.md).
//
// Bu modül "art arda başarısız olan adımı bir süre hiç denememe" kararını
// verir. Amaç: kalıcı olarak bozuk bir kademenin maliyetini HER istekte
// ödemek yerine BİR kez ödemek.
//
// KURAL: asla throw etmez, disk/ağ kullanmaz, PII tutmaz (yalnızca sağlayıcı adı
// + sayı + sebep kodu). Durum bellekte; süreç yeniden başlarsa sıfırlanır —
// aiLog ile aynı bilinçli karar (kalıcı denetim değil, teşhis).
// ============================================================================

"use strict";

/** Devre açık kaldığı süre. 10 dk: kesintiler genelde bunun altında biter,
 *  ama kalıcı yanlış yapılandırmada (ömür boyu ölü kalacak model) da makul bir
 *  bekleme. Env ÇAĞRI ANINDA okunur (modül yüklenirken değil): aksi hâlde aynı
 *  süreçteki testler/kısa ömürlü ayar değişiklikleri öngörülemez olurdu. */
const breakerMs = () => Number(process.env.NUTRI_AI_BREAKER_MS || 10 * 60 * 1000);

/** Kaç ardışık hata devreyi açar. Sağlayıcının KENDİ 5xx'i daha toleranslı
 *  (geçici yoğunluk olabilir), zaman aşımı ve erişilemezlik daha sıkı.
 *  "model" (401/403/404/410) tek hatada açar: yapılandırma hatasıdır. */
function thresholdOf(kind) {
  if (kind === "model") return 1;
  // "request" (400/422): model uyumsuzluğu OLABİLİR ama bizim istek şeklimiz de
  // suçlu olabilir — tek hatada devre kapatmak sessiz bir arızayı gizlerdi.
  if (kind === "request") {
    return Number(process.env.NUTRI_AI_BREAKER_REQUEST_ERRORS || 3);
  }
  if (kind === "unreachable") {
    return Number(process.env.NUTRI_AI_BREAKER_UNREACHABLE || 3);
  }
  if (kind === "provider") {
    return Number(process.env.NUTRI_AI_BREAKER_PROVIDER_ERRORS || 5);
  }
  return Number(process.env.NUTRI_AI_BREAKER_TIMEOUTS || 3);
}

const KINDS = new Set(["timeout", "unreachable", "provider", "model", "request"]);

/** provider → { failures, kind, lastStatus, openUntil, openedAt, lastFailAt } */
const state = new Map();

function entry(provider) {
  let e = state.get(provider);
  if (!e) {
    e = { failures: 0, kind: null, lastStatus: null, openUntil: 0, openedAt: 0, lastFailAt: 0 };
    state.set(provider, e);
  }
  return e;
}

function thresholdFor(kind) {
  const n = thresholdOf(KINDS.has(kind) ? kind : "provider");
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Bu adım şu an denenebilir mi?
 *
 * Süresi dolmuş bir devre "yarım açık"tır: bir sonraki istek (tek) denemeye
 * izin verilir. Başarılı olursa sayaç sıfırlanır, olmazsa devre yeniden açılır.
 * @returns {{ open: boolean, retryInMs: number }}
 */
function isOpen(provider, now = Date.now()) {
  try {
    const e = state.get(provider);
    if (!e || e.openUntil === 0) return { open: false, retryInMs: 0 };
    if (e.openUntil <= now) return { open: false, retryInMs: 0 }; // yarım açık: tek deneme
    return { open: true, retryInMs: e.openUntil - now };
  } catch {
    return { open: false, retryInMs: 0 };
  }
}

/** Başarılı adım → sayaç ve devre sıfırlanır. */
function noteSuccess(provider) {
  try {
    const e = entry(provider);
    e.failures = 0;
    e.kind = null;
    e.lastStatus = null;
    e.openUntil = 0;
    e.openedAt = 0;
  } catch {
    // gözlem/karar katmanı isteği asla etkilemesin
  }
}

/**
 * Başarısız adımı kaydeder ve gerekiyorsa devreyi açar.
 * `kind`: "timeout" | "unreachable" | "provider" | "model"
 *   - "provider": sağlayıcı 5xx döndürdü (geçici olabilir, eşik yüksek)
 *   - "model": model/anahtar seviyesinde kalıcı hata (401/403/404/410)
 * Kova reddi (429) BURAYA gelmez: sağlık sorunu değil, hız sınırıdır.
 */
function noteFailure(provider, kind, status = null, now = Date.now()) {
  try {
    const k = KINDS.has(kind) ? kind : "provider";
    const e = entry(provider);
    e.failures += 1;
    e.kind = k;
    e.lastStatus = Number.isFinite(status) ? status : null;
    e.lastFailAt = now;

    const openMs = breakerMs();
    if (e.failures >= thresholdFor(k)) {
      e.openUntil = now + openMs;
      e.openedAt = now;
      // DEVRE AÇILDI — tek satır stdout: journalctl'de `grep '[ai]'` ile görünür.
      console.log(
        `[ai] ${JSON.stringify({
          kind: "breaker",
          provider,
          state: "open",
          reason: k,
          upstream: e.lastStatus,
          failures: e.failures,
          openMs,
        })}`,
      );
    }
  } catch {
    // noop
  }
}

/** Devre açıkken atlanan adım sayacı (teşhis: "bu istek neyi denemedi"). */
function markSkipped(provider) {
  try {
    const e = entry(provider);
    e.skipped = (e.skipped || 0) + 1;
  } catch {
    // noop
  }
}

/** /api/ai/status için: adım başına sağlık durumu. */
function snapshot(now = Date.now()) {
  try {
    return [...state.entries()]
      .map(([provider, e]) => ({
        provider,
        state: e.openUntil > now ? "open" : e.failures > 0 ? "degraded" : "healthy",
        failures: e.failures,
        skipped: e.skipped || 0,
        reason: e.kind,
        upstream: e.lastStatus,
        retryInMs: e.openUntil > now ? e.openUntil - now : 0,
      }))
      .sort((a, b) => b.failures - a.failures);
  } catch {
    return [];
  }
}

/** Yalnızca testler için. */
function reset() {
  state.clear();
}

module.exports = { isOpen, noteSuccess, noteFailure, markSkipped, snapshot, reset, breakerMs };
