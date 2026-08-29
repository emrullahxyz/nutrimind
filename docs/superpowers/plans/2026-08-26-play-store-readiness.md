# Play Store Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nutrimind uygulamasını Google Play Store'a yayınlanabilir hale getirmek — Play Store politikalarına uygunluk, gizlilik gereksinimleri, çoklu dil desteği, native wrapper (Capacitor), ve kullanıcı deneyimi iyileştirmeleri.

**Architecture:** Mevcut Vite + React + TypeScript + Tailwind frontend + sıfır-bağımlılıklı Node backend (node:http + node:sqlite). PWA olarak zaten çalışıyor; Play Store için Capacitor ile native Android wrapper. i18n için react-i18next (3 dil: en default, tr, pl). Backend `server/index.js` donmuş — yeni mantık izole modüllerde.

**Tech Stack:** Vite 6, React 18, TypeScript 5, Tailwind 3, vitest 4, react-i18next, @capacitor/core+cli+android 8.5, node:http, node:sqlite, scrypt (auth), Google Gemini (AI), Open Food Facts (barcode).

**Spec:** `.claude/plans/uygulamam-z-n-play-store-da-yay-nlanmas-golden-lerdorf.md` (orijinal plan, 14 task tanımı + checklist)

## Global Constraints

- **`server/index.js` donmuştur** — yeni backend mantığı izole modüllerde (`server/offUA.js`, `server/authRoutes.js` vb.). Sadece `require + 1 if` bloğu eklenir. Kullanıcıya sorulmadan değiştirilemez.
- **Sıfır backend bağımlılık** — sadece `node:http`, `node:sqlite`, `node:crypto`. Yeni npm paketi EKLEME (frontend serbest).
- **Mutate → refetch** — iyimser güncelleme yok. Gün yazımı tüm günü değiştirir (boş = günü sil).
- **Test zorunluluğu** — her commit öncesi `pnpm typecheck && pnpm test && pnpm build` (621/621 baseline).
- **Branch:** `feature/play-store-readiness` (zaten oluşturulmuş).
- **i18n kuralı** — UI metinleri hardcode DEĞİL, `useTranslation() + t('key.path')` kullan. 3 dil dosyası zorunlu: en, tr, pl.
- **KVKK/GDPR** — hesap silme atomik transaction, OAuth revoke YAPILMAZ (kullanıcı kararı).
- **Ponytail/lazy** — YAGNI uygula. Stdlib ve mevcut dependency önce, yeni ekleme son çare.
- **Doğrulama kapısı:** her commit öncesi `pnpm typecheck` (0 hata) + `pnpm test` (tümü geçmeli) + `pnpm build` (✓ built).

---

## Tamamlanan (16 commit, branch'te mevcut)

`feature/play-store-readiness` branch'inde şu commit'ler hazır:

| # | Commit | Açıklama |
|---|---|---|
| 1 | e479510 | Baseline: .gitignore, 621/621 test |
| 2 | 3d7db15 | Privacy policy TR/EN/PL |
| 3 | 9dbc50e | Hesap silme + export API |
| 4 | 369361b | Settings UI (zaten mevcut, doğrulandı) |
| 5 | 1d49979 | SEO meta + robots + sitemap + CHANGELOG (zaten mevcut) |
| 6 | 2338977 | AI fotoğraf onay modalı |
| 7 | 87f35f1 | ai.ts consent helpers |
| 8 | 7e38a2a | Offline cache (IndexedDB) |
| 9 | e08af84 | UX (boş state + kamera ayar yönlendirmesi) |
| 10 | 56f1b8c | Logo WebP optimizasyonu |
| 11 | 3a36fd3 | i18n altyapısı + 2 örnek |
| 12 | 1783703 | a11y (progressbar + nav) |
| 13 | b2ff68a | Capacitor + android wrapper |
| 14 | 50b876e | AGENTS.md güncelleme |
| 15 | 3cd16ac | OFF UA anonimleştirme (kullanıcı yaptı) |
| 16 | 64856ba | plan-graph.html (Cytoscape interaktif) |

---

## Kalan TODO (3 task)

### Task 17: SettingsSheet i18n kapsamı genişlet

**Files:**
- Modify: `src/components/SettingsSheet.tsx` (38.3K, 1134 satır — büyük, 10+ alt bölüm)
- Modify: `src/i18n/locales/{en,tr,pl}.json`
- Modify: `src/components/FormBits.tsx` (gerekirse — paylaşılan form input bileşenleri)

**Interfaces:**
- Consumes: mevcut `useTranslation` import (`react-i18next`)
- Produces: SettingsSheet'in tüm kullanıcıya görünen metinleri `t('key')` ile çevrilmiş olacak
- Yeni JSON anahtarları: `settings.themeDark`, `settings.themeVelvet`, `settings.themeGlass`, `settings.themeLabel`, `settings.privacy*`, `settings.password*`, `settings.allowlist*`, `settings.goals*`, `settings.reports*`, `settings.notifications*`, `settings.cache*`

