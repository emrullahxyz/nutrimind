// ============================================================================
// Nutrimind — AI istemcisi (Gemini kademeleri + NVIDIA NIM + OpenCode Zen fallback zinciri).
//
// server/index.js "donmuş" kabul edildiği için bu mantık AYRI bir modülde
// yaşıyor; index.js yalnızca /api/ai/parse ve /api/ai/vision isteklerini buraya
// yönlendiren birkaç satırlık bir köprü taşıyor.
//
// EN ÖNEMLİ KURAL: `parseMealText`/`parseMealImage` HİÇBİR ZAMAN throw ETMEZ,
// her zaman {status, body} döner. index.js'in paylaşılan catch'i `instanceof
// HttpError` kontrolü yapıyor (o sınıf index.js'e özel, buradan export
// edilmiyor) — burada throw edilen her şey index.js'in catch'inde sessizce
// 500'e düşerdi. Bu modülün kendi hataları KENDİ İÇİNDE yakalanıp {status,body}'e
// çevrilir.
//
// FALLBACK ZİNCİRİ (2026-08-07 tasarımı — docs/superpowers/specs/2026-08-07-ai-fallback-chain-design.md):
// Gemini kotası model bazlı ayrı bir kova (Google'ın 429 hata mesajındaki
// quotaDimensions.model alanı bunu doğruluyor) — yani "gemini-3.6-flash" dolsa
// bile "gemini-3.5-flash" açık olabilir. Bu yüzden zincir önce Gemini'nin 3
// canlı kademesini dener, sonra NIM'e, metin ucunda son olarak OpenCode Zen'in
// ücretsiz bir modeline düşer. OpenCode Zen'in ücretsiz modelleri vision
// desteklemediği için görsel zincirde yok.
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadDotEnvOnce();

// --- Sabitler ----------------------------------------------------------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_TIER2_MODEL = process.env.GEMINI_TIER2_MODEL || "gemini-3.5-flash";
const GEMINI_TIER3_MODEL = process.env.GEMINI_TIER3_MODEL || "gemini-flash-lite-latest";
const NVIDIA_NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY || "";
const NVIDIA_NIM_MODEL = process.env.NVIDIA_NIM_MODEL || "meta/llama-3.1-8b-instruct";
const NVIDIA_NIM_VISION_MODEL =
  process.env.NVIDIA_NIM_VISION_MODEL || "meta/llama-3.2-90b-vision-instruct";
const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY || "";
const OPENCODE_MODEL = process.env.OPENCODE_MODEL || "deepseek-v4-flash-free";
const LLM_PROVIDER = process.env.NUTRIMIND_LLM_PROVIDER || "none";
const CONFIDENCE_THRESHOLD = Number(process.env.NUTRIMIND_CONFIDENCE_THRESHOLD || 0.8);
const AI_RATE_PARSE = Number(process.env.NUTRI_AI_RATE_PARSE || 10);
const AI_RATE_GEMINI_TIER2 = Number(process.env.NUTRI_AI_RATE_GEMINI_TIER2 || 10);
const AI_RATE_GEMINI_TIER3 = Number(process.env.NUTRI_AI_RATE_GEMINI_TIER3 || 15);
const NIM_RATE_PARSE = Number(process.env.NUTRI_AI_RATE_NIM || 10);
const NIM_VISION_RATE = Number(process.env.NUTRI_AI_RATE_NIM_VISION || 5);
const AI_RATE_OPENCODE = Number(process.env.NUTRI_AI_RATE_OPENCODE || 10);
const AI_TIMEOUT_MS = Number(process.env.NUTRI_AI_TIMEOUT_MS || 15000);
// NIM/OpenCode fallback adımları hem soğuk-başlangıçta (~30sn, vision'da canlı
// ölçüldü) hem de gerçek besin-analizi prompt'larında (kısa "OK" testinden çok
// daha uzun JSON üretimi gerektiriyor, canlı testte 15sn'yi aşıp 504 verdiği
// gözlendi) birincil Gemini denemesinden belirgin şekilde yavaş olabiliyor —
// bu yüzden hepsi daha uzun bir zaman aşımı kullanıyor.
const NIM_FALLBACK_TIMEOUT_MS = Number(process.env.NUTRI_AI_NIM_TIMEOUT_MS || 40000);
const NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const OPENCODE_URL = "https://opencode.ai/zen/v1/chat/completions";

