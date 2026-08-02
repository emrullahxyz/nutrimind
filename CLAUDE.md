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

**Tarama ekranındaki "Food Label" ve "Gallery" modları şu an KOZMETİK** — alttaki tarayıcı hâlâ salt
barkod dedektörü (`useOffScanner`/`BarcodeDetector`), gerçek OCR/görsel analiz YOK. Bu, orijinal planın
Faz 5'i (`/api/ai/vision`, Besin Etiketi OCR) — henüz inşa edilmedi.

## Komutlar

```bash
pnpm install
pnpm dev          # Vite → http://localhost:5173   ← 127.0.0.1:5173 ÇALIŞMAZ
pnpm build        # tsc && vite build
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run  (314 test)
pnpm format       # prettier --write .
pnpm run deploy   # dist/ → nutri.emrullah.xyz   ← "run" ŞART, çıplak `pnpm deploy` pnpm'in kendi komutuna gider
```

**Yerel geliştirme İKİ terminal ister** — Vite tek başına veri göremez:

```bash
node server/index.js     # backend, 127.0.0.1:8790
pnpm dev                 # Vite, /api proxy'li
```

Doğrulama kapısı: `pnpm typecheck` (0 hata) + `pnpm test` (314/314) + `pnpm build` (✓ built).

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
