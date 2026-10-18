// ============================================================================
// ExerciseModal'ın SAF mantığı — DOM testi yok (projede jsdom/@testing-library
// yok), bu yüzden bileşenden dışarı aldığım üç saf fonksiyon test edilir:
//
//   1. `EXERCISE_PRESETS` — 13 preset, benzersiz `nameKey`, geçerli kategori.
//   2. `resolveKcal` — `kcalOverride` önceliği (L20: ekranda ne yazıyorsa
//      kayda o girer), yoksa `burnedKcal` (Task 3) devreye girer.
//   3. `parseWeightInput` — kilo sorusunun girdisi; bozuk/negatif girdi
//      `null` döner, yani uydurma kilo YAZILMAZ (L21).
//
// Kilo sorusunun `weightKg === null` tetiği bileşende: `handleSaveExercise`
// `weightKg === null` ise kaydı `pendingExercise`'a alıp soruyu açar. O dallanma
// `useData`/`updateConfig` gerektirdiği için saf değil; tarayıcıda Task 8
// doğrulayacak.
// ============================================================================
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXERCISE_PRESETS,
  MAX_DURATION_MIN,
  MAX_WEIGHT_KG,
  WEIGHT_CONFIG_KEY,
  displayExerciseName,
  existingExerciseConfig,
  parseDurationInput,
  parseWeightInput,
  resolveKcal,
} from "./ExerciseModal";
import {
  EXERCISE_CONFIG_KEY,
  burnedKcal,
  metFor,
  parseCatalog,
  parseExerciseItem,
  parseExerciseEntries,
  parseHiddenPresets,
  withCatalog,
  withExercises,
} from "../lib/exercise";
import type { AppConfig, Exercise } from "../types";
import type { CatalogEntry } from "../lib/exercise";
import en from "../i18n/locales/en.json";
import tr from "../i18n/locales/tr.json";
import pl from "../i18n/locales/pl.json";

const ex: Exercise = {
  id: "ex_1",
  name: "exercise.presetRun",
  category: "run",
  durationMinutes: 30,
  caloriesBurned: 349,
};

const CATEGORIES = ["run", "weights", "walk", "swim", "cycle", "custom"] as const;