/** Hata gövdeleri İngilizce tutulur: kullanıcıya gösterilen metni istemci
 *  `code` alanından aktif dile çevirir (bkz. src/lib/ai.ts `aiErrorMessage`).
 *  `error` yalnızca son çare ve log dostu metindir. */
const AI_DISABLED_MESSAGE = "AI features are disabled in this environment";

const geminiUrl = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

// --- Jeton kovası (server/index.js'teki OFF proxy'sinin BİREBİR aynı deseni) --
function makeBucket(perMin) {
  return { tokens: perMin, cap: perMin, perMs: perMin / 60000, last: Date.now() };
}
// Metin zinciri: Gemini tier1 (mevcut GEMINI_MODEL) → tier2 → tier3 → NIM → OpenCode.
const aiBucket = makeBucket(AI_RATE_PARSE);
const geminiTier2Bucket = makeBucket(AI_RATE_GEMINI_TIER2);
const geminiTier3Bucket = makeBucket(AI_RATE_GEMINI_TIER3);
const nimBucket = makeBucket(NIM_RATE_PARSE);
const opencodeBucket = makeBucket(AI_RATE_OPENCODE);
// Görsel zinciri: Gemini tier1 → tier2 → tier3 → NIM Vision. Tier2/tier3 kovaları
// metin zinciriyle PAYLAŞILIYOR (aynı Gemini modeli, aynı gerçek üst kota) —
// yalnızca tier1 (aiBucket/visionBucket) ve NIM (nimBucket/nimVisionBucket) ayrı,
// çünkü bunlar zaten var olan, prod'da ayarlı olabilecek env anahtarları.
const VISION_RATE = Number(process.env.NUTRI_AI_RATE_VISION || 15);
const visionBucket = makeBucket(VISION_RATE);
const nimVisionBucket = makeBucket(NIM_VISION_RATE);
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
          // Besin etiketi taramasında değerlerin dayandığı miktar (100 g / porsiyon).
          // Alan `required` DEĞİL: metin ve yemek fotoğrafı akışlarında anlamsız.
          baseAmount: { type: "number" },
        },
        required: ["name", "kcal", "protein", "carbs", "fat", "fiber"],
      },
    },
  },
  required: ["items"],
};

// --- Dil (uygulama dilini izler) ----------------------------------------------
//
// Eskiden TÜM istemler Türkçeydi ve "Yanıtı Türkçe ver" diyordu: İngilizce
// arayüzde kullanıcı "Tavuk Göğsü (200g)" gibi Türkçe yemek adları alıyordu.
// İstem dili artık istemciden gelen `lang` alanından gelir (bkz. src/lib/ai.ts).
// Tanınmayan/eksik değer "en"e düşer (uygulamanın varsayılan dili).
const SUPPORTED_LANGS = new Set(["en", "tr", "pl"]);
// İstem HER dilde kendi dilinde yazılır: İngilizce isteme "Turkish" yazmak,
// Türkçe isteme "Türkçe" yazmak doğru olan. Bu yüzden dil adları istem
// şablonlarının İÇİNDE tanımlıdır (aşağıdaki PROMPTS).

function normalizeLang(lang) {
  const v = typeof lang === "string" ? lang.trim().toLowerCase() : "";
  if (SUPPORTED_LANGS.has(v)) return v;
  const base = v.split("-")[0];
  return SUPPORTED_LANGS.has(base) ? base : "en";
}

/** Besin adlarını kullanıcının DİLİNDE yazar; istem tek dilde kalsın. */
const NUTRIENT_WORDS = {
  en: {
    kcal: "kcal",
    protein: "g protein",
    carbs: "g carbs",
    fat: "g fat",
    fiber: "g fiber",
    sugar: "g sugar",
    satFat: "g sat. fat",
    sodium: "mg sodium",
  },
  tr: {
    kcal: "kcal",
    protein: "g protein",
    carbs: "g karbonhidrat",
    fat: "g yağ",
    fiber: "g lif",
    sugar: "g şeker",
    satFat: "g doymuş yağ",
    sodium: "mg sodyum",
  },
  pl: {
    kcal: "kcal",
    protein: "g białka",
    carbs: "g węglowodanów",
    fat: "g tłuszczu",
    fiber: "g błonnika",
    sugar: "g cukru",
    satFat: "g tł. nasyconych",
    sodium: "mg sodu",
  },
};

