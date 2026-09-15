import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = join(root, "src", "i18n", "locales");
const srcDir = join(root, "src");
const langs = ["en", "tr", "pl"];

/** Yalnızca string yaprak düğümleri düzleştir; dizi değerler (örn. weekdaysShort)
 *  placeholder içermez ve key denetimi dışında tutulur. */
const flatten = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "string" ? [[`${prefix}${k}`, v]] : flatten(v, `${prefix}${k}.`),
  );

/** Bir string değerdeki `{{name}}` placeholder adlarını çıkarır. */
const placeholders = (s) => Array.from(s.matchAll(/\{\{\s*([\w$]+)\s*\}\}/g), (m) => m[1]);

const sets = {};
const totals = {};
for (const lang of langs) {
  const raw = JSON.parse(readFileSync(join(localesDir, `${lang}.json`), "utf8"));
  sets[lang] = new Map(flatten(raw));
  totals[lang] = sets[lang].size;
}

// ---------------------------------------------------------------------------
// 1) Key parity — her dilde aynı anahtar kümesi olmalı.
// ---------------------------------------------------------------------------
const [ref] = langs;
let missing = 0;
for (const [key] of sets[ref]) {
  for (const lang of langs.slice(1)) {
    if (!sets[lang].has(key)) {
      console.log(`MISSING ${lang}:${key}`);
      missing++;
    }
  }
}

