# CLAUDE.md

Bu dosya, bu depoda çalışırken Claude Code'a (claude.ai/code) rehberlik eder.

## Bu proje nedir

**Nutrimind ("Besin Hafızası")** — Türkçe, koyu tema, mobil öncelikli bir beslenme/öğün takip uygulaması. Farkı: **öğrenilen takma-ad (alias) hafızası** — kullanıcı serbest metin yazar ("2 yumurta, yoğurt ve protein shake"), sistem ifadeleri daha önce öğrendiği belirli besinlere eşler, güven skoru verir, yalnızca emin değilse sorar, öğünü kaydeder ve günlük toplamları günceller.

## Mimari (sadeleştirilmiş — tek uygulama)

Proje eskiden 5 paketli bir pnpm monorepo (core/db/api/cli/web) + Docker MariaDB idi; hızlı ilerlemek için **kökte tek bir Vite + React + TypeScript + Tailwind uygulamasına** indirildi. 2026-08-02'de bir "CAL AI" görsel klonu + Gemini AI entegrasyonu turu geçirdi (aşağıdaki "Faz 2: Gemini AI" ve "CAL AI görsel klonu" bölümlerine bak) — bu CLAUDE.md o turdan sonraki hâli yansıtıyor.

```
index.html  package.json  tsconfig.json  vite.config.ts
tailwind.config.js  postcss.config.js  deploy.sh
src/
  main.tsx  App.tsx  index.css
  types.ts             # domain tipleri (tek doğruluk kaynağı)
  components/*         # CalorieRing, HeroCalorieCard, MacroCardGrid, MacroBar,
                        # WeekStrip, StreakCard, Collapsible, MealRow, Skeleton,
                        # BottomNav, FAB, Modal, FormBits, *Form, ...
  pages/*              # DailyPage, HistoryPage (Haftalar+Trend tek akışta), AliasPage
  lib/api.ts           # tipli fetch istemcisi + yazma uçları
  lib/ai.ts            # Gemini AI proxy istemcisi (off.ts ile aynı desen — kendi hata sınıfı)
  lib/data.tsx         # React context: veri + aksiyonlar ("mutate → refetch")
  lib/days.ts  lib/weeks.ts  lib/streak.ts   # gün/hafta/seri türetmeleri
  lib/nutrition.ts     # parseNum (tr-TR) + scaleNutrition   (+ .test.ts, vitest)
  lib/format.ts        # tr-TR biçimlendirme
server/
  index.js             # sıfır bağımlılık API (node:http + node:sqlite), Node 22+
  ai.js                # Gemini proxy — İZOLE modül, index.js'e 2-3 satırlık köprüyle bağlı
  package.json         # {"type":"commonjs"} — kökteki "type":"module"u ezmek için ŞART
  data.db              # SQLite dosyası
docs/                  # handoff/, analysis/, superpowers/ (plan + spec)
reference/legacy-db/   # eski Drizzle seed.ts + schema.sql (tohumlama referansı)
```

- `src/types.ts` **paylaşılan sözleşmedir** — tipleri buradan içe aktar.
- Veri katmanı: **SQLite (dosya tabanlı, Docker yok)** — `server/index.js` içinde `node:sqlite` ile
  kurulu ve çalışıyor. Yazma uçları hazır: `POST /api/day`, `DELETE /api/day/:date`, `PUT /api/goals`,
  `POST /api/alias`, `DELETE /api/alias/:id`.
