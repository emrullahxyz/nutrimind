# Gemini model keşfi ve kota yönetimi — Subagent-Driven Development planı

**Durum** Uygulama ve bağımsız kod incelemesi tamamlandı. Ürün kodu `e73c6db`. Plan tarihi 20 Kasım 2026, teslim tarihi 21 Kasım 2026.

| Görev | Doğrulanan davranış | Kod veya test |
|---|---|---|
| 1 | Anahtara özel, sayfalanan Gemini kataloğu ve atomik yenileme | `server/aiModels.js:34` |
| 2 | Metin ve görsel için ayrı sentetik doğrulama ve şema uyumluluğu | `server/aiGemini.js:373` |
| 3 | Gerçek modele ait kota, takma ad ve istek süresi yönetimi | `server/aiGeminiRouting.js`, `server/aiGeminiRouting.test.js` |
| 4 | Mevcut metin ve görsel uçlarında Gemini kullanımı | `server/ai.js:538`, `server/ai.js:551` |
| 5 | Sayfalama, kota, emekli modelin değiştirilmesi ve sonraki öğünün başarısı | `server/ai.test.js:202` |

Canlı Gemini API ile yalıtılmış yerel sunucuda yapılan kabul ölçümünde üç ilk istek de HTTP 200 döndü. Süreye seçim sonucunu okumak için yapılan yerel durum isteği dahildir.

| Girdi | Gerçek model | Süre | Gözlenen sonuç |
|---|---|---:|---|
| Bułka kajzerka 78g | gemini-3.8-flash | 15,9 sn | 78 g ekmek ve beş besin değeri |
| Sentetik etiket | gemma-4-26b-a4b-it | 10,7 sn | 100 g için 321 kcal, 11 g protein, 49 g karbonhidrat, 9 g yağ, 6 g lif birebir eşleşti |
| Yemek fotoğrafı | gemini-3.5-flash-lite | 11,1 sn | Dört geçerli öğe |

İlk kabul turunda üç hızlı başarısız yoklama metin isteğini süre bütçesi dolmadan kesiyordu. Soğuk başlangıçta kod artık on adaya kadar ilerleyebilir. Gerçek öğün gönderimleri ile ağ hatası veya zaman aşımına uğrayan yoklamalar birlikte en fazla üç hak kullanır. Bu karar, soğuk başlangıçta ek sentetik çağrı maliyeti karşılığında ilk isteğin çalışan bir modele ulaşmasına fırsat verir. Kabul çalışması ücretli modellerin tamamını taramadı. Üretimdeki Node servisine dağıtım ayrı bir işlemdir.

**Hedef:** Nutrimind, sunucudaki Gemini API anahtarıyla erişebildiği modelleri keşfeder. Kullanıcı metin, yemek fotoğrafı veya etiket gönderdiğinde bu iş için doğrulanmış, kullanılabilir bir modeli otomatik seçer. Bir modelin eklenmesi, ad değiştirmesi veya kaldırılması kod değişikliği gerektirmemeli.

**Teknik kapsam:** Node 22+, mevcut `fetch`, mevcut Node API ve Vitest. Bu plan, `C:/Users/Emrullah/.agents/skills/superpowers-subagent-driven-development/SKILL.md` ile yürütülür. Ürün gereksinimleri bu planda tanımlanır.

## Bugünkü davranış ve tasarımı belirleyen kanıt

