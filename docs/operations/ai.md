# AI zinciri — işletim ve teşhis runbook'u

Kapsam: `server/ai.js` (zincir), `server/aiLog.js` (günlük), `server/aiHealth.js` (devre kesici),
`server/aiModels.js` (model keşfi), `src/lib/ai.ts` + `src/lib/aiDeadline.ts` (istemci).
Bu dosya "canlıda AI hatası aldım, şimdi ne yapacağım" sorusunun cevabıdır.

## 1. Zincir nasıl çalışır

```
POST /api/ai/vision   →  Gemini tier1 → tier2 → tier3 → NIM vision
POST /api/ai/parse    →  Gemini tier1 → tier2 → tier3 → NIM → OpenCode Zen
(NUTRIMIND_LLM_PROVIDER=gemini|nim → aynı zincir, yalnızca tek adım süzülür)
```

Her adım sırayla denenir; **ilk 200'de durulur**. Hepsi düşerse istemciye dönen kod
`code` alanıyla bildirilir ve kullanıcıya gösterilen metin `src/lib/ai.ts` içinde aktif
dile çevrilir (sunucu gövdeleri İngilizce/teknik kalır).

| Karar | Kural | Nerede |
|---|---|---|
| Toplam süre | Tek bütçe (`NUTRI_AI_BUDGET_MS`, varsayılan **25 sn**); her adımın zaman aşımı kalanla kırpılır | `server/ai.js` |
| Kalan < `NUTRI_AI_MIN_STEP_MS` (2.5 sn) | Adım **hiç başlatılmaz** (`skipped: "budget"`) | `server/ai.js` |
| Kota | 429 yalnızca model-bazlı kovada → sonraki kademe denenir | `server/ai.js` |
| Sağlayıcı geneli arıza | Aynı sağlayıcının `NUTRI_AI_VENDOR_5XX_STREAK` (2) kademesi art arda 5xx/zaman aşımı verirse kalan kademeler atlanır | `server/ai.js` |
| Kalıcı bozuk adım | 3 zaman aşımı **veya** tek 401/403/404/410 → 10 dk devre dışı (`NUTRI_AI_BREAKER_MS`) | `server/aiHealth.js` |
| Ölü model adı | 400/404/410 → model listeden yeniden keşfedilir ve **aynı istekte** bir kez denenir | `server/aiModels.js` |
| Hata mesajı | Son adımın değil, **tüm denemelerin** sebebi seçilir (sağlayıcı hatası > zaman aşımı) | `server/ai.js` |

## 2. Değişmezler (ihlal edilirse kullanıcı hiçbir şey görmez)

```
NUTRI_AI_BUDGET_MS (25 sn)  <  nginx /api/ penceresi (30 sn)  <  istemci sınırı (35 sn)
```

- **nginx** prod'da `location ^~ /api/ { proxy_read_timeout 30s; }` ile sabittir
  (`/etc/nginx/conf.d/nutri.emrullah.xyz.d/app.conf`). Bu pencereden uzun süren bir isteğin
  yanıtı **kullanıcıya hiç ulaşmaz**: nginx kendi gövdesiz 504'ünü döner, istemci JSON
  okuyamayınca `status === 504` dalına düşer ve "AI servisi zaman aşımına uğradı" yazar.
- Kapı testleri: `server/ai.test.js` → *"DEĞİŞMEZ: varsayılan toplam bütçe nginx'in /api/
  penceresinden kısa olmalı"* + *"asılı kalan sağlayıcıda zincir bütçeyi AŞMAZ"*;
  `src/lib/aiDeadline.test.ts` → istemci sınırı > 30 sn.
