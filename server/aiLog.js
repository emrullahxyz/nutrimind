// ============================================================================
// Nutrimind — AI çağrı günlüğü (izole modül, sıfır bağımlılık, asla throw etmez).
//
// MOTİVASYON (2026-09-16): kullanıcı canlıda "x saniye sonra tekrar dene"
// tarzı bir süre hata aldı ama NE sunucu NE istemci hatanın sebebini
// saklıyordu — server/ai.js hataları yalnızca HTTP yanıtına çevirip
// unutuyordu, tek bir console.error bile yoktu. Bu katman her sağlayıcı adımının
// (kova reddi dahil) sonucunu kaydeder ki bir dahaki olayda "hangi dakikada,
// hangi kademede tıkandı" kanıtlı olsun.
//
// 2026-09-21 GELİŞTİRMESİ (canlı olay dersi): kayıt yalnızca sağlayıcının
// DURUM KODUNU tutuyordu, GEREKÇESİNİ atıyordu. Olay günü günlükte `503`
// görünüyordu ama "model emekliye ayrıldı (410 Gone)" / "bu hesap için yetki
// yok (404)" / "Model is unavailable (400)" ayrımı ancak elle curl atılarak
// bulunabildi. Artık:
//   - `status`  : BİZİM istemciye dönecek kodumuz (502/504/429/200)
//   - `upstream`: sağlayıcının ham HTTP kodu (503, 410, 404 …)
//   - `detail`  : sağlayıcının gerekçe metni (kırpılır + sırlar maskelenir)
// Ayrıca istek başına TEK satır "chain" özeti (başarıda da) yazılır: üretimde
// "zincir hâlâ nginx penceresini aşıyor mu" sorusunun cevabı budur.
//
// Depolama: BELLEK İÇİ ring buffer (son ~200 kayıt) — veritabanı YOK, dosya
// YOK. Süreç yeniden başlarsa geçmiş gider; amaç kalıcı denetim değil,
// teşhistir. Ek olarak başarısızlıkta TEK SATIR JSON stdout'a yazılır:
//   journalctl -u nutri-api | grep '\[ai\]'
//
// PII KURALI: prompt metni, görsel, kullanıcı kimliği ASLA kaydedilmez —
// yalnızca teknik alanlar (uç, sağlayıcı, model, durum kodu, gecikme, sağlayıcı
// hata metni). `detail` içindeki anahtar benzeri diziler maskelenir.
//
// Bağımlılık yönü: ai.js → aiLog (tek yön; aiLog ai.js'i require etmez, kova ve
// devre kesici durumu setBuckets()/setHealth() ile bildirilir → döngüsel import yok).
// ============================================================================

"use strict";

const MAX_ENTRIES = 200;
/** Sağlayıcı gerekçesi bu uzunlukta kırpılır: teşhise yeter, günlüğü şişirmez. */
const DETAIL_MAX = 160;

/** Ring buffer — en yeni kayıt SONDA. */
const entries = [];

/** provider → { calls, ok, errors } — süreç ömrü boyunca birikir. */
const stats = new Map();

/** ai.js kovaları: [{name, cap, peek()}]. `peek` çağrı anında refill dahil
 *  güncel jeton sayısını verir (ai.js'teki peekTokens'a köprü). */
const buckets = [];

/** ai.js devre kesici durumu (server/aiHealth.js snapshot'ı). */
let health = [];

function bump(provider, ok) {
  let s = stats.get(provider);
  if (!s) {
    s = { calls: 0, ok: 0, errors: 0 };
    stats.set(provider, s);
  }
  s.calls += 1;
  if (ok) s.ok += 1;
  else s.errors += 1;
}

/** Sağlayıcı hata metnini günlüğe yazılabilir hâle getirir: tek satır, kırpık,
 *  anahtar benzeri diziler maskeli. Girdi metni ASLA dışarı sızmaz — bu
 *  fonksiyonun çıktısı günlüğe gider. */
function scrubDetail(raw) {
  try {
    if (typeof raw !== "string") return null;
    let s = raw.replace(/\s+/g, " ").trim();
    if (!s) return null;
    // Bilinen sır önekleri + uzun anahtar benzeri diziler (hesap/kimlik id'leri
    // de bu sınıfa girer — NIM'in "Not found for account '…'" yanıtı gibi).
    s = s
      .replace(/\bAIza[\w-]{10,}/g, "«redacted»")
      .replace(/\bsk-[\w-]{10,}/g, "«redacted»")
      .replace(/\bsk-or-[\w-]{10,}/g, "«redacted»")
      .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "«redacted»");
    if (s.length > DETAIL_MAX) s = `${s.slice(0, DETAIL_MAX)}…`;
    return s;
  } catch {
    return null;
  }
}

