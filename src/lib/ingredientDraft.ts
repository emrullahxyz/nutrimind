// Nutrimind — düzenlenebilir kalem satırlarının saf cebir kaynağı.
// Hem `TemplatePreview` (şablon) hem `NutritionSheet` (günlük kayıt) bu
// modülü kullanır; iki yüzey de aynı kuralları gösterir, bu yüzden kurallar
// BURADA yaşar ve jsdom olmadan test edilir.
//
// ÜÇ sözleşme:
//   1. Gösterilen = kaydedilen (bkz. lessons.md L20). Gramaj alanında yazan
//      metin `qty`'ye aynen girer; ölçüm `grams` üzerinden yapılır. ÇÖZÜLEN
//      birim de satıra geri yazılır — "adet" görünürken makrosu "g" ile
//      hesaplanmış bir satır L20'nin ihlali olurdu.
//   2. Yarım yazılan bir gramaj makroyu SIFIRLAMAZ — kullanıcı "1" yazıp
//      "50" yaparken değerler titrer.
//   3. ÇÖZÜLEMEYEN birim TAHMİN EDİLMEZ, reddedilir. `mealActions.ts:139-140`
//      ("2 'adet'i sessizce 2 g yapar ve tarifin 100 g hesabını bozar") ve
//      `ingredientLines.resolveMealIngredients` (birim çözülmezse null) aynı
//      kararı verdi: bilinmeyen birim, ölçülmüş değil ÇÖZÜLEMEZ demektir.
//      Görünür ama yanlış miktar hâlâ miktar bozulmasıdır.
import type { Alias, AliasUnit, Nutrition } from "../types";
import { ZERO_NUTRITION } from "../types";
import { NUTRIENT_KEYS } from "./nutrients";
import {
  defaultUnitForAlias,
  parseNum,
  scaleNutrition,
  toGrams,
  unitOptions,
} from "./nutrition";
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

/** Verilen adı alias'ın KENDİ seçenekleriyle eşleştirir — `mealActions.ts`in
 *  yaptığı gibi tr-TR küçük harfe indirger ve kırpar, yalnız HALFASİ yapar:
 *  " Dilim " de "Dilim" ile eşleşir ve kanonik ad ("Dilim") çağırana döner.
 *
 *  Eşleşme yoksa `null`. Varsayılan birime ya da grama DÜŞMEZ: kayıtlı "2 kase"
 *  ile bu besinin dilimi başka bir ölçüdür, onu sessizce ölçmek sayıyı
 *  bozar. Reddetme `mealActions.buildRecipePreset` ve
 *  `ingredientLines.resolveMealIngredients` ile aynı sözleşmedir.
 *
 *  `alias` null ise (elle satır) modülün o besine dair birim bilgisi yoktur:
 *  tek gerçek birim gramdır, gram da `unitOptions`'ın daima ilk girdisidir. */
export function resolveDraftUnit(alias: Alias, unit: string): AliasUnit | null {
  const wanted = unit.trim().toLocaleLowerCase("tr");
  if (!wanted) return null;
  return unitOptions(alias.units).find((u) => u.name.trim().toLocaleLowerCase("tr") === wanted) ?? null;
}

/** Verilen alias + miktar/birimden satır.
 *
 *  `unit` çözülemiyorsa `null` döner — sessiz ölçüm YAPILMAZ; çağıran
 *  reddi kendi yüzeyinde ele alır (bkz. `resolveMealIngredients`: kırılımı
 *  düşürür). Yalnız büyük/küçük harf ve boşluk farkı normalleşir. */