const PH = {
  en: {
    memoryHeader: "USER'S FOOD MEMORY (if you recognise these, use these values verbatim)",
    memoryEmpty: "(no foods in memory yet)",
    perServing: "per",
    knownAs: "also known as",
    more: "(… and {n} more foods)",
  },
  tr: {
    memoryHeader:
      "KULLANICININ BESİN HAFIZASI (bu besinleri tanıyorsan bu değerleri birebir kullan)",
    memoryEmpty: "(hafızada henüz besin yok)",
    perServing: "başına",
    knownAs: "şu ifadelerle anılır",
    more: "(… ve {n} besin daha)",
  },
  pl: {
    memoryHeader:
      "PAMIĘĆ ŻYWIENIOWA UŻYTKOWNIKA (jeśli rozpoznajesz te produkty, użyj tych wartości dokładnie)",
    memoryEmpty: "(brak produktów w pamięci)",
    perServing: "na",
    knownAs: "znane również jako",
    more: "(… i jeszcze {n} produktów)",
  },
};

function formatAliasLines(aliases, lang) {
  const L = normalizeLang(lang);
  const words = NUTRIENT_WORDS[L];
  const ph = PH[L];
  const list = Array.isArray(aliases) ? aliases : [];
  if (list.length === 0) return "";

  const MAX_ALIASES = 80;
  const sliced = list.slice(0, MAX_ALIASES);
  const extraCount = list.length - MAX_ALIASES;

  const lines = sliced.map((a) => {
    const displayName = a.brand ? `${a.name} (${a.brand})` : a.name;
    const nut = a.nutrition || {};

    const parts = [
      `${nut.kcal ?? "?"}${words.kcal}`,
      `${nut.protein ?? "?"}${words.protein}`,
      `${nut.carbs ?? "?"}${words.carbs}`,
      `${nut.fat ?? "?"}${words.fat}`,
      `${nut.fiber ?? "?"}${words.fiber}`,
    ];

    if (nut.sugar != null) parts.push(`${nut.sugar}${words.sugar}`);
    if (nut.satFat != null) parts.push(`${nut.satFat}${words.satFat}`);
    if (nut.sodium != null) parts.push(`${nut.sodium}${words.sodium}`);

    let line = `${displayName}: ${parts.join(", ")} ${ph.perServing} ${a.serving_g ?? "?"}g`;

    if (Array.isArray(a.triggers) && a.triggers.length > 0) {
      line += ` (${ph.knownAs}: ${a.triggers.join(", ")})`;
    }

    return line;
  });

  if (extraCount > 0) {
    lines.push(ph.more.replace("{n}", String(extraCount)));
  }

  return lines.join("\n");
}

