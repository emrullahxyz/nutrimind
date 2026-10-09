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
//      `resolveDraftUnit` (birim çözülmezse null) aynı kararı verdi: bilinmeyen
//      birim, ölçülmüş değil ÇÖZÜLEMEZ demektir.
//      Görünür ama yanlış miktar hâlâ miktar bozulmasıdır.
//
// DÖRTÜNCÜ SÖZLEŞME — `preserved`: kayıttan gelip ölçüLEMEYEN kalem. Birim
// çözülemediği ya da alias silindiği için gramajı bilmiyoruz, ama kayıttaki
// adı ve makrosu GERÇEK. Bu satırlar `grams: 0` taşır (uydurma miktar yok)
// ve `draftLinesToItems` onları yine de kaydeder — kullanıcının kayıtlı
// şablonundan malzeme SİLMEK kaydetmenin sonucu olamaz (lessons.md L21).
// Kullanıcı miktarı girip satır ölçülebilir hale gelince `preserved` düşer:
// artık "korunan" değil, "ölçülen" bir satırdır.
import type { Alias, AliasUnit, MealItem, MealSource, Nutrition } from "../types";
import { ZERO_NUTRITION } from "../types";
import { NUTRIENT_KEYS } from "./nutrients";
import {
  addNutrition,
  defaultUnitForAlias,
  parseNum,
  scaleNutrition,
  scaleNutritionByFactor,
  subtractNutrition,
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
  /** `nutrition` HANGİ gramaja ait? (g, 0 = bilinmiyor)
   *
   *  HAFIZAYA BAĞLI OLMAYAN kalemlerde gramaj ile makro arasındaki ilişki
   *  kayıttan gelir: kullanıcı 100 g için 225 kcal yazdıysa, sonradan miktarı
   *  50'ye düşürünce 112,5 kcal olmalıdır. Ölçekleme tabanı olmadan oranlama
   *  YAPILAMAZ — ekranda 50 g yazarken 225 kcal görünmesi L20 ihlalidir
   *  (gösterilen ≠ kaydedilen).
   *
   *  Taban bir kez kurulur ve ÖLÇEKLEME sırasında DEĞİŞMEZ: kullanıcı
   *  100 g/225 kcal yazdıktan sonra 50'ye indirip tekrar 100'e çıkarırsa
   *  225 kcal'ye döner. `sources`'lı (ölçülebilir) satırlarda kullanılmaz —
   *  onlarda taban alias'ın `serving_g`'sidir ve `draftLineFromAlias` yazar. */
  nutritionGrams: number;
  /** true = bu kalem kayıttan geldi ama gramajı ÇÖZÜLEMEDİ; `grams` 0'dır ve
   *  ölçüm değildir. Kayıtta KORUNUR (bkz. `draftLinesToItems`), `sources`
   *  yazılmaz (`aliasId` null), ve miktar girilene kadar ekranda "bilinmiyor"
   *  olarak gösterilir. Ölçülebilir hale gelince `setDraftGrams` false yapar. */
  preserved: boolean;
  /** true = KULLANICI elle ad + makro girdi, gramaj vermedi. `preserved`'in
   *  karşıtı: `preserved` "kayıttan geldi, ölçülemedi", bu ise "kullanıcı
   *  ölçtü, gramajı yok". İkisi de `grams: 0` taşır ve ikisi de kayda girer,
   *  ama "Miktar bilinmiyor" etiketi YALNIZCA `preserved` için doğrudur —
   *  elle girilen makroda gramaj sorulmamıştır, bilinmiyor değil.
   *  `sources` YAZILMAZ (`aliasId` null zaten) — miktar uydurulmaz. */
  manualMeasured: boolean;
  /** true = yeni eklenmiş ama henüz HİÇBİR BESİNE BAĞLANMAMIŞ (elle ya da
   *  AI) satır. `aliasId` null'dur ve `name` boştur. `aliasId` dolar dolmaz
   *  düşer — ister picker'dan ister swap'tan (bkz. `TemplatePreview.addLine`
   *  ve `swapDraftLine`'ın zorunlu işaretlemesi: `alias: null` hiçbir zaman
   *  `null` kalma durumunu diğer bayraklara bırakmaz). Alanların "düzenleme"
   *  görünümüne geçmesi (`isManualRow`) BİRİKİMİ'dir: bayrak *ve* `name` ya
   *  da makro. Tek başına `name` yazmak, besini hafıza ile BAĞLAMAK demek
   *  değildir (düzenleme alanları 5 alanlı olduğu için geçerli olmayan bir
   *  eşleşme). */
  blank: boolean;
  /** true = satır KAYITTAN GELDİ (şablon kalemi ya da günlük kayıt kalemi).
   *  `preserved`dan BAĞIMSIZDIR ve `preserved` geçici bir durumdur: kayıttan
   *  gelen kalem gramaj yazılınca ölçülebilir olur, `preserved` düşer — ama
   *  hâlâ KAYITTAN gelmiştir.
   *
   *  Neden ayrı alan: `preserved` tek başına "elle mi" sorusunu yanıtlamaz.
   *  Korunmuş satıra gramaj yazıldığında `preserved` düşer ve satır
   *  `aliasId: null` olduğu için ELLE sayılır — kullanıcının elle girmediği bir
   *  kayıt kalemi elle satır gibi gösterilir (ad + 5 makro alanı açılır,
   *  kayıttaki gerçek ad silinir). ÖLÇÜLDÜ: öğünden türetilmiş iki kaynaklı
   *  kaleme 250 g yazılınca satır elle alanlara döndü, miktar kayboldu. */
  fromRecord: boolean;
}

