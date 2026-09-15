// ============================================================================
// Open Food Facts eşleme katmanı — testler GERÇEK yakalanmış OFF yükleriyle.
//
// Neden uydurma yük değil: bu katmanın tek işi OFF'un tuhaflıklarına dayanmak.
// Elle yazılmış temiz bir örnek, `brands`ın bir uçta metin diğerinde dizi
// olduğunu, `product_name`in bazen hiç bulunmadığını, protein değerinin
// 9.60000038146973 gibi float32 artığıyla geldiğini ya da sodyumun GRAM
// olduğunu YAKALAMAZ. Yükler `off.fixtures.ts`'te, çekildikleri uçlarla birlikte.
// ============================================================================
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n/i18n";
import {
  OFF_SERVING_G,
  OffError,
  barcodeDetectorCtor,
  cameraScanSupported,
  fetchOffProduct,
  isValidBarcode,
  mapOffNutriments,
  missingLabels,
  offErrorMessage,
  searchOff,
  toOffFood,
} from "./off";
import { PIATNICA_SKYR_RESPONSE, SKYR_SEARCH_RESPONSE, TWAROG_SEARCH_RESPONSE } from "./off.fixtures";
import { NUTRIENTS, nutrientOf } from "./nutrients";

/** Fikstürler `unknown` olarak dolaşır — eşleme katmanı zaten ham veri bekliyor. */
const skyrProduct = PIATNICA_SKYR_RESPONSE.product as Record<string, unknown>;
const skyrHits = SKYR_SEARCH_RESPONSE.products as unknown[];
/** `sugars/salt/sodium/saturated-fat/fiber` bildirmeyen gerçek ürün (Pilos). */
const pilosHit = skyrHits[6] as Record<string, unknown>;
/** `product_name` anahtarı HİÇ olmayan gerçek ürün (Fruvita). */
const namelessHit = skyrHits[5] as Record<string, unknown>;
/** Yağ bile bildirmeyen gerçek ürün — ÇEKİRDEK alanda eksik veri. */
const wisniowyHit = skyrHits[1] as Record<string, unknown>;

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe("besin kaydı — Faz 4 için OFF anahtarları", () => {
  it("çekirdek 5 besinin de offKey'i var (eşleme kaydı dolaşarak çalışıyor)", () => {
    expect(nutrientOf("kcal").offKey).toBe("energy-kcal_100g");
    expect(nutrientOf("protein").offKey).toBe("proteins_100g");
    expect(nutrientOf("carbs").offKey).toBe("carbohydrates_100g");
    expect(nutrientOf("fat").offKey).toBe("fat_100g");
    expect(nutrientOf("fiber").offKey).toBe("fiber_100g");
  });
  it("kayıttaki HER besin OFF'a eşlenebiliyor — elle sayım kalmadı", () => {
    for (const def of NUTRIENTS) expect(def.offKey, def.key).toBeTruthy();
  });
});

describe("mapOffNutriments — gerçek Piątnica Skyr yükü", () => {
  const mapped = mapOffNutriments(skyrProduct.nutriments);

  it("çekirdek besinleri 100 g değerlerinden okur", () => {
    expect(mapped.nutrition.kcal).toBe(64);
    expect(mapped.nutrition.protein).toBe(12);
    expect(mapped.nutrition.carbs).toBe(4.1);
    expect(mapped.nutrition.fat).toBe(0);
    expect(mapped.nutrition.fiber).toBe(0);
  });

  // BİRİM TUZAĞI: OFF sodyumu GRAM bildirir, kayıt mg tutar.
  it("sodyumu gramdan mg'ye çevirir (0,039 g → 39 mg)", () => {
    expect(skyrProduct.nutriments).toMatchObject({ sodium_100g: 0.039 });
    expect(mapped.nutrition.sodium).toBe(39);
    expect(mapped.sodiumSource).toBe("sodium");
  });
  it("kayan nokta artığı bırakmaz (0,039 × 1000 = 39,000000000000004)", () => {
    expect(String(mapped.nutrition.sodium)).toBe("39");
  });

  it("mikroları da doldurur", () => {
    expect(mapped.nutrition.sugar).toBe(4.1);
    expect(mapped.nutrition.satFat).toBe(0);
  });
  it("bu üründe eksik besin yok", () => {
    expect(mapped.missing).toEqual([]);
    expect(mapped.present).toHaveLength(NUTRIENTS.length);
  });
  it("kcal doğrudan geldi, kJ'den çevrilmedi", () => {
    expect(mapped.kcalFromKj).toBe(false);
  });
});

