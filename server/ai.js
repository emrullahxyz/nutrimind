// ============================================================================
// Nutrimind — AI istemcisi (OpenRouter + OpenCode + Ollama Cloud + Gemini kademeleri + Cloudflare).
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
// GÖZLEM + SAĞLAMLIK KATMANLARI (2026-09-21 canlı olay → docs/operations/ai.md,
// ders tasks/lessons.md L27). Olay: kamera/etiket zinciri 67-71 sn sürdü, prod nginx
// `/api/` penceresi 30 sn olduğu için kullanıcı BİZİM hatamızı hiç görmedi ve
// "AI zaman aşımı" mesajını nginx'in gövdesiz 504'ünden okudu; gerçek sebep ise
// Gemini'nin 503'üydü ama `runChain` yalnızca SON adımın sonucunu döndürüyordu.
// Bu yüzden zincir artık şu kurallarla çalışır:
//   1) TEK toplam bütçe (AI_BUDGET_MS < nginx penceresi) — her adım kalanla kırpılır
//      ve kalan yetmezse adım hiç başlatılmaz (failureFrom/runChain).
//   2) Hata kodu TÜM denemelerden seçilir; yanıt gövdesine `attempts` konur.
//   3) Aynı sağlayıcının kademeleri art arda 5xx verirse kalanları atlanır (429 sayılmaz).
//   4) Art arda düşen adım devre kesiciyle geçici olarak kapatılır (server/aiHealth.js).
//   5) Ölü model adı (400/404/410) listeden yeniden keşfedilir ve aynı istekte
//      denenir (server/aiModels.js) — model adları sağlayıcılar tarafından
//      habersizce emekliye ayrılıyor (410 Gone / 400 "Model is unavailable").
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

// Gözlem katmanı (server/aiLog.js): her sağlayıcı adımının sonucu buraya
// kaydedilir — hata anında "hangi dakikada, hangi kademede tıkandı" sorusunun
// cevabı journalctl'de grep '\[ai\]' ile görünür. Katman ASLA throw etmez ve
// davranışı değiştirmez (bkz. aiLog.js başındaki motivasyon notu).
const aiLog = require("./aiLog.js");
// Devre kesici (server/aiHealth.js) ve model keşfi (server/aiModels.js).
// İkisi de izole/kendi kendine yeten modüller; asla throw etmezler. index.js'e
// HİÇ dokunulmadan zincir burada sağlamlaştırılıyor (AGENTS.md madde 1).
const aiHealth = require("./aiHealth.js");
const aiModels = require("./aiModels.js");

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
// (ör. `NVIDIA_NIM_MODEL`) dosyadan geri dolar ve izolasyon kırılır — geliştirici
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

// --- Sabitler ----------------------------------------------------------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_TIER2_MODEL = process.env.GEMINI_TIER2_MODEL || "gemini-3.5-flash";
const GEMINI_TIER3_MODEL = process.env.GEMINI_TIER3_MODEL || "gemini-flash-lite-latest";
const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY || "";
const OPENCODE_MODEL = process.env.OPENCODE_MODEL || "space-bunny-free";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const OLLAMA_CLOUD_API_KEY = process.env.OLLAMA_CLOUD_API_KEY || "";
const OLLAMA_CLOUD_MODEL = process.env.OLLAMA_CLOUD_MODEL || "gemma4:31b";
const CLAUDEFLARE_API_KEY = process.env.CLAUDEFLARE_API_KEY || "";
const CLAUDEFLARE_ACCOUNT_ID = process.env.CLAUDEFLARE_ACCOUNT_ID || "";
const CLAUDEFLARE_MODEL = process.env.CLAUDEFLARE_MODEL || "@cf/google/gemma-2b-it-lora";
const LLM_PROVIDER = process.env.NUTRIMIND_LLM_PROVIDER || "none";
const CONFIDENCE_THRESHOLD = Number(process.env.NUTRIMIND_CONFIDENCE_THRESHOLD || 0.8);
const AI_RATE_PARSE = Number(process.env.NUTRI_AI_RATE_PARSE || 10);
const AI_RATE_GEMINI_TIER2 = Number(process.env.NUTRI_AI_RATE_GEMINI_TIER2 || 10);
const AI_RATE_GEMINI_TIER3 = Number(process.env.NUTRI_AI_RATE_GEMINI_TIER3 || 15);
const AI_RATE_OPENCODE = Number(process.env.NUTRI_AI_RATE_OPENCODE || 10);
const AI_RATE_OPENROUTER = Number(process.env.NUTRI_AI_RATE_OPENROUTER || 15);
const AI_RATE_OLLAMA = Number(process.env.NUTRI_AI_RATE_OLLAMA || 10);
const AI_RATE_CLAUDEFLARE = Number(process.env.NUTRI_AI_RATE_CLAUDEFLARE || 5);
const AI_TIMEOUT_MS = Number(process.env.NUTRI_AI_TIMEOUT_MS || 15000);
// OpenCode/OpenRouter/Ollama fallback adımları hem soğuk-başlangıçta hem de
// gerçek besin-analizi prompt'larında (kısa "OK" testinden çok daha uzun JSON
// üretimi gerektiriyor) birincil Gemini denemesinden belirgin şekilde yavaş
// olabiliyor — bu yüzden hepsi daha uzun bir zaman aşımı kullanıyor.
const FALLBACK_TIMEOUT_MS = Number(process.env.NUTRI_AI_FALLBACK_TIMEOUT_MS || 40000);

