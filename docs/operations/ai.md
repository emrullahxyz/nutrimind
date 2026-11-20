# Gemini AI işletimi

## Metin ve görsel istekleri

`POST /api/ai/parse` ve `POST /api/ai/vision` aynı süreç içi Gemini kataloğunu ve kota
beklemelerini kullanır. `auto` ve `gemini` ikisi de bu seçimi açar. Katalog anahtarın
erişebildiği modelleri sayfalayarak alır. Modelin metin ve görsel yetenekleri ayrı sentetik
etiketlerle doğrulanır. Bir istek en fazla üç aday dener ve ilk başarılı yanıtta biter.
Model API'den 404 veya 410 verirse katalog aynı istek içinde bir kez yenilenebilir. Başarısız
bir katalog yenilemesinde aynı anahtarın son eksiksiz kataloğu kullanılabilir.

Metin ve yemek fotoğrafı istemleri ilgili kullanıcının besin hafızasını kullanır. Ambalaj
etiketi istemi hafızayı içermez. Arka plan yoklamaları sentetik veri kullanır. Google API
anahtarı HTTPS istek başlığında gönderilir.

Yerel sınır, metin için dakikada 10 ve görsel için dakikada 15 istek olarak başlar. Bir gelen
istek yalnızca ilgili kovadan bir jeton alır. Google'ın bildirdiği model beklemeleri her iki
giriş türü için paylaşılır. Proje kapsamlı kota beklemesi yeni model denemelerini durdurur.
Günlük limitlerde bekleme Pasifik saatine göre bir sonraki gece yarısına kadar sürer ve
sağlayıcı daha uzun bir bekleme bildirebilir. `retryAfter` saniye cinsindendir.

## Süre bütçesi ve başlangıç

Katalog, yetenek doğrulaması ve üretim için toplam varsayılan **25 sn**, nginx API penceresi
**30 sn**, istemci sınırı **35 sn**. nginx vhost'unda `location ^~ /api/` için
`proxy_read_timeout 30s` ayarlı. API servisi yanıtını bu pencere dolmadan vermelidir.
Kalan istek bütçesi 2,5 sn'nin altına düştüğünde yeni model denemesi başlamaz. Tek üretim
adımının varsayılan üst sınırı 15 sn ve istek bütçesinin kalanıyla sınırlandırılır.

Etkin yapılandırmada katalog açılışta yüklenir. İlk yükleme başarısızsa zamanlayıcı bir
dakika sonra yeniden dener. Başarılı katalog yüklemesinden sonra varsayılan yenileme aralığı
altı saattir. Sentetik yoklama ayrı beş dakikalık döngüde ve sınırlı sayıda çağrıyla çalışır.
`NUTRI_AI_AUTOMODEL=0` yalnızca arka planı kapatır. Bu ayarla, açılış henüz
tamamlanmadan veya ilk katalog yüklemesi başarısız olduktan sonra gelen istekler ihtiyaç
olduğunda kataloğu yükler. `none` ve eksik anahtar yapılandırmalarında AI ağına çıkılmaz.

## Durum ucu ve günlükler

Erişim kontrollü `GET /api/ai/status` yerel kovaları, son istek sonuçlarını ve
`gemini` bölümünü döndürür.

| Alan | Anlamı |
|---|---|
| `configuration` | `enabled`, `disabled` veya `missing-key` |
| `catalogRefreshedAt` | Son eksiksiz katalog yenileme zamanı |
| `active.text`, `active.vision` | Tür başına son başarılı üretim modeli ve Google bildirdiyse gerçek model sürümü |
| `models[].text`, `models[].vision` | Doğrulama durumu, JSON biçimi, zaman, gecikme ve biliniyorsa sürüm |
| `projectWaiting`, `models[].waiting` | Bekleme nedeni, yeniden deneme zamanı ve alınan kota bilgisi |

Zaman alanları Unix milisaniyesidir. Kota bilgisi sağlayıcıdan alınan limit kanıtını taşır.
`buckets` yalnızca uygulamanın yerel jetonlarını gösterir. Durum ve günlükler API anahtarını,
kullanıcı içeriğini veya ham sağlayıcı hata gövdesini içermez.

Başarısız istekleri `journalctl -u nutri-api | grep '\[ai\]'` ile bul.
429 yanıtında önce yerel kovayı ve Gemini bekleme alanlarını, 502 veya 504 yanıtında son
isteğin teknik kodunu, gecikmesini ve doğrulanmış modelleri kontrol et.

API dosyalarını birlikte güncelle. `ai.js`, `aiModels.js`, `aiDiscovery.js`, `aiLog.js`,
`aiGemini.js`, `aiGeminiRouting.js` ve `aiProbeLabel.png` dağıtımda aynı dizinde olmalı.
`deploy.sh` web derlemesini taşır. Bu API dosyaları backend dağıtımına aittir.

## Ortam ayarları