const PROMPTS = {
  en: {
    textIntro: "You are a nutrition expert. Analyse the user's meal.",
    photoIntro: "You are a nutrition expert. Analyse the food(s) in the attached photo.",
    labelIntro: "You are a nutrition expert. The attached photo is a nutrition label.",
    rulesHeader: "RULES:",
    textRules: [
      "List every food item separately.",
      'Estimate the portion size in grams and state it in the name (e.g. "Chicken Breast (200g)").',
      "Calculate the nutrition values (kcal, protein, carbs, fat, fiber).",
      "Recognise Turkish and Polish dishes correctly.",
      'For every item give a "confidence" value between 0 and 1 (how sure you are).',
      "Answer in English.",
    ],
    photoRules: [
      "List every food item in the photo separately.",
      "Estimate the portion in grams from visual cues (plate size, comparative scale) and state it in the name.",
      "Calculate the nutrition values (kcal, protein, carbs, fat, fiber).",
      "Recognise Turkish and Polish dishes correctly.",
      'For every item give a "confidence" value between 0 and 1.',
      "Answer in English.",
    ],
    labelRules: [
      "Read the nutrition values (kcal, protein, carbs, fat, fiber) from the label EXACTLY, without estimating.",
      'State in the name whether the label is per 100 g or per serving (e.g. "Product Name (100g)").',
      'Also write the amount these values are based on into the "baseAmount" field as a NUMBER (the figure printed on the label: 100 if it is "per 100 g", 30 if it is "1 serving of 30 g"). If the label has several columns (per 100 g/100 ml AND per serving), prefer the "per 100 g/100 ml" column. If unsure, write 100.',
      "Usually there is a SINGLE item.",
      'For every item give a "confidence" value between 0 and 1 (lower it if the label is unclear).',
      "Answer in English.",
    ],
    userInput: "USER'S INPUT:",
  },
  tr: {
    textIntro: "Sen bir beslenme uzmanısın. Kullanıcının öğününü analiz et.",
    photoIntro: "Sen bir beslenme uzmanısın. Ekteki fotoğraftaki yemeği/yemekleri analiz et.",
    labelIntro: "Sen bir beslenme uzmanısın. Ekteki fotoğraf bir besin değerleri etiketi.",
    rulesHeader: "KURALLAR:",
    textRules: [
      "Her yemek öğesini ayrı ayrı listele.",
      'Porsiyon boyutunu gram cinsinden tahmin et, isimde belirt (ör. "Tavuk Göğsü (200g)").',
      "Besin değerlerini (kcal, protein, carbs, fat, fiber) hesapla.",
      "Türk ve Polonya yemeklerini doğru tanı.",
      'Her öğe için 0 ile 1 arasında bir "confidence" (ne kadar eminsin) değeri ver.',
      "Yanıtı Türkçe ver.",
    ],
    photoRules: [
      "Fotoğraftaki her yemek öğesini ayrı ayrı listele.",
      "Görsel ipuçlarından (tabak boyutu, karşılaştırmalı ölçek) porsiyon miktarını gram cinsinden tahmin et, isimde belirt.",
      "Besin değerlerini (kcal, protein, carbs, fat, fiber) hesapla.",
      "Türk ve Polonya yemeklerini doğru tanı.",
      'Her öğe için 0 ile 1 arasında bir "confidence" değeri ver.',
      "Yanıtı Türkçe ver.",
    ],
    labelRules: [
      "Etiketteki besin değerlerini (kcal, protein, carbs, fat, fiber) BİREBİR, tahmin etmeden oku.",
      'Etiket "100g başına" mı yoksa "porsiyon başına" mı gösteriyor, isimde belirt (ör. "Ürün Adı (100g)").',
      'Bu değerlerin dayandığı miktarı SAYI olarak "baseAmount" alanına da yaz (etikette yazan rakamın ta kendisi, ör. "100g başına" ise 100, "30g\u2019lik 1 porsiyon" ise 30). Etikette birden fazla sütun varsa (100g/100ml VE porsiyon) "100g/100ml başına" olan sütunu tercih et. Emin değilsen 100 yaz.',
      "Genellikle TEK bir öğe olur.",
      'Her öğe için 0 ile 1 arasında bir "confidence" değeri ver (etiket net değilse düşür).',
      "Yanıtı Türkçe ver.",
    ],
    userInput: "KULLANICININ GİRDİSİ:",
  },
  pl: {
    textIntro: "Jesteś ekspertem ds. żywienia. Przeanalizuj posiłek użytkownika.",
    photoIntro: "Jesteś ekspertem ds. żywienia. Przeanalizuj potrawy na załączonym zdjęciu.",
    labelIntro: "Jesteś ekspertem ds. żywienia. Załączone zdjęcie to etykieta wartości odżywczych.",
    rulesHeader: "ZASADY:",
    textRules: [
      "Wypisz każdy produkt osobno.",
      'Oszacuj porcję w gramach i podaj ją w nazwie (np. "Pierś z kurczaka (200g)").',
      "Oblicz wartości odżywcze (kcal, białko, węglowodany, tłuszcz, błonnik).",
      "Rozpoznawaj tureckie i polskie potrawy poprawnie.",
      'Dla każdego produktu podaj wartość "confidence" od 0 do 1 (jak bardzo jesteś pewien).',
      "Odpowiedz w języku polskim.",
    ],
    photoRules: [
      "Wypisz każdy produkt na zdjęciu osobno.",
      "Oszacuj porcję w gramach na podstawie wskazówek wizualnych (rozmiar talerza, skala) i podaj ją w nazwie.",
      "Oblicz wartości odżywcze (kcal, białko, węglowodany, tłuszcz, błonnik).",
      "Rozpoznawaj tureckie i polskie potrawy poprawnie.",
      'Dla każdego produktu podaj wartość "confidence" od 0 do 1.',
      "Odpowiedz w języku polskim.",
    ],
    labelRules: [
      "Odczytaj wartości odżywcze (kcal, białko, węglowodany, tłuszcz, błonnik) z etykiety DOKŁADNIE, bez szacowania.",
      'W nazwie podaj, czy etykieta dotyczy 100 g, czy porcji (np. "Nazwa produktu (100g)").',
      'Ilość, na której opierają się te wartości, zapisz jako LICZBĘ w polu "baseAmount" (dokładnie ta liczba, która jest na etykiecie: 100, jeśli jest "na 100 g", 30, jeśli to "1 porcja 30 g"). Jeśli etykieta ma kilka kolumn (na 100 g/100 ml ORAZ na porcję), wybierz kolumnę "na 100 g/100 ml". Jeśli nie masz pewności, wpisz 100.',
      "Zwykle występuje JEDEN produkt.",
      'Dla każdego produktu podaj wartość "confidence" od 0 do 1 (obniż ją, jeśli etykieta jest nieczytelna).',
      "Odpowiedz w języku polskim.",
    ],
    userInput: "DANE OD UŻYTKOWNIKA:",
  },
};