// --- Toplam süre bütçesi (2026-09-21 canlı olay) -----------------------------
// nginx'in `/api/` bloğu `proxy_read_timeout 30s` ile SABİT (bkz.
// docs/operations/ai.md). Bu pencereden uzun süren bir isteğin yanıtı kullanıcıya
// HİÇ ulaşmaz: nginx kendi gövdesiz 504'ünü döner, istemci de onu "AI servisi
// zaman aşımına uğradı" diye gösterir. Olay günü zincir en kötü
// 15+15+15+40 = 85 sn sürebiliyordu ve üç istek de 67-71 sn'de bittiği için
// kullanıcı bizim yanıtımızı hiç görmedi (üstelik sunucu 30 sn sonra boşu boşuna
// çalışmaya devam edip kota yaktı).
//
// DEĞİŞMEZ: AI_BUDGET_MS < API_WINDOW_MS. Kapısı: server/ai.test.js →
// "zaman penceresi değişmezi".
const API_WINDOW_MS = Number(process.env.NUTRI_AI_API_WINDOW_MS || 30000);
const AI_BUDGET_MS = Number(process.env.NUTRI_AI_BUDGET_MS || 25000);
// Kalan bütçe bir adımı denemeye yetmiyorsa o adım HİÇ başlatılmaz: 3 saniyelik
// bir deneme ne sonuç verir ne de günlüğü anlamlı kılar.
const MIN_STEP_MS = Number(process.env.NUTRI_AI_MIN_STEP_MS || 2500);
// Aynı sağlayıcının kademeleri art arda bu kadar "sağlayıcı kaynaklı" hata
// verirse kalan kademeler atlanır (sağlayıcı geneli arıza). 429 BÖYLE SAYILMAZ:
// kota model başına ayrı bir kovadır, sonraki kademe çalışabilir.
const VENDOR_5XX_STREAK = Number(process.env.NUTRI_AI_VENDOR_5XX_STREAK || 2);
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
// Metin zinciri: openrouter → opencode → ollama → gemini-tier1/2/3 → cloudflare.
// Görsel zinciri: gemini-tier1/2/3 (yalnız bunlar vision modelidir).
// Gemini tier2/tier3 kovaları metin+görsel arasında PAYLAŞILIYOR (aynı model,
// aynı gerçek üst kota) — tier1 (aiBucket/visionBucket) ve diğerleri ayrı.
const aiBucket = makeBucket(AI_RATE_PARSE);
const geminiTier2Bucket = makeBucket(AI_RATE_GEMINI_TIER2);
const geminiTier3Bucket = makeBucket(AI_RATE_GEMINI_TIER3);
const opencodeBucket = makeBucket(AI_RATE_OPENCODE);
const openrouterBucket = makeBucket(AI_RATE_OPENROUTER);
const ollamaBucket = makeBucket(AI_RATE_OLLAMA);
const cloudflareBucket = makeBucket(AI_RATE_CLAUDEFLARE);
const VISION_RATE = Number(process.env.NUTRI_AI_RATE_VISION || 15);
const visionBucket = makeBucket(VISION_RATE);
const VALID_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

// Kovalar aiLog'a bildirilir: /api/ai/status anlık doluluk gösterir (teşhis:
// "429 gerçekten kovadan mı geldi" sorusunun cevabı).
aiLog.setBuckets([
  { name: "openrouter", cap: openrouterBucket.cap, peek: () => peekTokens(openrouterBucket) },
  { name: "opencode", cap: opencodeBucket.cap, peek: () => peekTokens(opencodeBucket) },
  { name: "ollama", cap: ollamaBucket.cap, peek: () => peekTokens(ollamaBucket) },
  { name: "gemini-tier1-text", cap: aiBucket.cap, peek: () => peekTokens(aiBucket) },
  { name: "gemini-tier2", cap: geminiTier2Bucket.cap, peek: () => peekTokens(geminiTier2Bucket) },
  { name: "gemini-tier3", cap: geminiTier3Bucket.cap, peek: () => peekTokens(geminiTier3Bucket) },
  { name: "vision", cap: visionBucket.cap, peek: () => peekTokens(visionBucket) },
  { name: "cloudflare", cap: cloudflareBucket.cap, peek: () => peekTokens(cloudflareBucket) },
]);

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