- **`server/index.js` donmuş kabul edilir** — özellik işi frontend'de yapılır. Değiştirmeden önce sor.
  **İstisna deseni (2026-08-02'de kuruldu):** yeni bir backend özelliği (ör. Faz 2'nin Gemini proxy'si)
  gerekiyorsa, mantığı `server/ai.js` gibi **ayrı, izole bir modülde** yaz; `index.js`'e yalnızca
  `require(...)` + tek bir `if` route bloğu ekle (bkz. `server/ai.js`'in başındaki "instanceof HttpError"
  notu — izole modül asla throw ETMEZ, her zaman `{status, body}` döner, aksi halde index.js'in paylaşılan
  catch'i hatayı sessizce 500'e düşürür). Bu, "donmuş" kuralını bozmadan gerçek backend işi yapmanın
  kurulmuş yolu.
- Yazma deseni: **"mutate → refetch"**, iyimser güncelleme YOK. Gün yazımı günün **tüm** öğün dizisini
  değiştirir (boş dizi = günü sil), bu yüzden payload'ı kayıt anında `mealsOf(days, date)`'ten **taze**
  türet — closure'daki eski diziyi kullanma.

## Faz 2: Gemini AI entegrasyonu (doğal dil öğün girişi)

`MealForm.tsx`'in "AI ile" modu → `src/lib/ai.ts`'in `parseWithAI()`'ı → `POST /api/ai/parse` →
`server/index.js`'in köprüsü → `server/ai.js`'in `parseMealText()`'i → Gemini `generateContent` REST
ucu (native `fetch`, SDK bağımlılığı YOK). Kill-switch: `.env`'deki `NUTRIMIND_LLM_PROVIDER` `"gemini"`
DIŞINDA bir şeyse uç 503 döner — prod'a kod gitse bile bilinçli açılana kadar özellik inaktif kalır.
Gerçek anahtar + değişkenler için `.env.example`'a bak. Confidence eşiği (`NUTRIMIND_CONFIDENCE_THRESHOLD`,
varsayılan 0.8) sunucuda hesaplanır, istemciye yalnızca `needsReview:true/false` sızar.

**Prod durumu (2026-08-02):** Backend Oracle sunucusuna (`/home/emrullah/nutri-api/`) kopyalandı,
`nutri-api.service` yeniden başlatıldı, çalışıyor. **Anahtarın bağlı olduğu Google Cloud projesinde kota 0**
— bu bir hesap/faturalandırma ayarı, kod tarafında yapılacak bir şey yok. `server/ai.js`'in `.env` yolu
İKİ olası yerleşimi de dener (yanında / bir üst dizinde) çünkü yerel repo yapısı (`server/` alt klasörlü)
ile prod'un düz dizin yerleşimi (`/home/emrullah/nutri-api/index.js` + `ai.js`, alt klasörsüz) farklı.

## CAL AI görsel klonu (plan dışı, ayrı bir iş)

Kullanıcının **kendi başına, bu Claude oturumu dışında** çalıştırdığı ayrı bir agy oturumu, CAL AI'ın
ekran görüntülerine bakarak bir görsel klon yaptı: `BottomNav`, `FAB`, `HeroCalorieCard`, `MacroCardGrid`,
`WeekStrip`, yeni renk paleti. Bu, orijinal 5 fazlık yükseltme planının (`docs/analysis/2026-08-02-*`)
PARÇASI DEĞİL — ayrı, sonradan gelen bir yön değişikliği. Claude bunun üzerine 3 cila geçirdi: halka
sadeleştirme (gömülü modda sade alev ikonu), FAB 2x2 ızgara menüsü, `HistoryPage`'in "Haftalar"/"Trend"
ayrık sekmeleri yerine tek sürekli akışa (üstte `StreakCard`) geçirilmesi.

## Kamera (2026-08-06'da yeniden yazıldı)

Tarama ekranı **tam ekran bir kamera**: üç canlı mod (🍽️ Yemek / 🏷️ Etiket / 📊 Barkod) + bir
**Galeri** eylemi. Galeri bir mod DEĞİL — dosya seçiciyi açar, seçim bitince kullanıcı yine içinde
bulunduğu canlı moda döner.

- `src/lib/camera.ts` — kamera yaşam döngüsü (`useCameraStream`) barkod taramadan
  (`useBarcodeDetection`) **ayrıdır**. Eskiden `cameraScanSupported()` önce `BarcodeDetector`
  arıyordu; dedektör iOS Safari'de olmadığı için o cihazlarda yemek/etiket çekimi için kamera
  hiç açılmıyordu. Yeni `cameraSupported()` yalnızca `getUserMedia` + güvenli bağlam ister.