describe("sodyum — tuzdan türetme yedeği", () => {
  it("sodium_100g yoksa salt_100g'den hesaplar (0,1 g tuz → 40 mg sodyum)", () => {
    const nutriments = { ...(skyrProduct.nutriments as Record<string, unknown>) };
    delete nutriments.sodium_100g;
    const mapped = mapOffNutriments(nutriments);
    expect(nutriments.salt_100g).toBe(0.1);
    expect(mapped.nutrition.sodium).toBe(40);
    expect(mapped.sodiumSource).toBe("salt");
    expect(mapped.missing).not.toContain("sodium");
  });
  it("ikisi de yoksa sodyum BİLİNMİYOR kalır — 0 yazılmaz", () => {
    const mapped = mapOffNutriments({ "energy-kcal_100g": 100 });
    expect(mapped.nutrition.sodium).toBeUndefined();
    expect("sodium" in mapped.nutrition).toBe(false);
    expect(mapped.sodiumSource).toBeNull();
    expect(mapped.missing).toContain("sodium");
  });
  it("doğrudan sodyum varsa tuza bakılmaz", () => {
    const mapped = mapOffNutriments({ sodium_100g: 0.5, salt_100g: 99 });
    expect(mapped.nutrition.sodium).toBe(500);
    expect(mapped.sodiumSource).toBe("sodium");
  });
});

describe("eksik besin BİLİNMİYOR kalır (projenin dürüstlük kuralı)", () => {
  it("gerçek Pilos ürünü: bildirilmeyen mikrolar anahtar olarak bile yazılmaz", () => {
    const mapped = mapOffNutriments(pilosHit.nutriments);
    for (const key of ["sugar", "satFat", "sodium"] as const) {
      expect(mapped.nutrition[key], key).toBeUndefined();
      expect(key in mapped.nutrition, key).toBe(false);
    }
    expect(mapped.missing).toEqual(["fiber", "sugar", "satFat", "sodium"]);
    expect(mapped.present).toEqual(["kcal", "protein", "carbs", "fat"]);
  });

  it("çekirdek alan eksikse 0'a düşer AMA `missing` bunu söyler", () => {
    // "Skyr wiśniowy" yağ bildirmiyor. Tip yağı zorunlu tutuyor, o yüzden 0
    // yazılıyor — ama arayüz bu 0'ın ölçüm olmadığını `missing`ten öğrenir.
    const mapped = mapOffNutriments(wisniowyHit.nutriments);
    expect(mapped.nutrition.fat).toBe(0);
    expect(mapped.missing).toContain("fat");
    expect(mapped.present).not.toContain("fat");
  });

  it("besin değeri HİÇ olmayan ürün: çekirdek 0, mikro yok, hepsi eksik", () => {
    const mapped = mapOffNutriments({});
    expect(mapped.nutrition).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
    expect(mapped.missing).toEqual(NUTRIENTS.map((d) => d.key));
    expect(mapped.present).toEqual([]);
  });

  it("gerçek 0 ile eksik ayrı şeylerdir", () => {
    // Piątnica'da yağ GERÇEKTEN 0 — ölçülmüş bir sıfır.
    const real = mapOffNutriments({ fat_100g: 0 });
    expect(real.present).toContain("fat");
    expect(real.missing).not.toContain("fat");
  });
});

