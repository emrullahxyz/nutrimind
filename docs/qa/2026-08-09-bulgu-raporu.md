# Nutrimind QA Bulgu Raporu — 2026-08-09

Ortam: `pnpm preview` (4173) + `NUTRI_DB=server/data.qa.db node server/index.js` (8790).
Kapsam: uygulama geneli uçtan uca, bir kullanıcı gözünden, görsel + kod çift takip.
Kararlar: rapor-only (kod değişikliği YOK), AI kill-switch davranışı test edilir.

## Şiddet Tanımları
- **SEV1** veri kaybı / bozulma
- **SEV2** kırık ana akış (kaydet / navigasyon / kamera)
- **SEV3** bozuk gösterim / davranış
- **SEV4** kozmetik / kenar / bilgi

---

## Bulgular

### [SEV4] Öğün satırı seçim modunda çift birim gösteriyor ("800 kcal kalori")
- Alan: Faz 1 / MealRow
- Kök neden: `src/components/MealRow.tsx:58`
- Repro:
  1. Bugün gününe 1+ öğün ekle (veya merge et).
  2. "Seç" butonuna bas (seçim modu).
  3. Öğün satırının kalori kısmına bak.
- Beklenen: Tek birim — normal moddakiyle tutarlı (örn. "800 kalori").
- Gerçek: "800 kcal kalori" — `formatKcal()` "kcal" ekliyor, satır da " kalori" ekliyor.
- Kanıt: snapshot [863] "420 kcal kalori" (seçim modu); satır 79 normal modda "800 kalori".
- Not: `formatKcal` yalnızca seçim modu şablonunda (satır 58) kullanılıyor; satır 79 çıplak
  `{kcal}` kullanıyor. Tutarlılık için ikisinden biri seçilmeli.

### [SEV4] Negatif makro input'ta kabul ediliyor, kayıtta sessizce 0'a clamp'leniyor
- Alan: Faz 2 / MealForm (Elle mod)
- Kök neden: `src/components/MealForm.tsx:576-585` (clamp kayıt anında, input doğrulaması yok)
- Repro:
  1. Öğün ekle → "Elle" moduna geç.
  2. Protein alanına `-5` yaz (input `type="text"`, min/step yok, Kaydet disabled DEĞİL).
  3. Kaydet → POST /api/day 200 → gün yeniden yüklenir.