function rulesBlock(rules, header) {
  return `${header}\n${rules.map((r) => `- ${r}`).join("\n")}`;
}

function memoryBlock(aliasLines, lang) {
  const L = normalizeLang(lang);
  return `${PH[L].memoryHeader}:\n${aliasLines || PH[L].memoryEmpty}`;
}

function buildPrompt(text, aliases, lang) {
  const L = normalizeLang(lang);
  const p = PROMPTS[L];
  const aliasLines = formatAliasLines(aliases, L);

  return `${p.textIntro}\n\n${rulesBlock(p.textRules, p.rulesHeader)}\n\n${memoryBlock(aliasLines, L)}\n\n${p.userInput}\n${text}`;
}

function buildFoodPhotoPrompt(aliases, lang) {
  const L = normalizeLang(lang);
  const p = PROMPTS[L];
  const aliasLines = formatAliasLines(aliases, L);
  return `${p.photoIntro}\n\n${rulesBlock(p.photoRules, p.rulesHeader)}\n\n${memoryBlock(aliasLines, L)}`;
}

function buildLabelPrompt(lang) {
  const L = normalizeLang(lang);
  const p = PROMPTS[L];
  return `${p.labelIntro}\n\n${rulesBlock(p.labelRules, p.rulesHeader)}`;
}

// NIM ve OpenCode Zen, Gemini'nin `responseSchema` (yapısal çıktı garantisi)
// özelliğini desteklemiyor — bu yüzden ikisine de "sadece bu JSON'u döndür"
// talimatı ekleniyor. Eskiden `buildNimPrompt`/`NIM_JSON_INSTRUCTION` adıyla
// yalnızca NIM için vardı; artık OpenCode de aynı sınırlamayı paylaştığı için
// isim genelleştirildi.
// Talimatın KENDİSİ de uygulama dilini izler: eskiden yalnızca Türkçeydi ve
// İngilizce çıktı isteyen bir isteme Türkçe talimat ekliyordu (çıktı dilini
// saptırabilir).
const JSON_MODE_INSTRUCTIONS = {
  en: `

Reply ONLY with JSON in the shape below. Do NOT add any other text, explanation or markdown
code block (\`\`\`) — the ENTIRE reply must be valid JSON:
{"items":[{"name":"string","kcal":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"confidence":number,"baseAmount":number}]}

ALWAYS include the "confidence" field (0 to 1, how sure you are). Fill "baseAmount" only when you
are reading a nutrition label (the gram/ml amount the values are based on), otherwise write 0.`,
  tr: `

SADECE aşağıdaki JSON şekline uygun yanıt ver. Başka hiçbir metin, açıklama veya markdown
kod bloğu (\`\`\`) EKLEME — yanıtın TAMAMI geçerli JSON olmalı:
{"items":[{"name":"string","kcal":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"confidence":number,"baseAmount":number}]}

"confidence" alanını HER ZAMAN dahil et (0 ile 1 arası, ne kadar eminsin). "baseAmount" alanını
yalnızca bir besin etiketi okuyorsan (değerlerin dayandığı gram/ml miktarı) doldur, değilse 0 yaz.`,
  pl: `

Odpowiedz WYŁĄCZNIE w formacie JSON jak poniżej. NIE dodawaj żadnego innego tekstu, wyjaśnienia ani
bloku kodu markdown (\`\`\`) — CAŁA odpowiedź musi być poprawnym JSON-em:
{"items":[{"name":"string","kcal":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"confidence":number,"baseAmount":number}]}

ZAWSZE podawaj pole "confidence" (od 0 do 1, jak pewny jesteś). Pole "baseAmount" wypełniaj tylko
gdy czytasz etykietę wartości odżywczych (ilość w gramach/ml, na której opierają się wartości),
w przeciwnym razie wpisz 0.`,
};

