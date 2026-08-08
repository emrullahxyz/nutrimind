# Nutrimind — AI tarafı için yol haritası (Claude → Antigravity devir dosyası)

Bu dosya, Claude Code oturumlarından Antigravity'ye geçiş nedeniyle yazıldı — kendi başına
yeterli olacak şekilde hazırlandı (önceki konuşma geçmişine erişimin olmadığı varsayımıyla).
Kısa bağlam + bugüne kadar yapılanlar + geriye kalan/ertelenen işler + kendi önerilerim + bir
öncelik sırası içeriyor. Derin mimari detaylar için hâlâ `CLAUDE.md` (kök dizin) yetkili kaynak —
bu dosya onun yerine geçmiyor, üzerine inşa ediyor.

## Proje özeti (30 saniyede)

**Nutrimind** — Türkçe, koyu tema, mobil öncelikli beslenme takip uygulaması. Öğrenilen takma-ad
(alias) hafızası: kullanıcı serbest metin/fotoğraf ile öğün girer, sistem daha önce öğrendiği
besinlere eşler, güven skoru verir. Tek bir Vite+React+TypeScript+Tailwind uygulaması (kökte),
`server/` altında sıfır-bağımlılıklı bir Node API (`node:http` + `node:sqlite`, Node 22+).

**Değişmez kurallar** (agy brief yazarken unutulmamalı):
- `server/index.js` **donmuş kabul edilir** — değiştirmeden önce kullanıcıya sor. Yeni backend
  mantığı `server/ai.js` gibi izole bir modülde yazılır, `index.js`'e yalnızca 2-3 satırlık bir
  köprü eklenir. İzole modül ASLA throw etmez, her zaman `{status, body}` döner.