| Anahtar | Varsayılan | Kullanım |
|---|---|---|
| `NUTRIMIND_LLM_PROVIDER` | `none` | `auto` veya `gemini` AI'ı açar |
| `GEMINI_API_KEY` | Boş | Gemini kataloğuna ve üretime erişim sağlar |
| `NUTRIMIND_CONFIDENCE_THRESHOLD` | 0.8 | Bu değerin altında öğe inceleme ister |
| `NUTRI_AI_RATE_PARSE`, `NUTRI_AI_RATE_VISION` | 10, 15 | Dakika başına yerel jeton |
| `NUTRI_AI_BUDGET_MS`, `NUTRI_AI_API_WINDOW_MS` | 25000, 30000 | Toplam istek bütçesi ve doğrulama için nginx referans penceresi |
| `NUTRI_AI_MIN_STEP_MS`, `NUTRI_AI_TIMEOUT_MS` | 2500, 15000 | Yeni aday için gereken en az kalan süre ve üretim zaman aşımı |
| `NUTRI_AI_DISCOVER_BUDGET_MS` | 8000 | Bir katalog yüklemesinin zaman aşımı |
| `NUTRI_AI_DISCOVER_INTERVAL_MS` | 21600000 | Katalog yenileme aralığı, en az 900000 |
| `NUTRI_AI_AUTOMODEL` | 1 | 0 arka plan zamanlayıcılarını kapatır |

## Olay kaydı

### 2026-09-21 — "kamera/etiket AI'ı zaman aşımına uğradı" (v0.30.6'da düzeltildi)

**Kanıt.** Zincir 16:44–16:47 arası üç kez çalıştı ve sunucu tarafı süreler **67 / 68 / 71 sn**
(her kademenin `latencyMs`'inden hesaplandı). Kullanıcı 503 kaydından ~5 sn sonra değil,
nginx penceresi dolduğunda hata gördü.

| Zaman | Adım | Sonuç |
|---|---|---|
| 16:43:51 | gemini-tier1 (`gemini-flash-latest`) | `upstream 503`, 2.4 sn |
| 16:43:57 | gemini-tier2 (`gemini-3.5-flash`) | `upstream 503`, 6.1 sn |
| 16:44:12 | gemini-tier3 (`gemini-flash-lite-latest`) | `ai_timeout`, 15.0 sn |
| 16:44:52 | nim-vision (`llama-3.2-90b-vision`) | `ai_timeout`, 40.0 sn |
| **16:45:27** | **nginx** | 30 sn doldu → gövdesiz 504 → "AI servisi zaman aşımına uğradı" |

**Kök nedenler.** (1) Zincirin en kötü süresi (85 sn) nginx'in 30 sn'lik penceresini
aşıyordu; sunucunun dürüst hatası kullanıcıya hiç ulaşmadı, sunucu 30 sn sonra boşu boşuna
çalışmaya devam etti. (2) `runChain` **son adımın** hatasını döndürüyordu, yani gerçek sebep
(Gemini 503) "zaman aşımı" olarak göründü. (3) Yedek zincirin tamamı ölüydü: NIM metin modeli
410 Gone, NIM nemotron 404 (hesap yetkisi), NIM 11B vision 500, **NIM 90B vision 90 sn'de hâlâ
yanıt yok**, OpenCode `deepseek-v4-flash-free` 400 "Model is unavailable", OpenCode fiyatlı
modelleri 401 "No payment method". (4) Aynı dakikalarda **hiç 429 yoktu** — olayın eski
`NUTRI_AI_RATE_VISION` maddesiyle ilgisi yok.

**Düzeltmeler.** Bütçe + kalan adımları atlama, tüm denemelerden sebep seçimi, sağlayıcı 5xx
kısa devresi, devre kesici, model keşfi, `upstream`/`detail` günlüğü, zincir özeti satırı,
istemcide sayaç + "Tekrar dene" + 35 sn sınır. Kapı: `server/ai.test.js` (canlı olay
regresyonu dahil), `server/aiHealth.test.js`, `server/aiModels.test.js`, `src/lib/aiDeadline.test.ts`.

**Düzeltmeden sonra GERÇEK sağlayıcılarla ölçüm** (yerel sunucu, `NUTRI_PORT=8791`,
bilerek bozuk `GEMINI_MODEL`, tek `POST /api/ai/parse` dizisi):

| Deneme | Süre | Zincir özeti |
|---|---|---|
| 1 | 21.2 sn | tier1 404 (311 ms) → tier2 **zaman aşımı 15 sn** → tier3 **200** (5.9 sn) |
| 2 | 8.0 sn | tier1 `skipped: breaker` → tier2 503 (2.9 sn) → tier3 200 (5.1 sn) |
| 3 | 16.1 sn | tier1 breaker → tier2 zaman aşımı 15 sn → tier3 200 (1.1 sn) |
| 4 | **23.6 sn** | tier1+tier2 breaker → tier3 zaman aşımı → NIM **upstream 410** (8.5 sn, keşif denemesi dahil) → opencode `skipped: budget` → **502 `ai_provider_error`** ("zaman aşımı" değil) |
| 5 | **1.8 sn** | tier1+tier2 breaker → tier3 **200** (1.8 sn) |

Çıkarımlar: (1) bütçe tutuyor (en kötü 23.6 sn < 25 sn < nginx 30 sn); (2) devre kesici gerçek
yoğunlukta kendini kanıtlıyor — tekrarlanan hatalarda bekleme **21 sn → 1.8 sn**'ye iniyor;
(3) 410 alan NIM'de keşif çalışıyor ama bu hesapta kullanılabilir model bulamıyor (negatif
önbellek 15 dk, yani her istekte 8.5 sn tekrarlanmaz); (4) hata artık gerçek sebepten raporlanıyor.

**Bilinen maliyet.** Ölü bir sağlayıcıda keşif turu tek bir istekte ~8 sn yiyebilir; bütçe bunu
sınırlar ve olumsuz önbellek (15 dk) tekrarı önler. `NUTRI_AI_PROBE_TIMEOUT_MS` /
`NUTRI_AI_MAX_PROBES` ile kısaltılabilir (askıda kalan aday = yoklama zaman aşımı kadar maliyet).