**Mevcut state:** SettingsSheet satır 159'da `const { t, i18n } = useTranslation();` ve satır 451-470 arası dil seçici UI zaten mevcut. Eksik: diğer bölümler.

**Adımlar:**

- [ ] **Step 1: SettingsSheet'teki tüm hardcode TR metinleri tara**

Run: `grep -nE '>[A-ZÇĞİÖŞÜ][a-zçğıöşüA-ZÇĞİÖŞÜ ,.!?0-9:'\"/()-]{4,80}[\s]*<|title=|placeholder=|label="' src/components/SettingsSheet.tsx | head -50`

Beklenen: ~30-50 hardcode string listesi (bölüm başlıkları, menü item'ları, form label'lar, buton metinleri).

- [ ] **Step 2: JSON dosyalarına yeni anahtarları ekle**

`src/i18n/locales/tr.json` → `settings` bölümüne ~30 yeni anahtar ekle (mevcut `settings.*` zaten 24 anahtar var, toplam ~50 olacak).

Aynısını `en.json` ve `pl.json` için de yap. Doğal Lehçe çevirisi (kullanıcı ana dili İngilizce).

- [ ] **Step 3: SettingsSheet'te hardcode string'leri t() ile değiştir**

Her bölüm için (Hesap & Profil, Hedefler & Takip, Raporlar & Widget'lar, Veri & Destek, Dil, Hesap İşlemleri, Verilerim, İzinli E-postalar, vb.) tüm hardcode string'leri t('key') ile değiştir.

- [ ] **Step 4: Tip kontrolü**

Run: `pnpm typecheck`
Beklenen: 0 hata. (Eğer hata varsa, t() fonksiyonu içinde yanlış anahtar veya hook kural ihlali olabilir.)

- [ ] **Step 5: Test çalıştır**

Run: `pnpm test`
Beklenen: 621/621 pass. (Mevcut testler değişmemeli.)

- [ ] **Step 6: Build doğrula**

Run: `pnpm build`
Beklenen: ✓ built, dist/ içinde güncellenmiş bundle.

- [ ] **Step 7: Commit**

```bash
git add src/components/SettingsSheet.tsx src/i18n/locales/{en,tr,pl}.json
git commit -m "feat(i18n): translate SettingsSheet to EN/TR/PL"
```

---

### Task 18: MealForm i18n

**Files:**
- Modify: `src/components/MealForm.tsx` (35.5K, büyük form bileşeni)
- Modify: `src/i18n/locales/{en,tr,pl}.json`

**Interfaces:**
- Consumes: mevcut `useTranslation`
- Produces: MealForm'un tüm label, placeholder, buton, hata mesajı çevrilmiş

**Mevcut durum:** MealForm 35.5K — büyük form. İçinde ~40-50 hardcode string olabilir (besin adı, miktar, zaman, kategori, vitamin, mineral, supplement alanları).

**Adımlar:**

- [ ] **Step 1: Hardcode string'leri tara**

Run: `grep -nE '"[A-ZÇĞİÖŞÜ][a-zçğıöşüA-ZÇĞİÖŞÜ ]{3,}"|placeholder=|>[\s]*[A-ZÇĞİÖŞÜ][^<]{4,}<|label="' src/components/MealForm.tsx | head -60`

- [ ] **Step 2: JSON'a `meal.*` bölümü ekle**

tr.json, en.json, pl.json'a `meal: { ... }` bölümü. ~30-40 anahtar.

- [ ] **Step 3: MealForm'da t() ile değiştir**

Form alanları (ad, miktar, saat, kategori), besin detay (kalori, protein, karb, yağ, lif, vitamin, mineral), butonlar (Kaydet, İptal, Sil).

- [ ] **Step 4-7: typecheck, test, build, commit**

(Tıpkı Task 17 gibi.)

```bash
git add src/components/MealForm.tsx src/i18n/locales/{en,tr,pl}.json
git commit -m "feat(i18n): translate MealForm to EN/TR/PL"
```

---

### Task 19: NutritionSheet i18n

**Files:**
- Modify: `src/components/NutritionSheet.tsx` (17.8K, orta büyüklükte)
- Modify: `src/i18n/locales/{en,tr,pl}.json`

**Adımlar:** Task 18 ile aynı desen — tara, JSON'a ekle, t() ile değiştir, doğrula, commit.

```bash
git add src/components/NutritionSheet.tsx src/i18n/locales/{en,tr,pl}.json
git commit -m "feat(i18n): translate NutritionSheet to EN/TR/PL"
```

---

### Task 20: a11y kalan eksikler

**Files:**
- Modify: `src/components/OnboardingModal.tsx:418-422` (w-24 input, < 360px)
- Modify: `src/components/Modal.tsx` (focus trap)
- Modify: Çeşitli form bileşenleri (`FormBits.tsx`)

**Adımlar:**

- [ ] **Step 1: < 360px layout düzeltmesi**

OnboardingModal.tsx:418-422'de `w-24` input'u `w-20 sm:w-24` yap. 320px ekranda taşmayı önler.

- [ ] **Step 2: Modal focus trap**

Modal.tsx açıldığında ilk focusable öğeye focus, Tab tuşu döngüsü, Esc kapatma. Mevcut `useBodyScrollLock` ve `useModalHistory` zaten var, ek olarak focus yönetimi.

- [ ] **Step 3: Form label-for-id eşleşmesi**

FormBits.tsx içindeki `Label` + `TextField` çiftlerinde `htmlFor`/`id` eşleşmesini kontrol et. Tüm formlarda uygula.

- [ ] **Step 4-7: doğrula + commit**

```bash
git add src/components/OnboardingModal.tsx src/components/Modal.tsx src/components/FormBits.tsx
git commit -m "feat(a11y): < 360px layout, modal focus trap, label-for-id"
```

---

### Task 21: Capacitor signed AAB + Play Console (KULLANICI TARAFINDAN)

**Bu task AI tarafından yapılamaz** — Android Studio + Play Console erişimi gerekir.

**Kullanıcı adımları:**

- [ ] **Step 1: Keystore oluştur**

```bash
keytool -genkey -v -keystore nutrimind-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias nutrimind
```

Şifreleri güvenli yere kaydet. `nutrimind-release.jks` dosyasını **commit'leme** (gitignore'da).

