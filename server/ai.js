// ============================================================================
// Nutrimind — Gemini AI istemcisi (Faz 2: doğal dil öğün ayrıştırma).
//
// server/index.js "donmuş" kabul edildiği için bu mantık AYRI bir modülde
// yaşıyor; index.js yalnızca /api/ai/parse isteğini buraya yönlendiren birkaç
// satırlık bir köprü taşıyor (bkz. Adım 2).
//
// EN ÖNEMLİ KURAL: `parseMealText` HİÇBİR ZAMAN throw ETMEZ, her zaman
// {status, body} döner. index.js'in paylaşılan catch'i `instanceof HttpError`
// kontrolü yapıyor (o sınıf index.js'e özel, buradan export edilmiyor) —
// burada throw edilen her şey index.js'in catch'inde sessizce 500'e düşerdi.
// Bu modülün kendi hataları KENDİ İÇİNDE yakalanıp {status,body}'e çevrilir.
// ============================================================================
"use strict";

const fs = require("node:fs");
const path = require("node:path");

// --- .env yükleyici (yalnızca yerel geliştirme kolaylığı) -------------------
// Prod'da systemd zaten process.env'i dolduruyor — burada zaten SET olan
// hiçbir anahtarın üzerine YAZILMAZ. .env dosyası yoksa sessizce atlanır.
function loadDotEnvOnce() {
  const envPath = path.join(__dirname, "..", ".env");
  let raw;
  try {
    raw = fs.readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadDotEnvOnce();

// --- Sabitler ----------------------------------------------------------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const LLM_PROVIDER = process.env.NUTRIMIND_LLM_PROVIDER || "none";
const CONFIDENCE_THRESHOLD = Number(process.env.NUTRIMIND_CONFIDENCE_THRESHOLD || 0.8);
const AI_RATE_PARSE = Number(process.env.NUTRI_AI_RATE_PARSE || 10);
const AI_TIMEOUT_MS = Number(process.env.NUTRI_AI_TIMEOUT_MS || 15000);

const geminiUrl = () =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// --- Jeton kovası (server/index.js'teki OFF proxy'sinin BİREBİR aynı deseni) --
function makeBucket(perMin) {
  return { tokens: perMin, cap: perMin, perMs: perMin / 60000, last: Date.now() };
}
const aiBucket = makeBucket(AI_RATE_PARSE);

function peekTokens(b) {
  const now = Date.now();
  b.tokens = Math.min(b.cap, b.tokens + (now - b.last) * b.perMs);
  b.last = now;
  return b.tokens;
}
/** 0 = izin verildi; >0 = kaç saniye sonra tekrar denenmeli. */
function takeToken(b) {
  if (peekTokens(b) < 1) return Math.max(1, Math.ceil((1 - b.tokens) / b.perMs / 1000));
  b.tokens -= 1;
  return 0;
}

// --- Prompt + yapısal çıktı şeması -------------------------------------------
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          kcal: { type: "number" },
          protein: { type: "number" },
          carbs: { type: "number" },
          fat: { type: "number" },
          fiber: { type: "number" },
          confidence: { type: "number" },
        },
        required: ["name", "kcal", "protein", "carbs", "fat", "fiber"],
      },
    },
  },
  required: ["items"],
};

function buildPrompt(text, aliases) {
  const aliasLines = (aliases || [])
    .map(
      (a) =>
        `${a.name}: ${a.serving_g}g başına ${a.nutrition?.kcal ?? "?"}kcal, ${a.nutrition?.protein ?? "?"}g protein`,
    )
    .join("\n");

  return `Sen bir beslenme uzmanısın. Kullanıcının öğününü analiz et.

KURALLAR:
- Her yemek öğesini ayrı ayrı listele.
- Porsiyon boyutunu gram cinsinden tahmin et, isimde belirt (ör. "Tavuk Göğsü (200g)").
- Besin değerlerini (kcal, protein, carbs, fat, fiber) hesapla.
- Türk yemeklerini doğru tanı.
- Her öğe için 0 ile 1 arasında bir "confidence" (ne kadar eminsin) değeri ver.
- Yanıtı Türkçe ver.

KULLANICININ BESİN HAFIZASI (bu besinleri tanıyorsan bu değerleri birebir kullan):
${aliasLines || "(hafızada henüz besin yok)"}

KULLANICININ GİRDİSİ:
${text}`;
}

// --- Gemini çağrısı ------------------------------------------------------------
async function geminiFetch(prompt) {
  const wait = takeToken(aiBucket);
  if (wait > 0) {
    return {
      status: 429,
      body: { error: `AI hız sınırı korunuyor; ${wait} sn sonra tekrar deneyin`, retryAfter: wait },
    };
  }

  let r;
  let text;
  try {
    r = await fetch(geminiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    text = await r.text();
  } catch (e) {
    const timedOut = e && (e.name === "TimeoutError" || e.name === "AbortError");
    // DİKKAT: hata mesajına asla ham istek URL'i (API anahtarı içeriyor) eklenmez.
    return {
      status: 504,
      body: { error: timedOut ? "AI servisi zaman aşımına uğradı" : "AI servisine ulaşılamadı" },
    };
  }

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* aşağıda ele alınıyor */
  }
  if (!json || !r.ok) {
    return { status: 502, body: { error: `AI servisi hatası (HTTP ${r.status})` } };
  }

  const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof rawText !== "string") {
    return { status: 502, body: { error: "AI servisi beklenmeyen bir yanıt döndürdü" } };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { status: 502, body: { error: "AI yanıtı geçerli JSON değil" } };
  }

  return { status: 200, body: parsed };
}

// --- Doğrulama (savunmacı — Gemini'nin responseSchema'sı garanti değildir) ---
function isFiniteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function parseAiItem(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  if (![raw.kcal, raw.protein, raw.carbs, raw.fat, raw.fiber].every(isFiniteNum)) return null;

  const item = {
    name,
    nutrition: {
      kcal: raw.kcal,
      protein: raw.protein,
      carbs: raw.carbs,
      fat: raw.fat,
      fiber: raw.fiber,
    },
  };
  if (isFiniteNum(raw.confidence)) {
    const confidence = Math.max(0, Math.min(1, raw.confidence));
    item.confidence = confidence;
    item.needsReview = confidence < CONFIDENCE_THRESHOLD;
  }
  return item;
}

// --- Genel giriş noktası -------------------------------------------------------
/** @param {{text: string, aliases: unknown[]}} input
 *  @returns {Promise<{status:number, body:object}>} */
async function parseMealText({ text, aliases }) {
  if (LLM_PROVIDER !== "gemini") {
    return { status: 503, body: { error: "AI özelliği bu ortamda kapalı" } };
  }
  if (typeof text !== "string" || !text.trim()) {
    return { status: 400, body: { error: "text gerekli" } };
  }
  if (!GEMINI_API_KEY) {
    return { status: 500, body: { error: "AI servisi yapılandırılmamış (GEMINI_API_KEY yok)" } };
  }

  const prompt = buildPrompt(text.trim(), Array.isArray(aliases) ? aliases : []);
  const result = await geminiFetch(prompt);
  if (result.status !== 200) return result;

  const rawItems = Array.isArray(result.body?.items) ? result.body.items : [];
  const items = rawItems.map(parseAiItem).filter((x) => x !== null);

  return { status: 200, body: { items } };
}

module.exports = { parseMealText };
