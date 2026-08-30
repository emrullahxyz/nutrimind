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
    typeof v === "string" ? [[`${prefix}${k}`, v]] : flatten(v, `${prefix}${k}.`)
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
  const perLang = langs.map((l) => (sets[l].has(key) ? new Set(placeholders(sets[l].get(key))) : null));
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
  const needed = new Set([...langs].flatMap((l) => (sets[l].has(key) ? placeholders(sets[l].get(key)) : [])));
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

let fail = false;
if (missing > 0 || placeholderMismatch > 0) {
  console.log(
    `PARITY FAIL: ${missing} missing key(s), ${placeholderMismatch} placeholder mismatch(es)`
  );
  fail = true;
} else {
  console.log(`PARITY OK (${totals[langs[0]]} keys x${langs.length})`);
}
if (interpWarnings > 0) console.log(`INTERP: ${interpWarnings} warning(s) — code-side lenient, not failing`);
if (fail) process.exit(1);