/** Bir AI adımının sonucunu kaydeder. ASLA throw etmez. */
function record(e) {
  try {
    if (!e || typeof e !== "object") return;
    const status = typeof e.status === "number" && Number.isFinite(e.status) ? e.status : 0;
    const entry = {
      ts: new Date().toISOString(),
      endpoint: typeof e.endpoint === "string" ? e.endpoint : "unknown",
      provider: typeof e.provider === "string" ? e.provider : "unknown",
      model: typeof e.model === "string" ? e.model : null,
      status,
      code: typeof e.code === "string" ? e.code : null,
      latencyMs:
        typeof e.latencyMs === "number" && Number.isFinite(e.latencyMs)
          ? Math.max(0, Math.round(e.latencyMs))
          : null,
      retryAfter:
        typeof e.retryAfter === "number" && Number.isFinite(e.retryAfter) ? e.retryAfter : null,
      // Sağlayıcının HAM kodu (bizim çevirimizden önce). 2026-09-21 dersi:
      // `status` ile karıştırılınca "biz mi 503 döndük, Gemini mi?" sorusu
      // günlükten cevaplanamıyordu.
      upstream:
        typeof e.upstream === "number" && Number.isFinite(e.upstream) ? e.upstream : null,
      detail: scrubDetail(e.detail),
    };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    bump(entry.provider, status === 200);

    if (status !== 200) {
      // Tek satır JSON → journalctl'de `grep '\[ai\]'` ile aranabilir.
      console.log(`[ai] ${JSON.stringify(entry)}`);
    }
  } catch {
    // Gözlem katmanı isteği ASLA etkilemesin.
  }
}

/** İstek başına TEK satır zincir özeti. Ring buffer'a GİRMEZ (sağlayıcı
 *  sayaçlarını kirletmesin) — yalnızca stdout. Başarıda da yazılır, çünkü
 *  cevaplanması gereken soru "toplam süre nginx penceresinin altında mı". */
function recordChain(e) {
  try {
    if (!e || typeof e !== "object") return;
    const line = {
      ts: new Date().toISOString(),
      kind: "chain",
      endpoint: typeof e.endpoint === "string" ? e.endpoint : "unknown",
      status: typeof e.status === "number" && Number.isFinite(e.status) ? e.status : 0,
      totalMs: typeof e.totalMs === "number" && Number.isFinite(e.totalMs) ? Math.round(e.totalMs) : null,
      code: typeof e.code === "string" ? e.code : null,
      attempts: Array.isArray(e.attempts)
        ? e.attempts.slice(0, 8).map((a) => ({
            provider: a?.provider ?? "unknown",
            status: a?.status ?? null,
            upstream: a?.upstream ?? null,
            code: a?.code ?? null,
            latencyMs: a?.latencyMs ?? null,
            ...(a?.skipped ? { skipped: a.skipped } : {}),
          }))
        : [],
    };
    console.log(`[ai] ${JSON.stringify(line)}`);
  } catch {
    // noop
  }
}

/** ai.js, kendi kovalarını buraya bildirir (ad + kapasite + güncel doluluk okuma işlevi). */
function setBuckets(list) {
  try {
    buckets.length = 0;
    if (Array.isArray(list)) buckets.push(...list.filter((b) => b && typeof b === "object"));
  } catch {
    // noop
  }
}

/** ai.js, devre kesici durumunu buraya bildirir (server/aiHealth.js → snapshot). */
function setHealth(list) {
  try {
    health = Array.isArray(list) ? list.filter((h) => h && typeof h === "object") : [];
  } catch {
    health = [];
  }
}

/** GET /api/ai/status gövdesi. Sahibin teşhis ucu: son kayıtlar (en yeni önce),
 *  sağlayıcı sayaçları, kova dolulukları, devre kesici durumları. */
function snapshot() {
  try {
    return {
      ok: true,
      entries: entries.slice().reverse(),
      providers: [...stats.entries()].map(([provider, s]) => ({ provider, ...s })),
      buckets: buckets.map((b) => {
        try {
          const raw = Math.max(0, Math.min(b.cap, b.peek()));
          const tokens = Math.floor(raw);
          const fill = b.cap > 0 ? Number((raw / b.cap).toFixed(2)) : 0;
          return { name: b.name, tokens, cap: b.cap, fill };
        } catch {
          return { name: b.name, tokens: 0, cap: b.cap ?? 0, fill: 0 };
        }
      }),
      health: health.slice(),
    };
  } catch {
    return { ok: false, error: "snapshot failed" };
  }
}

/** Yalnızca testler için: kayıtları ve sayaçları temizler. */
function reset() {
  entries.length = 0;
  stats.clear();
  health = [];
}

module.exports = {
  record,
  recordChain,
  setBuckets,
  setHealth,
  snapshot,
  reset,
  scrubDetail,
  DETAIL_MAX,
};
