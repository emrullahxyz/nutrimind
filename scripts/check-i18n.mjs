import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const localesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "i18n", "locales");
const langs = ["en", "tr", "pl"];

const flatten = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "string" ? [[`${prefix}${k}`, v]] : flatten(v, `${prefix}${k}.`)
  );

const sets = {};
const totals = {};
for (const lang of langs) {
  const raw = JSON.parse(readFileSync(join(localesDir, `${lang}.json`), "utf8"));
  sets[lang] = new Map(flatten(raw));
  totals[lang] = sets[lang].size;
}

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

const unique = new Set([...langs].flatMap((l) => [...sets[l].keys()]));
if (missing > 0) {
  console.log(`PARITY FAIL: ${missing} missing key(s)`);
  process.exit(1);
}
console.log(`PARITY OK (${totals[langs[0]]} keys x${langs.length})`);