/** Sağlayıcının HAM HTTP kodunu devre kesici türüne çevirir.
 *  - 401/403/404/410 → "model": model ya da anahtar kalıcı olarak geçersiz
 *    (olay günü tam olarak bunlar vardı: 410 Gone ve 404 "not found for account").
 *  - 400/422 → "request": istek şekli ile model uyuşmuyor (OpenCode'un "Model is
 *    unavailable" yanıtı 400 geliyordu).
 *  - >=500 → "provider": sağlayıcı geneli geçici arıza.
 *  - diğerleri (429 dahil) → null: sağlık sorunu değil.
 */
function healthKindOf(upstream) {
  if (!Number.isFinite(upstream)) return null;
  if ([401, 403, 404, 410].includes(upstream)) return "model";
  if ([400, 422].includes(upstream)) return "request";
  if (upstream >= 500) return "provider";
  return null;
}

/** Model adı kaynaklı bir hata mı? → yeni model aramaya değer mi. */
function isModelErrorStatus(upstream) {
  return [400, 404, 410].includes(upstream);
}

/** Bir sağlayıcı adımının çağrı sonucu. `status`/`code` BİZİM istemciye
 *  döneceğimiz değerler, `upstream` sağlayıcının ham kodudur (olay günü 503 ile
 *  504 günlükte karıştığı için ayrıldı). `kind` devre kesici türüdür. */
async function callLLM(opts) {
  const {
    bucket,
    buildUrl,
    headers,
    buildBody,
    model,
    extractText,
    deadlineAt,
    maxMs,
    provider,
    endpoint,
    mode,
    allowModelRotation = false,
  } = opts;

  const startedAt = Date.now();
  const remaining = () => deadlineAt - Date.now();
  let currentModel = model;
  let rotated = false;

  const log = (status, detail) =>
    aiLog.record({
      endpoint,
      provider,
      model: currentModel,
      status,
      code: detail?.code ?? null,
      latencyMs: Date.now() - startedAt,
      retryAfter: detail?.retryAfter ?? null,
      upstream: detail?.upstream ?? null,
      detail: detail?.text ?? detail?.reason ?? null,
    });

  // Kova reddi: sağlık sorunu değil, hız sınırı. Adım DENENMEDİ.
  const wait = takeToken(bucket);
  if (wait > 0) {
    const body = {
      error: `AI rate limit protected; retry in ${wait}s`,
      code: "ai_rate_limit",
      retryAfter: wait,
    };
    log(429, { code: "ai_rate_limit", retryAfter: wait });
    return {
      status: 429,
      body,
      code: "ai_rate_limit",
      retryAfter: wait,
      upstream: null,
      kind: null,
      model: currentModel,
      latencyMs: Date.now() - startedAt,
    };
  }

  // En fazla iki tur. İkinci tur YALNIZCA model seviyesinde bir hatadan (400/404/
  // 410) sonra ve yeni bir model BULUNABİLİRSE yapılır: olay günü zincir ölü
  // model adlarıyla saniyeler yakıyordu, bu tur onu kendiliğinden onarır.
  for (let round = 0; round < 2; round += 1) {
    const timeoutMs = Math.max(1, Math.min(maxMs || AI_TIMEOUT_MS, remaining()));
    let r;
    let text;
    try {
      r = await fetch(buildUrl(currentModel), {
        method: "POST",
        headers,
        body: JSON.stringify(buildBody(currentModel)),
        signal: AbortSignal.timeout(timeoutMs),
      });
      text = await r.text();
    } catch (e) {
      const timedOut = e && (e.name === "TimeoutError" || e.name === "AbortError");
      // DİKKAT: hata mesajına asla ham istek URL'i (API anahtarı içeriyor) eklenmez.
      const kind = timedOut ? "timeout" : "unreachable";
      aiHealth.noteFailure(provider, kind);
      const body = {
        error: timedOut ? `AI service timed out after ${timeoutMs}ms` : "AI service unreachable",
        code: timedOut ? "ai_timeout" : "ai_unreachable",
      };
      // Zaman aşımı MODELDEN kaynaklanıyor olabilir (olay günü 90B llama 90 sn'de
      // yanıt vermedi): seçim tazelenir, sonraki istek başka model dener.
      if (timedOut) aiModels.invalidate(provider, mode);
      log(504, { code: body.code, reason: timedOut ? `timeout after ${timeoutMs}ms` : "unreachable" });
      return {
        status: 504,
        body,
        code: body.code,
        upstream: null,
        kind,
        model: currentModel,
        latencyMs: Date.now() - startedAt,
      };
    }

    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* aşağıda ele alınıyor */
    }

    if (!json || !r.ok) {
      const upstream = r.status;
      const kind = healthKindOf(upstream);
      const body = { error: `AI service error (HTTP ${upstream})`, code: "ai_provider_error" };
      if (kind) aiHealth.noteFailure(provider, kind, upstream);
      log(502, { code: body.code, upstream, text });

      // MODEL DEĞİŞTİRME: ölü model adı yerine sağlayıcının listesinden canlı
      // yoklanmış bir yedek bulunur (bkz. server/aiModels.js). Aynı bütçenin içinde.
      if (
        !rotated &&
        allowModelRotation &&
        isModelErrorStatus(upstream) &&
        remaining() > MIN_STEP_MS
      ) {
        const found = await aiModels.refreshOnFailure(provider, mode, {
          currentModel,
          budgetMs: remaining(),
          status: upstream,
        });
        if (found.model && found.model !== currentModel) {
          rotated = true;
          currentModel = found.model;
          continue;
        }
      }

      return {
        status: 502,
        body,
        code: body.code,
        upstream,
        kind,
        model: currentModel,
        latencyMs: Date.now() - startedAt,
      };
    }

    const rawText = extractText(json);
    if (typeof rawText !== "string") {
      const body = {
        error: "AI service returned an unexpected response",
        code: "ai_bad_response",
      };
      log(502, { code: body.code, upstream: r.status });
      return {
        status: 502,
        body,
        code: body.code,
        upstream: r.status,
        kind: null,
        model: currentModel,
        latencyMs: Date.now() - startedAt,
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(stripMarkdownFence(rawText));
    } catch {
      const body = { error: "AI response is not valid JSON", code: "ai_bad_response" };
      log(502, { code: body.code, upstream: r.status });
      return {
        status: 502,
        body,
        code: body.code,
        upstream: r.status,
        kind: null,
        model: currentModel,
        latencyMs: Date.now() - startedAt,
      };
    }

    aiHealth.noteSuccess(provider);
    log(200, null);
    return {
      status: 200,
      body: parsed,
      code: null,
      upstream: r.status,
      kind: null,
      model: currentModel,
      latencyMs: Date.now() - startedAt,
    };
  }

  // Güvenlik ağı: döngü yalnızca model değiştirip yeniden denemek için devam eder
  // ve her turda ya döner ya da yukarıda raporlanır — buraya normalde düşülmez.
  const body = { error: "AI service exhausted model retries", code: "ai_provider_error" };
  log(502, { code: body.code });
  return {
    status: 502,
    body,
    code: body.code,
    upstream: null,
    kind: null,
    model: currentModel,
    latencyMs: Date.now() - startedAt,
  };
}

