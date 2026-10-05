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
  // `manualMeasured` BURADA DÜŞMEZ. Kullanıcının elle yazdığı makro, gramaj
  // alanına dokunmasından bağımsız olarak geçerlidir: alanı temizlemek
  // "malzemeyi silmek" demek değil, sadece miktarı kaldırmaktır. Bayrağı
  // düşürürsek kullanıcıCalories alanını açmak için miktar alanına bir şey
  // yazıp silmek zorunda kalır — alanlar `manualMeasured` true'yken
  // KAPANDIĞI için bu, görünür bir tuzaktır (ölçüldü: ad yazılınca alanlar
  // kayboldu).
  // `blank` de BURADA DÜŞMEZ: gramaj yazmak hafızayla bağ kurmaz (bkz.
  // `newDraftLine(undefined)` yorumu) — satır hâlâ elle giriliyor.
  const parsed = parseNum(gramsText);
  return { ...line, qty: gramsText, unit: "g", grams: parsed > 0 ? parsed : 0, preserved: false };
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
 *  `scaled`: satır hafızadaki bir besine bağlı → `setDraftGrams` makroyu
 *  ölçekledi, kullanıcı bunu göremiyordu.
 *  `notInMemory`: kullanıcının kendi yazdığı kalem — gramaj ile makro bağımsız
 *  gerçekler, ölçeklemek uydurma olurdu.
 *  `unresolvableUnit`: kayıttan geldi ama birim/alias çözülemiyor — aynı
 *  sonuç, farklı sebep, farklı çıkış yolu ("Malzemeyi değiştir"). */
export type GramEditHint =
  | { kind: "scaled"; fromGrams: number; toGrams: number }
  | { kind: "notInMemory" }
  | { kind: "unresolvableUnit" }
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

  if (alias) return { kind: "scaled", fromGrams: previous.grams, toGrams: line.grams };
  if (line.fromRecord) return { kind: "unresolvableUnit" };
  return { kind: "notInMemory" };
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