- **Değişmez bozulursa:** önce sunucu bütçesini düşür (env ile), sonra gerekirse nginx
  penceresini büyüt. Ters sıra (önce nginx'i büyütmek) kullanıcıyı daha uzun bekletir.

## 3. Kanıt toplama (prod)

```bash
# 1) Son AI olayları — her satır tek JSON (adım kaydı veya zincir özeti)
ssh -i <key> emrullah@ <SERVER_IP>"journalctl -u nutri-api --since '2 hours ago' | grep '\[ai\]' | tail -50"

# 2) Sahibin teşhis ucu (oturum ister): son 200 kayıt + kova doluluğu + devre kesici durumu
curl -s -b 'cookie' https://nutri.emrullah.xyz/api/ai/status

# 3) Hangi sürüm canlıda?
ssh -i <key> emrullah@ <SERVER_IP>"md5sum /home/emrullah/nutri-api/ai.js /home/emrullah/nutri-api/aiModels.js"
md5sum server/ai.js server/aiModels.js
```

Kayıt alanları:

| Alan | Anlamı |
|---|---|
| `status` | **Bizim** istemciye döneceğimiz kod (200/429/502/504) |
| `upstream` | **Sağlayıcının** ham kodu (503 overloaded, 410 Gone, 404 yetki…) |
| `code` | Kararlı sebep kodu (`ai_timeout`, `ai_provider_error`, `ai_rate_limit`, …) |
| `detail` | Sağlayıcının gerekçe metni (160 karaktere kırpılır, sırlar maskelenir) |
| `kind: "chain"` | İstek başına ÖZET satır — `totalMs` burada; başarıda da yazılır |
| `kind: "breaker"` | Bir adım devre dışı bırakıldı |
| `kind: "model"` | Ölü model yerine yenisi bulundu (`rediscovered`) |

`status` ile `upstream`'i karıştırma: 2026-09-21 olayının teşhisi bu ikisi ayrılmadığı için
uzun sürdü (günlükte `503` görünüyordu, oysa biz 502 dönüyorduk ve sebep Gemini'nin
"model overloaded" yanıtıydı).

## 4. Sağlayıcı sağlığını elle yoklama

```bash
# Gemini anahtarı + model listesi (200 beklenir)
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" | head -c 200

# NIM: hesabın gerçekten erişebildiği modeller (bazıları 404 "Not found for account" verir)
curl -s -H "Authorization: Bearer $NVIDIA_NIM_API_KEY" https://integrate.api.nvidia.com/v1/models

# OpenCode Zen: ücretsizler `-free` sonekiyle; LİSTEDE OLMAK YETMEZ (400 "Model is unavailable")
curl -s -H "Authorization: Bearer $OPENCODE_API_KEY" https://opencode.ai/zen/v1/models
```

Uygulama bunu kendi kendine yapar: bir kademe model seviyesinde düşerse adayları listeleyip
1×1 PNG'lik tek-jetonluk istekle yoklar (metin modunda düz metin) ve çalışanı 6 saat
önbelleğe alır (`NUTRI_AI_MODEL_TTL_MS`). **Model adları bu yüzden koda gömülü kabul edilmez** —
.env'deki ad yalnızca ilk adaydır.

## 5. "Kullanıcı AI hatası aldı" karar ağacı

1. `journalctl … | grep '\[ai\]'` → zincir özeti satırını bul (`totalMs`, `attempts`).
2. `kind: "chain"` satırı yoksa istek nginx penceresinde kesilmiştir ya da süreç yeniden
   başlamıştır (kayıtlar bellekte, 200 kayıt).
3. `totalMs > NUTRI_AI_BUDGET_MS` → **bütçe uygulanmıyor**: canlı `ai.js` eski olabilir (md5
   karşılaştır) ya da `NUTRI_AI_BUDGET_MS` yanlış ayarlı.
4. `upstream: 503` → Google tarafı yoğun; bizim hatamız değil. Tek çare yedek sağlayıcı.
5. `upstream: 410 / 404 / 400` + `kind: "model"` satırı → model emekliye ayrılmış; keşif yeni
   aday bulamamış (anahtar/yetki/ödeme kontrolü: `NVIDIA_NIM_API_KEY`, `OPENCODE_API_KEY`).
6. `code: "ai_rate_limit"` → kova reddi; `NUTRI_AI_RATE_*` ile oynanabilir. Kullanıcıya
   gösterilen mesaj `retryAfter` saniyesini içerir.
7. `skipped: "breaker"` → adım geçici olarak devre dışı; süre dolunca kendiliğinden denenir
   (süreç yeniden başlarsa da temizlenir).

## 6. Olay kaydı

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

## 7. Env anahtarları

| Anahtar | Varsayılan | Not |
|---|---|---|
| `NUTRIMIND_LLM_PROVIDER` | `none` | `auto` tam zincir; `gemini`/`nim` tek adıma süzer |
| `NUTRI_AI_BUDGET_MS` | `25000` | **nginx penceresinin altında kalmalı** |
| `NUTRI_AI_MIN_STEP_MS` | `2500` | Kalan süre bunun altındaysa adım başlatılmaz |
| `NUTRI_AI_VENDOR_5XX_STREAK` | `2` | Aynı sağlayıcıda art arda 5xx → kalan kademeler atlanır |
| `NUTRI_AI_TIMEOUT_MS` | `15000` | Gemini adımı (bütçeyle kırpılır) |
| `NUTRI_AI_NIM_TIMEOUT_MS` | `40000` | NIM/OpenCode adımı (bütçeyle kırpılır) |
| `NUTRI_AI_API_WINDOW_MS` | `30000` | Yalnızca değişmez testi için: nginx penceresi |
| `NUTRI_AI_AUTOMODEL` | `1` | `0` = ölü model adında ısrar et, keşif yapma |
| `NUTRI_AI_MODEL_TTL_MS` | `21600000` | Başarılı keşif önbelleği (6 saat) |
| `NUTRI_AI_MODEL_NEGATIVE_TTL_MS` | `900000` | Başarısız keşif (15 dk) |
| `NUTRI_AI_BREAKER_MS` | `600000` | Devrenin açık kalma süresi |
| `NUTRI_AI_BREAKER_TIMEOUTS` | `3` | Kaç ardışık zaman aşımı devreyi açar |
| `NUTRI_AI_BREAKER_PROVIDER_ERRORS` | `5` | Kaç ardışık 5xx devreyi açar |
| `NUTRI_AI_BREAKER_REQUEST_ERRORS` | `3` | Kaç ardışık 400/422 devreyi açar |
| `NUTRI_AI_RATE_*` | 10–15/dk | Kova kapasiteleri (`STATUS` ucunda doluluk görünür) |

**`NUTRI_AI_TIMEOUT_MS` hakkında ölçüm notu.** Başarılı Gemini adımları 1–6 sn sürüyor;
zaman aşımına uğrayanlar HER ZAMAN tam 15 sn yakıyor (hem 2026-09-21 olayında hem yerel
turda). Yani bu değeri düşürmek doğrudan bekleme kazancıdır — ancak gerçekten yavaş (büyük
görsel, yavaş bağlantı) istekleri de keser. Karar ölçümle verilir; varsayılan bilinçli
olarak geniş bırakıldı çünkü toplam süre zaten bütçeyle sınırlı.