/** @param {{model:string, bucket:object, imageBase64?:string, mimeType?:string, timeoutMs?:number}} opts */
function geminiFetch(prompt, opts) {
  const parts = [{ text: prompt }];
  if (opts.imageBase64) {
    parts.push({ inline_data: { mime_type: opts.mimeType, data: opts.imageBase64 } });
  }
  return callLLM({
    bucket: opts.bucket,
    // Gemini modeli URL'de taşır (gövdede yok) — bu yüzden URL bir fonksiyon.
    buildUrl: (model) => geminiUrl(model),
    headers: { "Content-Type": "application/json" },
    buildBody: () => ({
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    }),
    extractText: (j) => j?.candidates?.[0]?.content?.parts?.[0]?.text,
    deadlineAt: opts.deadlineAt,
    maxMs: opts.maxMs,
    provider: opts.provider || "gemini",
    endpoint: opts.endpoint,
    mode: opts.mode,
    // Gemini kademeleri zaten ayrı ayrı denenir; ayrıca model keşfi (aiModels)
    // Gemini için tanımlı değil.
    allowModelRotation: false,
    model: opts.model,
  });
}

/** OpenAI-uyumlu `/chat/completions` (OpenRouter). `nimFetch` deseni:
 *  JSON-modu istem + model rotasyonu. Görsel metni desteklemez (text-only). */
function openrouterFetch(prompt, opts) {
  return callLLM({
    bucket: opts.bucket,
    buildUrl: () => "https://openrouter.ai/api/v1/chat/completions",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    buildBody: (model) => ({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
      response_format: { type: "json_object" },
    }),
    extractText: (j) => j?.choices?.[0]?.message?.content,
    deadlineAt: opts.deadlineAt,
    maxMs: opts.maxMs,
    provider: opts.provider || "openrouter",
    endpoint: opts.endpoint,
    mode: opts.mode,
    // Ölü model adı ya da :free doluysa listeden yenisi bulunur.
    allowModelRotation: true,
    model: opts.model,
  });
}

/** Ollama Cloud native `/api/chat` — OpenAI-uyumsuz body (`stream:false`).
 *  JSON'u prompt yoluyla ister; `response_format` alanı yok. */