/** Dev-Only: `manual` dışındaki bayrak kombinasyonlarını değiştirir (testler).
 *  Üretimde asla çağrılmaz. */
export function __setDraftFlag(line: DraftLine, patch: Partial<Pick<DraftLine, "preserved" | "manualMeasured">>): DraftLine {
  return { ...line, ...patch };
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
 *  `resolveDraftUnit` ile aynı sözleşmedir.
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
 *  reddi kendi yüzeyinde ele alır (`mealDraftLines` kırılımın tamamını
 *  düşürür, `NutritionSheet` bölümü hiç çizmez). Yalnız büyük/küçük harf ve
 *  boşluk farkı normalleşir. */
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
    // Ölçülebilir satırda taban alias'ın `serving_g`'sidir; `setDraftGrams`
    // her zaman `scaleNutrition(alias…)` kullandığı için bu alanı okumaz.
    nutritionGrams: valid ? grams : 0,
    preserved: false,
    manualMeasured: false,
    blank: false,
    fromRecord: false,
  };
}

/** Hafızadan seçilmiş bir besinle yeni satır (boş miktar).
 *
 *  Satır doğrudan kurulur, `draftLineFromAlias` çağrılmaz: miktar boş
 *  olduğu için ölçüm zaten yapılmayacak, alias'ın varsayılan birimi her
 *  zaman `unitOptions`'ın içindedir. */
