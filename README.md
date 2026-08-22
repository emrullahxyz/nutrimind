# Nutrimind (Besin Hafızası)

Türkçe, koyu tema, mobil öncelikli beslenme/öğün takip uygulaması. Farkı: **öğrenilen takma-ad
(alias) hafızası** — kullanıcı serbest metin yazar ("2 yumurta, yoğurt ve protein shake"), sistem
bunları daha önce öğrendiği belirli besinlere eşler, güven skoru verir, emin değilse sorar.

Canlı: <https://nutri.emrullah.xyz>

## Özellikler

- Serbest metinle öğün girişi + öğrenilen takma ad (alias) hafızası
- Güven skoruna dayalı doğrulama akışı
- Kamera ile etiket/barkod okuma
- Gemini AI ile görselden besin değeri çıkarma
- Günlük/aylık/yıllık raporlar, sağlık skoru, hedef takibi
- PWA desteği (service worker)

## Geliştirme

```bash
pnpm install    # bağımlılıkları kur
pnpm dev        # geliştirme sunucusu (5173)
```

**İki terminal gerekir:** biri backend (`node server/index.js` → 8790), diğeri Vite (`pnpm dev` → 5173).

Daha fazlası ve mimari detaylar için: **[AGENTS.md](AGENTS.md)**

## Komutlar

```bash
pnpm build      # tsc && vite build
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest run (2000+ test)
pnpm format     # prettier --write .
pnpm run deploy # dist/ → canlıya yükler
```

## Mimari

- **İstemci:** Vite + React + TypeScript + Tailwind CSS (kök dizin)
- **Sunucu:** `server/` altında sıfır-bağımlılıklı Node API (`node:http` + `node:sqlite`, Node 22+)
- **Veri:** SQLite (`server/data.db`)

```
src/
  components/   # UI bileşenleri
  pages/        # DailyPage, HistoryPage, AliasPage, ...
  hooks/        # useModalHistory, useModalExit, ...
  lib/          # data.tsx (context), api.ts, ai.ts, nutrition.ts, ...
server/         # Node API (index.js donmuş — AGENTS.md'ye bak)
docs/           # Dokümantasyon ve arşiv
tasks/          # todo.md + lessons.md (aktif iş takibi)
```