function ollamaCloudFetch(prompt, opts) {
  return callLLM({
    bucket: opts.bucket,
    buildUrl: () => "https://ollama.com/api/chat",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OLLAMA_CLOUD_API_KEY}`,
    },
    buildBody: (model) => ({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
    extractText: (j) => j?.message?.content,
    deadlineAt: opts.deadlineAt,
    maxMs: opts.maxMs,
    provider: opts.provider || "ollama",
    endpoint: opts.endpoint,
    mode: opts.mode,
    allowModelRotation: true,
    model: opts.model,
  });
}

/** Cloudflare AI Gateway — OpenAI-uyumlu `/chat/completions`; hesap-id header'ı.
 *  Deneysel sağlayıcı: yalnızca `CLAUDEFLARE_API_KEY` + `_ACCOUNT_ID` doluysa
 *  çağrılır; aksi halde adım hiç `available` olmaz. */
function cloudflareFetch(prompt, opts) {
  return callLLM({
    bucket: opts.bucket,
    buildUrl: () =>
      `https://api.cloudflare.com/client/v4/accounts/${CLAUDEFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CLAUDEFLARE_API_KEY}`,
      "cf-aig-gateway-id": "default",
    },
    buildBody: (model) => ({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
    }),
    extractText: (j) => j?.choices?.[0]?.message?.content,
    deadlineAt: opts.deadlineAt,
    maxMs: opts.maxMs,
    provider: opts.provider || "cloudflare",
    endpoint: opts.endpoint,
    mode: opts.mode,
    allowModelRotation: true,
    model: opts.model,
  });
}