- **Asist çerçevesi dekor değil**: `guideRectFor(mode, w, h)` çerçeveyi verir, `cropRectFor(...)`
  onu videonun kendi piksellerine çevirir (`object-cover` ölçek/ofsetiyle) ve deklanşör kareyi
  tam olarak oraya **kırpar** — model tüm sahne yerine sadece etiketi/tabağı görüyor. Bu yüzden
  çerçeveye geçiş animasyonu YOK: görünen dikdörtgen ile kırpılan bölge ayrışmamalı.
- Deklanşör → `captureVideoFrame()` → `parseMealImage()` → `onVisionResult()` → `MealForm`.
- Öğün kaydının **üç** yolu var: "Öğüne + hafızaya", "Sadece öğüne" (ifade İSTEMEZ, `sources` yazmaz),
  "Sadece hafızaya".
- Kamerasız/dedektörsüz cihazlarda özellik ölmez: galeri ve elle barkod her zaman erişilebilir.

`/api/ai/vision` **çalışıyor** (`6b01628` ile geldi; 2026-08-06'da uçtan uca doğrulandı — Gemini
kırpılmış etiketten kcal/protein/karbonhidrat/yağ/lif değerlerini birebir okudu).

## Komutlar

```bash
pnpm install
pnpm dev          # Vite → http://localhost:5173   ← 127.0.0.1:5173 ÇALIŞMAZ
pnpm build        # tsc && vite build
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run  (test sayısı proje büyüdükçe artar)
pnpm format       # prettier --write .
pnpm run deploy   # dist/ → nutri.emrullah.xyz   ← "run" ŞART, çıplak `pnpm deploy` pnpm'in kendi komutuna gider.
                    # Canlıya çıkış yalnızca `/deploy-nutri` skill'i ile: kapı + git durumu doğrulanır, Claude doğrudan çalıştırmaz.
```

**Yerel geliştirme İKİ terminal ister** — Vite tek başına veri göremez:

```bash
node server/index.js     # backend, 127.0.0.1:8790
pnpm dev                 # Vite, /api proxy'li
```

Doğrulama kapısı: `pnpm typecheck` (0 hata) + `pnpm test` (tüm testler geçmeli) + `pnpm build` (✓ built).

`pnpm preview` (4173) artık `/api`'yi de vekilliyor — **üretim derlemesi yerelde uçtan uca
denenebilir.** Dev'de görünmeyen davranışlar (React StrictMode efektleri iki kez çalıştırır,
service worker yalnızca PROD'da kaydolur) yalnızca burada ortaya çıkar.

## Tasarım token'ları

`tailwind.config.js`'te tanımlı (2026-08-02'de CAL AI paletine geçti — eski hifi yeşil/turuncu/sarı
DEĞİL): bg `#0D0D14`, protein `#FF6B8A` (pembe-kırmızı), karbonhidrat `#FFB84D` (turuncu-altın), yağ
`#5B8DEF` (mavi), fab/accent `#4DD4E6` (camgöbeği), hafıza/lif `#a78bfa`; kart yüzeyleri `calCard`/
`calBorder`; fontlar Manrope + JetBrains Mono. **Ham hex yerine semantik sınıflarla** stil ver
(`text-protein`, `bg-app`, `text-memory`, …).

## Salt-okunur referanslar (ASLA düzenleme / import etme / gönderme)