export function draftLineFromAlias(
  alias: Alias,
  qty: string,
  unit: string,
  fallback?: Nutrition,
): DraftLine | null {
  const u = resolveDraftUnit(alias, unit);
  if (!u) return null;
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

/** Hafızadan seçilmiş bir besinle yeni satır (boş miktar).
 *
 *  Satır doğrudan kurulur, `draftLineFromAlias` çağrılmaz: miktar boş
 *  olduğu için ölçüm zaten yapılmayacak, alias'ın varsayılan birimi her
 *  zaman `unitOptions`'ın içindedir. */
export function newDraftLine(alias: Alias | undefined): DraftLine {
  if (!alias) {
    return { key: nextKey(), aliasId: null, name: "", qty: "", unit: "g", grams: 0, nutrition: { ...ZERO_NUTRITION } };
  }
  return {
    key: nextKey(),
    aliasId: alias.id,
    name: alias.name,
    qty: "",
    unit: defaultUnitForAlias(alias).name,
    grams: 0,
    nutrition: { ...ZERO_NUTRITION },
  };
}

/** Gramaj alanı değişti. Makro yalnızca GEÇERLİ gramajda yeniden hesaplanır.
 *
 *  BÖLÜM YA HEP YA HİÇ: bir `DraftLine`ın `qty`, `grams` ve `nutrition`
 *  değerleri DAİMA aynı ölçümü anlatır. Birim çözülemiyorsa satıra hiç
 *  dokunulmaz — `qty` dâhil. Kısmi güncelleme yeni `qty`'yi eski makroyla
 *  eşleştirirdi; `draftLinesToItems` bunu olduğu gibi `sources`'a yazar ve
 *  kayıt, saklanan miktar ile saklanan makronun iki ayrı ölçüm anlattığı bir
 *  satıra dönüşürdi (L20 ihlali, dersin tam olarak önlediği ayrım).
 *
 *  Üç yol:
 *   • birim çözülemez → SATIR DEĞİŞMEZ. Ölçüm yapılmaz; tahmini birimle
 *     gramaja çevirmek sayıyı bozardı (bkz. mealActions:139-140).
 *   • `alias` null → elle satır. Gram cinsinden ölçülür; makro bu modülün
 *     işi değildir, satırın kendi değeri korunur.
 *   • aksi → gramaj ve makro yeniden hesaplanır, ÇÖZÜLEN birim geri yazılır
 *     (hesap bu birimle yapıldı; satır aynısını göstermeli — L20).
 *
 *  REDDİ NEREDE ELE ALINIR: burada değil, GÖSTERİM katmanında. Çağıran
 *  `resolveDraftUnit(alias, line.unit)` ile önceden sorar; `null` gelirse
 *  uyarıyı gösterir ve bu fonksiyonu ÇAĞIRMAZ. "Hangi satırı gösteriyorum"
 *  sorusunun cevabı ekranda; ikinci bir gerçek kaynak (`stale` bayrağı)
 *  bu yüzden yok. */
export function setDraftGrams(line: DraftLine, gramsText: string, alias: Alias | null): DraftLine {
  if (alias) {
    const u = resolveDraftUnit(alias, line.unit);
    // Red: hiçbir alan değişmez — qty dâhil.
    if (!u) return { ...line };

    const parsed = parseNum(gramsText);
    const grams = parsed > 0 ? toGrams(parsed, u) : 0;
    if (grams <= 0) {
      // `grams <= 0` tek bir koşul değil, üç durumu birleştirir:
      //   • boş metin        → parseNum("") = 0
      //   • sayı olmayan metin → parseNum("abc") = NaN → 0'a düşer
      //     (parseNum sonlu olmayanı 0 yapar)
      //   • EKSİ/negatif miktar → "-5", parseNum("-5") = -5 → 0'a düşer
      // Makro korunur: kullanıcı yarım yazarken (ya da geçersiz bir miktar
      // girerken) değerler titremesin. qty + grams birlikte güncellenir,
      // nutrition ESKİ kalır — kasıtlıdır ve güvenlidir: 0 gramajlı satır
      // `draftLinesToItems`'ta zaten ATILIR, yarım yazım kayda geçmez.
      return { ...line, qty: gramsText, unit: u.name, grams };
    }
    return {
      ...line,
      qty: gramsText,
      unit: u.name,
      grams,
      nutrition: scaleNutrition(alias.nutrition, alias.serving_g, grams),
    };
  }

  // Elle satır: gram cinsinden ölçülür.
  const parsed = parseNum(gramsText);
  return { ...line, qty: gramsText, unit: "g", grams: parsed > 0 ? parsed : 0 };
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

/** Kayıt/şablon kalemlerine çevirir. `grams <= 0` satırlar ATILIR; elle
 *  satırlar `sources` üretmez.
 *
 *  `grams <= 0` filtresi KALDIRILAMAZ: `setDraftGrams`'in geçersiz miktar
 *  yolu `qty` + `grams`'ı günceller ama `nutrition`'ı ESKİ bırakır (yarım
 *  yazımda titremesin diye). Bu filtre o tutarsız çifti `sources`'a
 *  yazmadan eler — 3. turdaki reddetme düzeltmesinin (redde giren satıra
 *  dokunulmaması) tutarlılık garantisini bu yüzden koruyor.
 *
 *  DİKKAT: gevşetmeyin. `!Number.isFinite(l.grams)` ya da `l.grams === 0`
 *  gibi bir koşul aynı işlevi görmez — negatif olmayan ama NaN olan ya da
 *  0'a çok yakın değerler kayda girer ve eski makroyla eşleşmez. Ölçümün
 *  "anlamlı miktar" olma koşulu tam olarak `grams > 0`. */
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