export function newDraftLine(alias: Alias | undefined): DraftLine {
  if (!alias) {
    return {
      key: nextKey(),
      aliasId: null,
      name: "",
      qty: "",
      unit: "g",
      grams: 0,
      nutrition: { ...ZERO_NUTRITION },
      nutritionGrams: 0,
      preserved: false,
      manualMeasured: false,
      blank: true, // YENİ, HİÇBİR BESİNE BAĞLANMAMIŞ (bkz. alanın dokümanı)
      fromRecord: false,
    };
  }
  return {
    key: nextKey(),
    aliasId: alias.id,
    name: alias.name,
    qty: "",
    unit: defaultUnitForAlias(alias).name,
    grams: 0,
    nutrition: { ...ZERO_NUTRITION },
    nutritionGrams: 0,
    preserved: false,
    manualMeasured: false,
    blank: false,
    fromRecord: false,
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
 *  RED SESSİZDİR ve GÜVENLİDİR: çözülemeyen birimde satıra hiç dokunulmaz,
 *  dolayısıyla satır son TUTARLI ölçümünü korur — `qty` eski metniyle birlikte.
 *  Çağıranın UYARMAK ya da bir şey yapmak zorunda olduğu bir durum yoktur;
 *  satır tutarlı kalır ve olduğu gibi kaydedilebilir.
 *
 *  Koşulu ÖNCEDEN görmek isteyen çağıran `resolveDraftUnit(alias, line.unit)`
 *  kullanabilir — bu fonksiyon hâlâ dışa açıktır ve "bu satırın birimi
 *  çözülebilir mi?" sorusunu tek başına yanıtlar. Ancak `setDraftGrams`'i
 *  GÜVENLE çağırmak için önceden sorgulamak ZORUNLU DEĞİLDİR: çağırmak
 *  güvenlidir, yalnızca reddedilen bir değişiklik sessizce uygulanmaz.
 *
 *  (Bu dal, "kullanıcı sayı yazdı ama alan geri sekti" derdini bir uyarıyla
 *  çözmeye çalışıyordu. `TemplatePreview` bu uyarıyı kaldırdı: o ekranda
 *  birim çözülemeyen satırlar zaten `aliasId: null` olan KORUNMUŞ satırlara
 *  dönüşüyor, yani dallara hiç ulaşılamıyordu.) */
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
      // nutrition ESKİ kalır — kasıtlıdır ve güvenlidir: kullanıcının kendi
      // sildiği miktar `draftLinesToItems`'ta ATILIR, yarım yazım kayda geçmez.
      //
      // DİKKAT: burada `preserved` DÜŞÜRÜLMEZ. Gramaj hâlâ ölçülebilir değil;
      // kullanıcı alanı temizledi, "korunan kalem" değil. `grams > 0` olan
      // tek yol aşağıdaki asıl dönüş — orada `preserved: false` yazılır.
      return { ...line, qty: gramsText, unit: u.name, grams };
    }
    return {
      ...line,
      qty: gramsText,
      unit: u.name,
      grams,
      nutrition: scaleNutrition(alias.nutrition, alias.serving_g, grams),
      preserved: false,
      // Gramaj girildi → satır artık ÖLÇÜLMÜŞ; elle girilmiş makro bayrağı
      // düşer (biri diğerini dışlar: ya gramaj var ya elle makro).
      manualMeasured: false,
    };
  }

  // Elle satır: gram cinsinden ölçülür.
  //
  // ÖLÇEKLEME (v0.31.2, kullanıcı isteği): hafızada olmayan kalemde de miktar
  // ile makro arasında ORAN vardır ve ekranda görünen gerçek budur — 50 g
  // yazarken 225 kcal yazması L20 ihlaliydi (gösterilen ≠ kaydedilen).
  //
  // TABAN (`nutritionGrams`) bir kez kurulur, sonra değişmez:
  //   • taban > 0 → kayıttan gelen gerçek miktar (ör. 100 g için 225 kcal).
  //     Kullanıcı 50'ye indirince çarpan 0,5 → 112,5 kcal.
  //   • taban 0   → makro henüz gramaja bağlanmamış (elle yeni kalem).
  //     `manualMeasured` true ise (kullanıcı makroyu kendi yazdı) ilk geçerli
  //     gramaj taban olur ve değerler KENDİSİ korunur: kullanıcı 100 g için
  //     225 kcal yazdı, sonra miktarı 200 g yaparsa 450 kcal bekler.
  //     Makro boşsa (`hasManualNutrition` kapısı) taban kurulmaz, makro 0'dır.
  //
  // `manualMeasured` ve `blank` BURADA DÜŞMEZ — alanları açık/kapalı tutan
  // bayraklar, ölçeklemeyle ilgisi yok (bkz. eski yorum + NutritionSheet
  // tuzağı: ad yazılınca alanlar kaybolmuştu).
  const parsed = parseNum(gramsText);
  const grams = parsed > 0 ? parsed : 0;

  // Geçersiz/boş gramaj: değerler ESKİ kalır (titreme olmaz), kullanıcının
  // sildiği miktar kayda giremez — `draftLinesToItems` satırı düşürür.
  if (grams <= 0) {
    return { ...line, qty: gramsText, unit: "g", grams: 0, preserved: false };
  }

  const base = line.nutritionGrams;
  if (base > 0 && line.grams > 0) {
    // Taban belliyse oranla. `line.nutrition` `line.grams` içindir; taban
    // `base` gramaja ait. Yeni miktar bu ikisinin oranıyla gelir:
    // taban 100 g, mevcut 50 g, yeni 25 g → 0,25.
    return {
      ...line,
      qty: gramsText,
      unit: "g",
      grams,
      nutrition: scaleNutritionByFactor(line.nutrition, grams / line.grams),
      preserved: false,
    };
  }

  // Taban yok: kullanıcı makroyu kendi yazdıysa bu miktar onun da tabanı olur.
  if (line.manualMeasured) {
    return { ...line, qty: gramsText, unit: "g", grams, nutritionGrams: grams, preserved: false };
  }

  // Makro da yok — gramaj yazmak tek başına değer üretmez.
  return { ...line, qty: gramsText, unit: "g", grams, preserved: false };
}

