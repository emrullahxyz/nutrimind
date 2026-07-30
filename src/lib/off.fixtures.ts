// ============================================================================
// Open Food Facts'ten GERÇEKTEN alınmış yanıtlar — testler için sabitlendi.
//
// 30 Temmuz 2026'da yerel proxy (/api/off/…) üzerinden çekildi ve OLDUĞU GİBİ
// yapıştırıldı. Elle sadeleştirme YOK: eşleme katmanının gerçek OFF verisinin
// tuhaflıklarına dayandığı ancak gerçek yükle kanıtlanabilir —
//   • ürün ucunda "brands" METİN, arama ucunda DİZİ,
//   • "product_name" alanı bazı üründe HİÇ YOK,
//   • mikro alanlar seyrek dolu,
//   • sodyum GRAM cinsinden geliyor (bizim kayıt mg tutuyor).
// Arama yanıtlarında yalnızca ürün SAYISI kısaltıldı; ürünlerin kendisine
// dokunulmadı.
//
// Uygulama kodu bu dosyayı İÇE AKTARMAZ — yalnızca off.test.ts kullanır.
// ============================================================================

/** GET /api/off/product/5900531004544 — Piątnica Skyr Naturalny.
 *  Sodyum GRAM geliyor (0,039 g = 39 mg); tuz da dolu (0,1 g → 40 mg).
 *  Ürün ucunda `brands` virgülle birleştirilmiş bir METİN. */
export const PIATNICA_SKYR_RESPONSE = {
  "ok": true,
  "found": true,
  "barcode": "5900531004544",
  "product": {
    "brands": "Piatnica",
    "code": "5900531004544",
    "countries_tags": [
      "en:poland"
    ],
    "image_small_url": "https://images.openfoodfacts.org/images/products/590/053/100/4544/front_en.39.200.jpg",
    "nutriments": {
      "added-sugars": 0,
      "added-sugars_100g": 0,
      "added-sugars_modifier": "~",
      "added-sugars_serving": 0,
      "added-sugars_unit": "g",
      "added-sugars_value": 0,
      "carbohydrates": 4.1,
      "carbohydrates_100g": 4.1,
      "carbohydrates_serving": 6.15,
      "carbohydrates_unit": "g",
      "carbohydrates_value": 4.1,
      "energy": 273.7,
      "energy-kcal": 64,
      "energy-kcal_100g": 64,
      "energy-kcal_serving": 96,
      "energy-kcal_unit": "kcal",
      "energy-kcal_value": 64,
      "energy-kj": 273.7,
      "energy-kj_100g": 273.7,
      "energy-kj_modifier": "~",
      "energy-kj_serving": 411,
      "energy-kj_unit": "kJ",
      "energy-kj_value": 273.7,
      "energy_100g": 273.7,
      "energy_modifier": "~",
      "energy_serving": 411,
      "energy_unit": "kJ",
      "energy_value": 273.7,
      "fat": 0,
      "fat_100g": 0,
      "fat_serving": 0,
      "fat_unit": "g",
      "fat_value": 0,
      "fiber": 0,
      "fiber_100g": 0,
      "fiber_serving": 0,
      "fiber_unit": "g",
      "fiber_value": 0,
      "fruits-vegetables-legumes-estimate-from-ingredients_100g": 0,
      "fruits-vegetables-nuts-estimate-from-ingredients_100g": 0,
      "nova-group": 1,
      "nova-group_100g": 1,
      "nova-group_serving": 1,
      "nova-group_unit": "",
      "nova-group_value": 1,
      "proteins": 12,
      "proteins_100g": 12,
      "proteins_serving": 18,
      "proteins_unit": "g",
      "proteins_value": 12,
      "salt": 0.1,
      "salt_100g": 0.1,
      "salt_serving": 0.15,
      "salt_unit": "g",
      "salt_value": 0.1,
      "saturated-fat": 0,
      "saturated-fat_100g": 0,
      "saturated-fat_serving": 0,
      "saturated-fat_unit": "g",
      "saturated-fat_value": 0,
      "sodium": 0.039,
      "sodium_100g": 0.039,
      "sodium_serving": 0.0585,
      "sodium_unit": "g",
      "sodium_value": 0.039,
      "sugars": 4.1,
      "sugars_100g": 4.1,
      "sugars_serving": 6.15,
      "sugars_unit": "g",
      "sugars_value": 4.1
    },
    "nutrition_data": "on",
    "nutrition_data_prepared_per": "100g",
    "product_name": "Skyr Naturalny",
    "product_name_pl": "Skyr Naturalny",
    "product_quantity": 150,
    "product_quantity_unit": "g",
    "quantity": "150 g",
    "serving_size": "1 portion (150 g)"
  },
  "cached": false
};

