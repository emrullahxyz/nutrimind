# CLAUDE.md

Bu dosya, bu depoda çalışırken Claude Code'a (claude.ai/code) rehberlik eder.

## Bu proje nedir

**Nutrimind ("Besin Hafızası")** — Türkçe, koyu tema, mobil öncelikli bir beslenme/öğün takip uygulaması. Farkı: **öğrenilen takma-ad (alias) hafızası** — kullanıcı serbest metin yazar ("2 yumurta, yoğurt ve protein shake"), sistem ifadeleri daha önce öğrendiği belirli besinlere eşler, güven skoru verir, yalnızca emin değilse sorar, öğünü kaydeder ve günlük toplamları günceller.

## Mimari (sadeleştirilmiş — tek uygulama)

Proje eskiden 5 paketli bir pnpm monorepo (core/db/api/cli/web) + Docker MariaDB idi; hızlı ilerlemek için **kökte tek bir Vite + React + TypeScript + Tailwind uygulamasına** indirildi.

```
index.html  package.json  tsconfig.json  vite.config.ts
tailwind.config.js  postcss.config.js  deploy.sh
src/
  main.tsx  App.tsx  index.css
  types.ts             # domain tipleri (tek doğruluk kaynağı)
  components/*         # UI bileşenleri (CalorieRing, MacroBar, Modal, FormBits, *Form, ...)
  pages/*              # DailyPage, HistoryPage, AliasPage
  lib/api.ts           # tipli fetch istemcisi + yazma uçları
  lib/data.tsx         # React context: veri + aksiyonlar ("mutate → refetch")
  lib/days.ts  lib/weeks.ts    # gün/hafta türetmeleri
  lib/nutrition.ts     # parseNum (tr-TR) + scaleNutrition   (+ .test.ts, vitest)
  lib/format.ts        # tr-TR biçimlendirme
server/
  index.js             # sıfır bağımlılık API (node:http + node:sqlite), Node 22+
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
- Yazma deseni: **"mutate → refetch"**, iyimser güncelleme YOK. Gün yazımı günün **tüm** öğün dizisini
  değiştirir (boş dizi = günü sil), bu yüzden payload'ı kayıt anında `mealsOf(days, date)`'ten **taze**
  türet — closure'daki eski diziyi kullanma.

## Komutlar

```bash
pnpm install
pnpm dev          # Vite → http://localhost:5173   ← 127.0.0.1:5173 ÇALIŞMAZ
pnpm build        # tsc && vite build
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run  (12 test)
pnpm format       # prettier --write .
pnpm run deploy   # dist/ → nutri.emrullah.xyz   ← "run" ŞART, çıplak `pnpm deploy` pnpm'in kendi komutuna gider
```

**Yerel geliştirme İKİ terminal ister** — Vite tek başına veri göremez:

```bash
node server/index.js     # backend, 127.0.0.1:8790
pnpm dev                 # Vite, /api proxy'li
```

Doğrulama kapısı: `pnpm typecheck` (0 hata) + `pnpm test` (12/12) + `pnpm build` (✓ built).

## Tasarım token'ları

Hifi token'ları `tailwind.config.js`'te tanımlı: bg `#08090a`, protein `#34d399`, karbonhidrat `#fb923c`, yağ `#fbbf24`, hafıza/lif `#a78bfa`; fontlar Manrope + JetBrains Mono. **Ham hex yerine semantik sınıflarla** stil ver (`text-protein`, `bg-app`, `text-memory`, …).

## Salt-okunur referanslar (ASLA düzenleme / import etme / gönderme)

- `README.md` — yetkili ürün/tasarım/veri sözleşmesi.
- `Besin Hafızası.dc.html` — yüksek sadakatli görsel referans (bağlayıcı).
- `Wireframes.dc.html` — düşük sadakatli akışlar.
- `support.js` — yalnızca önizleme çalışma-zamanı; asla ship/import etme.
- `eski veriler ('Emrullah' kullanıcısı).json` — göç (seed) kaynağı. **İki ardışık üst-düzey JSON nesnesidir** (profil+günler, sonra alias'lar) — tek-belge geçerli JSON DEĞİL; ayrıştırmadan önce iki nesneyi ayır ve eksik/parçalı `nutrition` içeren öğünlere tolerans göster.

## İlke

**Local-first:** her şey herhangi bir uzak işlemden önce localhost'ta çalışmalı ve doğrulanmalı.