/** Swap: gram korunur, miktar hedef alias'ın varsayılan birimine çevrilir.
 *
 *  `preserved` satırlar ÖZEL DAVRANIR: miktarı BİLİNMEYEN bir satırı başka
 *  bir besine bağlamak miktarı öğretmez. Yalnız `aliasId`/`name`/`unit`
 *  değişir; `grams` 0 kalır, `preserved` TRUE kalır ve `nutrition` ESKİ
 *  değeriyle KORUNUR — çünkü `next.nutrition`'ı `grams: 0`'dan ölçeklemek
 *  kayıtlı gerçek makroyu 0'a silerdi. Kullanıcı miktarı yazınca
 *  `setDraftGrams` satırı gerçekten ölçülebilir hale getirir ve o an hem
 *  makro hem `preserved` düşer.
 *
 *  Buradaki `preserved: false` bir "korunmuş satırı ölçülebilir yap" adımı
 *  DEĞİLDİR; bayrağı sıfırlamak miktarı uydurmak olurdu. */
export function swapDraftLine(line: DraftLine, next: Alias): DraftLine {
  const u = defaultUnitForAlias(next);
  if (line.preserved) {
    return {
      ...line,
      aliasId: next.id,
      name: next.name,
      unit: u.name,
      qty: "",
      preserved: true,
      // Taban da sıfırlanır: satır artık "makro bu gramaja ait" değil,
      // kullanıcı ölçüm girene kadar korunan bir kalem.
      nutritionGrams: 0,
      // Elle makro bayrağı da düşer: swap BESİN değiştirir, kullanıcının
      // yazdığı makro değil — ölçüm artık yeni besinin gramajına bağlı.
      manualMeasured: false,
      // Besin BAĞLANDI → `blank` düşer (yeni-elle satırın "henüz bağlanmadı"
      // iddiası artık yanlış). Her iki dalda da zorunlu: `alias: null` var
      // olduğu sürece bayrak `null` kalma durumunu başka bir bayrağa
      // bırakmamalı.
      blank: false,
      // `fromRecord` KORUNUR: bu dal `preserved` yani kayıttan gelen satır.
      // Yayılım (`...line`) zaten taşıyordu; `fromRecord` YAZILMAZ — yazmak
      // satırı elle saydırır ve kullanıcının girmediği kayıt adı elle alana
      // düşer (bkz. alanın dokümanındaki ölçülen hata).
    };
  }
  const qty = u.grams > 0 ? Math.round((line.grams / u.grams) * 10) / 10 : line.grams;
  return {
    key: line.key,
    aliasId: next.id,
    name: next.name,
    qty: String(qty),
    unit: u.name,
    grams: line.grams,
    nutrition: scaleNutrition(next.nutrition, next.serving_g, line.grams),
    nutritionGrams: line.grams,
    preserved: false,
    manualMeasured: false,
    blank: false,
    fromRecord: false,
  };
}

export function addDraftLine(lines: DraftLine[], line: DraftLine): DraftLine[] {
  return [...lines, line];
}

/** Miktar alanı değiştirilince kullanıcıya gösterilecek geri bildirim.
 *
 *  ÖLÇÜLEN HATA (tarayıcı): hafızaya bağlı olmayan bir kalemde 90 g → 45 g
 *  yazılınca miktar değişiyor ama toplam kcal SABİT kalıyordu (`setDraftGrams`
 *  alias'sız dalı `nutrition`'a bilerek dokunmuyor). Kullanıcı "miktarı
 *  azaltamıyorum" diye bildirdi. Davranışın KENDİSİ korundu — davranış
 *  değiştirilmedi, görünür oldu.
 *
 *  `scaled`: satırın makrosu gerçek → `setDraftGrams` oranladı, kullanıcı
 *  bunu göremiyordu.
 *  `noNutrition`: satırda makro YOK (elle yeni kalem ya da makrosuz kayıt) —
 *  ölçeklemenin nereye göre yapılacağı bilinmiyor, kullanıcı değer girmeli.
 *
 *  v0.31.2 ÖNCESİ üç dal vardı (`notInMemory`/`unresolvableUnit`), ama
 *  hepsinin çözümü aynıydı: besin değerini gir. Ayrım yalnız metni bölecekti
 *  ve AI kaleminde YANLIŞ uyarı üretiyordu (AI besin değerini zaten bilir). */
export type GramEditHint =
  | { kind: "scaled"; fromGrams: number; toGrams: number }
  | { kind: "noNutrition" }
  | null;