/** @param {{model:string, bucket:object, timeoutMs?:number}} opts */
function opencodeFetch(prompt, opts) {
  return callLLM({
    bucket: opts.bucket,
    buildUrl: () => OPENCODE_URL,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENCODE_API_KEY}`,
    },
    buildBody: (model) => ({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
    }),
    extractText: (j) => j?.choices?.[0]?.message?.content,
    deadlineAt: opts.deadlineAt,
    maxMs: opts.maxMs,
    provider: opts.provider || "opencode",
    endpoint: opts.endpoint,
    mode: opts.mode,
    // Ücretsiz modeller sık değişiyor (olay günü `deepseek-v4-flash-free` 400
    // "Model is unavailable" döndü) → listeden canlı bir yedek bulunur.
    allowModelRotation: true,
    model: opts.model,
  });
}

/** Bir denemenin kayda geçen özeti. `skipped` doluysa adım HİÇ denenmedi. */
function attemptOf(provider, result) {
  return {
    provider,
    model: result.model ?? null,
    status: result.status,
    code: result.code ?? null,
    upstream: result.upstream ?? null,
    retryAfter: result.retryAfter ?? null,
    latencyMs: result.latencyMs ?? null,
  };
}

/** Bir adım "sağlayıcı kaynaklı" mı düştü? Satıcı geneli arıza sayacı yalnızca
 *  bunları sayar; kova reddi (429) ve model hatası SAYILMAZ. */
function isVendorFailure(result) {
  if (!result) return false;
  if (Number.isFinite(result.upstream) && result.upstream >= 500) return true;
  return result.code === "ai_timeout" || result.code === "ai_unreachable";
}

/**
 * Denenen adımların TAMAMINA bakıp istemciye söylenecek sebebi seçer.
 *
 * NEDEN: olay günü zincir [Gemini 503, Gemini 503, Gemini zaman aşımı, NIM
 * zaman aşımı] şeklindeydi ve zincir "son adımın sonucunu" döndürdüğü için
 * kullanıcı "zaman aşımı" mesajı aldı — oysa asıl sebep sağlayıcının 503'üydü.
 * Artık öncelik: kova reddi (hiç denemedik) → sağlayıcı hatası → zaman aşımı →
 * erişilemezlik.
 */
function failureFrom(attempts) {
  const ran = attempts.filter((a) => !a.skipped);
  const body = (code, extra = {}) => ({ error: CODE_MESSAGES[code] || "AI service failed", code, attempts, ...extra });

  if (ran.length === 0) {
    const breakerSkipped = attempts.some((a) => a.skipped === "breaker");
    if (breakerSkipped) {
      // Sağlayıcı bilinen bozuk; hiç denemedik. Kullanıcıya dürüst cevap:
      // "şu an düzgün yanıt vermiyor" — zaman aşımı DEĞİL.
      return { status: 502, body: body("ai_provider_error") };
    }
    // Hiç adım denenemedi çünkü bütçe ilk adıma bile yetmiyordu: bu bir
    // yapılandırma sorunu değil, süre sorunudur → "zaman aşımı".
    if (attempts.some((a) => a.skipped === "budget")) {
      return { status: 504, body: body("ai_timeout") };
    }
    return { status: 500, body: body("ai_not_configured") };
  }

  // İlk adım kovadan reddedildiyse sağlayıcı hiç denenmedi: kullanıcıya
  // "çok hızlı denedin, biraz bekle" demek en doğrusu (retryAfter ile).
  if (ran[0].code === "ai_rate_limit") {
    return {
      status: 429,
      body: body("ai_rate_limit", { retryAfter: ran[0].retryAfter ?? null }),
    };
  }

  const providerError = ran.find((a) => a.code === "ai_provider_error" || a.code === "ai_bad_response");
  if (providerError) {
    return { status: 502, body: body(providerError.code || "ai_provider_error") };
  }
  const timeout = ran.find((a) => a.code === "ai_timeout");
  if (timeout) return { status: 504, body: body("ai_timeout") };
  const unreachable = ran.find((a) => a.code === "ai_unreachable");
  if (unreachable) return { status: 504, body: body("ai_unreachable") };
  const rateLimited = ran.find((a) => a.code === "ai_rate_limit");
  if (rateLimited) {
    return { status: 429, body: body("ai_rate_limit", { retryAfter: rateLimited.retryAfter ?? null }) };
  }
  return { status: 502, body: body("ai_provider_error") };
}

/** Hata kodlarının gövde metinleri İngilizce kalır; kullanıcıya gösterilen metni
 *  istemci `code`'dan aktif dile çevirir (src/lib/ai.ts). */
const CODE_MESSAGES = {
  ai_rate_limit: "AI rate limit protected",
  ai_timeout: "AI service timed out",
  ai_unreachable: "AI service unreachable",
  ai_provider_error: "AI service error",
  ai_bad_response: "AI service returned an unexpected response",
  ai_not_configured: "AI service not configured (no API key for any provider)",
};

// --- Sağlayıcı fallback zinciri --------------------------------------------
// `steps`: [{ provider, vendor, available, run(deadlineAt) }]. Sırayla denenir,
// ilk 200'de durur. Kurallar:
//   1) TEK toplam bütçe (AI_BUDGET_MS): kalan süre bir adımı denemeye yetmiyorsa
//      o adım HİÇ başlatılmaz (30 sn'lik nginx penceresini aşmamak için).
//   2) Devre kesici açık adımlar atlanır (server/aiHealth.js).
//   3) Aynı sağlayıcının VENDOR_5XX_STREAK kademesi art arda sağlayıcı kaynaklı
//      hata verirse kalan kademeleri atlanır (sağlayıcı geneli arıza).
//   4) Başarısızlıkta dönen kod TÜM denemelerden seçilir (failureFrom).
//   5) İstek başına tek satır `chain` özeti stdout'a yazılır (başarıda da).
async function runChain(steps, endpoint) {
  const startedAt = Date.now();
  const deadlineAt = startedAt + AI_BUDGET_MS;
  const attempts = [];
  const usable = steps.filter((s) => s.available);

  if (usable.length === 0) {
    const { status, body } = failureFrom([]);
    aiLog.recordChain({ endpoint, status, totalMs: Date.now() - startedAt, code: body.code, attempts });
    return { status, body };
  }

  const vendorFailures = new Map();

  for (const step of usable) {
    if ((vendorFailures.get(step.vendor) || 0) >= VENDOR_5XX_STREAK) {
      attempts.push({ provider: step.provider, skipped: "vendor-5xx", status: null, code: null, upstream: null, latencyMs: null });
      continue;
    }

    // 2026-10-? devre kesici KALDIRILDI (kullanıcı isteği): artık hiçbir adım
    // `skipped:"breaker"` ile atlanmaz — her istek tüm sağlayıcıları sırayla
    // dener. Geçmiş sağlık durumu teşhis için aiHealth.snapshot()'ta kalır ama
    // `isOpen` kararı runChain'i etkilemez. Bütçe (AI_BUDGET_MS) bozuk
    // sağlayıcıda süreyi hâlâ sınırlar.
    if (deadlineAt - Date.now() < MIN_STEP_MS) {
      attempts.push({ provider: step.provider, skipped: "budget", status: null, code: null, upstream: null, latencyMs: null });
      continue;
    }

    const result = await step.run(deadlineAt);
    attempts.push(attemptOf(step.provider, result));

    if (result.status === 200) {
      aiLog.setHealth(aiHealth.snapshot());
      aiLog.recordChain({
        endpoint,
        status: 200,
        totalMs: Date.now() - startedAt,
        code: null,
        attempts,
      });
      return result;
    }

    if (isVendorFailure(result)) {
      vendorFailures.set(step.vendor, (vendorFailures.get(step.vendor) || 0) + 1);
    } else {
      vendorFailures.set(step.vendor, 0);
    }
  }

  const { status, body } = failureFrom(attempts);
  aiLog.setHealth(aiHealth.snapshot());
  aiLog.recordChain({ endpoint, status, totalMs: Date.now() - startedAt, code: body.code, attempts });
  return { status, body };
}

function textChainSteps(prompt, lang) {
  const jsonPrompt = buildJsonModePrompt(prompt, lang);
  // Model adı ÖNBELLEKTEN gelir; keşif yalnızca bir kademe model seviyesinde
  // hata verince çalışır (server/aiModels.js) — sağlıklı akışta ek ağ isteği yok.
  const openrouterModel = aiModels.getModel("openrouter", "text", OPENROUTER_MODEL).model;
  const opencodeModel = aiModels.getModel("opencode", "text", OPENCODE_MODEL).model;
  const ollamaModel = aiModels.getModel("ollama", "text", OLLAMA_CLOUD_MODEL).model;
  const cfModel = aiModels.getModel("cloudflare", "text", CLAUDEFLARE_MODEL).model;
  const cfEnabled = !!CLAUDEFLARE_API_KEY && !!CLAUDEFLARE_ACCOUNT_ID;
  // Sıralama kuralı: Gemini tier'ları ÖNCE — hızlı, free-tier ve responseSchema
  // ile yapısal JSON garantisi (prod'da 200 dönüyor). openrouter/free genel
  // yönlendiricisi güvenilmez (reasoning modeline düşüp content:null bırakabiliyor,
  // 15 sn yanıyor) → yedek. Plan-dahili/ücretsiz opencode→ollama arada.
  // Vision modelleri burada YOKTUR — metin işi görsel modelin limitini harcamaz.
  return [
    {
      provider: "gemini-tier1",
      vendor: "gemini",
      available: !!GEMINI_API_KEY,
      run: (deadlineAt) =>
        geminiFetch(prompt, {
          model: GEMINI_MODEL,
          bucket: aiBucket,
          provider: "gemini-tier1",
          endpoint: "parse",
          mode: "text",
          deadlineAt,
          maxMs: AI_TIMEOUT_MS,
        }),
    },
    {
      provider: "gemini-tier2",
      vendor: "gemini",
      available: !!GEMINI_API_KEY,
      run: (deadlineAt) =>
        geminiFetch(prompt, {
          model: GEMINI_TIER2_MODEL,
          bucket: geminiTier2Bucket,
          provider: "gemini-tier2",
          endpoint: "parse",
          mode: "text",
          deadlineAt,
          maxMs: AI_TIMEOUT_MS,
        }),
    },
    {
      provider: "gemini-tier3",
      vendor: "gemini",
      available: !!GEMINI_API_KEY,
      run: (deadlineAt) =>
        geminiFetch(prompt, {
          model: GEMINI_TIER3_MODEL,
          bucket: geminiTier3Bucket,
          provider: "gemini-tier3",
          endpoint: "parse",
          mode: "text",
          deadlineAt,
          maxMs: AI_TIMEOUT_MS,
        }),
    },
    {
      provider: "opencode",
      vendor: "opencode",
      available: !!OPENCODE_API_KEY,
      run: (deadlineAt) =>
        opencodeFetch(jsonPrompt, {
          model: opencodeModel,
          bucket: opencodeBucket,
          maxMs: FALLBACK_TIMEOUT_MS,
          provider: "opencode",
          endpoint: "parse",
          mode: "text",
          deadlineAt,
        }),
    },
    {
      provider: "ollama",
      vendor: "ollama",
      available: !!OLLAMA_CLOUD_API_KEY,
      run: (deadlineAt) =>
        ollamaCloudFetch(jsonPrompt, {
          model: ollamaModel,
          bucket: ollamaBucket,
          maxMs: FALLBACK_TIMEOUT_MS,
          provider: "ollama",
          endpoint: "parse",
          mode: "text",
          deadlineAt,
        }),
    },
    {
      provider: "openrouter",
      vendor: "openrouter",
      available: !!OPENROUTER_API_KEY,
      run: (deadlineAt) =>
        openrouterFetch(jsonPrompt, {
          model: openrouterModel,
          bucket: openrouterBucket,
          maxMs: FALLBACK_TIMEOUT_MS,
          provider: "openrouter",
          endpoint: "parse",
          mode: "text",
          deadlineAt,
        }),
    },
    {
      provider: "cloudflare",
      vendor: "cloudflare",
      available: cfEnabled,
      run: (deadlineAt) =>
        cloudflareFetch(jsonPrompt, {
          model: cfModel,
          bucket: cloudflareBucket,
          maxMs: FALLBACK_TIMEOUT_MS,
          provider: "cloudflare",
          endpoint: "parse",
          mode: "text",
          deadlineAt,
        }),
    },
  ];
}

function visionChainSteps(prompt, imageBase64, mimeType, lang) {
  // Görsel zinciri YALNIZCA vision-destekli modelleri denemelidir: şu an bu
  // küme Gemini tier'larıdır (OpenRouter/Ollama/OpenCode metin-only — görsel
  // modelin limiti metin işine harcanmaz). JSON garantisi Gemini `responseSchema`
  // üzerinden gelir.
  return [
    {
      provider: "gemini-tier1",
      vendor: "gemini",
      available: !!GEMINI_API_KEY,
      run: (deadlineAt) =>
        geminiFetch(prompt, {
          model: GEMINI_MODEL,
          bucket: visionBucket,
          imageBase64,
          mimeType,
          provider: "gemini-tier1",
          endpoint: "vision",
          mode: "vision",
          deadlineAt,
          maxMs: AI_TIMEOUT_MS,
        }),
    },
    {
      provider: "gemini-tier2",
      vendor: "gemini",
      available: !!GEMINI_API_KEY,
      run: (deadlineAt) =>
        geminiFetch(prompt, {
          model: GEMINI_TIER2_MODEL,
          bucket: geminiTier2Bucket,
          imageBase64,
          mimeType,
          provider: "gemini-tier2",
          endpoint: "vision",
          mode: "vision",
          deadlineAt,
          maxMs: AI_TIMEOUT_MS,
        }),
    },
    {
      provider: "gemini-tier3",
      vendor: "gemini",
      available: !!GEMINI_API_KEY,
      run: (deadlineAt) =>
        geminiFetch(prompt, {
          model: GEMINI_TIER3_MODEL,
          bucket: geminiTier3Bucket,
          imageBase64,
          mimeType,
          provider: "gemini-tier3",
          endpoint: "vision",
          mode: "vision",
          deadlineAt,
          maxMs: AI_TIMEOUT_MS,
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
/** Zorlanmış sağlayıcı modunda adım listesini süzer. `auto` → tam zincir. */
function forcedSteps(provider, steps, filters) {
  if (provider === "auto") return steps;
  const filter = filters[provider];
  return filter ? steps.filter(filter) : steps;
}

/** @param {{text: string, aliases: unknown[]}} input
 *  @returns {Promise<{status:number, body:object}>} */
async function parseMealText({ text, aliases, lang }) {
  if (!["gemini", "auto"].includes(LLM_PROVIDER)) {
    return { status: 503, body: { error: AI_DISABLED_MESSAGE, code: "ai_disabled" } };
  }
  if (typeof text !== "string" || !text.trim()) {
    return { status: 400, body: { error: "text gerekli", code: "ai_bad_request" } };
  }

  const prompt = buildPrompt(text.trim(), Array.isArray(aliases) ? aliases : [], lang);

  // "auto": openrouter → opencode → ollama → gemini-tier1/2/3 → cloudflare.
  // "gemini" zorlama da AYNI zincirden geçer (yalnızca adım listesi süzülür):
  // bütçe, devre kesici ve hata raporu tek yerde kalsın.
  const steps = forcedSteps(LLM_PROVIDER, textChainSteps(prompt, lang), {
    gemini: (s) => s.provider === "gemini-tier1",
  });
  const result = await runChain(steps, "parse");

  if (result.status !== 200) return { status: result.status, body: result.body };

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
  const result = await runChain(visionChainSteps(prompt, imageBase64, mimeType, lang), "vision");

  if (result.status !== 200) return { status: result.status, body: result.body };

  const rawItems = Array.isArray(result.body?.items) ? result.body.items : [];
  const items = rawItems.map(parseAiItem).filter((x) => x !== null);
  const healthNote =
    typeof result.body?.healthNote === "string" ? result.body.healthNote : undefined;
  return { status: 200, body: { items, ...(healthNote ? { healthNote } : {}) } };
}

// Değişmez kapısı için dışa açık: server/ai.test.js "zaman penceresi değişmezi"
// testi `budgetMs < apiWindowMs` şartını buradan doğrular. index.js yalnızca
// parseMealText/parseMealImage kullanır; bu fazladan dışa aktarım onu etkilemez.
const AI_LIMITS = { budgetMs: AI_BUDGET_MS, apiWindowMs: API_WINDOW_MS, minStepMs: MIN_STEP_MS };

// Periyodik free-model taraması (server/aiDiscovery.js): test dışında ve
// AUTOMODEL kapalı değilse başlat. Süreç içi setInterval ile yaşar; açılışta
// ilk tur atar. `NODE_ENV=test` muafiyeti AiLogic.test izolasyonunu korur.
if (process.env.NODE_ENV !== "test" && process.env.NUTRI_AI_AUTOMODEL !== "0") {
  const discovery = require("./aiDiscovery.js");
  discovery.startDiscovery(Number(process.env.NUTRI_AI_DISCOVER_INTERVAL_MS));
}

module.exports = { parseMealText, parseMealImage, aiLog, aiHealth, aiModels, AI_LIMITS };