- `README.md` — yetkili ürün/tasarım/veri sözleşmesi.
- `Besin Hafızası.dc.html` — yüksek sadakatli görsel referans (bağlayıcı).
- `Wireframes.dc.html` — düşük sadakatli akışlar.
- `support.js` — yalnızca önizleme çalışma-zamanı; asla ship/import etme.
- `eski veriler ('Emrullah' kullanıcısı).json` — göç (seed) kaynağı. **İki ardışık üst-düzey JSON nesnesidir** (profil+günler, sonra alias'lar) — tek-belge geçerli JSON DEĞİL; ayrıştırmadan önce iki nesneyi ayır ve eksik/parçalı `nutrition` içeren öğünlere tolerans göster.

## İlke

**Local-first:** her şey herhangi bir uzak işlemden önce localhost'ta çalışmalı ve doğrulanmalı.

## İş Akışı Kuralları (Workflow Orchestration)

### 1. Plan Mode Varsayılan
- 3+ adımlı veya mimari karar gerektiren HERHANGİ bir işte plan moduna geç.
- Bir şey ters giderse hemen DUR ve yeniden planla — zorlamaya devam etme.
- Plan modunu sadece inşa için değil, doğrulama adımları için de kullan.
- Belirsizliği azaltmak için önceden detaylı spesifikasyon yaz.

### 2. Subagent Stratejisi
- Ana context'i temiz tutmak için subagent'ları serbestçe kullan.
- Araştırma, keşif ve paralel analizi subagent'lara devret.
- Karmaşık problemlerde subagent'lar üzerinden daha fazla compute harca.
- Her subagent'a tek, odaklı bir görev ver.

### 3. Kendini Geliştirme Döngüsü
- Kullanıcıdan HERHANGİ bir düzeltme geldikten sonra: `tasks/lessons.md`'yi o kalıpla güncelle.
- Aynı hatayı önleyecek kendi kurallarını yaz.
- Bu dersleri hata oranı düşene kadar acımasızca iyileştir.
- Oturum başında ilgili proje için dersleri gözden geçir.

### 4. Bitirmeden Önce Doğrulama
- Çalıştığını kanıtlamadan bir görevi tamamlanmış olarak işaretleme.
- İlgili olduğunda main ile değişikliklerin davranışını diff'le.
- Kendine sor: "Bir kıdemli mühendis bunu onaylar mıydı?"
- Testleri çalıştır, logları kontrol et, doğruluğu göster.

### 5. Zarafeti Talep Et (Dengeli)
- Önemsiz olmayan değişikliklerde dur ve sor: "Daha zarif bir yolu var mı?"
- Bir çözüm hacky hissettiriyorsa: "Şimdi bildiğin her şeyi bilerek, zarif çözümü uygula."
- Basit, açık düzeltmelerde bunu atla — aşırı mühendislik yapma.
- Sunmadan önce kendi işini sorgula.

### 6. Otonom Hata Düzeltme
- Bir hata raporu geldiğinde: direkt düzelt, elini tutmasını isteme.
- Logları, hataları, başarısız testleri işaret et — sonra çöz.
- Kullanıcıdan sıfır context switching gerekmeli.
- CI testleri, sana nasıl yapılacağı söylenmeden düzelt.
- **İstisna: `server/index.js`.** Yukarıdaki "donmuş kabul edilir — değiştirmeden önce sor" kuralı
  (bkz. "Mimari" bölümü) bu otonom hata düzeltme kuralına göre önceliklidir. `server/index.js`'i
  etkileyen bir hata/bug bulursan bile, önce kullanıcıya danış; sormadan direkt değiştirme. Yeni
  backend mantığı gerekiyorsa zaten kurulmuş izole modül deseni (`server/ai.js` gibi) geçerli kalır.

---

## Görev Yönetimi (Task Management)

1. **Önce Planla**: Planı işaretlenebilir maddelerle `tasks/todo.md`'ye yaz.
2. **Planı Doğrula**: Uygulamaya başlamadan önce kullanıcıya danış.
3. **İlerlemeyi Takip Et**: İlerledikçe maddeleri tamamlandı olarak işaretle.
4. **Değişiklikleri Açıkla**: Her adımda üst düzey özet ver.
5. **Sonuçları Belgele**: `tasks/todo.md`'ye bir inceleme (review) bölümü ekle.
6. **Dersleri Yakala**: Düzeltmelerden sonra `tasks/lessons.md`'yi güncelle.

---

## Temel İlkeler (genişletilmiş)

- **Basitlik Önce**: Her değişikliği olabildiğince basit tut. Minimal kodu etkile.
- **Tembellik Yok**: Kök nedenleri bul. Geçici düzeltme yok. Kıdemli geliştirici standartları.
- **Minimal Etki**: Değişiklikler sadece gerekli olanı etkilemeli. Yeni bug'lar eklemekten kaçın.

(Yukarıdaki Local-first kuralıyla birlikte geçerlidir.)