/** @param previous miktar YAZILMADAN ÖNCEKİ satır (`null` = yeni eklenen). */
export function draftGramHint(
  line: DraftLine,
  alias: Alias | null | undefined,
  previous: DraftLine | null,
): GramEditHint {
  if (previous === null) return null;
  // Miktar gerçekten değişmediyse uyarı göstermek gürültü.
  if (previous.grams === line.grams) return null;

  // v0.31.2'den sonra HAFIZAYA BAĞLI OLMAYAN kalemler de ölçeklenir
  // (`nutritionGrams` tabanı), yani artık "ölçeklenmedi" durumu YOKTUR:
  // tabanı OLAN VE MAKROSU GERÇEK olan her satır ölçekler. Ölçeklenmeyen
  // tek durum: makrosu henüz olmayan satır (kullanıcı ilk kez miktar
  // yazıyor) — o zaman "besin değerini gir" uyarısı DOĞRUDUR.
  //
  // `hasNutrition` ölçütü makronun GERÇEKTEN dolu olduğuna bakar; gramajı
  // tek başına yeterli değil (AI satırında makro her zaman doludur, elle
  // iskelet satırda hep sıfırdır).
  const hasNutrition = line.nutrition.kcal > 0 || line.nutrition.protein > 0;
  if (alias || (line.nutritionGrams > 0 && hasNutrition) || line.manualMeasured) {
    return { kind: "scaled", fromGrams: previous.grams, toGrams: line.grams };
  }
  // Makro yok: kullanıcıya DEĞER GİRMESİ gerektiğini söyle. `fromRecord`
  // ayrımı KALDIRILDI: eskiden "kayıttan geldi ama çözülemedi" ile "kullanıcı
  // elle girdi" ayrı dalları vardı, ama ikisinin de çözümü aynıydı (besin
  // değerini gir). Ayrım yalnız metni bölecekti, davranışı değiştirmiyordu.
  return { kind: "noNutrition" };
}

export function removeDraftLine(lines: DraftLine[], key: string): DraftLine[] {
  return lines.filter((l) => l.key !== key);
}

/** Kayıt/şablon kalemlerine çevirir.
 *
 *  FİLTRE — İKİ KOŞUL, İKİ FARKLI ANLAM:
 *   1. `grams <= 0` (ve `!preserved`) → KULLANICININ SİLDİĞİ miktar. Satır
 *      kayda giremez. Buradaki `setDraftGrams` geçersiz-miktar yolu `qty` +
 *      `grams`'ı günceller ama `nutrition`'ı ESKİ bırakır (yarım yazımda
 *      titremesin diye); filtre o tutarsız çifti `sources`'a yazmadan eler.
 *      3. turdaki reddetme düzeltmesinin (redde giren satıra dokunulmaması)
 *      tutarlılık garantisi BURAYA bağlıdır.
 *   2. `grams <= 0` AMA `preserved` → KAYITTAN GELEN, ÖLÇÜLEMEYEN kalem.
 *      Gramajı bilmiyoruz ama adı ve makrosu gerçek ve kullanıcı bunu
 *      görebiliyor. Düşürülürse kullanıcının kayıtlı şablonundan malzeme
 *      sessizce silinmiş olur (lessons.md L21) — kaydetmenin sonucu olamaz.
 *
 *  `sources` — YALNIZ ÖLÇÜLMÜŞ MİKTAR YAZAR. Bir `sources` girdisi miktarı
 *  da taşır; ölçülmemiş bir miktarı `qty: 0` olarak yazmak "0 g aldım"
 *  demektir, ki hiç ölçülmedi. Bu yüzden `preserved` satırlar kaynak
 *  YAZMAZ — `swapDraftLine` bir korunmuş satıra `aliasId` bağlasa bile.
 *  Korunmuş satırın kaydı yalnız ad + makrodur: miktarı bilinmeyen bir
 *  malzemenin kaynağı, kayda gerçeği yansıtmaz.
 *
 *  DİKKAT: `preserved` koşulunu gevşetmeyin. `!l.preserved` olmadan filtre
 *  kullanıcının sildiği satırları da kaydeder ve 1. koşulun garantisi düşer.
 *  `!Number.isFinite(l.grams)` ya da `l.grams === 0` gibi ikame koşullar da
 *  aynı işi görmez: ölçümün "anlamlı miktar" olma koşulu tam olarak
 *  `grams > 0`.
 *
 *  DÖRDÜNCÜ KOŞUL — `l.blank`: yeni eklenmiş, kayda giremeyen İSKELE
 *  satırlarını eler. "Malzeme ekle" açtığı boş elle satır henüz İÇERİK DEĞİL:
 *  adı boş, makrosu sıfır. Bayrak düşmeden kaydedilirse `name: ""` (sources'suz,
 *  0 gramaj) bir kalem yazılırdı. Boş elle satır makro girişiyle zaten
 *  `manualMeasured` olur, ölçümlü alias satırı zaten `grams > 0` — bu koşul
 *  yalnız İSKELE satırını eler. */
