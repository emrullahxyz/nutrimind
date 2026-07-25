# CLAUDE.md

Bu dosya, bu depoda çalışırken Claude Code'a (claude.ai/code) rehberlik eder.

## Bu proje nedir

**Nutrimind ("Besin Hafızası")** — Türkçe, koyu tema, mobil öncelikli bir beslenme/öğün takip uygulaması. Farkı: **öğrenilen takma-ad (alias) hafızası** — kullanıcı serbest metin yazar ("2 yumurta, yoğurt ve protein shake"), sistem ifadeleri daha önce öğrendiği belirli besinlere eşler, güven skoru verir, yalnızca emin değilse sorar, öğünü kaydeder ve günlük toplamları günceller.

## Mimari (sadeleştirilmiş — tek uygulama)

Proje eskiden 5 paketli bir pnpm monorepo (core/db/api/cli/web) + Docker MariaDB idi; hızlı ilerlemek için **kökte tek bir Vite + React + TypeScript + Tailwind uygulamasına** indirildi.

```
index.html  package.json  tsconfig.json  vite.config.ts
tailwind.config.js  postcss.config.js
src/
  main.tsx  App.tsx  index.css
  types.ts            # domain tipleri (tek doğruluk kaynağı)
  components/*         # UI bileşenleri (CalorieRing, MacroBar, Card, Chip, ...)
  lib/api.ts          # tipli fetch istemcisi   lib/format.ts # tr-TR biçimlendirme
reference/legacy-db/  # eski Drizzle seed.ts + schema.sql (SQLite tohumlaması için referans)
```

- `src/types.ts` **paylaşılan sözleşmedir** — tipleri buradan içe aktar.
- Veri katmanı: **SQLite (dosya tabanlı, Docker yok)** — bir sonraki adımda eklenecek. Referans DB mantığı `reference/legacy-db/` altında.

## Komutlar

```bash
pnpm install
pnpm dev          # Vite → http://localhost:5173
pnpm build        # tsc && vite build
pnpm typecheck    # tsc --noEmit
pnpm format       # prettier --write .
```

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
