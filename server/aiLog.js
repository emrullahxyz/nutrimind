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
// Depolama: BELLEK İÇİ ring buffer (son ~200 kayıt) — veritabanı YOK, dosya
// YOK. Süreç yeniden başlarsa geçmiş gider; amaç kalıcı denetim değil,
// teşhistir. Ek olarak başarısızlıkta TEK SATIR JSON stdout'a yazılır:
//   journalctl -u nutri-api | grep '\[ai\]'
//
// PII KURALI: prompt metni, görsel, kullanıcı kimliği ASLA kaydedilmez —
// yalnızca teknik alanlar (uç, sağlayıcı, model, durum kodu, gecikme).
//
// Bağımlılık yönü: ai.js → aiLog (tek yön; aiLog ai.js'i require etmez, kova
// değerleri setBuckets() ile bildirilir — döngüsel import yok).
// ============================================================================

"use strict";

const MAX_ENTRIES = 200;

/** Ring buffer — en yeni kayıt SONDA. */
const entries = [];

/** provider → { calls, ok, errors } — süreç ömrü boyunca birikir. */
const stats = new Map();

/** ai.js kovaları: [{name, cap, peek()}]. `peek` çağrı anında refill dahil
 *  güncel jeton sayısını verir (ai.js'teki peekTokens'a köprü). */
const buckets = [];

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

/** ai.js, kendi kovalarını buraya bildirir (ad + kapasite + güncel doluluk okuma işlevi). */
function setBuckets(list) {
  try {
    buckets.length = 0;
    if (Array.isArray(list)) buckets.push(...list.filter((b) => b && typeof b === "object"));
  } catch {
    // noop
  }
}

/** GET /api/ai/status gövdesi. Sahibin teşhis ucu: son kayıtlar (en yeni önce),
 *  sağlayıcı sayaçları, kova dolulukları. */
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
    };
  } catch {
    return { ok: false, error: "snapshot failed" };
  }
}

/** Yalnızca testler için: kayıtları ve sayaçları temizler. */
function reset() {
  entries.length = 0;
  stats.clear();
}

module.exports = { record, setBuckets, snapshot, reset };