export function draftLinesToItems(lines: DraftLine[]): TemplateItem[] {
  const items: TemplateItem[] = [];
  for (const l of lines) {
    // `grams > 0` → ölçülmüş satır.
    // `preserved`    → kayıttan geldi, gramajı çözülemedi ama adı+makrosu gerçek.
    // `manualMeasured` → kullanıcı elle ad + makro girdi, gramaj vermedi.
    //   Üçüncü koşul YENİ: `TemplateItem` gramajı ayrı bir alanda TUTMAZ —
    //   gramaj ancak `sources` içinde saklanır, ve elle satırın `aliasId`'si
    //   yoktur (yani `sources` yazılamaz). Buna rağmen kullanıcının yazdığı
    //   makro GERÇEK bir ölçümdür ve kaybolmamalıdır: "200 kcal'lık ev
    //   yapımı sos" de bir malzemedir. `preserved` burada YANLIŞ olurdu —
    //   o "kayıttan geldi, ölçülemedi" demek, elle girilen ise tam tersi
    //   ("ölçtüm, gramaj vermedim"). Ayrı alan bu iki anlamı ayırır ve
    //   "Miktar bilinmiyor" etiketini elle girilen makroya YANLIŞ yazdırmaz.
    if (l.grams <= 0) {
      // İSKELE: isimsiz, makrosuz satır malzeme DEĞİLDİR ("Malzeme ekle"nin
      // açtığı boş satır ya da AI'ın dolu ama bağlanmış sanılan satırı).
      // Makro girişi `manualMeasured` ile `blank`'in kayıt kapısını açar.
      if (l.blank && !l.preserved && !l.manualMeasured) continue;
      // Kullanıcı miktarı silmiş satır (preserved/manual korunmadıysa).
      if (!l.preserved && !l.manualMeasured) continue;
    }
    items.push({
      name: l.name,
      nutrition: roundNutrition(l.nutrition),
      // Korunmuş satırın miktarı bilinmiyor; kaynak yazmak `qty: 0` uydurur.
      ...(l.aliasId && !l.preserved
        ? { sources: [{ aliasId: l.aliasId, qty: parseNum(l.qty), unit: l.unit }] }
        : {}),
      // `sources` YAZILMAYAN satırlar (elle girilen, AI'ın döndüğü, kayıttan
      // gelip korunan) gramajı `TemplateItem.grams` ile taşır. Daha önce
      // miktar alanı yalnız EKRANDA vardı: kullanıcı 100 g yazıp kaydediyor,
      // şablonu açtığında "Miktar bilinmiyor" yazıyordu (L20).
      //
      // İki KAYNAK ASLA birlikte yazılmaz: `sources` varsa miktar zaten
      // `sources[].qty` içinde, ikinci bir kopyaya gerek yok — ve iki
      // kopyadan biri güncellenip diğeri eskir.
      ...(!l.aliasId && l.grams > 0 ? { grams: l.grams } : {}),
    });
  }
  return items;
}

/** Kaydedilecek kalemler arasında ADI OLMAYAN var mı?
 *
 *  `lib/templates.ts` parse'ı adı boş kalemi sessizce düşürür; hepsi düşerse
 *  şablon listeden tamamen çıkar ve sonraki şablon kaydı `config.templates`'i
 *  baştan yazarken onu sunucudan siler. Bu yüzden kaydetmeden ÖNCE burada
 *  durdurulur — üç kayıt kapısının (TemplatePreview, DayView, AliasPage)
 *  ortak kuralı.
 *
 *  Doğrulama `draftLinesToItems`'ın İÇİNE KOYULMAZ: oraya koymak satırı
 *  sessizce elemek olurdu — ekranda görünenle kaydedilenin farklı olması
 *  (L20). Kapı bileşen yüzeyinde, kural burada. */
export function hasUnnamedItem(items: TemplateItem[]): boolean {
  return items.some((i) => !i.name.trim());
}