- Beklenen: Negatif değer inline reddedilmeli veya en azından kullanıcıya bildirilmeli.
- Gerçek: "-5" gösteriliyor ama DB'ye `protein:0` yazılıyor; kullanıcıya hiçbir uyarı yok.
- Kanıt: eval ile input `-5` + Kaydet disabled=false; `/api/data` sonrası öğün `protein:0`.
- Veri güvenliği değişmezi KORUNUYOR (negatif DB'ye ulaşmıyor) — bulgu UX tutarsızlığı.

### [SEV4] Miktar alanında 1g minimumu yok — "0.5" → qty 0.5 + 0 kcal öğün
- Alan: Faz 2 / MealForm (Hafızadan mod, Miktar NumField)
- Kök neden: `src/components/MealForm.tsx:234-239` (grams init) + `357c184` 1g minimumu YALNIZCA
  VisionReview'a uygulanmış (`src/lib/visionReview.ts` `MIN_VISION_MULTIPLIER`), genel Miktar alanı
  min doğrulamasız.
- Repro:
  1. Öğün ekle → "Hafızadan" modunda (yoğurt otomatik seçilir).
  2. Miktar alanına `0.5` yaz (input text, min yok, Kaydet disabled DEĞİL).
  3. Kaydet → POST /api/day 200.
- Beklenen: 1g altı porsiyon ya reddedilmeli ya da 1g'e yuvarlanmalı (VisionReview ile tutarlı).
- Gerçek: `sources:[{aliasId, qty:0.5, unit:"g"}]` yazılıyor; scaled nutrition 0 kcal'e düşüyor.
  Kullanıcıya hiçbir uyarı yok.
- Kanıt: `/api/data` sonrası öğün `qty:0.5`, `kcal:0, protein:0`.
- Not: 0.5g × (77kcal/150g) ≈ 0.26 kcal — aritmetik doğru ama anlamsız porsiyon sessizce
  sıfır-besin öğünü üretiyor.

### [SEV3] NutritionSheet aç-kaydet, 2 ondalıklı makro değerlerini sessizce 1 ondalığa tırnaklıyor
- Alan: Faz 2 / NutritionSheet (öğün satırındaki makro kutusuna tıklayınca açılan "Nutrition")
- Kök neden: `src/components/NutritionSheet.tsx:22-33` — `scaleMealNutrition` her alanda
  `.toFixed(1)` uyguluyor (satır 26-28); multiplier=1 olsa bile draft buradan kuruluyor
  (satır 49, 58), kayıt `fromDraft` ile tırnaklanmış değeri geri yazıyor.
- Repro:
  1. Gün öğününde 2 ondalıklı makro olan bir öğün olsun (örn. API ile `carbs:8.75, fat:3.25`).
  2. Öğün satırına tıkla → "Nutrition" sheet açılır.
  3. Input değerleri: carbs "8.8", fat "3.3" gösteriyor (stored 8.75 / 3.25 yerine).
  4. Hiçbir alanı değiştirmeden "Kaydet".
- Beklenen: Aç-kaydet veriyi DEĞİŞTİRMEMELİ; gösterilen değer saklananla birebir olmalı.
- Gerçek: DB `carbs: 8.75→8.8`, `fat: 3.25→3.3` — sessiz veri mutasyonu. Uygulamanın
  kayıt yolu (MealForm.tsx:578-581) zaten 1 ondalığa yuvarlıyor ama burada gösterim DE
  yuvarlanıyor, yani kullanıcı elini sürmeden veri değişiyor.
- Kanıt: POST 8.75 → reload → NutritionSheet aç → inputs "8.8"/"3.3" → Kaydet → `/api/data`
  sonrası `carbs:8.8, fat:3.3`. Modal başlığı "Nutrition" olarak doğrulandı.

### [SEV4] Öğün satırı makro değerleri tr-TR biçimini atlıyor — "12.5g P" (nokta)
- Alan: Faz 1/2 / MealRow
- Kök neden: `src/components/MealRow.tsx:87-95` — `{meal.computed.protein}g P` çıplak JS sayısı;
  uygulamanın resmî biçimi `src/lib/format.ts:6-19` `formatNumber`/`formatGrams` = Intl tr-TR
  (virgül ondalık).
- Repro:
  1. Onluk makro değeri olan bir öğün ekle (örn. protein 12.5).
  2. Öğün satırına bak.
- Beklenen: tr-TR virgül → "12,5g P" (format.ts kuralı).
- Gerçek: "12.5g P" — ABD nokta stili. Aynı ekranda hero "250 / 2.600" (tr-TR binlik nokta) ile
  yan yana tutarsızlık.
- Kanıt: DOM text-node taraması: `"12.5"`, `"8.8"`, `"3.3"` (meal row) vs `"250 / 2.600"` (hero).
- Not: Ayrıca hero makro kartları yuvarlıyor ("13/145g" için 12.5) — kartlar `Math.round`,
  satır hassas değer; kasıtlı görünebilir, ana bulgu nokta-virgül.

### [SEV4] Trend özet etiketi "Son 7 gün ort." — pencere takvim günü değil KAYITLI gün sayıyor
- Alan: Faz 7 / TrendPage özet kutuları
- Kök neden: `src/lib/trend.ts:213` — `recentAvg = mean(recorded.slice(-STAT_WINDOW))`
  (STAT_WINDOW=7) ve `recorded` serideki yalnızca VERİSİ OLAN günlerden kuruluyor; 187-190
  yorumu bunu bilinçli seçiyor ("son 7 gün o 4 günü kullanır"). Etiket `TrendPage.tsx:131`.
- Repro:
  1. Seyrek kayıt (örn. aralıkta yalnızca 3-4 kayıtlı gün) olan bir hesapla Trend sekmesini aç.
  2. "Son 7 gün ort." kutusuna bak.
- Beklenen: Etiket pencerenin anlamını net vermeli — "son 7 takvim günü" vs "son 7 kayıtlı gün".
- Gerçek: Etiket "Son 7 gün ort." diyor ama değer verisi olan son 7 KAYITLI günün ortalaması;
  seyrek veride bu pencere haftalarca geriye uzanabilir. "Önceki 7 güne göre" (yüzde değişim) da
  aynı varsayımla: önceki 7 KAYITLI güne göre. Hint ("kayıtlı son 7 gün") doğru ama birincil
  etiket yanıltıcı — iki kutu farklı kaynak pencereden besleniyor izlenimi bırakıyor.
- Kanıt: trend.ts:187-190 yorumu + `STAT_WINDOW`; etiket TrendPage.tsx:131, hint satır 133.
- Not: Yoğun veride takvim≈kayıtlı farkı görünmez; yalnızca seyrek veride ortaya çıkar. SEV4 bilgi.

### [SEV4] "Bilinmiyor ≠ 0" ilkesi çekirdek makrolarda uygulanmıyor — girilmemiş K/P/Y/L "0/Xg", mikro'lar "—"
- Alan: Faz 9 / MacroCardGrid + MicroCardGrid (ana ekran)
- Kök neden: `src/types.ts:177-179` `ZERO_NUTRITION` çekirdek 5'i 0 tohumluyor;
  `src/lib/nutrition.ts:127-136` `addNutrition`; `src/lib/api.ts:37-45` `fill` (eksik çekirdek → 0,
  eksik mikro → `undefined`); `src/components/MacroCardGrid.tsx` undefined kontrolü YOK (ör.
  `consumed: total.carbs` doğrudan) — `MicroCardGrid.tsx:79-90` ise undefined → "—".
- Repro:
  1. Yalnızca kcal+protein içeren bir öğün ekle (AI analizi sık sık 1-2 makroyu atlar).
  2. Ana ekranın makro kartlarına bak.
- Beklenen: Girilmemiş bir makro "bilinmiyor" sayılmalı (mikro'lar gibi "—") — `types.ts:8-11`'in
  "0 mg göstermek yalan olur" ilkesi çekirdek için de geçerli.
- Gerçek: Karbonhidrat "0/456g", Yağ "0/70g", Lif "0/42g" — kullanıcı "0g karbonhidrat yedim"
  okuyor; Şeker/Sodyum ise "—". Aynı "girilmedi" durumu iki ayrı biçimde çiziliyor.
- Kanıt: Faz 9 öğün testi (yalnız kcal+protein) + snapshot; boş günde bile ayrım görünür
  (0/456g vs "—").
- Not: Çekirdek = her-zaman-sayı sözleşmesi kasıtlı (`src/lib/nutrients.ts:22-25`) ama gösterim
  katmanı "bilinmiyor" kavramını çekirdek makrolara taşımıyor; gün toplamı da ZERO_NUTRITION'la
  0'dan başladığı için boş günde bile "0g" doğuyor. SEV4 tutarsızlık.

---

## Faz 8 — Navigasyon / modal / FAB / back-stack: **0 bulgu**

- Çift-geri çıkış sözleşmesi: kökte 1. geri → "bir kez daha geri…" toast (2sn); 2. geri → çıkış
  akışı; pencerenin dışında tekrar toast. React state async olduğundan DOM kontrolü beklemeyle
  doğrulandı — doğru.
- FAB → modal yığınlama: FAB menüsü → öğün formu → geri → geri, geçmiş "FAB→geri→geri çıkar" hatalı
  yeniden açılma olmadan; `afterHistoryBackSettles` fix'i doğrulandı.
- Programatik-geri sayacı sızıntısı YOK (`consumeProgrammaticBack`/`afterHistoryBackSettles`);
  gerçek geri basışta toast hâlâ çıkıyor.
- Sekme değişimi açık modalı kapatıyor, kök `replaceState` korunuyor.
- Scroll-lock ref sayacı: ScanSheet çift-kilit + hızlı aç/kapa döngüsünde gövde scroll'u
  kilitlenmiyor/çözülüyor.
- FAB geçmiş hijyeni: sekme değişimi/arkasında yığılan girdi yok.

## Faz 9 — Uç senaryolar + tr-TR + onboarding: sonuçlar

- **tr-TR sayı ayrıştırma** (`parseNum`): "1,5"→1.5, "2.600"→2600 vb. testlerde mevcut
  (nutrition.test.ts) — doğru.
- **İlk yükleme hatası + kurtarma**: backend kapalıyken `auth.tsx:108-121` "Sunucuya ulaşılamadı"
  ekranı geliyor (AuthProvider boot kontrolü `DataProvider`'dan önce düşüyor — beklenen sıra);
  retry kapalıyken aynı ekranda kalıyor, backend açılınca veri kurtarılıyor. Doğru davranış,
  bulgu yok.
- **Onboarding TAMAMLA**: 5 adım → `updateGoals` (PUT /api/goals **200**, v2, kcal 3015) +
  `updateConfig("profile", …)` (tek çağrı; bmr 1748/tdee 3015 + hasCompletedOnboarding). Tarihsel
  400 bug'ı (`updateConfig("goals")`) **FIXED** — kod `updateGoals` kullanıyor.
- **Onboarding ATLA (X)**: sihirbaz kapanıyor, profil EZİLMEDİ (isim/kilo/BMR/TDEE aynen korundu,
  yalnızca `hasCompletedOnboarding:true` eklendi), hedefler değişmedi. Tarihsel "bayat profil ezme"
  bug'ı (`handleFinish`→`onClose`→`sihirbaziAtla`) **FIXED** — `sihirbazKaydettiRef` guard'ı çalışıyor.
- **Sihirbaz açıkken FAB**: modal kökü `z-[9999]` FAB'ı (z-50) tamamen örtüyor; gerçek dokunuşla
  FAB'a erişilemez (programatik `.click()` yalnızca test artefaktıydı). Bug değil.
- **Hızlı ardışık yazma yarışı**: aynı güne 2×POST + eşzamanlı PUT goals → ikisi de 200, son-yazan-
  kazanır (tüm-gün upsert sözleşmesi, `index.js:653-659`), crash yok, nihai durum tutarlı.

---

## Özet tablo

| Sev | Alan | Kısa açıklama | File:line |
|---|---|---|---|
| SEV3 | Öğün girişi | NutritionSheet aç-kaydet 2 ondalığı sessizce 1 ondalığa tırnaklıyor | `NutritionSheet.tsx:22-33` |
| SEV4 | Ana ekran | Öğün satırı seçim modunda çift birim "800 kcal kalori" | `MealRow.tsx:58` |
| SEV4 | Öğün girişi | Negatif makro kabul edilip kayıtta sessizce 0'a clamp'leniyor | `MealForm.tsx:576-585` |
| SEV4 | Öğün girişi | Miktar 1g minimumsuz — "0.5" → 0 kcal öğün | `MealForm.tsx:234-239` |
| SEV4 | Ana ekran | Öğün satırı makroları tr-TR virgülü atlıyor ("12.5g P") | `MealRow.tsx:87-95` |
| SEV4 | Trend | "Son 7 gün ort." aslında son 7 KAYITLI gün — etiket belirsiz | `trend.ts:213` |
| SEV4 | Ana ekran | Girilmemiş çekirdek makro "0g", mikro "—" — ilke tutarsız | `MacroCardGrid.tsx` |