/** GET /api/off/search?q=skyr&limit=8 — tek kelime, `scope: "index"`.
 *  6. üründe `product_name` anahtarı HİÇ YOK; 7. ürün (Pilos Skyr Vanilla)
 *  yalnızca 5 alan bildiriyor: lif, şeker, doymuş yağ, sodyum ve tuz eksik.
 *  Arama ucunda `brands` bir DİZİ. */
export const SKYR_SEARCH_RESPONSE = {
  "ok": true,
  "query": "skyr",
  "scope": "index",
  "count": 8,
  "upstreamCount": 56,
  "products": [
    {
      "code": "5900531004544",
      "brands": [
        "Piątnica"
      ],
      "quantity": "150 g",
      "countries_tags": [
        "en:poland"
      ],
      "nutriments": {
        "carbohydrates_100g": 4.1,
        "energy-kcal_100g": 64,
        "fat_100g": 0,
        "proteins_100g": 12,
        "salt_100g": 0.1,
        "saturated-fat_100g": 0,
        "sodium_100g": 0.04,
        "sugars_100g": 4.1
      },
      "product_name": "Skyr Naturalny",
      "image_small_url": "https://images.openfoodfacts.org/images/products/590/053/100/4544/front_pl.8.200.jpg"
    },
    {
      "code": "5900531004629",
      "brands": [
        "Piątnica",
        "OSM Piątnica"
      ],
      "countries_tags": [
        "en:poland"
      ],
      "nutriments": {
        "carbohydrates_100g": 11,
        "energy-kcal_100g": 82,
        "proteins_100g": 9.60000038146973,
        "sugars_100g": 11
      },
      "product_name": "Skyr wiśniowy",
      "image_small_url": "https://images.openfoodfacts.org/images/products/590/053/100/4629/front_en.5.200.jpg"
    },
    {
      "code": "5900531004506",
      "brands": [
        "Piątnica"
      ],
      "quantity": "150 g",
      "countries_tags": [
        "en:poland"
      ],
      "nutriments": {
        "carbohydrates_100g": 11,
        "energy-kcal_100g": 82,
        "energy-kj_100g": 350,
        "fat_100g": 0,
        "proteins_100g": 9.6,
        "salt_100g": 0.06,
        "saturated-fat_100g": 0,
        "sodium_100g": 0.024,
        "sugars_100g": 11
      },
      "product_name": "Skyr - jogurt typu islandzkiego z truskawkami",
      "image_small_url": "https://images.openfoodfacts.org/images/products/590/053/100/4506/front_pl.19.200.jpg"
    },
    {
      "code": "7048840090778",
      "brands": [
        "Skyr"
      ],
      "countries_tags": [
        "en:poland"
      ],
      "nutriments": {
        "carbohydrates_100g": 9.33,
        "energy-kcal_100g": 78.7,
        "fat_100g": 0,
        "fiber_100g": 0.667,
        "proteins_100g": 10,
        "salt_100g": 0.0983,
        "saturated-fat_100g": 0,
        "sodium_100g": 0.0393,
        "sugars_100g": 8.67
      },
      "product_name": "0% fat vanila original skyr cultures"
    },
    {
      "code": "5901939103099",
      "brands": [
        "Piątnica"
      ],
      "quantity": "350 g",
      "countries_tags": [
        "en:poland"
      ],
      "nutriments": {
        "carbohydrates_100g": 9.5,
        "energy-kcal_100g": 78,
        "fat_100g": 1.5,
        "proteins_100g": 6.5,
        "salt_100g": 0.0775,
        "saturated-fat_100g": 1.1,
        "sodium_100g": 0.031,
        "sugars_100g": 9
      },
      "product_name": "Skyr Icelandic type yoghurt blueberry",
      "image_small_url": "https://images.openfoodfacts.org/images/products/590/193/910/3099/front_en.44.200.jpg"
    },
    {
      "code": "5900531004469",
      "brands": [
        "Fruvita"
      ],
      "quantity": "150 g",
      "countries_tags": [
        "en:poland"
      ],
      "nutriments": {
        "carbohydrates_100g": 4.6,
        "energy-kcal_100g": 66,
        "energy-kj_100g": 282,
        "fat_100g": 0,
        "fiber_100g": 0,
        "proteins_100g": 12,
        "salt_100g": 0.1,
        "saturated-fat_100g": 0,
        "sodium_100g": 0.04,
        "sugars_100g": 4.4
      },
      "image_small_url": "https://images.openfoodfacts.org/images/products/590/053/100/4469/front_pl.5.200.jpg"
    },
    {
      "code": "20881078",
      "brands": [
        "Pilos",
        "lidl"
      ],
      "quantity": "150 g",
      "countries_tags": [
        "en:croatia",
        "en:france",
        "en:germany",
        "en:poland"
      ],
      "nutriments": {
        "carbohydrates_100g": 4.1,
        "energy-kcal_100g": 54,
        "energy-kj_100g": 226,
        "fat_100g": 0.2,
        "proteins_100g": 8.8
      },
      "product_name": "Skyr Vanilla",
      "image_small_url": "https://images.openfoodfacts.org/images/products/20881078/front_hr.48.200.jpg"
    },
    {
      "code": "5900531004513",
      "brands": [
        "Piątnica"
      ],
      "quantity": "150 g",
      "countries_tags": [
        "en:poland"
      ],
      "nutriments": {
        "carbohydrates_100g": 11,
        "energy-kcal_100g": 82,
        "fat_100g": 0,
        "proteins_100g": 9.6,
        "salt_100g": 0.06,
        "saturated-fat_100g": 0,
        "sodium_100g": 0.024,
        "sugars_100g": 11
      },
      "product_name": "Skyr Joghurt",
      "image_small_url": "https://images.openfoodfacts.org/images/products/590/053/100/4513/front_pl.21.200.jpg"
    }
  ],
  "cached": false
};