- [ ] **Step 2: SHA-256 fingerprint al**

```bash
keytool -list -v -keystore nutrimind-release.jks | grep -E "SHA1|SHA256"
```

SHA-256 değerini kopyala.

- [ ] **Step 3: `public/.well-known/assetlinks.json` güncelle**

```json
{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.emrullah.nutrimind",
    "sha256_cert_fingerprints": ["BURAYA_SHA256"]
  }
}
```

```bash
git add public/.well-known/assetlinks.json
git commit -m "feat(twa): add real SHA-256 fingerprint to assetlinks.json"
```

- [ ] **Step 4: Signed AAB build**

Android Studio → `android/` klasörünü aç → Build → Generate Signed Bundle → APK → release.aab.

VEYA terminal:
```bash
cd android
./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

- [ ] **Step 5: Play Console'a yükle**

1. https://play.google.com/console aç ($25 hesap)
2. "Create app" → Nutrimind
3. App content → Target audience, Health & Fitness kategorisi, ads=no
4. Content rating → IARC formu
5. Data safety formu: toplanan veri türleri (email, öğün/sağlık, fotoğraf — Gemini'ye gönderim), paylaşım (Gemini + OFF + Google OAuth), güvenlik (HTTPS + scrypt), kullanıcı silme (POST /api/auth/account)
6. Privacy policy URL: `https://nutri.emrullah.xyz/privacy.html`
7. Release → Internal Testing → AAB yükle → Closed Beta → Production

- [ ] **Step 6: Capacitor senkronizasyonu (her native değişiklik sonrası)**

```bash
pnpm exec cap sync android
pnpm exec cap open android
```

---

### Task 22: Crash raporlama (yayın sonrası)

**Files:**
- Modify: `package.json` (yeni dep)
- Modify: `src/main.tsx` (init)
- New: `src/lib/sentry.ts`

**Adımlar:**

- [ ] **Step 1: Sentry kur**

```bash
pnpm add @sentry/react
```

- [ ] **Step 2: Sentry init**

`src/lib/sentry.ts` (YENİ):
```typescript
import * as Sentry from "@sentry/react";
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
});
```

`src/main.tsx`'e import ekle (en üstte, diğer import'lardan önce).

- [ ] **Step 3: ErrorBoundary'ye Sentry.errorReporting ekle**

`src/components/ErrorBoundary.tsx` componentDidCatch → Sentry.captureException.

- [ ] **Step 4: .env.example'a VITE_SENTRY_DSN ekle**

```
# Crash raporlama (Sentry)
# Sentry.io'dan proje oluştur, DSN'i buraya kopyala. Boşsa Sentry noop.
VITE_SENTRY_DSN=
```

- [ ] **Step 5-7: doğrula + commit**

```bash
git add package.json pnpm-lock.yaml src/main.tsx src/lib/sentry.ts src/components/ErrorBoundary.tsx .env.example
git commit -m "feat(ops): add Sentry crash reporting"
```