describe("mapOffNutriments — bozuk / eksik yükler", () => {
  it("nutriments null, undefined, dizi ya da metin olsa da patlamaz", () => {
    for (const bad of [null, undefined, [], "yok", 42, true]) {
      const mapped = mapOffNutriments(bad);
      expect(mapped.nutrition.kcal).toBe(0);
      expect(mapped.present).toEqual([]);
    }
  });
  it("METİN gelen sayıları okur (OFF bazı kayıtlarda böyle döndürüyor)", () => {
    const mapped = mapOffNutriments({ "energy-kcal_100g": "250", proteins_100g: "8,5" });
    expect(mapped.nutrition.kcal).toBe(250);
    expect(mapped.nutrition.protein).toBe(8.5);
  });
  it("sayı olmayan / negatif / sonsuz değer BİLDİRİLMEMİŞ sayılır", () => {
    const mapped = mapOffNutriments({
      "energy-kcal_100g": "bilinmiyor",
      proteins_100g: -3,
      fat_100g: null,
      carbohydrates_100g: Infinity,
      sugars_100g: -0.5,
    });
    expect(mapped.missing).toEqual(NUTRIENTS.map((d) => d.key));
    expect(mapped.nutrition.sugar).toBeUndefined();
  });
  it("float32 artığını 1 ondalığa yuvarlar (9,60000038… → 9,6)", () => {
    const mapped = mapOffNutriments(wisniowyHit.nutriments);
    expect(mapped.nutrition.protein).toBe(9.6);
  });
  it("kcal yoksa kJ'den çevirir (282 kJ → 67,4 kcal) ve bunu bildirir", () => {
    const mapped = mapOffNutriments({ "energy-kj_100g": 282 });
    expect(mapped.nutrition.kcal).toBe(67.4);
    expect(mapped.kcalFromKj).toBe(true);
    expect(mapped.present).toContain("kcal");
  });
  it("kcal doğrudan varsa kJ'ye bakılmaz", () => {
    const mapped = mapOffNutriments({ "energy-kcal_100g": 66, "energy-kj_100g": 282 });
    expect(mapped.nutrition.kcal).toBe(66);
    expect(mapped.kcalFromKj).toBe(false);
  });
});

describe("toOffFood", () => {
  it("ürün ucundaki METİN markayı okur", () => {
    const food = toOffFood(skyrProduct)!;
    expect(food.code).toBe("5900531004544");
    expect(food.name).toBe("Skyr Naturalny");
    expect(food.brand).toBe("Piatnica");
    expect(food.quantity).toBe("150 g");
    expect(food.servingSize).toBe("1 portion (150 g)");
    expect(food.imageUrl).toContain("images.openfoodfacts.org");
  });
  it("arama ucundaki DİZİ markanın ilkini alır", () => {
    const food = toOffFood(skyrHits[1])!;
    expect(food.brand).toBe("Piątnica"); // ["Piątnica", "OSM Piątnica"]
  });
  it("virgülle birleştirilmiş markadan ilkini alır", () => {
    expect(toOffFood({ code: "1", brands: "Pilos,lidl" })!.brand).toBe("Pilos");
  });
  it("marka hiç yoksa null", () => {
    const noBrand = (TWAROG_SEARCH_RESPONSE.products as unknown[])[3] as Record<string, unknown>;
    expect("brands" in noBrand).toBe(false);
    expect(toOffFood(noBrand)!.brand).toBeNull();
  });
  it("adı olmayan gerçek ürün uydurulmaz, aktif dildeki yer tutucuya düşer", () => {
    expect("product_name" in namelessHit).toBe(false);
    expect(toOffFood(namelessHit)!.name).toBe(i18n.t("off.unnamed"));
  });
  it("Lehçe ad varsa onu tercih eder (kullanıcı Polonya'da, rafta o yazıyor)", () => {
    const food = toOffFood({ code: "1", product_name: "Cottage cheese", product_name_pl: "Twaróg" })!;
    expect(food.name).toBe("Twaróg");
  });
  it("kodu olmayan kayıt eşlenmez (barkod ürünün kimliği)", () => {
    expect(toOffFood({ product_name: "adsız" })).toBeNull();
    expect(toOffFood({ code: "  " })).toBeNull();
    expect(toOffFood(null)).toBeNull();
    expect(toOffFood("metin")).toBeNull();
  });
  it("eksik besinlerin okunur adlarını aktif dilde verir", () => {
    expect(missingLabels(toOffFood(pilosHit)!, i18n.t.bind(i18n))).toEqual([
      i18n.t("nutrient.fiber"),
      i18n.t("nutrient.sugar"),
      i18n.t("nutrient.satFat"),
      i18n.t("nutrient.sodium"),
    ]);
  });
});