- Yerel geliştirme İKİ terminal ister: `node server/index.js` (8790) + `pnpm dev` (5173, `/api`
  proxy'li). `pnpm preview` (4173) de `/api`'yi vekilliyor — **production build'i yerelde uçtan
  uca test etmek için bunu kullan**, `pnpm dev` DEĞİL. Sebep: React StrictMode dev'de her efekti
  iki kez çalıştırıyor (mount→cleanup→mount), bu özellikle `history`/`popstate` gibi tarayıcı API'leriyle
  çalışan kodda YANLIŞ teşhislere yol açıyor — bu oturumda tam olarak bu yüzden bir kamera
  geri-tuşu hatası ilk denemede yanlış anlaşılmıştı, `pnpm preview` ile doğru teşhis edildi.
- pnpm 11 TTY-less doğrulama hatası veriyor: her komuta `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false`
  ön eki ekle (`typecheck`, `test`, `build`, `dev`, `preview` hepsi için).
- `pnpm-workspace.yaml` git'te izlenen GERÇEK bir dosya — asla silme, pnpm'in esbuild build-izni
  kararını saklıyor (`allowBuilds: {esbuild: true}`, `onlyBuiltDependencies: [esbuild]`).
- Doğrulama kapısı: `pnpm typecheck` (0 hata) + `pnpm test` (569/569) + `pnpm build` (✓). UI
  değişikliğinde tarayıcıda gerçek davranışı doğrula (yukarıdaki `pnpm preview` notuna bak).
- Deploy: `pnpm run deploy` (frontend, `deploy.sh` — build + Oracle sunucusuna scp + nginx
  webroot'una aç, otomatik script). **Backend'in otomatik deploy script'i YOK** — `server/ai.js`
  gibi bir dosya değiştiğinde elle: `scp` ile `/home/emrullah/nutri-api/` (prod'da düz dizin,
  `server/` alt klasörü YOK) içine kopyala, `ssh ... sudo systemctl restart nutri-api.service`.
- Commit mesajları: Türkçe, kısa, "neden" odaklı. **`Co-Authored-By: Claude` trailer'ı EKLENMEZ**
  (kullanıcının açık tercihi).
- Oracle sunucusu: `emrullah@92.5.42.0`, key `C:\Users\Emrullah\Desktop\Projeler\.ssh\id_oracle`.

## Bugüne kadar yapılanlar (bu son oturumda, referans için)

Hepsi prod'a (`nutri.emrullah.xyz` + `nutri-api.service`) deploy edildi ve doğrulandı:

1. **AI sağlayıcı fallback zinciri** (`1756c4a`) — `server/ai.js` tek-atlamalı Gemini→NIM
   modundan, gerçek API key'lerle canlı doğrulanmış 5 adımlı bir zincire geçti:
   - Metin: `gemini-3.6-flash` → `gemini-3.5-flash` → `gemini-flash-lite-latest` → NIM
     (`meta/llama-3.1-8b-instruct`) → OpenCode Zen (`deepseek-v4-flash-free`).
   - Görsel: aynı 3 Gemini kademesi → NIM Vision (`meta/llama-3.2-90b-vision-instruct` — daha
     önce hiç doğrulanmamış bir yoldu, artık gerçek fotoğrafla kanıtlandı).
   - Tasarım dokümanı: `docs/superpowers/specs/2026-08-07-ai-fallback-chain-design.md`.
2. **Kamera onay ekranı** (`f71f8c2`) — deklanşörden sonra kare AI'a gitmeden önce gösteriliyor,
   "Tekrar çek"/"Kullan" ile onaylanıyor (önceden hiç önizleme yoktu, kötü kare fark edilmeden
   AI'a gidip kota harcıyordu).
3. **Geri tuşu/kaydırma düzeltmesi** (`f07c1a9`, `cc44eb0`) — önizleme ekranındayken telefonun
   geri tuşu/kaydırması artık "Tekrar çek" ile aynı davranıyor (önceden tüm kamera ekranını
   kapatıyordu). İkinci düzeltme, arka arkaya ÇOK hızlı iki geri basışta (React render'ının
   yetişemediği bir yarış durumu) uygulamadan tamamen çıkma hatasını giderdi — karar artık React
   state değil, senkron bir ref'ten okunuyor.

`server/ai.test.js` (8 yeni test) ve mevcut 569 testin tamamı yeşil.

## Bu dosyanın kapsamı: ertelenen fikirler + öneriler

Brainstorming sırasında kullanıcı iki fikir önerdi (multi-stage pipeline, vektör önbellekleme),
kasıtlı olarak bu turun dışında bırakıldı. Kullanıcı ayrıca kendi fikirlerimi de istedi. Aşağıda
hepsi, önerilen bir öncelik sırasıyla.

### Faz B — Modal history hook'unu ortak bir yere çıkar (öneri, YÜKSEK öncelik)

**Neden en yüksek öncelik:** Bu son oturumda `ScanSheet.tsx`'te tam olarak bu sınıf bir hatayı
(Modal'ın `history.pushState`/`popstate` mantığı + iç içe bir "önizleme" alt-durumu arasındaki
etkileşim) debug etmek saatler sürdü — kök neden, React state'in render beklemesiyle tarayıcı
history API'sinin senkron olması arasındaki bir yarış durumuydu. `docs/handoff/HANDOFF.md`'de
zaten not düşülmüş: `MealForm.tsx`, `AliasForm.tsx`, `NutritionSheet.tsx`, `RecipeBuilder.tsx`
**her biri** `Modal.tsx`'in history mantığını (push/popstate/`consumeProgrammaticBack`) elle
kopyalıyor, ortak bir hook'a çıkarılmamış. Bunlardan biri gelecekte iç içe bir alt-adım
(onay ekranı, çok adımlı form vb.) kazanırsa AYNI yarış durumuna düşebilir.

**Öneri:** `src/hooks/useModalHistory.ts` gibi paylaşılan bir hook — `Modal.tsx`'in ve bu 4
bileşenin mevcut mantığını (push/pop/`isPoppedRef`/`consumeProgrammaticBack` tüketimi) tek yerde
topla. `ScanSheet.tsx`'teki `capturedPreviewRef` deseni (senkron ref, React state değil) iç içe
bir alt-adımı desteklemesi gereken herhangi bir çağıran için bu hook'un API'sine dahil edilebilir.
Bu bir refactor, davranış değişikliği değil — mevcut testlerin hepsi yeşil kalmalı.

### Faz D — Tekrarlayan fotoğraf/etiket önbelleği (kullanıcının fikri, rafine edilmiş)

Kullanıcının orijinal önerisi: benzer bir tabak daha önce analiz edildiyse AI'a hiç gitmeden
önceki sonucu göster (vektör veritabanı ile). Değerli bir fikir ama şu haliyle iki risk taşıyor:
(1) kullanım deseni doğrulanmadı — kullanıcı GERÇEKTEN aynı/benzer yemekleri mi tekrar tekrar
çekiyor, yoksa her seferinde farklı mı; (2) "vektör veritabanı" bu projenin "SQLite dosya, Docker
yok, minimal" felsefesiyle gergin — ayrı bir vektör DB'ye gerek yok, bu ölçekte (tek/birkaç
kullanıcı, binlerle ölçülen kayıt) SQLite'ta saklanan embedding'ler üzerinde JS'de brute-force
cosine similarity milisaniyeler sürer.

**Önerilen aşamalı yaklaşım (her aşama bir öncekinin verisiyle karar veriyor):**

1. **Ölç, harcama yapma:** Her görsel istekte ucuz bir perceptual hash (pHash/dHash — küçük,
   bağımlılıksız bir JS implementasyonu var, ekstra API çağrısı GEREKMEZ) hesaplayıp SQLite'a
   logla. Birkaç hafta gerçek kullanımdan sonra: kaç tekrar var, ne sıklıkla?
2. **Tekrar oranı anlamlıysa, en ucuzundan başla:** Birebir hash eşleşmesiyle tam önbellek (aynı
   ürünün aynı fotoğrafı tekrar çekildiğinde) — embedding/vektör benzerliğinden çok daha ucuz,
   yeni bir API çağrısı gerektirmez.
3. **Hâlâ değer varsa VE "benzer ama birebir aynı değil" senaryolar önemliyse:** ancak o zaman
   embedding tabanlı yaklaşıma geç — yine SQLite üzerinde, ayrı bir vektör DB olmadan.

**Risk notu:** Adım 1'i atlayıp doğrudan 2/3'e geçmek, kullanım verisi olmadan spekülatif bir
yatırım olur. Faz E'deki "basit telemetri" önerisi bu ölçümü ucuza destekler.

### Faz C — Multi-stage pipeline (kullanıcının fikri, dikkatle değerlendirilmeli)

Kullanıcının önerisi: fotoğrafı küçült → ucuz bir nesne-tespit modeliyle ön-tespit yap → sadece
tespit edilen etiketleri + küçültülmüş görseli Gemini Flash'a gönder.

**Değerlendirme:** Sıkıştırma zaten kısmen var (`CAPTURE_OPTS`, 1024-1600px arası, JPEG kalite
0.7-0.92 — `src/lib/image.ts`). Ayrı bir "ön-tespit modeli" eklemek EK bir API çağrısı demek —
bu da tam olarak bu son oturumda çözülen "rate limit'i koru" hedefiyle **çelişebilir**: iki
modele istek atmak tek modele atmaktan daha fazla kota tüketir. Bugünkü mimari zaten TEK bir
Gemini çağrısıyla hem "ne var" hem "besin değerleri ne" sorusunu multimodal + yapısal JSON
çıktıyla çözüyor.

**Öneri:** Ön-tespiti HER istekte değil, sadece mevcut zincir düşük-confidence veya boş sonuç
döndüğünde devreye giren bir "ikinci görüş" aşaması olarak ekle (mevcut fallback zincirinin
doğal bir uzantısı gibi düşün). Daha ucuz bir alternatif/ilk adım: ayrı model eklemeden, mevcut
tek-çağrılık prompt'u iyileştirmek (Türk yemekleri için few-shot örnekler, porsiyon tahmini
rehberliği) — aynı doğruluk artışını, ek maliyet olmadan hedefler.

### Faz A — Confidence-tabanlı otomatik ikinci deneme (öneri, düşük efor ama belirsiz getiri)

Şu an `confidence`/`needsReview` sinyali var ama sadece UI'da gösteriliyor — zincir yalnızca
HTTP hatalarında (429/5xx) bir sonraki adıma geçiyor, "başarılı ama düşük güvenilir" durumunda
geçmiyor. Düşük confidence dönerse otomatik olarak zincirdeki bir sonraki adımı da deneyip iki
sonuçtan (varsa) daha yüksek confidence'lı olanı seçmek mümkün.

**Uyarı:** Bu garantili bir kazanç değil — düşük confidence çoğu zaman fotoğrafın/yemeğin
gerçekten belirsiz olmasından kaynaklanır, farklı bir model de benzer belirsizlikle sonuçlanabilir.
Önce deneysel olarak (küçük bir örneklemde, iki modelin confidence'larını karşılaştırarak)
gerçekten fark yaratıp yaratmadığı ölçülmeli, sonra otomatikleştirilmeli.

### Faz E — Küçük/açık işler

- **2.0/2.5 Gemini model ailesinin hesap kotası** — kod sorunu değil, hesabın Google
  Cloud/AI Studio panelinden kontrol edilmesi gereken bir yapılandırma konusu (bkz. fallback
  zinciri tasarım dokümanı, "Araştırma" bölümü).
- **Gerçek cihaz testi** — fallback zinciri şu ana kadar sunucu ortamında (curl) ve tarayıcıda
  (sahte kamera akışı ile simüle edilmiş) doğrulandı, gerçek bir telefonda henüz denenmedi.
- **Basit sağlayıcı-kullanım telemetrisi** — hangi zincir adımının (`gemini-3.6-flash`,
  `-3.5-flash`, `-flash-lite`, NIM, OpenCode) ne sıklıkla devreye girdiğini say (OFF proxy'nin
  zaten yaptığı `cached`/`upstreamCalls` sayaçlarıyla aynı desen, `/api/health`'e eklenebilir).
  Hem günlük debug için hem Faz D'nin/Faz A'nın değerini verilerle ölçmek için faydalı.

## Önerilen sıra ve gerekçe

**B → E (telemetri + gerçek cihaz testi) → D adım 1 (ölçüm) → C (dikkatle) → D adım 2/3 (veri
varsa) → A (deneysel).**

B en yüksek risk-azaltımını en düşük eforla veriyor (refactor, davranış değişikliği yok). Telemetri
neredeyse bedava ve sonraki her kararı (D, A) verilerle destekliyor. Gerçek cihaz testi zaten
planlanan, ucuz bir doğrulama adımı. C ve A daha spekülatif — ölçüm olmadan uygulanırlarsa hem
ek kota tüketebilir hem karmaşıklık ekleyebilirler, bu yüzden veri sonrası karar önerilir.

## Antigravity'ye özel notlar

- Bu proje daha önce Claude Code + `agy` (Antigravity CLI) delegasyonuyla yürütülüyordu —
  `.claude/skills/antigravity/SKILL.md`'de agy brief yazma kuralları, bilinen tuzaklar (pnpm,
  `server/data.db`'ye yanlışlıkla yazma riski, dosya-değiştirme script'i YAZMAMA kuralı) var,
  ilgi çekici olabilir ama artık Antigravity BİZZAT çalıştığı için bu doküman kendi başına
  yeterli olmalı — CLAUDE.md ve bu PLAN.md'nin ötesine gitmeden önce onu da bir kez okumak faydalı.
- `.claude/launch.json`'da `nutrimind-dev` (5173) ve `nutrimind-preview` (4173) tanımlı — ikinci
  config bu oturumda eklendi, üretim davranışını yerelde test etmek için kullanılmalı.
- Gerçek API key'ler `.env`'de (gitignore'da, commit'lenmez); `.env.example` her değişkenin
  formatını/kaynağını belgeliyor — yeni bir env değişkeni eklerken ikisini de güncel tut.