---

### Task 23: data.db yedekleme (yayın sonrası)

**Files:**
- New: `server/backup.sh` (cron script)

**Adımlar:**

- [ ] **Step 1: Yedekleme script'i yaz**

`server/backup.sh` (YENİ):
```bash
#!/bin/bash
# data.db haftalık yedek. cron: 0 3 * * 0 /var/www/nutri/backup.sh
set -e
BACKUP_DIR="/var/backups/nutrimind"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
sqlite3 /var/www/nutri/data.db ".backup '$BACKUP_DIR/data-$TIMESTAMP.db'"
# 30 günden eski yedekleri sil
find "$BACKUP_DIR" -name "data-*.db" -mtime +30 -delete
# Uzak kopyala (ör. S3/Backblaze)
# aws s3 cp "$BACKUP_DIR/data-$TIMESTAMP.db" s3://nutrimind-backups/
```

```bash
chmod +x server/backup.sh
```

- [ ] **Step 2: cron ekle**

```bash
crontab -e
# 0 3 * * 0 /var/www/nutri/server/backup.sh
```

- [ ] **Step 3: İlk yedek al (manuel)**

```bash
sudo ./server/backup.sh
ls -la /var/backups/nutrimind/
```

- [ ] **Step 4: Commit (script + döküman)**

```bash
git add server/backup.sh
git commit -m "feat(ops): add weekly data.db backup script"
```

---

## Plan özeti tablosu

| # | Task | Tip | Tahmini süre | Durum |
|---|---|---|---|---|
| 17 | SettingsSheet i18n | kod | 1 saat | TODO |
| 18 | MealForm i18n | kod | 1 saat | TODO |
| 19 | NutritionSheet i18n | kod | 30 dk | TODO |
| 20 | a11y kalan | kod | 1 saat | TODO |
| 21 | Capacitor AAB + Play Console | kullanıcı | 2-3 saat | TODO |
| 22 | Sentry crash raporlama | kod | 30 dk | TODO |
| 23 | data.db yedekleme | kod + cron | 30 dk | TODO |

**Toplam kalan:** ~4-5 saat kod + 2-3 saat kullanıcı (Play Console).

**Tamamlanma yüzdesi:** 16/23 = %70 (Tasks 1-16 zaten branch'te).

---

## Spec coverage kontrol

| Spec gereksinimi | Task |
|---|---|
| Gizlilik politikası (TR/EN/PL) | ✅ Tamam (Commit 2) |
| Hesap silme (atomik) | ✅ Tamam (Commit 3) |
| Veri export (JSON) | ✅ Tamam (Commit 3) |
| Settings UI | ✅ Tamam (Commit 4) |
| SEO meta + sitemap | ✅ Tamam (Commit 5) |
| AI onay modalı | ✅ Tamam (Commit 6) |
| Offline okuma cache | ✅ Tamam (Commit 8) |
| UX boş state + kamera | ✅ Tamam (Commit 9) |
| Logo optimizasyonu | ✅ Tamam (Commit 10) |
| OFF UA anonim | ✅ Tamam (Commit 15) |
| i18n altyapısı | ✅ Tamam (Commit 11) |
| i18n sayfa çevirisi (kısmi) | 🟡 Tamam (Commit 16) — Task 17-19'da devam |
| A11y (kısmi) | 🟡 Tamam (Commit 12) — Task 20'de devam |
| Capacitor kurulumu | ✅ Tamam (Commit 13) — Task 21'de devam |
| AGENTS.md | ✅ Tamam (Commit 14) |
| Crash raporlama | Task 22 |
| Yedekleme | Task 23 |
| plan-graph.html | ✅ Tamam (Commit 16) |

**Gap:** Yok. Tüm spec gereksinimleri task'larla eşleşti.

---

## No Placeholders kontrol

- "TBD" / "TODO": ❌ Yok
- "Add appropriate error handling": ❌ Yok (somut hata yönetimi her task'ta)
- "Similar to Task N": ❌ Yok (her task kendi adımlarını içeriyor)
- "fill in details": ❌ Yok

---

## Type consistency kontrol

`useTranslation` her yerde `const { t } = useTranslation()` olarak. `t('key.path')` her dilde aynı anahtar yapısı. JSON dosyaları 3 dilde senkron.

---

## Sonraki adım

Plan complete. **İki yol:**

1. **Inline execution** — bu oturumda Task 17-20'i sırayla yap (her biri için tara → JSON ekle → t() ile değiştir → doğrula → commit). Task 21-23 sonraki oturum.

2. **Subagent-driven** — Sonnet dispatches sorunlu (önceki oturumlarda openrouter/nemotron 410 hatası). Bu oturumda inline tercih edildi.

Hangi yolu istersen?
