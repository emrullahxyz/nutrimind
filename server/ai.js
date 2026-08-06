// ============================================================================
// Nutrimind — AI istemcisi (Gemini + NVIDIA NIM fallback).
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
// Prod'da systemd zaten process.env'i doldurabilir — burada zaten SET olan
// hiçbir anahtarın üzerine YAZILMAZ. .env dosyası yoksa sessizce atlanır.
//
// İki olası yerleşim var ve ikisi de desteklenir:
//   - Yerel repo: bu dosya `server/ai.js`, `.env` bir üst dizinde (repo kökü).
//   - Prod (systemd, /home/emrullah/nutri-api): `index.js`/`ai.js` ALT KLASÖRSÜZ,
//     düz duruyor — `.env` bu dosyayla AYNI dizinde.
// İlk bulunan aday kullanılır.
function loadDotEnvOnce() {
  const candidates = [path.join(__dirname, ".env"), path.join(__dirname, "..", ".env")];
  let raw;
  for (const envPath of candidates) {
    try {
      raw = fs.readFileSync(envPath, "utf8");
      break;
    } catch {
      // sıradaki adaya geç
    }
  }
  if (raw === undefined) return;
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
const NVIDIA_NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY || "";
const NVIDIA_NIM_MODEL = process.env.NVIDIA_NIM_MODEL || "meta/llama-3.1-8b-instruct";
const LLM_PROVIDER = process.env.NUTRIMIND_LLM_PROVIDER || "none";
const CONFIDENCE_THRESHOLD = Number(process.env.NUTRIMIND_CONFIDENCE_THRESHOLD || 0.8);
const AI_RATE_PARSE = Number(process.env.NUTRI_AI_RATE_PARSE || 10);
const NIM_RATE_PARSE = Number(process.env.NUTRI_AI_RATE_NIM || 10);
const AI_TIMEOUT_MS = Number(process.env.NUTRI_AI_TIMEOUT_MS || 15000);
const NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

const geminiUrl = () =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// --- Jeton kovası (server/index.js'teki OFF proxy'sinin BİREBİR aynı deseni) --
function makeBucket(perMin) {
  return { tokens: perMin, cap: perMin, perMs: perMin / 60000, last: Date.now() };
}
const aiBucket = makeBucket(AI_RATE_PARSE);
const nimBucket = makeBucket(NIM_RATE_PARSE);
const VISION_RATE = Number(process.env.NUTRI_AI_RATE_VISION || 5);
const visionBucket = makeBucket(VISION_RATE);
const VALID_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

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
    healthNote: { type: "string" },
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

function formatAliasLines(aliases) {
  const list = Array.isArray(aliases) ? aliases : [];
  if (list.length === 0) return "";

  const MAX_ALIASES = 80;
  const sliced = list.slice(0, MAX_ALIASES);
  const extraCount = list.length - MAX_ALIASES;

  const lines = sliced.map((a) => {
    const displayName = a.brand ? `${a.name} (${a.brand})` : a.name;
    const nut = a.nutrition || {};

    const parts = [
      `${nut.kcal ?? "?"}kcal`,
      `${nut.protein ?? "?"}g protein`,
      `${nut.carbs ?? "?"}g karbonhidrat`,
      `${nut.fat ?? "?"}g yağ`,
      `${nut.fiber ?? "?"}g lif`,
    ];

    if (nut.sugar != null) parts.push(`${nut.sugar}g şeker`);
    if (nut.satFat != null) parts.push(`${nut.satFat}g doymuş yağ`);
    if (nut.sodium != null) parts.push(`${nut.sodium}mg sodyum`);

    let line = `${displayName}: ${a.serving_g ?? "?"}g başına ${parts.join(", ")}`;

    if (Array.isArray(a.triggers) && a.triggers.length > 0) {
      line += ` (şu ifadelerle anılır: ${a.triggers.join(", ")})`;
    }

    return line;
  });

  if (extraCount > 0) {
    lines.push(`(… ve ${extraCount} besin daha)`);
  }

  return lines.join("\n");
}

function buildPrompt(text, aliases) {
  const aliasLines = formatAliasLines(aliases);

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

function buildFoodPhotoPrompt(aliases) {
  const aliasLines = formatAliasLines(aliases);
  return `Sen bir beslenme uzmanısın. Ekteki fotoğraftaki yemeği/yemekleri analiz et.

KURALLAR:
- Fotoğraftaki her yemek öğesini ayrı ayrı listele.
- Görsel ipuçlarından (tabak boyutu, karşılaştırmalı ölçek) porsiyon miktarını gram cinsinden tahmin et, isimde belirt.
- Besin değerlerini (kcal, protein, carbs, fat, fiber) hesapla.
- Türk yemeklerini doğru tanı.
- Her öğe için 0 ile 1 arasında bir "confidence" değeri ver.
- Yanıtı Türkçe ver.

KULLANICININ BESİN HAFIZASI (bu besinleri tanıyorsan bu değerleri birebir kullan):
${aliasLines || "(hafızada henüz besin yok)"}`;
}

function buildLabelPrompt() {
  return `Sen bir beslenme uzmanısın. Ekteki fotoğraf bir besin değerleri etiketi.

KURALLAR:
- Etiketteki besin değerlerini (kcal, protein, carbs, fat, fiber) BİREBİR, tahmin etmeden oku.
- Etiket "100g başına" mı yoksa "porsiyon başına" mı gösteriyor, isimde belirt (ör. "Ürün Adı (100g)").
- Genellikle TEK bir öğe olur.
- Her öğe için 0 ile 1 arasında bir "confidence" değeri ver (etiket net değilse düşür).
- Yanıtı Türkçe ver.`;
}

const NIM_JSON_INSTRUCTION = `

SADECE aşağıdaki JSON şekline uygun yanıt ver. Başka hiçbir metin, açıklama veya markdown
kod bloğu (\`\`\`) EKLEME — yanıtın TAMAMI geçerli JSON olmalı:
{"items":[{"name":"string","kcal":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"confidence":number}]}

"confidence" alanını HER ZAMAN dahil et (0 ile 1 arası, ne kadar eminsin).`;

function buildNimPrompt(basePrompt) {
  return basePrompt + NIM_JSON_INSTRUCTION;
}

// --- Ortak LLM çağrı mantığı ---------------------------------------------------
function stripMarkdownFence(s) {
  const trimmed = s.trim();
  const m = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : trimmed;
}

async function callLLM({ bucket, url, headers, requestBody, extractText }) {
  const wait = takeToken(bucket);
  if (wait > 0) {
    return {
      status: 429,
      body: { error: `AI hız sınırı korunuyor; ${wait} sn sonra tekrar deneyin`, retryAfter: wait },
    };
  }

  let r;
  let text;
  try {
    r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
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

  const rawText = extractText(json);
  if (typeof rawText !== "string") {
    return { status: 502, body: { error: "AI servisi beklenmeyen bir yanıt döndürdü" } };
  }

  let parsed;
  try {
    parsed = JSON.parse(stripMarkdownFence(rawText));
  } catch {
    return { status: 502, body: { error: "AI yanıtı geçerli JSON değil" } };
  }

  return { status: 200, body: parsed };
}

function geminiFetch(prompt) {
  return callLLM({
    bucket: aiBucket,
    url: geminiUrl(),
    headers: { "Content-Type": "application/json" },
    requestBody: {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    },
    extractText: (j) => j?.candidates?.[0]?.content?.parts?.[0]?.text,
  });
}

function nimFetch(prompt) {
  return callLLM({
    bucket: nimBucket,
    url: NIM_URL,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${NVIDIA_NIM_API_KEY}`,
    },
    requestBody: {
      model: NVIDIA_NIM_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    },
    extractText: (j) => j?.choices?.[0]?.message?.content,
  });
}

function attemptGemini(prompt) {
  if (!GEMINI_API_KEY) {
    return { status: 500, body: { error: "AI servisi yapılandırılmamış (GEMINI_API_KEY yok)" } };
  }
  return geminiFetch(prompt);
}

function attemptNim(prompt) {
  if (!NVIDIA_NIM_API_KEY) {
    return { status: 500, body: { error: "AI servisi yapılandırılmamış (NVIDIA_NIM_API_KEY yok)" } };
  }
  return nimFetch(prompt);
}

// --- Doğrulama (savunmacı — AI yanıtlarının yapısı garanti değildir) -----------
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
  if (!["gemini", "nim", "auto"].includes(LLM_PROVIDER)) {
    return { status: 503, body: { error: "AI özelliği bu ortamda kapalı" } };
  }
  if (typeof text !== "string" || !text.trim()) {
    return { status: 400, body: { error: "text gerekli" } };
  }

  const prompt = buildPrompt(text.trim(), Array.isArray(aliases) ? aliases : []);

  let result;
  if (LLM_PROVIDER === "gemini") {
    result = await attemptGemini(prompt);
  } else if (LLM_PROVIDER === "nim") {
    result = await attemptNim(buildNimPrompt(prompt));
  } else {
    // "auto": önce Gemini, olmazsa NIM. İki sağlayıcı da başarısız olursa NIM'in
    // (son denenenin) sonucu olduğu gibi döner — birleştirilmiş özel bir mesaj YOK
    result = await attemptGemini(prompt);
    if (result.status !== 200) {
      const nimResult = await attemptNim(buildNimPrompt(prompt));
      if (nimResult.status !== 200) {
        console.error(`[ai] her iki sağlayıcı da başarısız: gemini=${result.status} nim=${nimResult.status}`);
      }
      result = nimResult;
    }
  }

  if (result.status !== 200) return result;

  const rawItems = Array.isArray(result.body?.items) ? result.body.items : [];
  const items = rawItems.map(parseAiItem).filter((x) => x !== null);

  return { status: 200, body: { items } };
}

async function parseMealImage({ imageBase64, mimeType, mode, aliases }) {
  if (LLM_PROVIDER === "none") {
    return { status: 503, body: { error: "AI özelliği bu ortamda kapalı" } };
  }
  if (!GEMINI_API_KEY) {
    return { status: 500, body: { error: "AI servisi yapılandırılmamış (GEMINI_API_KEY yok)" } };
  }
  if (typeof imageBase64 !== "string" || !imageBase64.trim()) {
    return { status: 400, body: { error: "image gerekli" } };
  }
  if (typeof mimeType !== "string" || !VALID_IMAGE_MIME.has(mimeType)) {
    return { status: 400, body: { error: "geçersiz mimeType (image/jpeg, image/png, image/webp)" } };
  }

  // İki istem var (bkz. src/types.ts'in `VisionMode`'u — aynı ikili):
  //   food_label → ambalajdaki tabloyu BİREBİR oku, tahmin etme, hafıza gönderme
  //   food_photo → tabaktaki yemeği tahmin et, kullanıcının besin hafızasını da gör
  // Görselin kameradan mı galeriden mi geldiği farketmez, ikisi de aynı ikiliye düşer.
  const prompt =
    mode === "food_label"
      ? buildLabelPrompt()
      : buildFoodPhotoPrompt(Array.isArray(aliases) ? aliases : []);

  const result = await callLLM({
    bucket: visionBucket,
    url: geminiUrl(),
    headers: { "Content-Type": "application/json" },
    requestBody: {
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    },
    extractText: (j) => j?.candidates?.[0]?.content?.parts?.[0]?.text,
  });

  if (result.status !== 200) return result;

  const rawItems = Array.isArray(result.body?.items) ? result.body.items : [];
  const items = rawItems.map(parseAiItem).filter((x) => x !== null);
  const healthNote = typeof result.body?.healthNote === "string" ? result.body.healthNote : undefined;
  return { status: 200, body: { items, ...(healthNote ? { healthNote } : {}) } };
}

module.exports = { parseMealText, parseMealImage };
