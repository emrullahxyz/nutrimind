# AI sağlayıcı fallback zinciri — Tasarım

## Bağlam

`server/ai.js`'in mevcut "auto" modu tek atlamalı: metin ayrıştırmada (`parseMealText`)
Gemini başarısız olursa (429/500/502/504) NIM'e düşüyor, ama görsel ayrıştırmada
(`parseMealImage` — kamera/etiket/galeri) **hiç fallback yok**, sadece Gemini. Kod içi
yorum bunu bilinçli olarak "hiç doğrulanmadı, riskli olurdu" diye işaretlemiş.

Kullanıcı `.env`'e `OPENCODE_API_KEY` ekledi ama hiçbir kod bu değişkeni okumuyor — atıl
duruyor. Aynı zamanda `tasks/todo.md`'de kayıtlı, çözümü bekleyen bir şikayet var: görsel
ucunun rate-limit'i (`NUTRI_AI_RATE_VISION`, varsayılan 5/dk) birkaç denemeden sonra
kullanıcıya hata gösteriyor.

Hedef: "API kullanımı sistematik olmalı, asla aksamamalı" — yani Gemini kota dolduğunda
uygulamanın sessizce bir sonraki uygun sağlayıcıya geçmesi, kullanıcının hiç fark etmemesi.

Bu tur sadece **fallback zinciri**ni kapsıyor. Multi-stage pipeline (sıkıştırma + ön-tespit
+ eşleştirme) ve vektör önbellekleme fikirleri kasıtlı olarak dışarıda bırakıldı — her biri
kendi başına yeterince büyük, ayrı brainstorming turlarında ele alınacak. Kamera
deklanşör/bulanıklık şüphesi de tamamen ayrı, ilişkisiz bir konu (ayrı bir debugging
oturumunda ele alınacak).

## Araştırma — canlı doğrulanmış bulgular

Rate limit belgeleri (Gemini, NVIDIA NIM, OpenCode Zen) resmi kaynaklarda net RPM/RPD
rakamı vermiyor ("hesabına özel, panelden bak" diyorlar). Bunun yerine gerçek API
key'lerle canlı test edildi (salt-okunur, minik "OK yaz" istekleri):

- **`gemini-3.6-flash`** (= şu anki `GEMINI_MODEL=gemini-flash-latest`): test anında
  gerçekten 429 döndü — `generate_content_free_tier_requests, limit:20`, birkaç saniyede
  açılan kısa pencereli (muhtemelen dakikalık) bir kota.
- **`gemini-3.5-flash`**: ✅ çalışıyor, aynı anda kota doluydu ama bu model açıktı — kota
  gerçekten **model bazlı ayrı kova** (hata mesajındaki `quotaDimensions.model` alanı bunu
  doğruluyor).
- **`gemini-flash-lite-latest`** (≈ 3.5-flash-lite): ✅ çalışıyor.
- **`gemini-2.5-flash`**: ❌ 404 — "no longer available to new users", `/models`
  listesinde görünse de bu hesap için kalıcı olarak emekli.
- **`gemini-2.0-flash`**: 429, ama `quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`
  — yani **günlük** kota (muhtemelen CLAUDE.md'de bahsedilen eski "kota 0" ayarından beri
  bu model için hiç düzelmemiş). `retryDelay` alanı burada yanıltıcı (saniyeler
  gösteriyor ama gerçek reset gün sınırında).
- **`gemini-2.0-flash-lite`**: 429, token/dk (TPM) türünde kota dolu.
- **NIM `meta/llama-3.1-8b-instruct`** (mevcut, zaten kullanılıyor): ✅ hızlı (~0.7sn).
- **NIM `meta/llama-3.2-11b-vision-instruct`**: ✅ çalışıyor ama ~30sn soğuk-başlangıç
  gecikmesi gözlendi (ilk çağrıda GPU worker ayağa kalkıyor).
- **NIM `meta/llama-3.2-90b-vision-instruct`**: ✅ çalışıyor, testte hızlı yanıt verdi
  (~0.4-0.6sn) — muhtemelen zaten sıcak bir worker'a denk geldi.
- **NIM `microsoft/phi-3.5-vision-instruct`, `nvidia/neva-22b`**: ❌ 404, bu hesap için
  yok (NIM kataloğunun hesaba göre değiştiği daha önce de gözlenmişti — doğrulanmadan
  hiçbir model isme güvenilmiyor).
- **OpenCode Zen** (`https://opencode.ai/zen/v1/models`, public liste): 61 model, 8'i
  gerçekten ücretsiz (`*-free` soneki). `deepseek-v4-flash-free` ile canlı test edildi:
  ✅ `"cost":"0"` ile yanıt döndü. **Ücretsiz modellerin hiçbiri görsel/vision
  desteklemiyor** — sadece metin/kod modelleri (DeepSeek, MiMo, Ling, Nemotron, LongCat,
  North Mini Code, Laguna).