/** GET /api/off/search?q=twaróg chudy — çok kelimeli, `scope: "post-filter"`.
 *  Proxy istenen sayıdan AZ sonuç döndürebilir; bazı üründe `brands` yok. */
export const TWAROG_SEARCH_RESPONSE = {
  "ok": true,
  "query": "twaróg chudy",
  "scope": "post-filter",
  "count": 4,
  "upstreamCount": 34,
  "products": [
    {
      "code": "5902170000932",
      "brands": [
        "Delikatne"
      ],
      "countries_tags": [
        "en:poland"
      ],
      "nutriments": {
        "carbohydrates_100g": 3.5,
        "energy-kcal_100g": 94,
        "proteins_100g": 20,
        "salt_100g": 0.0984251983170434,
        "sodium_100g": 0.0393700793268174,
        "sugars_100g": 3.5
      },
      "product_name": "Twaróg chudy"
    },
    {
      "code": "5900820021993",
      "brands": [
        "Delikate"
      ],
      "quantity": "250 g",
      "countries_tags": [
        "en:poland"
      ],
      "nutriments": {
        "saturated-fat_100g": 0,
        "fat_100g": 0,
        "sodium_100g": 0.08,
        "proteins_100g": 18,
        "salt_100g": 0.2,
        "sugars_100g": 3.5,
        "energy-kcal_100g": 366,
        "carbohydrates_100g": 3.5
      },
      "product_name": "Twaróg chudy",
      "image_small_url": "https://images.openfoodfacts.org/images/products/590/082/002/1993/front_en.3.200.jpg"
    },
    {
      "code": "5902298008001",
      "brands": [
        "Delikate"
      ],
      "countries_tags": [
        "en:poland"
      ],
      "nutriments": {
        "carbohydrates_100g": 2.9,
        "energy-kcal_100g": 84,
        "fat_100g": 0.5,
        "proteins_100g": 17,
        "saturated-fat_100g": 0,
        "sugars_100g": 1.8
      },
      "product_name": "Twaróg chudy",
      "image_small_url": "https://images.openfoodfacts.org/images/products/590/229/800/8001/front_en.3.200.jpg"
    },
    {
      "code": "5900120072589",
      "countries_tags": [
        "en:poland"
      ],
      "nutriments": {
        "carbohydrates_100g": 4.5,
        "energy-kcal_100g": 85,
        "fat_100g": 0.3,
        "proteins_100g": 16,
        "salt_100g": 0.25,
        "saturated-fat_100g": 0.2,
        "sodium_100g": 0.1,
        "sugars_100g": 3.1
      },
      "product_name": "Twaróg chudy"
    }
  ],
  "cached": false
};