function buildJsonModePrompt(basePrompt, lang) {
  return basePrompt + JSON_MODE_INSTRUCTIONS[normalizeLang(lang)];
}

// --- Ortak LLM çağrı mantığı ---------------------------------------------------
function stripMarkdownFence(s) {
  const trimmed = s.trim();
  const m = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : trimmed;
}

async function callLLM({ bucket, url, headers, requestBody, extractText, timeoutMs }) {
  const wait = takeToken(bucket);
  if (wait > 0) {
    return {
      status: 429,
      body: {
        error: `AI rate limit protected; retry in ${wait}s`,
        code: "ai_rate_limit",
        retryAfter: wait,
      },
    };
  }

  let r;
  let text;
  try {
    r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs || AI_TIMEOUT_MS),
    });
    text = await r.text();
  } catch (e) {
    const timedOut = e && (e.name === "TimeoutError" || e.name === "AbortError");
    // DİKKAT: hata mesajına asla ham istek URL'i (API anahtarı içeriyor) eklenmez.
    return {
      status: 504,
      body: {
        error: timedOut ? "AI service timed out" : "AI service unreachable",
        code: timedOut ? "ai_timeout" : "ai_unreachable",
      },
    };
  }

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* aşağıda ele alınıyor */
  }
  if (!json || !r.ok) {
    return {
      status: 502,
      body: { error: `AI service error (HTTP ${r.status})`, code: "ai_provider_error" },
    };
  }

  const rawText = extractText(json);
  if (typeof rawText !== "string") {
    return {
      status: 502,
      body: { error: "AI service returned an unexpected response", code: "ai_bad_response" },
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(stripMarkdownFence(rawText));
  } catch {
    return {
      status: 502,
      body: { error: "AI response is not valid JSON", code: "ai_bad_response" },
    };
  }

  return { status: 200, body: parsed };
}

/** @param {{model:string, bucket:object, imageBase64?:string, mimeType?:string, timeoutMs?:number}} opts */
function geminiFetch(prompt, opts) {
  const parts = [{ text: prompt }];
  if (opts.imageBase64) {
    parts.push({ inline_data: { mime_type: opts.mimeType, data: opts.imageBase64 } });
  }
  return callLLM({
    bucket: opts.bucket,
    url: geminiUrl(opts.model),
    headers: { "Content-Type": "application/json" },
    requestBody: {
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    },
    extractText: (j) => j?.candidates?.[0]?.content?.parts?.[0]?.text,
    timeoutMs: opts.timeoutMs,
  });
}

/** @param {{model:string, bucket:object, imageBase64?:string, mimeType?:string, timeoutMs?:number}} opts */
function nimFetch(prompt, opts) {
  const content = opts.imageBase64
    ? [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: { url: `data:${opts.mimeType};base64,${opts.imageBase64}` },
        },
      ]
    : prompt;
  return callLLM({
    bucket: opts.bucket,
    url: NIM_URL,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${NVIDIA_NIM_API_KEY}`,
    },
    requestBody: {
      model: opts.model,
      messages: [{ role: "user", content }],
      temperature: 0.2,
      // Bazı NIM vision modelleri response_format'ı desteklemeyebilir — görsel
      // isteklerde göndermiyoruz, sadece JSON_MODE_INSTRUCTIONS'a güveniyoruz.
      ...(opts.imageBase64 ? {} : { response_format: { type: "json_object" } }),
    },
    extractText: (j) => j?.choices?.[0]?.message?.content,
    timeoutMs: opts.timeoutMs,
  });
}

/** @param {{model:string, bucket:object, timeoutMs?:number}} opts */
function opencodeFetch(prompt, opts) {
  return callLLM({
    bucket: opts.bucket,
    url: OPENCODE_URL,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENCODE_API_KEY}`,
    },
    requestBody: {
      model: opts.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
    },
    extractText: (j) => j?.choices?.[0]?.message?.content,
    timeoutMs: opts.timeoutMs,
  });
}

