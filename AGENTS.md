# AGENTS.md

Bu dosya, bu depoyla çalışan **tüm AI ajanları ve geliştiriciler** için tek doğruluk kaynağıdır
(Claude Code, Cursor, Copilot, Codex, Cline vb. fark etmez). Başlamadan önce oku.

## Proje nedir?

**Nutrimind ("Besin Hafızası")** — Türkçe, koyu tema, mobil öncelikli bir beslenme/öğün takip
uygulaması. Farkı: **öğrenilen takma-ad (alias) hafızası** — kullanıcı serbest metin yazar
("2 yumurta, yoğurt ve protein shake"), sistem ifadeleri daha önce öğrendiği belirli besinlere
eşler, güven skoru verir, yalnızca emin değilse sorar, öğünü kaydeder ve günlük toplamları günceller.
Ayrıca kamera ile etiket/barkod okuma ve Gemini AI ile görselden besin değeri çıkarma özellikleri vardır.

Canlı: <https://nutri.emrullah.xyz>

## Hızlı Başlangıç

```bash
pnpm install
node server/index.js     # backend, 127.0.0.1:8790 (ayrı terminal)
pnpm dev                 # Vite → http://localhost:5173
```

- **İKİ terminal gerekir** — Vite tek başına veri göremez.
- Vite'in `/api` proxy'si aynı makinedeki Node backend'ine gider.
- `pnpm preview` (4173) da `/api`'yi vekilliyor — **üretim derlemesi yerelde uçtan uca test edilebilir.**
  Dev'de görünmeyen davranışlar (React StrictMode efektleri iki kez çalıştırır, service worker yalnızca
  prod'da kaydolur) yalnızca burada ortaya çıkar.

## Komutlar

```bash
pnpm install    # bağımlılıkları kur
pnpm dev        # geliştirme sunucusu (5173) — backend ayrı çalışmalı
pnpm build      # tsc && vite build
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest run (2000+ test)
pnpm format     # prettier --write .
pnpm run deploy # dist/ → canlıya yükler. "run" ŞART, çıplak `pnpm deploy` pnpm'in kendi komutuna gider.
```

**Doğrulama kapısı (bitirmeden önce çalıştır):** `pnpm typecheck` (0 hata) + `pnpm test` (tümü geçmeli) + `pnpm build` (✓ built).

## Mimari

Tek bir Vite + React + TypeScript + Tailwind uygulaması (kök dizin) + `server/` altında sıfır-bağımlılıklı
bir Node API (node:http + node:sqlite, Node 22+).

```
src/
  main.tsx  App.tsx  index.css
  types.ts             # domain tipleri (tek doğruluk kaynağı)
  components/          # UI bileşenleri (görünüme göre alt klasörleme YOK, düz)
  pages/               # DailyPage, HistoryPage, AliasPage, ...
  hooks/               # useModalHistory, useModalExit, useBodyScrollLock, ...
  lib/                 # yardımcılar: data.tsx (context), api.ts, ai.ts, nutrition.ts, ...
  i18n/                # react-i18next: i18n.ts, locales/{en,tr,pl}.json
server/
  index.js             # giriş noktası, node:http + node:sqlite (DONMUŞ, aşağıya bak)
  ai.js                # Gemini proxy — İZole modül
  auth.js, googleAuth.js, authRoutes.js, migrate.js, setpassword.js
  data.db              # SQLite veritabanı (çalışma anında oluşur, repo'da YOK)
public/                # statik dosyalar, service worker, manifest.webmanifest, privacy.html
android/               # Capacitor Android wrapper (kaynak kodu, build artifact'leri .gitignore'da)
capacitor.config.ts    # appId: com.emrullah.nutrimind, webDir: dist
docs/archive/          # arşivlenmiş eski dokümanlar (salt-okunur, silme)
tasks/                 # todo.md + lessons.md (aktif iş takibi)
```

## Kritik Kurallar

1. **`server/index.js` DONMUŞTUR** — değiştirmeden önce kullanıcıya sor. Yeni backend mantığı
   gerekiyorsa `server/ai.js` gibi **izole bir modülde** yaz; `index.js`'e yalnızca
   `require(...)` + tek bir `if` route bloğu eklenir. İzole modül asla `throw` etmez, her zaman
   `{status, body}` döner.
2. **Salt-okunur tasarım referansları** (ASLA düzenleme/import etme/silme): `README.md` (ürün
   sözleşmesi), `Besin Hafızası.dc.html`, `Wireframes.dc.html`, `support.js`, `docs/archive/`.
3. **Yazma deseni:** "mutate → refetch", iyimser güncelleme YOK. Gün yazımı günün TÜM öğün dizisini
   değiştirir (boş dizi = günü sil).
4. **Yerel geliştirme iki terminal ister** (yukarıya bak). Kod değişikliği gerektiren her işten önce
   `pnpm typecheck` çalıştırılmalı.
5. **Veri güvenliği:** `server/data.db` canlı SQLite dosyasıdır; asla elle düzenleme. Sırlar
   `.env`'de tutulur, asla commit'lenmez. Kullanıcı veri silme (`POST /api/auth/account`)
   atomik transaction; OAuth revoke YAPILMAZ.
6. **i18n kuralı (değişti):** UI metinleri hardcode Türkçe DEĞİL — `useTranslation()` + `t('key.path')`
   kullan. Anahtarlar `src/i18n/locales/{en,tr,pl}.json` içinde. Yeni metin eklerken
   3 dile de ekle. navigator.language otomatik algılama (EN default). localStorage override.
7. **Play Store / Capacitor:** TWA için `public/.well-known/assetlinks.json` SHA-256 fingerprint
   ile dolu olmalı (boşsa placeholder). `android/` kaynak kodu commit'lenir; `*.jks`, `*.keystore`,
   `android/app/build/` ASLA commit'lenmez.

## Mimari Notlar

- **Backend donmuş sayılır** (madde 1'e bak) — özellikle `server/index.js`'i değiştirmeden önce kullanıcıya danış.
- `src/types.ts` paylaşılan sözleşmedir — tipleri oradan içe aktar.
- Veri katmanı: SQLite (dosya tabanlı, Docker yok). `server/index.js` içinde `node:sqlite` ile kurulu.
- Yazma uçları hazır: `POST /api/day`, `DELETE /api/day/:date`, `PUT /api/goals`, `POST /api/alias`, `DELETE /api/alias/:id`.
- Gemini AI entegrasyonu `src/lib/ai.ts` (istemci) → `POST /api/ai/parse` → `server/ai.js` şeklindedir.
  Kill-switch: `.env`'deki `NUTRIMIND_LLM_PROVIDER` değeri `"gemini"` değilse 503 döner.
- Kamera akışı: `src/lib/camera.ts` (kamera yaşam döngüsü) + `src/lib/scan.ts` (barkod tarama) ayrıdır.
- Çevrimdışı yazma: `src/lib/offlineCache.ts` (IndexedDB v2 kuyruk) + `offlineProjection.ts`
  (saf projeksiyon) + `offlineSync.ts` (conflict korumalı sync) + `components/SyncStatus.tsx`;
  ağ gerektiren özellikler `offline` context bayrağıyla kilitlenir (bkz. docs/operations/offline.md).
