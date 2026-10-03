// Nutrimind — düzenlenebilir kalem satırlarının saf cebir kaynağı.
// Hem `TemplatePreview` (şablon) hem `NutritionSheet` (günlük kayıt) bu
// modülü kullanır; iki yüzey de aynı kuralları gösterir, bu yüzden kurallar
// BURADA yaşar ve jsdom olmadan test edilir.
//
// İki sözleşme:
//   1. Gösterilen = kaydedilen (bkz. lessons.md L20). Gramaj alanında yazan
//      metin `qty`'ye aynen girer; ölçüm `grams` üzerinden yapılır.
//   2. Yarım yazılan bir gramaj makroyu SIFIRLAMAZ — kullanıcı "1" yazıp
//      "50" yaparken değerler titrer.
import type { Alias, Nutrition } from "../types";
import { ZERO_NUTRITION } from "../types";
import type { NutrientKey } from "./nutrients";
import { NUTRIENT_KEYS } from "./nutrients";
import { defaultUnitForAlias, parseNum, scaleNutrition, toGrams, unitOptions } from "./nutrition";
import type { TemplateItem } from "./templates";

export interface DraftLine {
  /** React anahtarı + düzenleme hedefi. Zaman damgalı benzersiz. */
  key: string;
  /** null = elle girilmiş kalem, hafıza bağlantısı yok. */
  aliasId: string | null;
  name: string;
  /** Kullanıcının gördüğü ham metin — tr-TR ayrıştırılabilir. */
  qty: string;
  unit: string;
  grams: number;
  nutrition: Nutrition;
}

let seq = 0;
function nextKey(): string {
  seq += 1;
  return `draft-${Date.now()}-${seq}`;
}

/** 0,1 hassasiyet + sodyum tam sayı — `addNutrition` kayan nokta artığı
 *  bırakır ve bu artık girdi alanında olduğu gibi görünür (L20 kardeşi). */
export function roundNutrition(n: Nutrition): Nutrition {
  const out = { ...n };
  for (const key of NUTRIENT_KEYS) {
    const v = out[key];
    // undefined ("bilinmiyor") kalır — 0 yazmak uydurma veri üretir.
    if (typeof v !== "number") continue;
    out[key] = key === "sodium" ? Math.round(v) : Math.round(v * 10) / 10;
  }
  return out;
}

function unitFor(alias: Alias | null, unit: string) {
  if (!alias) return { name: unit.trim() || "g", grams: 1 };
  return unitOptions(alias.units).find((u) => u.name === unit) ?? defaultUnitForAlias(alias);
}

/** Verilen alias + miktar/birimden satır. Geçersiz gramajda `nutrition`
 *  dokunulmadan `ZERO_NUTRITION` DEĞİL, verilen `fallback` korunur. */
export function draftLineFromAlias(
  alias: Alias,
  qty: string,
  unit: string,
  fallback?: Nutrition,
): DraftLine {
  const u = unitFor(alias, unit);
  const grams = toGrams(parseNum(qty), u);
  const valid = grams > 0;
  return {
    key: nextKey(),
    aliasId: alias.id,
    name: alias.name,
    qty,
    unit: u.name,
    grams: valid ? grams : 0,
    nutrition: valid ? scaleNutrition(alias.nutrition, alias.serving_g, grams) : (fallback ?? { ...ZERO_NUTRITION }),
  };
}

/** Hafızadan seçilmiş bir besinle yeni satır (boş miktar). */
export function newDraftLine(alias: Alias | undefined): DraftLine {
  if (!alias) {
    return { key: nextKey(), aliasId: null, name: "", qty: "", unit: "g", grams: 0, nutrition: { ...ZERO_NUTRITION } };
  }
  return draftLineFromAlias(alias, "", defaultUnitForAlias(alias).name);
}

/** Gramaj alanı değişti. Makro yalnızca GEÇERLİ gramajda yeniden hesaplanır. */
export function setDraftGrams(line: DraftLine, gramsText: string, alias: Alias | null): DraftLine {
  const parsed = parseNum(gramsText);
  const valid = parsed > 0;
  const u = unitFor(alias, line.unit);
  const grams = valid ? toGrams(parsed, u) : 0;
  if (!valid || !alias) {
    // Makro korunur: kullanıcı yarım yazarken değerler titremesin.
    return { ...line, qty: gramsText, grams };
  }
  return {
    ...line,
    qty: gramsText,
    grams,
    nutrition: scaleNutrition(alias.nutrition, alias.serving_g, grams),
  };
}

/** Swap: gram korunur, miktar hedef alias'ın varsayılan birimine çevrilir. */
export function swapDraftLine(line: DraftLine, next: Alias): DraftLine {
  const u = defaultUnitForAlias(next);
  const qty = u.grams > 0 ? Math.round((line.grams / u.grams) * 10) / 10 : line.grams;
  return {
    key: line.key,
    aliasId: next.id,
    name: next.name,
    qty: String(qty),
    unit: u.name,
    grams: line.grams,
    nutrition: scaleNutrition(next.nutrition, next.serving_g, line.grams),
  };
}

export function addDraftLine(lines: DraftLine[], line: DraftLine): DraftLine[] {
  return [...lines, line];
}

export function removeDraftLine(lines: DraftLine[], key: string): DraftLine[] {
  return lines.filter((l) => l.key !== key);
}

/** Kayıt/şablon kalemlerine çevirir. 0 gramajlı satırlar ATILIR; elle
 *  satırlar `sources` üretmez. */
export function draftLinesToItems(lines: DraftLine[]): TemplateItem[] {
  const items: TemplateItem[] = [];
  for (const l of lines) {
    if (l.grams <= 0) continue;
    items.push({
      name: l.name,
      nutrition: roundNutrition(l.nutrition),
      ...(l.aliasId ? { sources: [{ aliasId: l.aliasId, qty: parseNum(l.qty), unit: l.unit }] } : {}),
    });
  }
  return items;
}
