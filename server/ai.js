"use strict";

const fs = require("node:fs");
const path = require("node:path");
const aiLog = require("./aiLog.js");
const aiModels = require("./aiModels.js");
const { geminiEnabled, startGeminiDiscovery } = require("./aiDiscovery.js");

// --- .env yükleyici (yalnızca yerel geliştirme kolaylığı) -------------------
// Prod'da systemd zaten process.env'i doldurabilir — burada zaten SET olan
// hiçbir anahtarın üzerine YAZILMAZ. .env dosyası yoksa sessizce atlanır.
//
// İki olası yerleşim var ve ikisi de desteklenir:
//   - Yerel repo: bu dosya `server/ai.js`, `.env` bir üst dizinde (repo kökü).
//   - Prod (systemd, /home/emrullah/nutri-api): `index.js`/`ai.js` ALT KLASÖRSÜZ,
//     düz duruyor — `.env` bu dosyayla AYNI dizinde.
// İlk bulunan aday kullanılır.
//
// TEST ORTAMI MUAFİYETİ: Vitest her test koşturumda `VITEST=true` set eder.
// .env yükleyicisi testte de çalışırsa, testin `beforeEach`'te sildiği anahtarlar
// (ör. `GEMINI_API_KEY`) dosyadan geri dolar ve izolasyon kırılır — geliştirici
// makinesinde `.env` varsa testler kırmızı, CI'da yeşil (ai.test.js'in
// `loadAi()` sıfırlaması bunu kapatamaz, çünkü modül yeniden yüklenince bu
// fonksiyon dosyayı yeniden okur). Dev/ortamı etkilemez: orada `VITEST` yoktur.
function loadDotEnvOnce() {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return;
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

const CONFIDENCE_THRESHOLD = Number(process.env.NUTRIMIND_CONFIDENCE_THRESHOLD || 0.8);
const API_WINDOW_MS = Number(process.env.NUTRI_AI_API_WINDOW_MS || 30000);
const AI_BUDGET_MS = Number(process.env.NUTRI_AI_BUDGET_MS || 25000);
const MIN_STEP_MS = Number(process.env.NUTRI_AI_MIN_STEP_MS || 2500);
const AI_TIMEOUT_MS = Number(process.env.NUTRI_AI_TIMEOUT_MS || 15000);
const AI_LIMITS = { budgetMs: AI_BUDGET_MS, apiWindowMs: API_WINDOW_MS, minStepMs: MIN_STEP_MS };
const VALID_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function makeBucket(perMin) {
  return { tokens: perMin, cap: perMin, perMs: perMin / 60000, last: Date.now() };
}

const buckets = {
  parse: makeBucket(Number(process.env.NUTRI_AI_RATE_PARSE || 10)),
  vision: makeBucket(Number(process.env.NUTRI_AI_RATE_VISION || 15)),
};

aiLog.setBuckets(
  Object.entries(buckets).map(([name, bucket]) => ({
    name,
    cap: bucket.cap,
    peek: () => peekTokens(bucket),
  })),
);

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
      'Write the estimated portion size in GRAMS into the "baseAmount" field as a NUMBER too (e.g. 450 if you estimated 450 g).',
      "Calculate the nutrition values (kcal, protein, carbs, fat, fiber).",
      "Recognise Turkish and Polish dishes correctly.",
      'For every item give a "confidence" value between 0 and 1 (how sure you are).',
      "Answer in English.",
    ],
    photoRules: [
      "List every food item in the photo separately.",
      "Estimate the portion in grams from visual cues (plate size, comparative scale) and state it in the name.",
      'Write the estimated portion size in GRAMS into the "baseAmount" field as a NUMBER too (e.g. 450 if you estimated 450 g).',
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
      'Tahmin ettiğin porsiyon gramajını SAYI olarak "baseAmount" alanına da yaz (ör. 450 g tahmin ettiysen 450).',
      "Besin değerlerini (kcal, protein, carbs, fat, fiber) hesapla.",
      "Türk ve Polonya yemeklerini doğru tanı.",
      'Her öğe için 0 ile 1 arasında bir "confidence" (ne kadar eminsin) değeri ver.',
      "Yanıtı Türkçe ver.",
    ],
    photoRules: [
      "Fotoğraftaki her yemek öğesini ayrı ayrı listele.",
      "Görsel ipuçlarından (tabak boyutu, karşılaştırmalı ölçek) porsiyon miktarını gram cinsinden tahmin et, isimde belirt.",
      'Tahmin ettiğin porsiyon gramajını SAYI olarak "baseAmount" alanına da yaz (ör. 450 g tahmin ettiysen 450).',
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
      'Zapisz oszacowaną wagę porcji również jako LICZBĘ w polu "baseAmount" (np. 450, jeśli oszacowałeś 450 g).',
      "Oblicz wartości odżywcze (kcal, białko, węglowodany, tłuszcz, błonnik).",
      "Rozpoznawaj tureckie i polskie potrawy poprawnie.",
      'Dla każdego produktu podaj wartość "confidence" od 0 do 1 (jak bardzo jesteś pewien).',
      "Odpowiedz w języku polskim.",
    ],
    photoRules: [
      "Wypisz każdy produkt na zdjęciu osobno.",
      "Oszacuj porcję w gramach na podstawie wskazówek wizualnych (rozmiar talerza, skala) i podaj ją w nazwie.",
      'Zapisz oszacowaną wagę porcji również jako LICZBĘ w polu "baseAmount" (np. 450, jeśli oszacowałeś 450 g).',
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

ALWAYS include the "confidence" field (0 to 1, how sure you are). Fill "baseAmount" with the gram
amount the values are based on: 100 for "per 100 g", the serving size for a serving (e.g. 30), or your
ESTIMATED portion in grams for a text/photo meal. If unsure, write 100. Do not write 0 when you made
an estimate.`,
  tr: `

SADECE aşağıdaki JSON şekline uygun yanıt ver. Başka hiçbir metin, açıklama veya markdown
kod bloğu (\`\`\`) EKLEME — yanıtın TAMAMI geçerli JSON olmalı:
{"items":[{"name":"string","kcal":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"confidence":number,"baseAmount":number}]}

"confidence" alanını HER ZAMAN dahil et (0 ile 1 arası, ne kadar eminsin). "baseAmount" alanını
değerlerin dayandığı gram miktarıyla doldur: "100g başına" ise 100, porsiyon ise porsiyon miktarı
(ör. 30), metin/fotoğraf öğününde ise TAHMİN ETTİĞİN porsiyon gramajı. Emin değilsen 100 yaz.
Tahmin yaptıysan 0 yazma.`,
  pl: `

Odpowiedz WYŁĄCZNIE w formacie JSON jak poniżej. NIE dodawaj żadnego innego tekstu, wyjaśnienia ani
bloku kodu markdown (\`\`\`) — CAŁA odpowiedź musi być poprawnym JSON-em:
{"items":[{"name":"string","kcal":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"confidence":number,"baseAmount":number}]}

ZAWSZE podawaj pole "confidence" (od 0 do 1, jak pewny jesteś). Pole "baseAmount" wypełnij ilością
w gramach, na której opierają się wartości: 100 dla "na 100 g", wielkością porcji dla porcji (np. 30),
lub OSZACOWANĄ wagą porcji dla posiłku z tekstu/zdjęcia. Jeśli nie jesteś pewien, wpisz 100. Nie wpisuj
0, gdy dokonałeś oszacowania.`,
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

const geminiGeneration = require("./aiGemini.js").createGeminiGeneration({
  schema: RESPONSE_SCHEMA,
  buildJsonModePrompt,
  parseAiItem,
  stripMarkdownFence,
  getCatalog: aiModels.getGeminiCatalog,
  getCredentialGeneration: aiModels.getGeminiCredentialGeneration,
  getApiKey: () => process.env.GEMINI_API_KEY,
});

const geminiRouting = require("./aiGeminiRouting.js").createGeminiRouting({
  ...geminiGeneration,
  runVerifiedGemini: (model, mode, input) =>
    geminiGeneration.runVerifiedGemini(model, mode, {
      ...input,
      maxMs: AI_TIMEOUT_MS,
    }),
  getGeminiCatalog: aiModels.getGeminiCatalog,
  getGeminiCatalogWait: aiModels.getGeminiCatalogWait,
  getCredentialGeneration: aiModels.getGeminiCredentialGeneration,
  refreshGeminiCatalog: aiModels.refreshGeminiCatalog,
  createGeminiCatalogRecovery: aiModels.createGeminiCatalogRecovery,
  getApiKey: () => process.env.GEMINI_API_KEY,
});

const disabled = {
  status: 503,
  body: { error: "AI features are disabled in this environment", code: "ai_disabled" },
};
const notConfigured = {
  status: 500,
  body: { error: "AI service not configured", code: "ai_not_configured" },
};
const timeout = { status: 504, body: { error: "AI service timed out", code: "ai_timeout" } };
const providerError = {
  status: 502,
  body: { error: "AI service error", code: "ai_provider_error" },
};

async function routeRequest(endpoint, startedAt, buildInput) {
  const mode = endpoint === "parse" ? "text" : "vision";
  let result;
  try {
    if (!process.env.GEMINI_API_KEY?.trim()) {
      result = notConfigured;
    } else {
      const retryAfter = takeToken(buckets[endpoint]);
      if (retryAfter) {
        result = {
          status: 429,
          body: { error: "AI rate limit protected", code: "ai_rate_limit", retryAfter },
        };
      } else {
        const input = buildInput();
        const deadlineAt = startedAt + AI_BUDGET_MS;
        result =
          deadlineAt - Date.now() < MIN_STEP_MS
            ? timeout
            : await geminiRouting.routeGemini(mode, input, { deadlineAt, minStepMs: MIN_STEP_MS });
      }
    }
  } catch {
    result = providerError;
  }
  aiLog.record({
    endpoint,
    provider: "gemini",
    status: result.status,
    code: result.body.code,
    latencyMs: Date.now() - startedAt,
    retryAfter: result.body.retryAfter,
  });
  return result;
}

async function parseMealText({ text, aliases, lang } = {}) {
  const startedAt = Date.now();
  if (!geminiEnabled()) return disabled;
  if (typeof text !== "string" || !text.trim()) {
    return { status: 400, body: { error: "text gerekli", code: "ai_bad_request" } };
  }
  const result = await routeRequest("parse", startedAt, () => ({
    prompt: buildPrompt(text.trim(), Array.isArray(aliases) ? aliases : [], lang),
    lang,
  }));
  return result.status === 200 ? { status: 200, body: { items: result.body.items } } : result;
}

async function parseMealImage({ imageBase64, mimeType, mode, aliases, lang } = {}) {
  const startedAt = Date.now();
  if (!geminiEnabled()) return disabled;
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
  return routeRequest("vision", startedAt, () => ({
    prompt:
      mode === "food_label"
        ? buildLabelPrompt(lang)
        : buildFoodPhotoPrompt(Array.isArray(aliases) ? aliases : [], lang),
    imageBase64,
    mimeType,
    lang,
  }));
}

aiLog.setGeminiSnapshot(() => ({
  ...geminiRouting.geminiRoutingSnapshot(),
  configuration: !geminiEnabled()
    ? "disabled"
    : process.env.GEMINI_API_KEY?.trim()
      ? "enabled"
      : "missing-key",
}));

if (!process.env.VITEST && process.env.NODE_ENV !== "test") {
  startGeminiDiscovery(Number(process.env.NUTRI_AI_DISCOVER_INTERVAL_MS), {
    probeRound: geminiRouting.probeGeminiRoutingRound,
  });
}

module.exports = {
  parseMealText,
  parseMealImage,
  aiLog,
  aiModels,
  AI_LIMITS,
  ...geminiGeneration,
  ...geminiRouting,
};
