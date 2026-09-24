# v0.30.8 — Su takibi (yeni) + Barkod tarayıcı düzeltmesi

**Kaynak:** 21 Eyl 2026 tarihli iki kullanıcı geri bildirimi (v0.30.6):
1. *Özellik isteği:* "Ne kadar su içtiğimi görebilmek isterdim (belki vardır da görmüyorum)."
2. *Bug:* "Barkod tarayıcı çalışmıyor."

**Sınıflandırma:** Mimari (yeni alt sistem + kalıcı şema + 3 dillik arayüz + sürüm kapısı).

**Sürüm:** `APP_VERSION` **0.30.8**. Bu sürüm **tamamen ön yüzdür** — `server/**` dosyalarına
dokunulmaz (AGENTS.md madde 1: `server/index.js` donmuş; `config.water` anahtarı mevcut
`PUT /api/config/:key` ucundan geçer).

---

## 1. Kanıt: plan anındaki durum

**Su takibi YOK.** `src/lib/` altında su modülü yok; `config` anahtarları yalnızca `supplements`,
`weight`, `templates`, `profile`, `guide` ve `goals`. Tasarım referansı `Wireframes.dc.html` §2c
("Su & takviye") sözleşmede zaten duruyor: hızlı sayaç, hedef göstergesi.

**Backend'e ihtiyaç yok:** `server/index.js:318` `RESERVED_CONFIG_KEYS = {goals, seeded}`; `water`
`^[a-z][a-z0-9_]{0,31}$` desenine uyuyor.

**Barkodda iki kök neden kodda okunuyordu:**
- **Tek atışlık tarama.** `src/lib/camera.ts` `useBarcodeDetection`: ilk okumada `stop()` interval'i
  kalıcı kapatıyordu; `ScanSheet.tsx` efektinin bağımlılığı `active` hiç değişmediği için efekt bir
  daha kurulmuyordu → ilk okuma "Ürün bulunamadı" ile biterse tarayıcı o oturum boyunca ölüydü.
- **iOS'ta tarama sessizce imkânsız.** `barcodeDetectorCtor()` null iken hook sessiz no-op'tu ama UI
  "otomatik okunuyor" nabzını atıyor ve ipucu "otomatik okunur" diyordu.
- Bu özellik gerçek cihazda hiç doğrulanmamıştı: `docs/archive/handoff/HANDOFF.md:505-506`.

**Onaylanan kararlar:** su modeli **yalnızca ml** (200/330/500 ml hazır + serbest ml, bardak kavramı
yok); kart **varsayılan açık**, Ayarlar'dan kapatılabilir; barkod için **gerçek iOS çözücüsü** (wasm)
eklenecek; sürüm etiketi **v0.30.8**.

---

## 2. Tasarım A — Su takibi

### 2.1 Şema (`config.water`)

```jsonc
{
  "targetMl": 2000,                 // günlük hedef
  "enabled": true,                  // kart Bugün ekranında görünsün mü
  "log": { "2026-09-24": [200, 330, 500] }   // tarih → o gün girilen ölçüler (ml), sıra korunur
}
```

Ölçüleri günlük toplam yerine **dizi** olarak saklamanın tek nedeni "son ekleneni geri al" (`−`).
Şema yokken/bozukken `parseWaterConfig` savunmacı davranır (`supplements.ts` deseni).

### 2.2 Saf modül `src/lib/water.ts`

`parseWaterConfig` · `waterEntries` · `waterTotalMl` · `addWaterEntry` (sınır aşımında `null`) ·
`removeLastWaterEntry` · `waterRatio` · `normalizeAmount` · `suggestTargetMl` (35 ml/kg, 50'ye
yuvarlanır, 1200–4000 ml kelepçesi) · `shouldShowWaterCard`. Sabitler: `DEFAULT_WATER_TARGET_ML = 2000`,
`WATER_PRESETS_ML = [200, 330, 500]`, `WATER_MIN_ENTRY_ML = 10`, `WATER_MAX_ENTRY_ML = 2000`,
`WATER_MAX_DAY_ML = 8000`.