describe("searchOff — proxy zarfı", () => {
  /** Proxy yanıtını taklit eder; ağa çıkılmaz.
   *  `url` parametresi imzada duruyor ki `mock.calls[0][0]` ile çağrılan adres
   *  doğrulanabilsin (parametresiz bir sahtede tip boş demet olurdu). */
  function stubJson(status: number, body: unknown, headers: Record<string, string> = {}) {
    const fn = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json", ...headers },
        }),
    );
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("`products` (proxy'nin adı) üzerinden okur ve ürünleri eşler", async () => {
    stubJson(200, SKYR_SEARCH_RESPONSE);
    const res = await searchOff("skyr");
    expect(res.foods).toHaveLength(8);
    expect(res.foods[0].name).toBe("Skyr Naturalny");
    // 40, 39 DEĞİL: arama dizini AYNI ürün için daha kaba bir sayı tutuyor
    // (0,04 g), ürün ucu 0,039 g veriyor. Aşağıda ayrıca kilitlendi.
    expect(res.foods[0].nutrition.sodium).toBe(40);
    expect(res.scope).toBe("index");
    expect(res.upstreamCount).toBe(56);
  });
  it("arama dizini ile ürün ucu AYNI ürün için farklı hassasiyet veriyor", async () => {
    // Gerçek gözlem, bizim hatamız değil: search-a-licious dizini sodyumu
    // 0,04 g olarak tutarken v2 ürün ucu 0,039 g döndürüyor. Kullanıcı listeden
    // seçtiğinde 40 mg, barkodla getirdiğinde 39 mg görür — arama sonucunu
    // "yaklaşık" saymak gerektiğinin kaydı.
    expect((skyrHits[0] as { nutriments: Record<string, number> }).nutriments.sodium_100g).toBe(0.04);
    expect((skyrProduct.nutriments as Record<string, number>).sodium_100g).toBe(0.039);
  });
  it("sorguyu URL'ye kodlar ve limiti geçirir", async () => {
    const fn = stubJson(200, { ok: true, products: [] });
    await searchOff("twaróg chudy", 12);
    expect(fn.mock.calls[0][0]).toBe("/api/off/search?q=twar%C3%B3g%20chudy&limit=12");
  });
  it("çok kelimeli aramanın `post-filter` kapsamını taşır (liste kısa olabilir)", async () => {
    stubJson(200, TWAROG_SEARCH_RESPONSE);
    const res = await searchOff("twaróg chudy", 12);
    expect(res.scope).toBe("post-filter");
    expect(res.foods.length).toBeLessThan(12); // eksik sonuç bir HATA değil
  });
  it("zarf bozuksa boş liste döner, patlamaz", async () => {
    stubJson(200, { ok: true });
    expect((await searchOff("skyr")).foods).toEqual([]);
  });
  it("kodsuz kayıtları eler", async () => {
    stubJson(200, { ok: true, products: [{ product_name: "kodsuz" }, { code: "1", product_name: "iyi" }] });
    const res = await searchOff("x");
    expect(res.foods.map((f) => f.code)).toEqual(["1"]);
  });

  it("429'da Retry-After BAŞLIĞINI okur ve OffError fırlatır", async () => {
    stubJson(429, { error: "hız sınırı", retryAfter: 7 }, { "Retry-After": "7" });
    const err = await searchOff("skyr").catch((e) => e);
    expect(err).toBeInstanceOf(OffError);
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(7);
    expect(err.message).toContain("7 sn");
  });
  it("başlık yoksa gövdedeki retryAfter'a düşer", async () => {
    stubJson(429, { error: "hız sınırı", retryAfter: 12 });
    const err = await searchOff("skyr").catch((e) => e);
    expect(err.retryAfter).toBe(12);
  });
  it("502 ve 504 kendi Türkçe mesajlarını alır", async () => {
    stubJson(502, { error: "OFF JSON yerine HTML döndürdü" });
    await expect(searchOff("skyr")).rejects.toThrow(/düzgün yanıt vermiyor/);
    stubJson(504, { error: "zaman aşımı" });
    await expect(searchOff("skyr")).rejects.toThrow(/zaman aşımına uğradı/);
  });
  it("ağa hiç çıkılamazsa status 0 ile anlaşılır mesaj verir", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const err = await searchOff("skyr").catch((e) => e);
    expect(err).toBeInstanceOf(OffError);
    expect(err.status).toBe(0);
    expect(err.message).toContain("Sunucuya ulaşılamadı");
  });
  it("iptal (AbortError) hataya çevrilmez — çağıranın kendi kararı", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      const e = new Error("iptal");
      e.name = "AbortError";
      throw e;
    }));
    const err = await searchOff("skyr").catch((e) => e);
    expect(err).not.toBeInstanceOf(OffError);
    expect(err.name).toBe("AbortError");
  });

  it("fetchOffProduct: bulunan ürünü eşler", async () => {
    const fn = stubJson(200, PIATNICA_SKYR_RESPONSE);
    const food = await fetchOffProduct("5900531004544");
    expect(fn.mock.calls[0][0]).toBe("/api/off/product/5900531004544");
    expect(food?.nutrition.sodium).toBe(39);
  });
  it("fetchOffProduct: bulunamayan ürün HATA değil, null", async () => {
    stubJson(200, { ok: true, found: false, barcode: "1234", product: null });
    expect(await fetchOffProduct("1234")).toBeNull();
  });

  it("searchOff: çevrimdışıysa isteği hiç açmaz, OffError(0) fırlatır", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const err = await searchOff("skyr").catch((e) => e);
    expect(err).toBeInstanceOf(OffError);
    expect((err as OffError).status).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("mesajlar, barkod ve yetenek testi", () => {
  const t = i18n.t.bind(i18n);

  it("429 mesajı süresiz de olsa dürüst kalır (aktif dilde)", () => {
    expect(offErrorMessage(429, null, null)).toBe(t("off.errRateLimit"));
    expect(offErrorMessage(429, null, 5)).toBe(t("off.errRateLimitSeconds", { seconds: 5 }));
  });
  it("tanınmayan durumda AKTİF DİLDE, HTTP kodlu mesaj döner (sunucu gövdesi gösterilmez)", () => {
    // Sunucu gövdesi Türkçe olabilir; onu İngilizce bir arayüze basmak bu
    // düzeltmenin kapatmak istediği kaçak sınıfıdır.
    expect(offErrorMessage(400, "arama terimi (q) gerekli")).toBe(t("off.errHttp", { status: 400 }));
    expect(offErrorMessage(418, null)).toBe(t("off.errHttp", { status: 418 }));
    expect(offErrorMessage(418, null)).not.toContain("arama");
  });
  it("barkod doğrulaması sunucununkiyle aynı (boşuna jeton yakılmasın)", () => {
    expect(isValidBarcode("5900531004544")).toBe(true);
    expect(isValidBarcode(" 20881078 ")).toBe(true);
    expect(isValidBarcode("123")).toBe(false);
    expect(isValidBarcode("59005E10")).toBe(false);
    expect(isValidBarcode("")).toBe(false);
  });
  it("OFF ürünleri 100 g başına — alias porsiyonu da öyle", () => {
    expect(OFF_SERVING_G).toBe(100);
  });
  it("ODbL atıfı boş bırakılamaz (lisans gereği) — üç dilde de", () => {
    for (const lang of ["en", "tr", "pl"]) {
      const attribution = i18n.getFixedT(lang)("off.attribution");
      expect(attribution).toContain("Open Food Facts");
      expect(attribution).toContain("ODbL");
    }
  });

  // --- BarcodeDetector yetenek testi ---
  it("BarcodeDetector yokken kurucu null, kamera desteklenmiyor sayılır", () => {
    expect(barcodeDetectorCtor()).toBeNull(); // node'da yok, iOS Safari'de de yok
    expect(cameraScanSupported()).toBe(false);
  });
  it("BarcodeDetector varsa bile getUserMedia yoksa kamera kapalı", () => {
    vi.stubGlobal("BarcodeDetector", function BarcodeDetector() {} as unknown);
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", {});
    expect(barcodeDetectorCtor()).not.toBeNull();
    expect(cameraScanSupported()).toBe(false);
  });
  it("güvenli bağlam değilse kamera düğmesi gösterilmez (getUserMedia zaten reddeder)", () => {
    vi.stubGlobal("BarcodeDetector", function BarcodeDetector() {} as unknown);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => {} } });
    vi.stubGlobal("isSecureContext", false);
    expect(cameraScanSupported()).toBe(false);
  });
  it("üç koşul da sağlanınca kamera açılabilir", () => {
    vi.stubGlobal("BarcodeDetector", function BarcodeDetector() {} as unknown);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => {} } });
    vi.stubGlobal("isSecureContext", true);
    expect(cameraScanSupported()).toBe(true);
  });
});
