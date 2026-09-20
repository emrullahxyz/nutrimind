# 2026-09-20 — iPhone (iOS) iki bug + stabilite/optimizasyon

**Durum:** tamamlandı (v0.30.5)
**Tetikleyen:** Arkadaşın iPhone'unda (standalone, ana ekrana eklenmiş) kurulum sonrası iki bug:
(1) geri/kapat düğmesi çok yukarda kalıyor ve tıklanmıyor, (2) kamera ÖN kamerayla açılıyor ve
arka kameraya geçilemiyor. Ayrıca genel iOS debugging + optimizasyon/stabilite talebi.

**Kapsam kararı (kullanıcı):** 2 bug + yüksek riskli iOS bulguları; kamera geçişi için ekrandaki
**çift dokunuş**; kanıt toplama için **Preview'da iPhone taklidi**.

---

## 1. Kök nedenler

### Bug #1 — üst safe-area hiç uygulanmamış (KANITLI)

`Modal.tsx` bir `pad-safe-top` sınıfı kullanıyordu ama **bu sınıf hiçbir yerde tanımlı değildi**
(`index.css`'te yalnızca `.pad-safe` var; derlenmiş CSS'te `pad-safe-top` 0 eşleşme). Sınıf JSX'te
durduğu için kod okunurken doğru görünüyordu; tip denetimi ve testler sessizdi.

`viewport-fit=cover` + `apple-mobile-web-app-status-bar-style: black-translucent` + `display:
standalone` üçlüsünde iOS içeriği status bar'ın altına çizer ve `env(safe-area-inset-top)` kadar
boşluk bekler (Dynamic Island'lı modellerde 59 px). Başlık satırları `py-3.5` (14 px) ile başlıyordu
→ 40 px'lik geri düğmesi y≈14–54 px'te, yani tamamen status bar bölgesinde; dokunmayı sistem alıyor.

Etkilenen yüzeyler: `Modal` (özellikle `bleed` = tarama modu kapatma X'i), `MealForm`, `AliasForm`,
`NutritionSheet`, `RecipeBuilder`, `OnboardingModal`, `App` kök başlığı, `ScanSheet` mod ipucu.

### Bug #2 — iki mekanizma birden

- **M2 (kodda kanıtlı):** geçiş `if (pick && current && pick !== current)` ile korunuyordu.
  `getSettings().deviceId` gelmeyen cihazda (iOS) kapı `false` oluyor ve **ana lense geçiş hiç
  denenmiyordu**.
- **M1 (dış kaynak):** `facingMode: {ideal:"environment"}` yumuşak kısıt; ilk çağrıda yok sayılıp
  varsayılan (ön) kamera dönebilir.
- **Ürün boşluğu:** hiçbir geçiş yolu yoktu; tek yanlış seçim = çıkışsız durum.

## 2. Çözüm

| Alan | Değişiklik |
|---|---|
| CSS | `--sat/--sab/--sal/--sar` değişkenleri (tek kaynak) + `.pad-safe-t`, `.pad-safe-t-sm`, `.pad-safe-b*` sınıfları; dev-only `[data-emulate-ios]` taklidi |
| Kapı testi | `src/lib/safeArea.test.ts` — JSX'te kullanılan **her** `pad-safe*` sınıfı index.css'te tanımlı olmalı; ham `env()` yasak; viewport'a sabitlenen yüzeyler alt safe-area taşımalı. **Bu test yazılı olsaydı bug ürüne hiç çıkmazdı.** |
| Kamera | `pickCameraDeviceId(devices, facing)` (yön genel), `measuredFacing()` (gerçekten ne geldi), `resolveCameraPick()` (saf karar: keep / retry-device / retry-facing), `describeConstraints()`; `useCameraStream(active, {facing})` → `switchCamera()`; ilk açılışta çözülen lens önbelleklenir |
| Kamera UI | Vizör yüzeyinde **çift dokunuş** (ayrı z şeridi: alt kontroller üstünde kalır, `touch-action: manipulation`), 1.6 sn geçiş bildirimi, 4 sn ipucu, ön kamerada aynalı önizleme (kare aynalanmaz) |
| Tanılama | `cameraDiag` (halka tampon, PII yok) + `deviceReport` + `perfProbe` (long task) + geri bildirim formunda "Tanılama bilgilerini ekle" (mevcut `POST /api/feedback` yolu) |
| Klavye | `keyboardInset()` + `useKeyboardInset` → `--kb`; 5 tam ekran formun gövdesi `pb-[calc(1rem+var(--kb))]` |
| Kaydırma | `usePullToRefresh`: non-passive `touchmove` artık yalnızca çekilebilir bir dokunuşta bağlanır (karar `lib/pullToRefresh.ts`, saf + testli) |
| Performans | Canlı video üstündeki 4 `backdrop-blur` katmanı kaldırıldı (kamera hazır değilken eski görünüm) |
| Ölçüm tazeliği | `subscribeViewport()` (visualViewport) → `MealActionSheet` / `ProductGuide` yerleşimi bayat ölçümle yerleşmiyor |
| PWA | `apple-mobile-web-app-title`, `apple-touch-icon sizes` |

## 3. Doğrulama (Preview'da iPhone taklidi)

`?emulate=island` ile `--sat=59px/--sab=34px`; `?camera=ios-first-front` ile iOS kamera senaryosu
(ilk çağrı ön kamerayı verir, `settings.deviceId` gelmez).

| Ölçüm | Sonuç |
|---|---|
| `?emulate=island` → `MealForm` başlığı | `padding-top: 73px`, geri düğmesi **73→113** (status bar'ın altında) |
| Emülasyon kapalı (masaüstü) | 14 px / 14→54 — eskisiyle birebir, regresyon yok |
| Tarama sheet'i (bleed) kapatma düğmesi | 73 px |
| Çift dokunuş (vizör) | "⇄ Front camera" bildirimi; tek dokunuş geçiş yapmıyor |
| `--kb` boru hattı | `--kb: 0px` → form gövdesi 16px; `--kb: 300px` → **316px** |
| Kamera mantığı (iOS senaryosu) | birim testler: `retry-device → ios-back` (ultra-geniş değil) |

**Taklit edilemeyenler:** gerçek inset değerleri, gerçek iOS WebKit davranışı, klavye, kamera
donanımı. Bu yüzden arkadaşın telefonu son kapı.

## 4. Kapı

`pnpm typecheck` 0 · `pnpm test` **972/972** · `pnpm check:i18n` (PARITY/KEYS/HARDCODED OK) ·
`pnpm build` ✓

## 5. Arkadaşının teyit listesi

1. Tam ekran bir formun geri düğmesi basılıyor mu?
2. Taramada sağ üstteki kapatma (X) basılıyor mu?
3. Kamera **arka** lensle açılıyor mu?
4. Ekrana **çift dokunma** ön/arka geçiriyor mu?
5. Öğün eklerken klavye, odaklanılan alanı kapatıyor mu?
6. Sorun çıkarsa: Ayarlar → Geri Bildirim → **Tanılama bilgilerini ekle** → gönder.

## 6. Bilinçli olarak kapsam dışı

iPad/yatay düzen · Capacitor iOS sarmalayıcı · App Store · tam lens seçici UI · backend değişikliği
(`server/index.js` donmuş, hiç dokunulmadı).