**i18n kuralı:** modül i18n'e bağlanmaz (saf sayı) — litre etiketi/ondalık ayırıcı bileşende
`formatNumber` + `t()` ile üretilir (`lib/ring.ts` deseni).

### 2.3 Arayüz

- `src/components/WaterCard.tsx` — `SupplementCard` deseni (`date`, `onOpenSettings`): toplam/hedef,
  ince ilerleme çubuğu, `+200/+330/+500 ml` çipleri, "Özel" satır içi ml kutusu (modal YOK → odak
  tuzağı işi gerekmez), `−` geri alma. Çevrimdışı: düğmeler kapalı + `offline.writeUnavailable`.
  Geçmiş gün: `shouldShowWaterCard` → yalnızca kaydı olan günlerde.
- `src/components/WaterSettings.tsx` — hedef ml, kilo varsa 35 ml/kg önerisi, görünürlük aç/kapa,
  son 7 gün ortalaması.
- `SettingsSheet.tsx` — `SubView` birliğine `"water"` + giriş kartı; prop yolu
  `DayView → DailyPage → App` (`onOpenSupplementSettings` ile aynı desen).
- `DayView.tsx` — kart `SupplementCard`'ın hemen üstünde (şikâyetin özü keşfedilebilirlik).
- Tema: `--water` / `--water-ink` her iki tema bloğunda + `tailwind.config.js` token satırı.
  **Velvet byte-identity:** yalnızca yeni token eklenir, mevcut renkler değişmez.
- `prefs.ts` — `PREF.waterOpen` (kartın açık/kapalı hâli).

---

## 3. Tasarım B — Barkod tarayıcı

### 3.1 Yetenek modeli (native-first, tembel wasm)

`src/lib/barcode.ts`: `nativeDetector()` (senkron) · `barcodeSupportSync()` ·
`loadBarcodeDetector()` (yerli yoksa polyfill'i dinamik import eder, önbelleğe alır, **asla throw
etmez**) · `BARCODE_SCAN_INTERVAL_MS = 400` · `FALLBACK_SCAN_INTERVAL_MS = 500` · `FALLBACK_MAX_DIM = 960`.

Bağımlılıklar: `barcode-detector` (MIT, `barcode-detector/ponyfill`) + **aynı sürümde** `zxing-wasm`
(pnpm katı `node_modules`). **wasm yolu CDN'e bırakılmaz:** `zxing_reader.wasm?url` + 
`prepareZXingModule({ overrides: { locateFile } })` → aynı origin'den `/assets/*`.
Paket yalnızca barkod moduna girildiğinde indirilir.

### 3.2 Tek atışlık bug'ın yapısal kapanışı

`src/lib/barcodeScan.ts`: `shouldAcceptDetection(last, code, now)` (aynı kod
`REPEAT_SUPPRESS_MS = 10_000` boyunca yutulur, farklı kod anında geçer) · `scanFrameSize(w, h, max)`.

`useBarcodeDetection` artık okuma sonrası durmaz; `{ status: "off" | "preparing" | "scanning" |
"unsupported" }` döner. Fallback yolunda `detect()` ham `<video>` yerine küçültülmüş `<canvas>` ile
çağrılır ve uçuşta-decode koruması vardır.

### 3.3 Dürüst arayüz

Nabız/"otomatik okunuyor" yalnızca `scanning` iken; `preparing` → "Tarayıcı hazırlanıyor…";
`unsupported` → "Bu cihazda otomatik barkod okuma yok" + elle giriş vurgusu (klavyeyi açıp vizörü
bozmasın diye otomatik odaklanmaz). Barkod modu ipucu `hintBarcode` / `hintBarcodeManual` olarak
ayrılır. "Ürün bulunamadı" sonrası "↺ Tekrar dene" (aynı kod, taramaya dokunmadan).
`OffSearch` kamera düğmesi `cameraSupported()` üzerinden gösterilir.

### 3.4 Tanılama

`src/lib/barcodeDiag.ts` (halka tampon, PII yok) + `deviceReport.ts`'e tek satır:
`barcode native=… fallback=… loaded=… attempts=… hits=… last=…`. Bir sonraki "barkod çalışmıyor"
geri bildirimi tahmin değil **kanıt** olur.