function attemptGemini(prompt) {
  if (!GEMINI_API_KEY) {
    return { status: 500, body: { error: "AI service not configured (no GEMINI_API_KEY)" } };
  }
  return geminiFetch(prompt, { model: GEMINI_MODEL, bucket: aiBucket });
}

function attemptNim(prompt) {
  if (!NVIDIA_NIM_API_KEY) {
    return { status: 500, body: { error: "AI service not configured (no NVIDIA_NIM_API_KEY)" } };
  }
  return nimFetch(prompt, { model: NVIDIA_NIM_MODEL, bucket: nimBucket });
}

// --- Sağlayıcı fallback zinciri --------------------------------------------
// `steps`: [{available: boolean, run: () => Promise<{status,body}>}]. Sırayla
// dener, ilk 200'de durur. Hiçbiri "available" değilse (hiç API key yoksa)
// hemen 500 döner — hiçbir ağ isteği yapılmaz.
async function runChain(steps) {
  const usable = steps.filter((s) => s.available);
  if (usable.length === 0) {
    return {
      status: 500,
      body: {
        error: "AI service not configured (no API key for any provider)",
        code: "ai_not_configured",
      },
    };
  }
  let result;
  for (const step of usable) {
    result = await step.run();
    if (result.status === 200) return result;
  }
  return result;
}

function textChainSteps(prompt, lang) {
  const jsonPrompt = buildJsonModePrompt(prompt, lang);
  return [
    {
      available: !!GEMINI_API_KEY,
      run: () => geminiFetch(prompt, { model: GEMINI_MODEL, bucket: aiBucket }),
    },
    {
      available: !!GEMINI_API_KEY,
      run: () => geminiFetch(prompt, { model: GEMINI_TIER2_MODEL, bucket: geminiTier2Bucket }),
    },
    {
      available: !!GEMINI_API_KEY,
      run: () => geminiFetch(prompt, { model: GEMINI_TIER3_MODEL, bucket: geminiTier3Bucket }),
    },
    {
      available: !!NVIDIA_NIM_API_KEY,
      run: () =>
        nimFetch(jsonPrompt, {
          model: NVIDIA_NIM_MODEL,
          bucket: nimBucket,
          timeoutMs: NIM_FALLBACK_TIMEOUT_MS,
        }),
    },
    {
      available: !!OPENCODE_API_KEY,
      run: () =>
        opencodeFetch(jsonPrompt, {
          model: OPENCODE_MODEL,
          bucket: opencodeBucket,
          timeoutMs: NIM_FALLBACK_TIMEOUT_MS,
        }),
    },
  ];
}

function visionChainSteps(prompt, imageBase64, mimeType, lang) {
  const jsonPrompt = buildJsonModePrompt(prompt, lang);
  return [
    {
      available: !!GEMINI_API_KEY,
      run: () =>
        geminiFetch(prompt, { model: GEMINI_MODEL, bucket: visionBucket, imageBase64, mimeType }),
    },
    {
      available: !!GEMINI_API_KEY,
      run: () =>
        geminiFetch(prompt, {
          model: GEMINI_TIER2_MODEL,
          bucket: geminiTier2Bucket,
          imageBase64,
          mimeType,
        }),
    },
    {
      available: !!GEMINI_API_KEY,
      run: () =>
        geminiFetch(prompt, {
          model: GEMINI_TIER3_MODEL,
          bucket: geminiTier3Bucket,
          imageBase64,
          mimeType,
        }),
    },
    {
      available: !!NVIDIA_NIM_API_KEY,
      run: () =>
        nimFetch(jsonPrompt, {
          model: NVIDIA_NIM_VISION_MODEL,
          bucket: nimVisionBucket,
          timeoutMs: NIM_FALLBACK_TIMEOUT_MS,
          imageBase64,
          mimeType,
        }),
    },
  ];
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
  // Etiket taramasında değerlerin dayandığı miktar. Yalnızca POZİTİF ve sonlu
  // geldiğinde taşınır: model etiket okumadığında "0" yazar, istemciye
  // anlamsız bir 0 taşımanın faydası yok.
  if (isFiniteNum(raw.baseAmount) && raw.baseAmount > 0) {
    item.baseAmount = raw.baseAmount;
  }
  return item;
}