Sonuç: 2.0/2.5 model ailesini zincire eklemek gerçekte ölü ağırlık olurdu (her istekte
boşuna 429/404 alıp asıl çalışan modele geçilecekti). Bunun yerine sadece gerçekten canlı
olan 3 Gemini kademesi kullanılacak.

## Tasarım

### Zincir kompozisyonu

`server/ai.js` içinde sıralı bir adım listesi (`{provider, model}[]`) — mevcut
`callLLM`/`geminiFetch`/`nimFetch` deseni genişletiliyor, `attemptGemini`/`attemptNim`
yerine tek bir "zinciri sırayla dene" fonksiyonu geliyor:

**Metin (`parseMealText`, `LLM_PROVIDER=auto` iken):**
1. Gemini `gemini-3.6-flash` (mevcut `GEMINI_MODEL`)
2. Gemini `gemini-3.5-flash`
3. Gemini `gemini-flash-lite-latest`
4. NIM `meta/llama-3.1-8b-instruct` (mevcut `NVIDIA_NIM_MODEL`)
5. OpenCode Zen `deepseek-v4-flash-free` (yeni sağlayıcı, `opencodeFetch()` eklenecek)

**Görsel (`parseMealImage`, `LLM_PROVIDER` `none` dışında iken — bugün olduğu gibi):**
1. Gemini `gemini-3.6-flash`
2. Gemini `gemini-3.5-flash`
3. Gemini `gemini-flash-lite-latest`
4. NIM Vision `meta/llama-3.2-90b-vision-instruct` (yeni — vision hiç yoktu)

OpenCode Zen görsel zincirde yok (ücretsiz modelleri vision desteklemiyor). Tüm zincir
tükenirse mevcut hata formatı (`{status, body}`) son adımın sonucunu döner — davranış
bugünkiyle aynı, sadece daha fazla deneme sonrası.

### Davranış kuralları

- Sadece **retry edilebilir** hatalarda (429/500/502/503/504/timeout) bir sonraki adıma
  geçilir. 400 (kötü girdi — `text`/`image` eksik, geçersiz `mimeType`) zinciri hiç
  tüketmez, anında döner (bugünkü "auto" modda bu ayrım yok — herhangi bir non-200'de NIM
  deneniyor; bu düzeltilecek).
- Her adımın kendi token-bucket rate limiter'ı olur (var olan `makeBucket` deseni),
  API key eksikse o adım sessizce atlanır (hata üretmez, bir sonrakine geçilir) — zincirin
  son adımı hariç: hiçbir adım çalışmazsa mevcut hata şekli korunur.
- `LLM_PROVIDER=gemini` veya `LLM_PROVIDER=nim` (tekil zorlama modları, debug amaçlı) hâlâ
  tek sağlayıcıda kalır — zincir sadece `auto` modda devreye girer. Bu, mevcut
  davranışla geriye dönük uyumlu.
- NIM fallback adımına düşüldüğünde zaman aşımı süresi ~40sn'ye uzatılır (soğuk başlangıçta
  gözlenen ~30sn + tampon); birincil Gemini denemesi mevcut kısa `AI_TIMEOUT_MS`'te
  (15sn) kalır — kullanıcı zaten Gemini'nin hızlı başarısız olmasını bekliyor, fallback'te
  biraz daha sabır kabul edilebilir.
- `NUTRI_AI_RATE_VISION` varsayılanı 5/dk'dan **15/dk**'ya yükseltilir — Gemini'de canlı
  gözlenen ~20/dk kısa-pencere kotasının biraz altında, ama zincir artık Gemini'nin kendi
  429'unu yönetebildiği için eskisinden çok daha güvenli bir taban.

### Kapsam dışı (bilinçli)

- Multi-stage pipeline (görsel sıkıştırma + ön-tespit modeli + eşleştirme) — ayrı tur.
- Vektör önbellekleme (benzer tabak varsa AI'a hiç gitmeme) — ayrı tur, veritabanı/embedding
  gerektiren daha büyük bir karar.
- 2.0/2.5 Gemini model ailesinin hesap/kota tarafında düzeltilmesi — kod sorunu değil,
  istenirse ayrıca Google Cloud/AI Studio panelinden bakılabilir.
- Kamera deklanşör zamanlaması/bulanıklık şüphesi — ilişkisiz, ayrı konu.

## Doğrulama

`pnpm typecheck` + `pnpm test` (yeni zincir adımları için testler eklenecek — özellikle
"400 zinciri tüketmez", "key eksikse adım atlanır", "tüm adımlar tükenince son hatayı
döner" senaryoları) + `pnpm build`. Ayrıca iki terminal ile yerel çalıştırma
(`node server/index.js` + `pnpm dev`) üzerinden gerçek bir metin ve gerçek bir kamera
isteğiyle uçtan uca deneme. Yeni model isimleri (özellikle NIM vision) plan/uygulama
aşamasında tekrar `curl` ile doğrulanacak — hesaba özel kataloglar zamanla değişebiliyor.