---

## 4. Görevler ve durum

| # | Görev | Durum | Kanıt |
|---|---|---|---|
| 0 | Plan dosyası | ✅ | bu dosya |
| S1 | `water.ts` + `water.test.ts` | ✅ | `src/lib/water.ts` · `src/lib/water.test.ts` |
| S2 | `--water` token'ları + Tailwind | ✅ | `src/index.css` (`:root` + `[data-theme="glass"]`) · `tailwind.config.js` |
| S3 | `WaterCard` + DayView + PREF + offline | ✅ | `src/components/WaterCard.tsx` · `src/components/DayView.tsx` · `src/lib/prefs.ts` |
| S4 | `WaterSettings` + SettingsSheet | ✅ | `src/components/WaterSettings.tsx` · `src/components/SettingsSheet.tsx` · `src/pages/DailyPage.tsx` · `src/App.tsx` |
| S5 | i18n `water.*` (3 dil) | ✅ | `src/i18n/locales/{en,tr,pl}.json` |
| B1 | `barcodeDiag` + rapor satırı | ✅ | `src/lib/barcodeDiag.ts` · `src/lib/deviceReport.ts` |
| B2 | Sürekli tarama + bastırma | ✅ | `src/lib/barcodeScan.ts` · `src/lib/camera.ts` · `src/lib/camera.test.ts` |
| B3 | wasm fallback + durum makinesi | ✅ | `src/lib/barcode.ts` · `src/lib/barcode.test.ts` · `package.json` |
| B4 | Dürüst UI + Tekrar dene + amountLabel | ✅ | `src/components/ScanSheet.tsx` · `src/components/OffSearch.tsx` · `scripts/check-i18n.mjs` |
| R1 | Sürüm + changelog | ✅ | `src/lib/version.ts` · `src/lib/changelog.ts` |
| R2 | todo + dersler L28/L29 | ✅ | `tasks/todo.md` · `tasks/lessons.md` |
| R3 | Kapı (typecheck/test/i18n/build) | ✅ | `pnpm typecheck` 0 · `pnpm test` tümü · `check:i18n` 3/3 · `build` ✓ |
| B5 | Tarayıcı ölçümü (gerçek EAN-13 + CDN'siz wasm) | ✅ | Preview ölçümü (§5) |
| B6 | **Gerçek cihaz turu** | ⏳ | Bildiren kullanıcıdan tanılama ekli geri bildirim bekleniyor |
| R4 | **Dağıtım** (`pnpm run deploy`) | ⏳ | Sahibin onayıyla yapılacak |

---

## 5. Ölçüm kayıtları

_(Uygulama sırasında dolduruldu — aşağıya bakınız: "Uygulama ölçümleri".)_

---

## 6. Riskler ve geri dönüş

| Risk | Önlem |
|---|---|
| wasm ilk indirme maliyeti, iOS'ta CPU/pil | Tembel import, aynı origin + `immutable`/SW önbelleği, 960 px'e küçültme, uçuşta-decode koruması, "hazırlanıyor" göstergesi |
| pnpm katı `node_modules` | `zxing-wasm` doğrudan bağımlılık, `barcode-detector` ile aynı sürüm |
| Native yolun Android'de bozulması | Native-first; yerli varsa paket hiç indirilmez (testle kilitli) |
| Su verisinin config satırını şişirmesi | Günde ~5-8 sayı; supplements ile aynı ölçek |
| Çevrimdışı su girişi yapılamaz | Mevcut sözleşme; arayüz açıkça söyler. Offline su yazımı ayrı iş |
| Geri dönüş | Fallback tek yerden kapatılabilir; su kartı Ayarlar'dan kapatılır, `config.water` zararsız durur |

---

## 7. Kapsam dışı (YAGNI)

Kafein/bardak sayacı · su trendi ve PDF raporu · hatırlatıcı/bildirim · ana ekran widget'ı · su
hedefinin kilodan otomatik türetilmesi (yalnızca "öneriyi uygula") · çevrimdışı su yazımı ·
`Nutrition` tipine su ekleme (su makro değildir).