// ---------------------------------------------------------------------------
// 2) Placeholder parity — aynı anahtarın değeri 3 dilde de AYNI placeholder
//    kümesini kullanmalı. Fark varsa (birinde {{weight}}, diğerinde {{grams}})
//    placeholder'ı eksik olan dilde ham `{{...}}` metni ekranda görünür.
// ---------------------------------------------------------------------------
const allKeys = new Set([...langs].flatMap((l) => [...sets[l].keys()]));
let placeholderMismatch = 0;
for (const key of allKeys) {
  const perLang = langs.map((l) =>
    sets[l].has(key) ? new Set(placeholders(sets[l].get(key))) : null,
  );
  if (perLang.some((p) => p === null)) continue; // key zaten MISSING'te raporlanır
  const refSet = [...perLang[0]];
  for (const p of refSet) {
    for (let i = 1; i < langs.length; i++) {
      if (!perLang[i].has(p)) {
        console.log(`PLACEHOLDER MISSING ${langs[i]}:${key} ({{${p}}})`);
        placeholderMismatch++;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3) Kod tarafı — `t("key", { var: ... })` çağrılarında placeholder'lara karşılık
//    gelen değişken verilmiş mi? Yalnızca güvenle ayrıştırılan basit çağrılar
//    denetlenir; karmaşık/yoldinamik anahtarlar atlanır. Hatalı sonuçtan kaçınmak
//    için bu kontrol YALNIZCA uyarıdır (çıkış kodunu etkilemez).
// ---------------------------------------------------------------------------
/** Kaynağı `t("key", {...})` çağrıları için tara; `Map<key, Set<varName>>` döner. */
function collectInterpolatedKeys(text) {
  const out = new Map();
  const push = (key, vars) => {
    if (!key || key.includes("${")) return; // dinamik/template anahtar — güvenli atla
    let set = out.get(key);
    if (!set) out.set(key, (set = new Set()));
    for (const v of vars) set.add(v);
  };
  const re = /t\s*\(\s*(["'`])(.*?)\1\s*,\s*\{/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const openBrace = m.index + m[0].length - 1; // `{` konumu
    // eşleşen kapanış `}` — derinlik takibi (iç içe JSX/nesne/çağrı güvenliği)
    let depth = 1;
    let i = openBrace + 1;
    let inStr = null;
    let esc = false;
    for (; i < text.length && depth > 0; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (depth !== 0) continue; // kapanış bulunamadı — atla
    const args = text.slice(openBrace + 1, i - 1);
    const vars = new Set();
    // arg nesnesinin 1. düzeyindeki `name:` anahtarlarını topla
    let d = 0;
    let j = 0;
    let str = null;
    while (j < args.length) {
      const c = args[j];
      if (str) {
        if (c === "\\") j++;
        else if (c === str) str = null;
        j++;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") str = c;
      else if (c === "{") d++;
      else if (c === "}") d--;
      else if (d === 0 && /[A-Za-z_$]/.test(c)) {
        const rest = args.slice(j);
        // `name: expr` (açık anahtar)
        const colon = /^([A-Za-z_$][\w$]*)\s*:/.exec(rest);
        // shorthand `{ name }`, `{ a, b }` — i18next placeholder ismi == yerel değişken adı
        const shorthand = /^([A-Za-z_$][\w$]*)(?=\s*(?:[,}]|$))/.exec(rest);
        if (colon && !rest.startsWith("...")) {
          vars.add(colon[1]);
          j += colon[0].length;
          continue;
        }
        if (shorthand && !rest.startsWith("...")) {
          vars.add(shorthand[1]);
          j += shorthand[0].length;
          continue;
        }
      }
      j++;
    }
    push(m[2], vars);
  }
  return out;
}

function collectDirFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) collectDirFiles(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

const codeVars = new Map();
for (const file of collectDirFiles(srcDir)) {
  const text = readFileSync(file, "utf8");
  for (const [key, vars] of collectInterpolatedKeys(text)) {
    let set = codeVars.get(key);
    if (!set) codeVars.set(key, (set = new Set()));
    for (const v of vars) set.add(v);
  }
}

let interpWarnings = 0;
for (const key of allKeys) {
  const needed = new Set(
    [...langs].flatMap((l) => (sets[l].has(key) ? placeholders(sets[l].get(key)) : [])),
  );
  if (needed.size === 0) continue;
  const supplied = codeVars.get(key);
  if (!supplied) {
    // Anahtara kodda interpolasyon argümanıyla rastlanmadı — bilinen basit nedenler:
    // `$t()` iç içe kullanımı, `t()` başka bir değişkene sarılı, helper katmanları.
    // Bu nedenle yalnızca uyarı.
    console.log(`WARN ${key}: {{${[...needed].join(", ")}}} vars bulk static t() calls bulunamadi`);
    interpWarnings++;
    continue;
  }
  for (const p of needed) {
    if (!supplied.has(p)) {
      console.log(`WARN ${key}: code never supplies {{${p}}}`);
      interpWarnings++;
    }
  }
}

// ---------------------------------------------------------------------------
// 4) KOD → LOCALE — kodda `t("...")` ile İSTENEN her anahtar locale'de olmalı.
//
// Neden gerekli: bu kapı yalnızca 3 dil arasındaki tutarlılığı görüyordu, kodun
// kendisiyle olan bağı görmüyordu. Yazım hatası olan ya da hiç eklenmemiş bir
// anahtar (`t("settings.targetWeightLabel")`) ekranda ham `settings.…` olarak
// görünür — ve bunu testler de yakalamaz. Dinamik anahtarlar (`${...}`) atlanır.
// ---------------------------------------------------------------------------
function collectUsedKeys(text) {
  const keys = new Set();
  const re = /(?:^|[^\w$.])(?:i18n\.)?t\s*\(\s*(["'`])((?:[^"'`\\]|\\.)*)\1/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = m[2];
    if (!key || key.includes("${") || key.includes("\n")) continue; // dinamik — atla
    // Yalnızca GERÇEK anahtar şekli: harfle başlar, harf/rakam/nokta/alt çizgi.
    // Gerekçe: düz metin içinde geçen örnekler (`t("...")` gibi) anahtar sanılıp
    // yanlış alarm üretiyordu — bkz. tasks/lessons.md L23 (kapı, prozayla kandırılamaz).
    if (!/^[A-Za-z][\w.]*$/.test(key)) continue;
    keys.add(key);
  }
  return keys;
}

/** Bir nesnenin TÜM yolları — DİZİLERİ yaprak sayar. `flatten` dizi değerleri
 *  atladığı için (`day.weekdaysShort` gibi `returnObjects` anahtarları) burada
 *  ayrıca toplanır: "kod bu anahtarı istiyor, locale'de var mı?" sorusunun
 *  doğru cevabı budur. */
const pathsOfLocale = (o, p = "") =>
  Object.entries(o).flatMap(([k, v]) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? pathsOfLocale(v, `${p}${k}.`)
      : [`${p}${k}`],
  );

const knownKeys = new Set(
  pathsOfLocale(JSON.parse(readFileSync(join(localesDir, "en.json"), "utf8"))),
);
let missingInCode = 0;
for (const file of collectDirFiles(srcDir)) {
  const text = readFileSync(file, "utf8");
  for (const key of collectUsedKeys(text)) {
    if (!knownKeys.has(key)) {
      console.log(`MISSING KEY ${key} — used in ${file.slice(root.length + 1)}`);
      missingInCode++;
    }
  }
}

// ---------------------------------------------------------------------------
// 5) SABİT TÜRKÇE METİN — dile bağlı olmadan yazılmış kullanıcı metni.
//
// Bu hata sınıfı üç kez ürünüle çıktı: "Beslenme Hedefleri" başlığı, kalori
// halkasının `\u00xx` kaçışlarıyla gizlenmiş alt yazısı, CSV başlıkları. Üç
// farklı yolla saklandığı için üç imza birlikte aranır:
//   1. Türkçe'ye özgü harfler (ç ğ ı ö ş ü), 2. `\u01xx` kaçışları,
//   3. ASCII'yle yazılabilen Türkçe kelimeler (Hedef, Kaydet, Ekle…).
// `// i18n-exempt: <gerekçe>` yorumu olan satırlar ve dosya bazlı muafiyetler
// (aşağıdaki liste, her biri gerekçeli) atlanır.
// ---------------------------------------------------------------------------
const FILE_EXEMPT = [
  ["src/lib/changelog.ts", "sürüm notları tr/en alanları çevirinin KENDİSİ"],
  ["src/i18n/i18n.ts", "i18n altyapısı ve dil algılama"],
  ["src/lib/goals.ts", "gömülü profil ADLARI veri değeri (backend sözleşmesi)"],
];

const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;
const TR_ESCAPE = /\\u01[0-9a-fA-F]{2}/;
const TR_WORDS = [
  "Hedef",
  "Hedefe",
  "Beslenme",
  "Kaydet",
  "Varsayilan",
  "Ekle",
  "Kalan",
  "Toplam",
  "Ortalama",
  "Takip",
  "Tema",
  "Destek",
  "Gizlilik",
  "Profil",
  "Porsiyon",
  "Tarif",
  "Besin",
  "Yemek",
  "Isim",
];
const TR_WORD_RE = new RegExp(`\\b(?:${TR_WORDS.join("|")})\\b`);

/** Yorumları boşlukla değiştirir (satır numarası ve kod yapısı bozulmadan). */
function stripComments(text) {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
  return out;
}

const exemptFiles = new Set(FILE_EXEMPT.map(([f]) => join(root, f)));
let hardcoded = 0;
for (const file of collectDirFiles(srcDir)) {
  if (exemptFiles.has(file)) continue;
  if (/\.test\.(ts|tsx)$/.test(file)) continue; // test verisi kullanıcıya görünmez
  const rel = file.slice(root.length + 1);
  const rawLines = readFileSync(file, "utf8").split(/\r?\n/);
  const lines = stripComments(readFileSync(file, "utf8")).split(/\r?\n/);
  lines.forEach((line, i) => {
    // Muafiyet işareti YORUMDA yaşar; yorumlar yukarıda boşaltıldığı için hem
    // ham hem temizlenmiş satıra bakılır (aynı zamanda bir üst satırdaki
    // işaret de geçerlidir — çok satırlı yapılar için).
    if (/i18n-exempt/.test(line) || /i18n-exempt/.test(rawLines[i] ?? "")) return;
    if (i > 0 && /i18n-exempt/.test(rawLines[i - 1] ?? "")) return;
    const hit = TR_LETTERS.test(line) || TR_ESCAPE.test(line) || TR_WORD_RE.test(line);
    if (!hit) return;
    console.log(`HARDCODED ${rel}:${i + 1} — ${line.trim().slice(0, 110)}`);
    hardcoded++;
  });
}

let fail = false;
if (missing > 0 || placeholderMismatch > 0) {
  console.log(
    `PARITY FAIL: ${missing} missing key(s), ${placeholderMismatch} placeholder mismatch(es)`,
  );
  fail = true;
} else {
  console.log(`PARITY OK (${totals[langs[0]]} keys x${langs.length})`);
}

if (missingInCode > 0) {
  console.log(`KEYS FAIL: ${missingInCode} key(s) used in code but absent from locales`);
  fail = true;
} else {
  console.log(`KEYS OK (kodda kullanılan her t("…") anahtarı locale'de var)`);
}

if (hardcoded > 0) {
  console.log(`HARDCODED FAIL: ${hardcoded} satırda dile bağlı metin`);
  fail = true;
} else {
  console.log(`HARDCODED OK (sabit Türkçe metin yok)`);
}

if (interpWarnings > 0)
  console.log(`INTERP: ${interpWarnings} warning(s) — code-side lenient, not failing`);
if (fail) process.exit(1);