/** Kaydın malzemelerini düzenlenebilir satırlara çevirir — YA HİÇ ya da HİÇBİRİ.
 *
 *  TÜM-ORA-HİÇBİRİ kuralı bilinçlidir: tek bir kaynak çözülemezse (alias
 *  silinmiş ya da birim artık tanınmıyor) bölümün TAMAMI çizilmez. Kısmi bir
 *  liste çizmek, kaydederken çözülmeyen malzemeyi kayıttan SİLMEK demektir —
 *  `normalizeMeals` gövdeyi geçirdiği için kayıt sessizce değişir. Ölçülmüş
 *  davranış: kaynaksız/çözülemez öğünde toplam ekranı aynen kalır.
 *
 *  Bu, aynı zamanda "silinmiş alias'a bağlı satır" (dangling aliasId) durumunu
 *  YAPISAL OLARAK IMKÂNSIZ kılar: o satır `alias` bulunamadığı için `null`
 *  döndürür ve bölüm hiç render edilmez. */
export function mealDraftLines(meal: MealItem, aliases: Alias[]): DraftLine[] | null {
  const sources = meal.sources;
  if (!sources || sources.length === 0) return null;
  const byId = new Map(aliases.map((a) => [a.id, a]));
  const out: DraftLine[] = [];
  for (const s of sources) {
    const alias = byId.get(s.aliasId);
    // Alias yoksa ya da birim çözülemiyorsa satır ÜRETİLMEZ → bölüm hiç çizilmez.
    const line = alias ? draftLineFromAlias(alias, String(s.qty), s.unit) : null;
    if (!line) return null;
    out.push(line);
  }
  return out.length > 0 ? out : null;
}

/** Kaydın satırlara YORULAMAYAN kısmı — `sources`'ı olmayan kalemin payı.
 *
 *  Tek öğüne birleşen şablonda (`templateItemsToPayload`) kaynaksız bir kalem
 *  yalnız toplama karışır: adı satır listesinde yer bulamaz. Satır
 *  düzenlemesinin sonucu bu fark EKLENMEDEN yazılırsa o kalemin besini
 *  sessizce düşer (gösterilen ≠ kaydedilen, L20) — kullanıcı gramaj
 *  değiştirmeden öğünün kalorisi 100 kcal azalır.
 *
 *  Kaynaksız/çözülemez öğünde satır zaten çizilmez, dolayısıyla bu fark
 *  hiç kullanılmaz: oran sıfır değil TANIMSIZ değil, sadece kullanılmayan. */
export function unattributedNutrition(meal: MealItem, aliases: Alias[]): Nutrition {
  const lines = mealDraftLines(meal, aliases);
  if (!lines) return { ...ZERO_NUTRITION };
  let sum = { ...ZERO_NUTRITION };
  for (const l of lines) sum = addNutrition(sum, l.nutrition);
  return subtractNutrition(meal.computed, sum);
}

/** `MealForm` sepetinin mevcut öğünden tohumu. Bir satır = bir basket item. */
export interface MealSeedItem {
  name: string;
  nutrition: Nutrition;
  sources?: MealSource[];
}

/** Bir besin kümesini `MealForm.save`'in `cleanNutrition`'iyle AYNI kesinlikte
 *  ve AYNI kıstakta hazırlar (kcal tamsayı, geri kalanı 1 ondalık, negatif 0).
 *
 *  YALNIZCA EŞİK İÇİN KULLANILIR — kalıntının kendisi bu fonksiyondan
 *  geçirilmez (bkz. `mealToBasketSeed`): çift yuvarlama toplamı her aç/kapa
 *  ~1 kcal yukarı kaydırırdı.
 *
 *  Eşik olarak iki işi birden yapar:
 *   • Yuvarlama tozu (kayıt yuvarlanmış, satır toplamı yuvarlanmamış — fark
 *     her açılışta ±0.5 kcal / ±0.05 g) bu kesinlikte sıfıra gider → hayalet
 *     kalem üretilmez.
 *   • Negatif fark (`computed < satır toplamı`, elle düşürülmüş toplam) 0'a
 *     kıstırılır → tohum üretilmez. "Malzemeler esas" kuralının kendisi. */
function roundLikeSaved(n: Nutrition): Nutrition {
  const whole = (v: number) => Math.max(0, Math.round(v || 0));
  const one = (v: number) => Math.max(0, Math.round((v || 0) * 10) / 10);
  const optOne = (v: number | undefined) => (v === undefined ? undefined : one(v));
  const optWhole = (v: number | undefined) => (v === undefined ? undefined : whole(v));
  return {
    kcal: whole(n.kcal),
    protein: one(n.protein),
    carbs: one(n.carbs),
    fat: one(n.fat),
    fiber: one(n.fiber),
    sugar: optOne(n.sugar),
    satFat: optOne(n.satFat),
    sodium: optWhole(n.sodium),
  };
}