// --- Genel giriş noktası -------------------------------------------------------
/** @param {{text: string, aliases: unknown[]}} input
 *  @returns {Promise<{status:number, body:object}>} */
async function parseMealText({ text, aliases, lang }) {
  if (!["gemini", "nim", "auto"].includes(LLM_PROVIDER)) {
    return { status: 503, body: { error: AI_DISABLED_MESSAGE, code: "ai_disabled" } };
  }
  if (typeof text !== "string" || !text.trim()) {
    return { status: 400, body: { error: "text gerekli", code: "ai_bad_request" } };
  }

  const prompt = buildPrompt(text.trim(), Array.isArray(aliases) ? aliases : [], lang);

  let result;
  if (LLM_PROVIDER === "gemini") {
    result = await attemptGemini(prompt);
  } else if (LLM_PROVIDER === "nim") {
    result = await attemptNim(buildJsonModePrompt(prompt, lang));
  } else {
    // "auto": Gemini (3 kademe) → NIM → OpenCode Zen, sırayla. Hepsi başarısız
    // olursa son denenenin sonucu döner (özel birleştirilmiş mesaj YOK).
    result = await runChain(textChainSteps(prompt, lang));
  }

  if (result.status !== 200) return result;

  const rawItems = Array.isArray(result.body?.items) ? result.body.items : [];
  const items = rawItems.map(parseAiItem).filter((x) => x !== null);

  return { status: 200, body: { items } };
}

async function parseMealImage({ imageBase64, mimeType, mode, aliases, lang }) {
  if (LLM_PROVIDER === "none") {
    return { status: 503, body: { error: AI_DISABLED_MESSAGE, code: "ai_disabled" } };
  }
  if (typeof imageBase64 !== "string" || !imageBase64.trim()) {
    return { status: 400, body: { error: "image gerekli", code: "ai_bad_request" } };
  }
  if (typeof mimeType !== "string" || !VALID_IMAGE_MIME.has(mimeType)) {
    return {
      status: 400,
      body: {
        error: "geçersiz mimeType (image/jpeg, image/png, image/webp)",
        code: "ai_bad_request",
      },
    };
  }

  // İki istem var (bkz. src/types.ts'in `VisionMode`'u — aynı ikili):
  //   food_label → ambalajdaki tabloyu BİREBİR oku, tahmin etme, hafıza gönderme
  //   food_photo → tabaktaki yemeği tahmin et, kullanıcının besin hafızasını da gör
  // Görselin kameradan mı galeriden mi geldiği farketmez, ikisi de aynı ikiliye düşer.
  const prompt =
    mode === "food_label"
      ? buildLabelPrompt(lang)
      : buildFoodPhotoPrompt(Array.isArray(aliases) ? aliases : [], lang);

  // NOT: eskiden burada "GEMINI_API_KEY yoksa 500" diye erken bir kontrol vardı.
  // Artık kaldırıldı — runChain zaten hiçbir adım kullanılamıyorsa kendi 500'ünü
  // üretiyor, ve Gemini anahtarı olmasa bile NIM Vision tek başına devreye
  // girebilmeli (zincirin bütün amacı bu).
  const result = await runChain(visionChainSteps(prompt, imageBase64, mimeType, lang));

  if (result.status !== 200) return result;

  const rawItems = Array.isArray(result.body?.items) ? result.body.items : [];
  const items = rawItems.map(parseAiItem).filter((x) => x !== null);
  const healthNote =
    typeof result.body?.healthNote === "string" ? result.body.healthNote : undefined;
  return { status: 200, body: { items, ...(healthNote ? { healthNote } : {}) } };
}

module.exports = { parseMealText, parseMealImage };