- `server/aiDiscovery.js` açılışta ve varsayılan olarak altı saatte bir OpenRouter, OpenCode, Ollama ve Cloudflare için **metin** taraması yapıyor. Gemini bu listeye dahil edilmiyor. `server/ai.js` Gemini çağrılarında model değiştirmeyi açıkça kapatıyor. NIM bugünkü etkin zincirde yer almıyor.
- Canlıdaki `auto` yapılandırması iki akışta da önce üç sabit Gemini adı deniyor. Mevcut `gemini` ayarı metin zincirini yalnızca ilk modele indiriyor. Dolayısıyla yalnızca ortam değişkenini değiştirmek istenen davranışı sağlamıyor.
- 20 Kasım'da ilk iki ad 15 + 10 saniyede bütün istek bütçesini tüketti. Google her iki ad için de aynı gerçek sürümü döndürdü. Flash için canlı anahtarın günlük 20 istek sınırı ve Flash Lite için geçici 503 yoğunluk yanıtı ayrı ayrı gözlendi. **20 sayısı test verisidir**, ürün varsayılanı değildir. Google eski adın yönlendirmesini de belgeliyor. [Model yaşam döngüsü](https://aistudio.google.com/docs/deprecations)
- Aynı anahtarla katalog sayfalanarak okundu. Sabit üç adın dışında modeller bulundu. `supportedGenerationMethods` içinde `generateContent` bulunması ilk filtredir. Gerçek katalogda ses sentezleyen modeller de bu yöntemi bildiriyor. Liste yanıtında modele ait kullanılabilir günlük bakiye veya kesin fotoğraf + besin JSON'u desteği gelmedi. [Model listeleme API'si](https://aistudio.google.com/api-reference/models/list-models) · [Kota kapsamı ve sıfırlamalar](https://aistudio.google.com/docs/rate-limits)

## Global Constraints

- `server/index.js` donmuş kabul edilir. Mevcut uçlar ve köprüler kullanılır. Canlı `server/data.db`, kullanıcı verileri ve `.env` korunur. API anahtarı, kullanıcı metni, görsel ve besin hafızası loglara, raporlara veya commit'lere girmez.
- Task 1–3 eklemeli ilerler. `server/ai.js` ve `server/aiDiscovery.js` içindeki eski çağıranlar ve mevcut testler Task 4'e kadar çalışır. Yeni Gemini çağrı yolu, bu görevlerde hedefli testlerden çağrılır. Metin ve görsel girişlerini yeni yola geçirme ve eski sağlayıcıları kaldırma Task 4'te birlikte yapılır.
- Geçişten sonra metin ve görsel aynı Gemini kataloğunu, kota durumunu ve istek başına varsayılan 25 saniyelik bütçeyi kullanır. Keşif yoklamalarında yalnızca sentetik veri kullanılır. Mevcut uçların dönüş sözleşmeleri, yerel istek sınırı ve öğün onay davranışı korunur.
- Her davranış değişikliği için önce odaklı testi beklenen nedenle başarısız gör, sonra geçir. Değiştirilen davranışın test komutunu, sonucunu ve dosya:satır kanıtını görev raporuna kaydet. Son kapı sırasıyla `pnpm typecheck`, `pnpm test`, `pnpm check:i18n`, `pnpm build`.

## Koordinatörün yürütme akışı

### Kurulum ve ön inceleme

1. Ana ajan **Astra** (`gpt-6.2-astra`) koordinasyonu ve kararları üstlenir. Ürün değişiklikleri uygulayıcılara aittir. Uygulama istendiğinde `superpowers:using-git-worktrees` ile yalıtılmış `codex/` dalını ve worktree'yi hazırla veya mevcut yalıtımı doğrula. Plan kaynak worktree'de Git tarafından henüz izlenmediği için aynı göreli yola kopyala, iki kopyanın içeriğini doğrula ve kaynak kopyayı koru. Diğer yerel değişiklikleri taşıma. Bundan sonraki komutları uygulama worktree'sinde çalıştır ve beceri betiklerini beceri dizinindeki tam yollarıyla çağır. `git status --short`, dalın başlangıç SHA'sı (`MERGE_BASE`) ve kod değişikliklerinden önce `pnpm typecheck` sonucunu kaydet.
2. Beceri dizinindeki `scripts/sdd-workspace PLAN_FILE` ile `.superpowers/sdd/2026-11-20-gemini-model-kesfi/` dizinini al. Bu planın `progress.md` dosyasını `# SDD ledger — plan: <plan file path>` satırıyla aç veya kimliği eşleşen mevcut kaydı sürdür. `Task <N>: complete` kayıtlarını Git geçmişinden doğrula. İlk açık görevden veya yarım kalan düzeltme turundan devam et. Beş görev için yürütme listesi oluştur. Ayrı bir ürün tasarım belgesi verilmediyse bunu kaydet.
3. İlk görevden önce aşağıdaki satırları gerçek dosya, arayüz ve testleri okuyarak doldur. Her satıra beklenti, bulgu ve varsa `Ruling: <karar> — <gerekçe> — <yanlışsa maliyeti>` ekle. Birbiriyle çelişen gereksinimleri ve uygulamayı sınamadan geçen veya mantığı kopyalayan testleri bu aşamada çöz.

| Ön inceleme | Karşılaştırılacak sözleşme |
|---|---|
| 1 ↔ 2 | Katalog kimliği ve sürüm değişimi, giriş türüne göre yoklama geçerliliği |
| 1 ↔ 3 | Atomik yenileme, 404/410 tekilleştirme, takma adlar ve ortak süre bütçesi |
| 1 ↔ 4 | Eski çağıranların uyumluluğu, açılış zamanlayıcısı ve katalog tanısı |
| 1 ↔ 5 | Sayfalama, kaldırılan model ve uçtan uca kabul senaryosu |
| 2 ↔ 3 | Yoklama sonuçları, hata sınıfları ve yeni adayın bütçesi |
| 2 ↔ 4 | Aynı çağrı/doğrulama kodu, mevcut öğün sonuçları ve giriş türü tanısı |
| 2 ↔ 5 | Sentetik etiket, yemek fotoğrafı ve başarılı yanıt ölçütleri |
| 3 ↔ 4 | İki girişin paylaştığı kota, hata eşlemeleri ve durum alanları |
| 3 ↔ 5 | Kota, gecikme ve yeniden deneme senaryolarının kanıtı |
| 4 ↔ 5 | Normal API girişleri, güvenli başlangıç ve son doğrulama |
| Görev 1 | Dosya sahipliği, sayfalama/yenileme uygulaması ve testlerinin iç tutarlılığı |
| Görev 2 | Dosya sahipliği, modalite/şema uygulaması ve testlerinin iç tutarlılığı |
| Görev 3 | Dosya sahipliği, kota/zamanlama uygulaması ve testlerinin iç tutarlılığı |
| Görev 4 | Dosya sahipliği, geçiş/tanı uygulaması ve testlerinin iç tutarlılığı |
| Görev 5 | Kabul testi, yerel ortam güvenliği ve teslim kanıtlarının iç tutarlılığı |

### Görev döngüsü ve teslim

1. Görevleri **1 → 2 → 3 → 4 → 5** sırasıyla yürüt. Her görev için `BASE` olarak `git rev-parse HEAD` çıktısını kaydet ve `scripts/task-brief PLAN_FILE N` çalıştır. `implementer-prompt.md` ile temiz bağlamlı, `agent_type="worker"` bir uygulayıcı başlat. Her yeni alt ajan çağrısında `fork_turns="none"` ve `model="gpt-6.2-sol"` değerlerini açıkça ver. Uygulayıcıya worktree, görev özeti dosyası, Global Constraints, önceki görevden tükettiği arayüzler, ilgili kararlar ve `task-N-report.md` yolunu ilet. Alt ajanlar kendi alt ajanlarını açmaz. Uygulayıcı kimliğini ilerleme kaydına yaz.
2. Uygulayıcı odaklı testleri çalıştırır, diff'i inceler ve yalnız kendi kapsamındaki değişiklikleri proje sahibinin yazarlığıyla commit eder. Rapor dosyasında değişiklikler, dosya:satır kanıtı, test komutları ve sonuçları, commit SHA'ları ve kaygılar yer alır. Ajan dönüşü `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT` veya `BLOCKED` durumu, commit'ler, tek satır test özeti ve kaygılarla sınırlıdır. Astra eksik bağlamı sağlar, kapsam ve doğruluk kaygılarını incelemeye girmeden çözer ve gerekirse aynı Sol modelini daha yüksek akıl yürütme düzeyiyle görevlendirir.
3. `scripts/review-package PLAN_FILE BASE HEAD` ile görev commit'lerinin tamamını paketle. `task-reviewer-prompt.md` ile görev özetini, raporu ve diff paketini uygulayıcıdan ayrı, salt okunur ve temiz bağlamlı bir Sol inceleyiciye ver. Global Constraints'ı ilet. İnceleyici gereksinim uyumu ve görev kalitesi için ayrı karar verir. Astra, diff'ten doğrulanamayan maddeleri kendisi doğrular. Bulguları, kanıtı ve görev sonucunu ilerleme kaydına ekle.
4. Eksik gereksinim ve Critical/Important bulgular için en fazla beş düzeltme turu yürüt. 1–3. turlarda ilk uygulayıcıyı sürdür. Geri çağırma mümkün değilse görev özeti, rapor ve açık bulgularla temiz bir Sol kullan. 4–5. turlarda her seferinde temiz bir Sol uygulayıcı başlat ve başlangıca göre daha yüksek akıl yürütme düzeyi seç (`high`, gerekiyorsa `xhigh` veya `max`). Her turda rapora yeni test kanıtı ekle, önceki incelemenin `HEAD` değerini `FIX_BASE` al ve `scripts/review-package PLAN_FILE FIX_BASE HEAD` ile yalnız düzeltme aralığını paketle. `re-review-prompt.md` kullanan salt okunur Sol, her açık bulguyu ve düzeltmenin getirdiği yeni hataları değerlendirir. Sonucu ve commit aralığını `Task <N>: fix round <R>/5` kaydına yaz. Minör bulguları son incelemeye kaydet. Beşinci tur sonunda açık bulguların her biri için karar yaz ve sonraki işi etkileyen çözümü ilgili görev çağrısına taşı. İnceleme onaylandığında veya açık bulgular kararlarıyla kayda geçtiğinde `Task <N>: complete (commits <base7>..<head7>, review clean)` ya da `Task <N>: complete (commits <base7>..<head7>, <K> parked)` satırını ekle.
5. Son görevden sonra `scripts/review-package PLAN_FILE MERGE_BASE HEAD` çalıştır. Önceki görevlerde yer almamış, temiz bağlamlı, `reasoning_effort="high"` veya üstü bir Sol inceleyiciye `superpowers-requesting-code-review/code-reviewer.md`, dal paketi, plan ve ertelenmiş bulguları ver. Gerekirse tüm bulguları tek Sol uygulayıcıya devret ve düzeltme aralığını bir kez yeniden incelet. Kalan bulguları karara bağla. Son düzeltmelerden sonra doğrulama kapısını son `HEAD` üzerinde çalıştır.
6. Teslimde son SHA'yı, test ve kabul kanıtını, doğrulanabilen canlı servis durumunu ve tüm `Ruling:` kayıtlarını sırasıyla, yanlış kararın maliyetiyle birlikte ver. Tamamlanan planın dosya:satır kanıtını ve durum tablosunu `docs/superpowers/plans/README.md` yaşam döngüsüne göre kaydet. `superpowers:finishing-a-development-branch` ile dal teslimini tamamla. Bu planın geçici çalışma dizinini ancak son inceleme temiz, düzeltmeler birleştirilmiş ve kararlar teslim için kaydedilmişse kaldır.

## Task 1 — Gemini kataloğunu gerçek anahtara bağla

**Sahiplik** `server/aiModels.js`, `server/aiModels.test.js`, `server/aiDiscovery.js`, `server/aiDiscovery.test.js`.

**Girdi ve çıktı** Var olan model keşfi ve zamanlayıcıdan hareketle Gemini'ye özel, son tam kataloğu saklayan ve eşzamanlı yenilemeyi paylaşan bir arayüz üret. Task 2'ye katalog kimliği, bildirilen yöntemler, sürüm ve yenileme sözleşmesini raporla. Yeni Gemini zamanlayıcısını hazırlanmış olarak teslim et. Etkin başlangıç yolunun değişimi Task 4'tedir.

- [x] Önce iki sayfalı test yaz. İkinci sayfadaki, adı daha önce görülmemiş bir model aday olmalı. Yalnızca embedding destekleyen kayıt öğün adaylarına girmemeli. İkinci sayfa hata verirse önceki tam katalog korunmalı.
- [x] `GET /v1beta/models` çağrısında anahtarı `x-goog-api-key` başlığında gönder. `nextPageToken` bitene kadar ilerle. Tekrarlanan sayfa belirtecini ve süre aşımını ele al. Adayları kaynak kimliği ve bildirilen yöntemlerle kaydet. Sürüm numarası, marka öneki, `flash` veya `latest` şartı koyma.
- [x] Açılışta ve varsayılan altı saatlik yenilemede yalnızca Google kataloğunu çek. Eşzamanlı çağrılar aynı yenileme işlemini paylaşsın. Tam liste başarılı olduğunda atomik olarak değiştir. İlk açılışta liste alınamıyorsa gerçek hata nedenini döndür ve kısa bekleme sonrası yeniden dene.
- [x] Katalogdan çıkan modeli seçimden kaldır. Aynı adın katalog sürümü değiştiğinde eski yetenek ve yönlendirme bilgisini düşür. 404/410 halinde aynı kullanıcı isteğinde, kalan süre içinde en fazla bir kez zorunlu yenileme yap. Eşzamanlı 404'lerin ayrı ayrı tarama başlatmasını önle.

**Doğrulanabilir teslim** İki sayfalı katalog, kısmi hata, tekrarlanan belirteç, süre aşımı, eşzamanlı yenileme, kaldırma/sürüm değişimi ve 404/410 için odaklı test kanıtı. Mevcut keşif çağıranlarının testleri geçer.

## Task 2 — Kullanılabilirliği Nutrimind'in yaptığı işle doğrula

**Sahiplik** `server/aiDiscovery.js`, `server/aiModels.js`, `server/ai.js` ve bunların testleri. Sentetik PNG düzeneği gerekirse `server/` altında bu göreve aittir.

**Girdi ve çıktı** Task 1 kataloğu ve mevcut Gemini yanıt doğrulaması. Task 3'e giriş türüne göre doğrulama durumu, başarılı çıktı biçimi, hata sınıfları ve ortak çağrı arayüzünü raporla. Yeni gerçek istek yolu ile yoklama aynı kodu paylaşır. Eski uçların geçişi Task 4'tedir.

- [x] Ortak model çağrısı ve yanıt doğrulamasını hem yoklamada hem gerçek öğünde kullan. Metin ve görsel için ayrı durum tut: henüz denenmedi, doğrulandı, bu girişle uyumsuz. Katalogda bildirilen özellikler varsa ön elemede kullan. Belgelenmemiş alanların her kayıtta gelmesini bekleme.
- [x] Metin yoklamasında sentetik bir besin etiketi ve bilinen sayılar kullan. Görsel yoklamasında aynı sayıları yalnızca küçük bir PNG etikete yaz. Başarı için dönen JSON'daki ürün ve besin değerlerini kontrol et. HTTP 200, boş liste, yanlış sayılar veya salt metin tek başına başarı sayılmamalı. Gerçek öğünde mevcut boş sonuç ve kullanıcı onay davranışı korunmalı.
- [x] Yeni adaylar için önce uygulamanın mevcut `responseSchema` biçimini dene. Google şema/çıktı özelliğini açıkça reddederse mevcut JSON istemi ve aynı sıkı doğrulayıcıyla uyumluluğu bir kez sına. Hangi biçimin hangi girişte başarılı olduğunu sakla ve gerçek istekte onu kullan. Desteklenmeyen modaliteyi, bozuk kullanıcı görselini, kota hatasını ve geçici yoğunluğu ayrı değerlendir.
- [x] Tarama kullanıcı verisi içermesin. Önerilen başlangıç ayarı beş dakikalık turda en fazla iki sentetik üretim isteği ve aynı anda bir arka plan yoklamasıdır. Adaylar arasında sırayla ilerle. Başarılı kabul, gerçek kullanımla tazelensin. Her periyodik liste yenilemesinde bütün modelleri tekrar üretime çağırma. Aynı model ve giriş türüne eşzamanlı doğrulamalar tek isteği paylaşsın.
- [x] Kabul testi: anlam taşımayan adlara sahip iki modelden biri yalnızca metinde, diğeri görselde başarılı olsun. Fotoğrafı görmeyip geçerli JSON üreten üçüncü model sentetik etiketi yanlış okuduğunda kullanıcı fotoğrafını almamalı.

**Doğrulanabilir teslim** İki giriş türünün ayrımı, yanlış etiketin reddi, açık şema reddinde tek JSON uyumluluk denemesi, eşzamanlı yoklama ve tur sınırı için odaklı testler. Doğrulayıcıyı her iki yolda çalıştıran testler ve mevcut öğün/onay testleri geçer.

## Task 3 — Kota, takma ad ve süre kararlarını birleştir

**Sahiplik** `server/aiModels.js`, `server/ai.js`, `server/aiLog.js` ve testleri. `server/aiHealth.js` içindeki kullanılabilir kayıt davranışını incele ve yeniden kullanım gerekiyorsa ilgili testi güncelle.

**Girdi ve çıktı** Task 1 yenileme sözleşmesi, Task 2 çağrı ve yoklama durumları, Google yanıtları ve sahte saat. Task 4'e paylaşılan aday seçimi, hata eşlemeleri, `retryAfter` ve tanıya verilecek kota/bekleme bilgisini raporla.

| Google'dan gelen sinyal | Seçim davranışı |
|---|---|
| Başarılı üretim ve `modelVersion` | İstenen ad ile gerçek sürümü ilişkilendir. Aynı istekte aynı gerçek sürümü tekrar deneme. Katalogdaki genel `version: "001"` alanını tekilleştirme anahtarı yapma. |
| 429 ve modele özgü kota | `QuotaFailure.violations` ve varsa `quotaDimensions.model` üzerinden etkilenen modeli belirle. Metin, fotoğraf ve bilinen takma adlar bekleme durumunu paylaşsın. Bağımsız uygun modeli dene. |
| Günlük istek kotası | Bir sonraki Pasifik gece yarısını yaz/kış saatiyle hesapla. Daha uzun açık sağlayıcı bekleme süresine uy. Dakikalık kotada `RetryInfo.retryDelay` ve HTTP `Retry-After` bilgisini işle. Belirsiz 429 için geçici geri çekilme kullan. |
| Açıkça proje genelinde kota veya geçersiz anahtar | Diğer modelleri çağırmayı kes. Tüm uygun modeller kota nedeniyle bekliyorsa `429 ai_rate_limit` ve anlamlı `retryAfter` döndür. Bir modelin 403 erişim reddini tüm projeye genelleme. |
| 503 veya zaman aşımı | Modeli geçici olarak geri sıraya al. Kalan bütçede bağımsız bir adaya fırsat ver. Aynı sağlayıcının iki hatası, tüm Gemini modellerini dışlamamalı. |

- [x] Google'ın bildirdiği sınırı ve yeniden deneme zamanını kaydet. API anahtarı tek başına tüm proje tüketimini veya diğer istemcilerin harcadığı kotayı göstermez. Yerel sayacı kesin kalan kota olarak sunma. Başlangıçta kota bilinmiyor kabul edilsin.
- [x] Önce ilgili giriş türünde başarılı ve erişilebilir adayları, bunların içinde yakın zamanda daha hızlı yanıt verenleri seç. Doğrulanmış aday kalmazsa kalan istek bütçesinde yeni bir adayı sentetik veriyle doğrula. Keşif, gövde okuma, yoklama ve üretim aynı 25 saniyelik varsayılan bütçeden düşsün. Bekleyen başka aday varsa ilk çağrıya tüm kalan süreyi verme.
- [x] Sahte saat ve ağ ile test et: model kotası dolunca takma adının atlanması, proje kotasında tek deneme, dakika kotası ardından yeniden kullanım, Pasifik yaz/kış sıfırlamaları, yavaş ilk modelden çalışan ikinci modele geçiş ve tüm modeller beklerken ağa çıkmadan 429.

**Doğrulanabilir teslim** Sahte saat/ağ senaryolarının sonuçları, ağ çağrı sayısı ve süre bütçesi doğrulamaları. Durumun iki girişte paylaşımı ve `modelVersion` tekilleştirmesi test edilir. Mevcut uçların testleri geçer.

## Task 4 — Metin ve fotoğraf girişlerini yeni seçime bağla

**Sahiplik** `server/ai.js`, `server/aiDiscovery.js`, `server/aiModels.js`, `server/aiLog.js`, ilgili testleri, `.env.example` ve `docs/operations/ai.md`. `src/lib/ai.ts` üzerinden istemci hata eşlemelerini kontrol et ve gerekiyorsa yalnız ilgili eşlemeyi güncelle. Sürüm çıkarsa `src/lib/version.ts` ve `src/lib/changelog.ts` bu göreve aittir.

**Girdi ve çıktı** Task 1–3'ten gelen katalog, yoklama ve kota seçimi. Mevcut API girişleri, başlangıç zamanlayıcısı ve durum ucu yeni seçime birlikte geçirilir. Task 5'e etkin yapılandırma ve normal uçların kabul testi için gereken yerel başlangıç koşullarını raporla.

- [x] `parseMealText` ve `parseMealImage` aynı katalog ve kota durumunu kullansın. Mevcut `auto` ve `gemini` kurulumlarını Gemini dinamik seçimine bağla. `none` iken ve anahtar yokken yoklama dahil ağ çağrısını engelle. Eski üçüncü taraf anahtarları mevcut olsa bile tüm AI istekleri yalnızca Gemini API'ye gitmeli.
- [x] Eski sabit model kademelerini, diğer sağlayıcıların aktif çağrılarını ve bunların arka plan taramasını kaldır. İstem dili, takma ad hafızasının kullanıcıya özel işlenmesi, besin değerleri, `baseAmount`, güven skoru ve mevcut uçların dönüş sözleşmeleri için regresyon testlerini koru. Yerel istek sınırlamasını model sayısıyla çarparak genişletme.
- [x] Mevcut erişim kontrollü `/api/ai/status` üzerinden katalog zamanı, aktif model adı, biliniyorsa gerçek sürüm, giriş türü başına doğrulama ve bekleme nedenini göster. Hassas anahtarlar, kullanıcı metni, fotoğraf ve besin hafızası tanıya girmemeli. Yeni bir yönetim ekranı gerekmiyor.
- [x] Örnek ortam ayarlarını ve AI işletim belgesinin güncel davranış bölümlerini düzelt. Olay geçmişini koru. `server/index.js` içindeki mevcut köprüler yeterli. Bir sürüm çıkarılacaksa proje kuralına göre sürüm ve uygulama içi değişiklik kaydını birlikte güncelle.

**Doğrulanabilir teslim** `auto`, `gemini`, `none` ve eksik anahtar senaryoları, eski anahtarlar tanımlıyken yalnızca Gemini ağı, yerel istek sınırı ve tanıda gizlilik testleri. Mevcut öğün alanları ve istemci dönüş sözleşmeleri regresyon testleriyle doğrulanır.

## Task 5 — Kabul ve teslim

**Sahiplik** `server/ai.test.js`, `server/aiModels.test.js`, `server/aiDiscovery.test.js`, `server/aiLog.test.js` içindeki kabul kapsamı ve `task-5-report.md`. Önceki görevleri etkileyen bir ürün kusuru bulunursa koordinatör kayda geçirir ve düzeltmeyi kapsamıyla yeniden görevlendirir.

**Girdi ve çıktı** Task 4'ün tamamlanmış geçişi. Birleşik regresyon testi, normal yerel uçlardan alınan sentetik örneklerin temizlenmiş kanıtı ve dört adımlı kapı sonucu. İsteklerde yalıtılmış yerel veri ve mevcut test erişimi kullan. Canlı veritabanına bağlanma.

- [x] Her adımda önce davranışı yakalayan testi başarısız gör, uygulamadan sonra aynı testi geçir. Odaklı komut: `pnpm exec vitest run server/ai.test.js server/aiModels.test.js server/aiDiscovery.test.js server/aiLog.test.js`.
- [x] Tek bir senaryoda katalog sayfalaması, ilk modelin kotası, eski adın kaldırılması ve yeni modelle sonraki öğünün başarılı olması birlikte sınansın. Eski çok sağlayıcılı zinciri bekleyen testleri yeni sözleşmeye uyarla.
- [x] Mevcut anahtarla yalıtılmış yerel sunucuda normal `/api/ai/parse` ve `/api/ai/vision` girişlerinden sentetik öğün dene. Metin için `Bułka kajzerka 78g`, görsel için değerleri bilinen bir etiket kullan. Fotoğraf modu için de bir yemek görselinden boş olmayan geçerli sonuç al. Her denemede seçilen model, süre ve doğrulanan alanları kaydet. Dış servis kotası doğrulamayı engellerse gerçek yanıtı bildir.
- [x] Son kapı sırayla `pnpm typecheck`, `pnpm test`, `pnpm check:i18n`, `pnpm build`. Canlıdaki Node servisi ayrı dağıtılır. Yerelde doğrulanan commit ve bilinen canlı servis durumunu raporla.

**Doğrulanabilir teslim** Birleşik senaryo için test adı ve dosya:satır, normal uçların her biri için seçilen model ve süre, doğrulanan alanlar veya dış servisin temizlenmiş hata yanıtı, dört kapı komutunun sonucu ve commit SHA'sı.