describe("EXERCISE_PRESETS", () => {
  it("13 gömülü preset içerir", () => {
    expect(EXERCISE_PRESETS).toHaveLength(13);
  });

  it("nameKey'leri benzersizdir (React key + çeviri çakışması olmaz)", () => {
    const keys = EXERCISE_PRESETS.map((p) => p.nameKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("her preset geçerli bir ExerciseCategory taşır (genişletilmedi)", () => {
    for (const p of EXERCISE_PRESETS) {
      expect(CATEGORIES).toContain(p.category);
    }
  });

  it("önerilen süre pozitif tam sayıdır", () => {
    for (const p of EXERCISE_PRESETS) {
      expect(Number.isInteger(p.durationMinutes)).toBe(true);
      expect(p.durationMinutes).toBeGreaterThan(0);
    }
  });

  it("nameKey 3 dilde de tanımlıdır (locale'de olmayan anahtar ekranda çıplak görünür)", () => {
    for (const p of EXERCISE_PRESETS) {
      const key = p.nameKey.replace(/^exercise\./, "") as keyof typeof tr.exercise;
      for (const loc of [en, tr, pl]) {
        expect(loc.exercise[key], `${p.nameKey} eksik`).toBeTruthy();
      }
    }
  });

  it("preset'te SABİT kalori yoktur —UNKAL da yoksa kayıt calorie'siz olurdu", () => {
    for (const p of EXERCISE_PRESETS) {
      expect(Object.keys(p)).not.toContain("caloriesBurned");
    }
  });

  it("brief'teki kategori eşlemesi birebir uygulanmıştır", () => {
    const by = (k: string) => EXERCISE_PRESETS.find((p) => p.nameKey.endsWith(k))?.category;
    expect(by("presetRun")).toBe("run");
    expect(by("presetWalk")).toBe("walk");
    expect(by("presetWeights")).toBe("weights");
    expect(by("presetSwim")).toBe("swim");
    expect(by("presetCycle")).toBe("cycle");
    expect(by("presetTreadmill")).toBe("run");
    expect(by("presetHiit")).toBe("run");
    // Bilinçli tavan: 6 aktivite `custom` (MET 4.0) ile kaydedilir.
    for (const k of [
      "presetYoga",
      "presetPilates",
      "presetTennis",
      "presetBasketball",
      "presetFootball",
      "presetDance",
    ]) {
      expect(by(k), k).toBe("custom");
      expect(metFor("custom")).toBe(4.0);
    }
  });
});

describe("displayExerciseName", () => {
  const fakeT = (key: string) => `TR:${key}`;

  it("kayda yazılmış PRESET ANAHTARINI çevirir (hesap dili değişse de ad durmaz)", () => {
    // Kayıt "exercise.presetWeights" taşır; ekran o anki dilde gösterir.
    expect(displayExerciseName("exercise.presetWeights", fakeT)).toBe("TR:exercise.presetWeights");
  });

  it("kullanıcının kendi yazdığı ad olduğu gibi gösterilir (çevrilmez)", () => {
    expect(displayExerciseName("Rampa yürüyüş", fakeT)).toBe("Rampa yürüyüş");
  });

  it("ESKİ kayıtlar (çevrilerek yazılmış düz metin) bozulmadan görünür", () => {
    // Canlı veride "Trening siłowy" gibi yazılmış preset adları var; bunlar
    // listeden DÜŞER olsaydı kullanıcının geçmişi kaybolurdu.
    expect(displayExerciseName("Trening siłowy", fakeT)).toBe("Trening siłowy");
    expect(displayExerciseName("Ağırlık Antrenmanı", fakeT)).toBe("Ağırlık Antrenmanı");
  });

  it("hiçbir preset adı KAYDA çevrilerek yazılmaz (bozulmanın kökü kapatıldı)", () => {
    for (const p of EXERCISE_PRESETS) {
      const short = p.nameKey.replace(/^exercise\./, "") as keyof typeof tr.exercise;
      // Kayda yazılan şey çeviri metni DEĞİL — ne tam anahtar ne de öneksiz
      // hali. `t()` ile yazılmış olsaydı biri bunlardan biriyle eşleşirdi.
      expect([short, p.nameKey]).not.toContain(tr.exercise[short]);
      expect([short, p.nameKey]).not.toContain(en.exercise[short]);
      expect([short, p.nameKey]).not.toContain(pl.exercise[short]);
    }
  });
});

describe("resolveKcal", () => {
  it("kcalOverride varsa KULLANICININ yazdığı gerçek gider (formül ezilmez)", () => {
    // 80 kg, 30 dk koşu → formül 349 verir; kullanıcı 310 yazdıysa 310 kaydedilir.
    expect(resolveKcal(310, "run", 80, 30)).toBe(310);
    expect(burnedKcal("run", 80, 30)).toBe(349);
  });

  it("override yoksa hesaplanan kalori yazılır", () => {
    expect(resolveKcal(null, "run", 80, 30)).toBe(349);
    expect(resolveKcal(null, "run", 40, 30)).toBe(174);
    expect(resolveKcal(null, "run", 80, 60)).toBe(697);
  });

  it("geçersiz elle override (0/NaN) formüle düşer", () => {
    expect(resolveKcal(0, "run", 80, 30)).toBe(349);
    expect(resolveKcal(Number.NaN, "run", 80, 30)).toBe(349);
    expect(resolveKcal(Number.POSITIVE_INFINITY, "run", 80, 30)).toBe(349);
  });

  it("kilo ya da süre geçersizse 0 döner (uydurma değer üretmez)", () => {
    expect(resolveKcal(null, "run", 0, 30)).toBe(0);
    expect(resolveKcal(null, "run", 80, 0)).toBe(0);
  });
});

describe("parseWeightInput", () => {
  it("sayıyı ve Türkçe virgüllü sayıyı kabul eder", () => {
    expect(parseWeightInput("80")).toBe(80);
    expect(parseWeightInput(" 78,5 ")).toBe(78.5);
    expect(parseWeightInput("78.5")).toBe(78.5);
  });

  it("boş/bozuk/sıfır/negatif girdide null döner — uydurma kilo YAZILMAZ (L21)", () => {
    for (const bad of ["", "   ", "abc", "0", "-70", "NaN", "Infinity", "8 0"]) {
      expect(parseWeightInput(bad), bad).toBeNull();
    }
  });

  it("sınırdan büyük kilo null döner — Infinity kalorili KAYIT YAZILMAZ (sessiz veri kaybı)", () => {
    // `Number("1e308")` sonludur ama `burnedKcal` → Infinity üretir ve
    // `parseExerciseItem` bu kaydı reddeder: kullanıcı kaydetti sanır, reload'da
    // kaybolurdu. Sınır büyükse de reddedilmelidir.
    expect(parseWeightInput("1e308")).toBeNull();
    expect(parseWeightInput(String(MAX_WEIGHT_KG + 1))).toBeNull();
    expect(parseWeightInput(String(MAX_WEIGHT_KG))).toBe(MAX_WEIGHT_KG);
  });
});

describe("parseDurationInput", () => {
  it("pozitif tam sayıyı alır", () => {
    expect(parseDurationInput("30")).toBe(30);
    expect(parseDurationInput("45.9")).toBe(45);
  });

  it("boş/bozuk/sıfır/negatifte 0 döner", () => {
    for (const bad of ["", "abc", "0", "-30", "NaN", "Infinity"]) {
      expect(parseDurationInput(bad), bad).toBe(0);
    }
  });

  it("üst sınırda kırpılır — Infinity kalorili KAYIT YAZILMAZ (sessiz veri kaybı)", () => {
    // Kilo için `MAX_WEIGHT_KG` ile aynı gerekçe: `Number("1e308")` sonlu ama
    // `burnedKcal` onu Infinity yapar, JSON'da null olur, kayıt düşerdi.
    expect(parseDurationInput("1e308")).toBe(MAX_DURATION_MIN);
    expect(parseDurationInput(String(MAX_DURATION_MIN + 60))).toBe(MAX_DURATION_MIN);
    expect(parseDurationInput(String(MAX_DURATION_MIN))).toBe(MAX_DURATION_MIN);
  });
});

describe("config anahtarları (egzersiz ve kilo AYRI satırlarda)", () => {
  it("egzersiz kaydı ile kilo ölçümü birbirini silmez", () => {
    expect(EXERCISE_CONFIG_KEY).toBe("exercise");
    expect(WEIGHT_CONFIG_KEY).toBe("weight");
    expect(EXERCISE_CONFIG_KEY).not.toBe(WEIGHT_CONFIG_KEY);
    // İkisi de backend'in anahtar desenine uyar (tire/büyük harf yok).
    for (const key of [EXERCISE_CONFIG_KEY, WEIGHT_CONFIG_KEY]) {
      expect(key).toMatch(/^[a-z][a-z0-9_]{0,31}$/);
    }
  });
});

describe("existingExerciseConfig — günlük kayıt yazarken `catalog` KORUNUR", () => {
  const catalog: CatalogEntry[] = [
    { id: "ec_1", name: "Rampa yürüyüş", category: "walk", met: 5.5 },
  ];

  it("kataloglu config'i olduğu gibi yaylar", () => {
    const base = existingExerciseConfig({ exercise: { entries: {}, catalog } });
    expect(base.catalog).toEqual(catalog);
  });

  it("catalog YANINA günlük kayıt yazınca katalog düşmez ⭐ simetri", () => {
    // `withCatalog`'un "entries KORUNUR" vaadi tek yönlüydü; bu yazma yolu
    // ters yönü koruyor. İkisi birleşince `catalog` da `entries` de yaşar.
    const raw = existingExerciseConfig({ exercise: { entries: {}, catalog } });
    const next: Record<string, unknown> = {
      ...raw,
      entries: withExercises({}, "2026-10-18", [ex]),
    };
    expect(parseExerciseEntries(next)["2026-10-18"]).toHaveLength(1);
    expect(next.catalog).toEqual(catalog);
  });

  it("withCatalog SONRASI günlük kayıt yazmak katalog'u düşürmez", () => {
    const withCat = withCatalog({ exercise: { entries: {} } } as AppConfig, catalog);
    const base = existingExerciseConfig(withCat);
    const next: Record<string, unknown> = {
      ...base,
      entries: withExercises({}, "2026-10-18", [ex]),
    };
    expect(next.catalog).toEqual(catalog);
    expect(parseExerciseEntries(next)["2026-10-18"]).toHaveLength(1);
  });

  it("config.exercise bozuksa boş nesne döner (yazma yine de çalışır)", () => {
    for (const bad of [null, undefined, "bozuk", 42, [1, 2]]) {
      expect(existingExerciseConfig({ exercise: bad })).toEqual({});
    }
    expect(existingExerciseConfig(undefined)).toEqual({});
  });

  it("girdi config'i mutasyona uğratmaz", () => {
    const config = { exercise: { entries: {}, catalog } };
    const base = existingExerciseConfig(config);
    base.entries = "yazildi";
    expect(config.exercise.entries).toEqual({});
  });
});

// ============================================================================
// BLOKLAYAN — KATALOG YAZILIYORDU, HİÇBİR YERDE OKUNMUYORDU.
//
// `grep parseCatalog` → yalnız `ExerciseSettings` (yazan yer) ve testler.
// `ExerciseModal` onu hiç import etmiyordu; ekran yalnız
// `EXERCISE_PRESETS.map(...)` çiziyordu. Kullanıcı Ayarlar → Egzersiz
// Kütüphanesi'nden "Futbol maçı / custom / 7 MET" ekliyor, sonra Egzersiz
// ekranında o listede yok — elle yeniden yazmak zorunda. `CatalogEntry.met`
// HİÇBİR YERDE `burnedKcal`'a girmiyordu: özelliğin yarısı eksik teslim.
//
// Projede jsdom/@testing-library yok (üst yorum), bu yüzden JSX'in
// "kart listede görünüyor" hali kaynak taramasıyla, hesabın KENDİSİ saf
// fonksiyonlarla kanıtlanır.
// ============================================================================
const EXERCISE_MODAL_SRC = readFileSync(
  join(process.cwd(), "src", "components", "ExerciseModal.tsx"),
  "utf8",
);

describe("katalog modalda OKUNUYOR (yazılıyordu, hiç okunmuyordu)", () => {
  const catalog: CatalogEntry[] = [
    { id: "ec_1", name: "Futbol maçı", category: "custom", met: 7 },
    { id: "ec_2", name: "Rampa yürüyüş", category: "walk", met: 5.5 },
  ];
  const config = { exercise: { entries: {}, catalog } } as AppConfig;

  it("modal katalogu OKUYOR (`parseCatalog` import edilir ve çağrılır)", () => {
    expect(EXERCISE_MODAL_SRC).toContain("parseCatalog");
    expect(EXERCISE_MODAL_SRC).toContain("parseCatalog(config[EXERCISE_CONFIG_KEY])");
  });

  it("katalog girdisi `config.exercise`'in `entries`'i İÇİNDE yaşar (ayrıştırma sırası bozulmaz)", () => {
    // `{catalog}` yazan bir okuma `{entries}`'i göremezdi; ikisi aynı nesnede.
    const parsed = parseCatalog(config[EXERCISE_CONFIG_KEY]);
    expect(parsed).toHaveLength(2);
    expect(parseExerciseEntries(config[EXERCISE_CONFIG_KEY])).toEqual({});
    expect(parseCatalog(existingExerciseConfig(config))).toEqual(catalog);
  });

  it("KART GÖRÜNÜR: katalog başlığı + kart dizisi modalın JSX'inde var", () => {
    // Başlık ayrı grup: `quickPresets` (gömülü) ile karışmasın.
    expect(EXERCISE_MODAL_SRC).toContain('t("exercise.myExercises")');
    expect(EXERCISE_MODAL_SRC).toMatch(/catalog\.map\(/);
    // Kartın MET'i kullanıcının girdiği değer olarak gösterilir.
    expect(EXERCISE_MODAL_SRC).toContain("formatNumber(item.met, 1)");
  });

  it("KART TIKLANINCA katalog MET'i hesaba GİRER (kullanıcının girdiği bilgi kullanılır)", () => {
    // "Futbol maçı" `custom` → tabloda MET 4.0. Kullanıcı 7 MET yazdı:
    // hesap 4.0 ile değil 7 ile yapılmalı, yoksa katalog yine ölü kalır.
    expect(metFor("custom")).toBe(4);
    expect(resolveKcal(null, "custom", 80, 30, 7)).toBe(294);
    expect(resolveKcal(null, "custom", 80, 30)).toBe(168);
    expect(resolveKcal(null, "custom", 80, 30, 7)).toBeGreaterThan(
      resolveKcal(null, "custom", 80, 30),
    );
    // Katalog girdisinin `met`'i panelde de aynı değerle kullanılır.
    const entry = catalog[0];
    expect(resolveKcal(null, entry.category, 80, 30, entry.met)).toBe(294);
  });

  it("elleCalories override önceliği KATALOGDA da geçerli (L20)", () => {
    expect(resolveKcal(310, "custom", 80, 30, 7)).toBe(310);
  });

  it("katalog adı kayda OLDUĞU GİBİ yazılır (çeviri değil) — `displayExerciseName` çözmeye çalışmaz", () => {
    const t = (k: string) => `tr:${k}`;
    expect(displayExerciseName("Futbol maçı", t)).toBe("Futbol maçı");
    // Gömülü preset adı KENDİ anahtarıyla çevrilir (dondurulmuş yabancı dil yok).
    expect(displayExerciseName("exercise.presetFootball", t)).toBe("tr:exercise.presetFootball");
  });

  it("KAYDA giren egzersiz `parseExerciseItem` süzgecinden GEÇER (katalog yolu kaydı bozmaz)", () => {
    const kcal = resolveKcal(null, "custom", 80, 30, 7);
    const saved: Exercise = {
      id: "ex_cat",
      name: "Futbol maçı",
      category: "custom",
      durationMinutes: 30,
      caloriesBurned: kcal,
    };
    expect(parseExerciseItem(saved)).toEqual(saved);
  });
});

// ============================================================================
// GÖMÜLÜ ŞABLON GİZLEME — kullanıcı kullanmadığı hızlı şablonu kaldırabilir
// ve Ayarlar'dan geri getirebilir. Preset KODDA kalır; yalnız anahtarı
// `hiddenPresets` listesine girer. Gizleme `entries`/`catalog`'u silmemeli.
// ============================================================================
describe("gömülü şablon gizleme", () => {
  it("`parseHiddenPresets` yalnız dizi metinlerini alır, bozuğu yutar", () => {
    // Girdi `config[EXERCISE_CONFIG_KEY]` — yani `exercise` değerinin KENDİSİ
    // (`parseCatalog` ile aynı imza disiplini).
    expect(parseHiddenPresets({ hiddenPresets: ["exercise.presetRun"] })).toEqual([
      "exercise.presetRun",
    ]);
    expect(parseHiddenPresets({ hiddenPresets: [] })).toEqual([]);
    expect(parseHiddenPresets({})).toEqual([]);
    expect(parseHiddenPresets(null)).toEqual([]);
    expect(parseHiddenPresets({ hiddenPresets: "bozuk" })).toEqual([]);
    // Bozuk satırlar tek tek düşer, geçerliler kalır (katalog parser'ıyla aynı disiplin).
    expect(
      parseHiddenPresets({ hiddenPresets: ["exercise.presetRun", 42, "", null, "exercise.presetYoga"] }),
    ).toEqual(["exercise.presetRun", "exercise.presetYoga"]);
  });

  it("gizleme yalnız `hiddenPresets`'i yazar — `entries` ve `catalog` KORUNUR", () => {
    // Sunucu config satırının TAMAMINI değiştirir: `...base` yayılımı şart.
    const base = existingExerciseConfig({
      exercise: {
        entries: { "2026-10-18": [{ id: "ex_1" }] },
        catalog: [{ id: "ec_1", name: "Futbol maçı", category: "custom", met: 7 }],
      },
    });
    const next: Record<string, unknown> = { ...base, hiddenPresets: ["exercise.presetRun"] };
    expect(next.entries).toEqual({ "2026-10-18": [{ id: "ex_1" }] });
    expect(parseCatalog(next)).toHaveLength(1);
    expect(parseHiddenPresets(next)).toEqual(["exercise.presetRun"]);
  });

  it("modal gizlenen şablonu SÜZER (kart listeden düşer)", () => {
    // Kaynak taraması: filtrenin varlığı + `hiddenPresets`'e bağlılığı.
    expect(EXERCISE_MODAL_SRC).toMatch(/EXERCISE_PRESETS\.filter\(/);
    expect(EXERCISE_MODAL_SRC).toMatch(/hiddenPresets\.includes\(p\.nameKey\)/);
    // ✕ butonu iki adımlı onay ister (kazara kaldırmaya karşı).
    expect(EXERCISE_MODAL_SRC).toContain("handleHidePreset");
    expect(EXERCISE_MODAL_SRC).toContain("ConfirmButton");
  });
});

// ============================================================================
// OVERLAY/SCROLL/A11Y — ExerciseModal kendi overlay'ini elle kurar (paylaşılan
// `<Modal>` DEĞİL). Diğer overlay'lerde (özellikle MealActionSheet) kanıtlanmış
// katmanlar buraya da eklenmeli; eksik oldukları için üç bug çıkıyordu.
// jsdom yok → kaynak taraması.
// ============================================================================
describe("overlay katmanları (scroll kilidi + a11y)", () => {
  it("preset kartı dikey düzendedir — isim ✕ ile çakışmaz", () => {
    // Ölçülen bug: yatay düzende isim ✕'in ALTINA biniyordu (35px çakışma) ve
    // sağ boşluk eklemek ismi darlaştırıyordu. Dikey düzen: ikon üstte, isim
    // tam genişlikte altta. Kart `flex-col` olmalı.
    expect(EXERCISE_MODAL_SRC).toMatch(/w-full flex flex-col gap-2 p-3 rounded-2xl/);
  });

  it("arka plan scroll'u NON-PASSIVE blocker + scrim touch-none ile kilitlenir", () => {
    // `useBodyScrollLock` html/body overflow'unu kapatır ama tekerlek/dokunma
    // altındaki alanı kaydırabilir; MealActionSheet bu yüzden non-passive
    // pencere dinleyicisi ekliyor. React 17+ onTouchMove.preventDefault'i
    // passive olduğu için sessizce etkisizdir.
    expect(EXERCISE_MODAL_SRC).toContain('"wheel", blockBackgroundScroll, { passive: false, capture: true }');
    // `touchmove` çağrısı çok satıra sarılı; boşluk esnek eşleş.
    expect(EXERCISE_MODAL_SRC).toMatch(/"touchmove",\s*blockBackgroundScroll,\s*\{\s*passive: false,\s*capture: true,/);
    expect(EXERCISE_MODAL_SRC).toContain("touch-none");
    expect(EXERCISE_MODAL_SRC).toContain("overscroll-behavior:none");
  });

  it("iç scroll container overscroll-contain taşır (scroll chaining yok)", () => {
    expect(EXERCISE_MODAL_SRC).toMatch(/min-h-0 overflow-y-auto overscroll-contain/);
  });

  it("odak yönetimi + dialog rolü (Escape/Tab/a11y)", () => {
    expect(EXERCISE_MODAL_SRC).toContain("useDialogFocus(");
    expect(EXERCISE_MODAL_SRC).toContain('role="dialog"');
    expect(EXERCISE_MODAL_SRC).toContain('aria-modal="true"');
    // kapatma ✕'i etiketli (ekran okuyucu boş buton okumasın)
    expect(EXERCISE_MODAL_SRC).toMatch(/aria-label=\{t\("common\.close"\)\}/);
  });

  it("kapanışta yarım state sıfırlanır + kilo o güne yazılır", () => {
    expect(EXERCISE_MODAL_SRC).toMatch(/if \(isOpen\) return;/);
    expect(EXERCISE_MODAL_SRC).toContain("seedEntry(before, date, kg)");
    expect(EXERCISE_MODAL_SRC).toContain("max-h-[90dvh]");
    expect(EXERCISE_MODAL_SRC).toContain("pad-safe-b");
  });
});