function hasAnyNutrition(n: Nutrition): boolean {
  return NUTRIENT_KEYS.some((k) => (n[k] ?? 0) > 0);
}

/** İki değer aynı KAYIT kesinliğinde aynı mı? `undefined` ile 0 eşdeğer sayılır
 *  (ikisi de "0 kcal" yazar). */
function sameAsSaved(a: Nutrition, b: Nutrition): boolean {
  return NUTRIENT_KEYS.every((k) => (a[k] ?? 0) === (b[k] ?? 0));
}

/** Kaynakları `MealForm` sepetine açar: bir `sources` girdisi bir kalem.
 *
 *  `lines === null` (kaynak yok ya da biri çözülemez) → TEK seed, `computed`
 *  ile: bugünün davranışı ve `NutritionSheet`'in "bölümü hiç çizme" kuralının
 *  aynısı.
 *
 *  Kalıntı: `computed` ile satırlar toplamı arasındaki fark (elle eklenmiş
 *  kalem, eski manuel toplam) **seed olarak eklenir** — L20 gereği kaybolamaz.
 *  Gösterim adı çağıran tarafın işi (`lib/` i18n'e bağlanmaz), o yüzden
 *  `remainderName` parametre olarak gelir. */
/** Satırın bağlı olduğu hafıza kaydı. İki yüzey (NutritionSheet,
 *  TemplatePreview) birebir aynı gövdeyi kopyalamıştı — tek kaynak. */
export function aliasOfLine(aliases: Alias[], line: DraftLine): Alias | undefined {
  return line.aliasId ? aliases.find((a) => a.id === line.aliasId) : undefined;
}

/** Satır makrolarının toplamı. Kayıt yolu (`draftLinesToItems`) üzerinden
 *  DEĞİL, ham `lines` üzerinden çağrılmaz — çağıranlar `draftLinesToItems`
 *  sonucunu besler (bkz. L20).
 *
 *  Parametre yapısal (`{ nutrition }[]`), `DraftLine[]` DEĞİL: çağıranlar
 *  kayıt yolu çıktısını (`TemplateItem[]`) besler ve o girdi DraftLine'ın öteki
 *  alanlarını taşımaz. Yardımcı yalnız `nutrition`'a dokunur. */
export function sumLineNutrition(lines: readonly { nutrition: Nutrition }[]): Nutrition {
  return lines.reduce<Nutrition>((acc, line) => addNutrition(acc, line.nutrition), { ...ZERO_NUTRITION });
}

export function mealToBasketSeed(
  meal: MealItem,
  aliases: Alias[],
  remainderName: string,
): MealSeedItem[] {
  const lines = mealDraftLines(meal, aliases);
  if (!lines) return [{ name: meal.label, nutrition: { ...meal.computed } }];

  const seeds: MealSeedItem[] = [];
  let sum: Nutrition = { ...ZERO_NUTRITION };
  for (const l of lines) {
    seeds.push({
      name: l.name,
      nutrition: l.nutrition,
      ...(l.aliasId
        ? { sources: [{ aliasId: l.aliasId, qty: parseNum(l.qty), unit: l.unit }] }
        : {}),
    });
    sum = addNutrition(sum, l.nutrition);
  }

  // Kalıntı ancak ÖLÇÜLEBİLİR bir fark varsa tohumlanır. Kayıt `cleanNutrition`
  // ile yuvarlandığı için `computed − satır toplamı` her açılışta ±0.5 kcal /
  // ±0.05 g toz üretir; o tozu tohumlamak her aç/kapa hayaleti bir kalem ekler.
  //
  // İKİ AYRI KARAR, İKİ AYRI DEĞER — dikkat:
  //   • EŞİK yuvarlanır (toz mu, gerçek fark mı diye bakılır).
  //   • DEĞER yuvarlanmaz. Kalıntı `sum`'dan TAM çıkarılıp sepete ham olarak
  //     eklenir ki `round(sum + kalan) === computed` OLSUN. Kalıntıyı da
  //     yuvarlamak çift yuvarlama olurdu: her aç/kapa toplamı ~1 kcal yukarı
  //     kaydırırdı.
  if (!sameAsSaved(roundLikeSaved(meal.computed), roundLikeSaved(sum))) {
    const remainder = subtractNutrition(meal.computed, sum);
    if (hasAnyNutrition(roundLikeSaved(remainder))) {
      seeds.push({ name: remainderName, nutrition: remainder });
    }
  }
  return seeds;
}
