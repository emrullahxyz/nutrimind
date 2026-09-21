// Uygulama-içi changelog — istemcide statik veri, ağ çağrısı yok.
// İçerikler TR+EN çift dillidir (PL istenmedi); `dev` satırları repo dili Turkish.
// Yeni sürüm eklerken listeye başa ekle; `date` ISO `YYYY-MM-DD`.
export type ChangeLogUserType = "new" | "improved" | "fixed";

export interface ChangeLogVersion {
  version: string; // "0.29.0"
  date: string; // "2026-09-04"
  summary: { tr: string; en: string }; // kullanıcı-önemli 1-3 cümle
  items: { type: ChangeLogUserType; tr: string; en: string }[]; // tek tek kullanıcı görünen maddeler
  dev: string[]; // dev-level detay satırları (TR, repo dili)
}

export const CHANGELOG: ChangeLogVersion[] = [
  {
    version: "0.30.6",
    date: "2026-09-21",
    summary: {
      tr: "Kamera veya fotoğrafla yapay zekâ analizi artık bekletmiyor: en fazla ~25 saniye sürüyor ve hata aldığında mesaj gerçek sebebi söylüyor. Analiz sürerken geçen süreyi görürsün; hata olursa çektiğin kare kaybolmaz, “Tekrar dene” ile aynı fotoğraf yeniden gönderilir.",
      en: "AI analysis from the camera or a photo no longer hangs: it takes at most ~25 seconds, and when it fails the message names the real cause. You can see the elapsed time while it runs, and if it fails your captured frame is kept — “Try again” resends the same photo.",
    },
    items: [
      {
        type: "fixed",
        tr: "Etiket okurken veya yemek fotoğrafı analiz ederken “AI servisi zaman aşımına uğradı” hatası alıyordun ve sonuç hiç gelmiyordu. Sebep: analiz 60 saniyeyi aşabiliyordu, sunucu hâlâ çalışırken ekran hatayı gösteriyordu. Artık bekleyiş en fazla ~25 saniye ve bitince gerçek sonucu (ya da gerçek sebebi) görüyorsun.",
        en: "Reading a label or analysing a food photo could fail with “the AI service timed out” while the result never arrived: analysis could take over 60 seconds, so the screen showed an error while the server was still working. It now stops at ~25 seconds and you get the real result (or the real reason).",
      },
      {
        type: "improved",
        tr: "Analiz hata verdiğinde hata metni gerçek sebebi söylüyor: yapay zekâ sağlayıcısı yoğunsa/yanıt vermiyorsa bunu, gerçekten süre dolduysa onu yazar. Eskiden hangi sebep olursa olsun “zaman aşımı” yazıyordu.",
        en: "When analysis fails, the message now names the real cause: a busy/unresponsive AI provider is reported as such, and a genuine timeout is reported as a timeout. Previously every failure said “timed out”.",
      },
      {
        type: "new",
        tr: "Hata sonrası çektiğin kare saklanır: “Tekrar dene” düğmesi aynı fotoğrafı yeniden gönderir, etiketi baştan çekmen gerekmez. Analiz 6 saniyeyi geçince de geçen süre ekranda görünür.",
        en: "After a failure the frame you captured is kept: the “Try again” button resends the same photo, so you do not have to shoot the label again. Once analysis passes 6 seconds, the elapsed time is shown on screen.",
      },
      {
        type: "fixed",
        tr: "Yapay zekâ sağlayıcılarından biri kullandığı modeli kaldırırsa ya da aniden yanıt vermezse uygulama artık orada takılıp kalmıyor: kullanılabilir başka bir modele kendiliğinden geçiyor ve çalışmayan sağlayıcıyı kısa süreliğine devre dışı bırakıyor.",
        en: "If an AI provider retires the model it uses or suddenly stops responding, the app no longer gets stuck: it moves on to another available model by itself and temporarily stops using the failing provider.",
      },
    ],
    dev: [
      "Kök neden (2026-09-21 canlı olay, kanıtlı): görsel zinciri en kötü 15+15+15+40 = 85 sn sürebiliyordu; prod nginx vhost'unda `location ^~ /api/ { proxy_read_timeout 30s; }` sabit — Node tek seferde res.end() yazdığı için bu bir TOPLAM süre tavanıdır. Üç zincir de sunucu tarafında 67/68/71 sn sürdü, kullanıcı 30. saniyede nginx'in gövdesiz 504'ünü aldı ve istemci onu 'AI zaman aşımı' diye gösterdi; sunucu 37 sn daha boşu boşuna çalışıp kota yaktı.",
      "İkinci kök neden: `runChain` yalnızca SON adımın sonucunu döndürüyordu → gerçek sebep Gemini'nin 503'ü iken kullanıcı 'zaman aşımı' okudu. Üçüncü: yedek zincirin tamamı ölüydü — NIM `meta/llama-3.1-8b-instruct` 410 Gone, nemotron-70b 404 'Not found for account', 11B vision 500, **90B vision 90 sn'de yanıt yok**; OpenCode `deepseek-v4-flash-free` 400 'Model is unavailable', fiyatlı modelleri 401 'No payment method'. Kayıtlarda hiç 429 yok (eski RATE_VISION maddesiyle ilgisiz).",
      "server/ai.js: `AI_BUDGET_MS` (varsayılan 25000) + `MIN_STEP_MS` (2500) — her adımın zaman aşımı kalan bütçeyle kırpılır, kalan yetmezse adım HİÇ başlatılmaz (`skipped: budget`). `VENDOR_5XX_STREAK` (2): aynı sağlayıcının kademeleri art arda 5xx/zaman aşımı verirse kalan kademeler atlanır (429 sayılmaz — kota model başına). `callLLM` artık `buildUrl`/`buildBody(model)` alır ve model seviyesinde hatada (400/404/410) aiModels üzerinden TEK kez model değiştirip aynı istekte yeniden dener. Tek-sağlayıcı zorlama modları da aynı zincirden geçer (bütçe/kod/rapor tek yerde).",
      "server/ai.js: `failureFrom(attempts)` — kod TÜM denemelerden seçilir (kova 429 → sağlayıcı hatası → zaman aşımı → erişilemezlik); yanıt gövdesine `attempts` eklenir (PII yok) ve `CODE_MESSAGES` ile İngilizce gövde metni verilir. `AI_LIMITS` dışa açıldı (değişmez kapısı için); index.js'e DOKUNULMADI.",
      "server/aiHealth.js (yeni, izole): sağlayıcı adımı başına devre kesici — 3 ardışık zaman aşımı / 3 erişilemezlik / 5 sağlayıcı 5xx / tek 401-403-404-410 → 10 dk devre dışı; süre dolunca yarım açık tek deneme. Eşikler ve pencere env'den ÇAĞRI ANINDA okunur. Açılışta `[ai] {kind:\"breaker\"}` satırı.",
      "server/aiModels.js (yeni, izole): ücretsiz model keşfi — sağlayıcı listesinden aday süzme (NIM'de guard/embed/rerank elenir, OpenCode'da `-free` önce), boyut/`flash` heuristiğiyle küçük-hızlı model öne (`\\b1b\\b` sınırı: yoksa '51b' içindeki '1b' eşleşiyordu), adayları tek-jetonluk/1×1 PNG yoklamayla doğrulama, 6 saat olumlu / 15 dk olumsuz önbellek. Ağ YALNIZCA model seviyesinde hata gelince açılır (sağlıklı akışta sıfır ek istek). `NUTRI_AI_AUTOMODEL=0` ile kapatılır.",
      "server/aiLog.js: kayda `upstream` (sağlayıcının ham kodu) + `detail` (kırpık, sır maskeli gerekçe) eklendi; `status` artık BİZİM döndüğümüz kod. `recordChain()` istek başına tek satır özet yazar (başarıda da) — ring buffer'a ve sağlayıcı sayaçlarına girmez. `setHealth()` ile devre kesici durumu `/api/ai/status` gövdesine eklenir (index.js değişmedi).",
      "src/lib/aiDeadline.ts (yeni): `withDeadline()` kullanıcı iptali ile süre aşımını tek sinyalde birleştirir ama AYIRT eder (`AbortSignal.any` bilinçli kullanılmadı — iOS Safari sürüm riski). 35 sn; süre aşımında `AiError(504, ai_timeout)` fırlatılır, iptal sessizce geçer. ScanSheet: 6 sn sonra saniye sayacı (`scan.analyzingSeconds`, 3 dilde) + hata sonrası aynı kareyle 'Tekrar dene' (`common.retry`).",
      "Testler: `server/ai.test.js` pencere değişmezi (budget < apiWindow) + asılı fetch ile bütçe aşımı (1 adım, <2 sn, `skipped: budget`) + sağlayıcı 5xx kısa devresi + CANLI OLAY REGRESYONU (503+timeout → 502 `ai_provider_error`, 'zaman aşımı' DEĞİL) + devre kesici atlaması + model keşfi entegrasyonu; yeni `server/aiHealth.test.js` (6), `server/aiModels.test.js` (9), `src/lib/aiDeadline.test.ts` (6). `loadAi` artık aiLog/aiHealth/aiModels durumunu da açıkça sıfırlar (modül yeniden yüklemesine güvenmek bir tur testi yanılttı: aynı test tek başına 504, dosyada 502 veriyordu).",
      "GERÇEK sağlayıcılarla yerel ölçüm (bilerek bozuk GEMINI_MODEL, tek /api/ai/parse dizisi): 21.2 sn (tier1 404 → tier2 zaman aşımı → tier3 200) · 8.0 sn · 16.1 sn · 23.6 sn (tier3 zaman aşımı + NIM gerçek **410 Gone** + keşif denemesi 8.5 sn + opencode `skipped: budget` → 502 `ai_provider_error`, 'zaman aşımı' DEĞİL) · son olarak **1.8 sn** — devre kesici tier1/tier2'yi devre dışı bıraktığı için bekleme 21 sn'den 1.8 sn'ye indi. Bütçe hiç aşılmadı (en kötü 23.6 sn < 25 sn).",
      "Kapı: typecheck 0 · test 1006/1006 · check:i18n 3/3 (PARITY/KEYS/HARDCODED OK) · build ✓. PROD'A ALINMADI: sunucu dosyaları scp + restart ve nginx `proxy_read_timeout 30s → 60s` ayrı onay bekliyor (bkz. tasks/todo.md AÇIK İŞLER, docs/operations/ai.md).",
      "Ders: tasks/lessons.md **L27** — dış katmanın zaman aşımı iç zincirden kısa olamaz; hata mesajı son adımın değil gerçek sebebin olmalı.",
    ],
  },
  {
    version: "0.30.5",
    date: "2026-09-20",
    summary: {
      tr: "iPhone'da tam ekran ekranların geri/kapat düğmeleri status bar'ın altında kalıyordu ve tıklanmıyordu; artık güvenli alan kadar aşağıda. Kamerada da arka lens açılıyor ve ekrana çift dokunarak ön/arka geçiş yapılabiliyor.",
      en: "On iPhone the back/close buttons of full-screen views sat under the status bar and could not be tapped; they now respect the safe area. The camera opens the rear lens, and a double tap switches between cameras.",
    },
    items: [
      {
        type: "fixed",
        tr: "iPhone'da (ana ekrana eklenmiş uygulamada) tam ekran ekranların başlıkları artık durum çubuğunun altında kalıyor: öğün formu, besin ekranı, tarif oluşturma, kurulum sihirbazı ve kameradaki kapatma düğmesi yeniden dokunulabilir.",
        en: "On iPhone (added to the home screen) full-screen headers now clear the status bar: the meal form, nutrition sheet, recipe builder, setup wizard and the camera's close button are tappable again.",
      },
      {
        type: "fixed",
        tr: "Tarama ve etiket okuma artık arka kamerayla açılıyor. Arkaya geçemediğinde uygulama bunu kendiliğinden tekrar dener ve lensi seçer.",
        en: "Scanning and label reading now open the rear camera. When it cannot get there, the app retries on its own and picks the lens.",
      },
      {
        type: "new",
        tr: "Kamerada ekrana çift dokunarak ön/arka kamera arasında geçebilirsin; hangi kameraya geçtiğin kısa süre ekranda görünür.",
        en: "Double-tap the camera screen to switch between the front and rear camera; a short on-screen note tells you which one is active.",
      },
      {
        type: "improved",
        tr: "iPhone'da klavye açıldığında odaklandığın alan artık klavyenin arkasında kalmıyor; sayfa kaydırması da daha akıcı (aşağı çekip yenileme dinleyicisi yalnızca gerektiğinde devreye giriyor).",
        en: "On iPhone the field you focus no longer hides behind the keyboard, and scrolling is smoother (the pull-to-refresh listener now engages only when needed).",
      },
      {
        type: "new",
        tr: "Geri Bildirim ekranına “Tanılama bilgilerini ekle” düğmesi geldi: yaşadığın bir sorunu bildirirken ekran ölçüsü, güvenli alan ve kamera ayarları gibi teknik bilgileri tek dokunuşla ekleyebilirsin. Yemek/hafıza verin gönderilmez ve göndermeden önce metni görebilirsin.",
        en: "The feedback screen has an “Attach technical details” button: when reporting a problem you can add technical facts (screen size, safe-area values, camera settings) with one tap. Your meal/memory data is never included and you can review the text before sending.",
      },
    ],
    dev: [
      "Motivasyon: iOS'ta (standalone) tam ekran sheet başlıkları status bar bölgesinde kalıyordu — geri/kapat düğmeleri TIKLANMIYORDU. Kök neden bir sınıfın VARLIĞI değil YOKLUĞUYDU: Modal.tsx `pad-safe-top` kullanıyordu, sınıf hiçbir yerde tanımlı değildi (derlenmiş CSS'te 0 eşleşme).",
      "src/index.css: `--sat/--sab/--sal/--sar` (env() tek kaynak) + `.pad-safe-t`, `.pad-safe-t-sm`, `.pad-safe-b`, `.pad-safe-b-sm`, `.pad-safe-b-md`; `--kb: 0px` (tanımsız değişkenle yazılan calc() padding'i TÜMDEN düşürürdü). Dev-only `html[data-emulate-ios=…]` blokları.",
      "src/lib/safeArea.test.ts: KAPI — JSX'te kullanılan her `pad-safe*` sınıfı index.css'te tanımlı olmalı, ham `env(safe-area-inset-*)` yasak, viewport'a sabitlenen (`fixed inset-0` + `h-[100dvh]`) her yüzey alt sınıf taşımalı. `pad-safe-top` ölü adı bir daha geçemez. Yorumlar taranmaz (geçmişi anlatan not yasak değil).",
      "src/lib/camera.ts: `pickCameraDeviceId(devices, facing)` (ön/arka genel), `measuredFacing(settings, devices)` (facingMode → otorite; yoksa deviceId↔etiket; ikisi de yoksa null = 'bilinmiyor'), `resolveCameraPick()` → keep/retry-device/retry-facing, `describeConstraints()`. `useCameraStream(active, {facing})` → `switchCamera()`; ilk açılışta çözülen lens `resolvedRef` ile önbelleklenir (sonraki açılışlar tek istek).",
      "Kapatılan iki mekanizma: (M2) `if (pick && current && …)` kapısı kaldırıldı — deviceId gelmese bile ana lense geçilir; (M1) yön ölçülemezse `facingMode: {exact}` ile TEK (sınırlı) yeniden deneme, olmazsa yumuşak kısıta geri çekilme.",
      "Kamera geçişi: vizörde çift dokunuş (`lib/doubleTap.ts` saf kapı + `hooks/useDoubleTap`, masaüstü için dblclick de bağlı ve çift ateşleme yutulur). Vizör AYRI bir z şeridi (z-[5]); alt kontroller z-10 ile üstünde kaldığı için deklanşöre dokunmak kamerayı DEĞİŞTİRMEZ. `touch-action: manipulation` iOS çift-dokunuş zoom'unu engeller.",
      "Tanılama: `lib/cameraDiag.ts` (12 kayıtlık halka tampon, PII yok: kısıtlar + dönen track ayarları + cihaz etiketleri), `lib/deviceReport.ts` + `lib/perfProbe.ts` (longtask sayacı), `FeedbackForm` → 'Tanılama bilgilerini ekle' (mevcut geri bildirim kanalı; arkadaşın iPhone'unda Web Inspector olmadığı için tek kanıt yolu).",
      "iOS klavye: `lib/keyboard.ts` (saf `keyboardInset`, MIN_KEYBOARD_PX=100 ile adres çubuğu gürültüsü elenir) + `hooks/useKeyboardInset` → `--kb`; MealForm/AliasForm/NutritionSheet/RecipeBuilder/OnboardingModal gövdeleri `pb-[calc(1rem_+_var(--kb))]`, odakta `scrollIntoView`.",
      "Okuma takılması: `usePullToRefresh` non-passive `touchmove`'u artık yalnızca çekilebilir dokunuşta bağlar (sayfa kaydırma yolu JS'e bağımlı değil); karar `lib/pullToRefresh.ts`'te saf ve testli.",
      "Perf: canlı `<video>` üstündeki 4 `backdrop-blur` katmanı (mod hapları, galeri, iki ipucu) yalnızca kamera HAZIR DEĞİLKEN uygulanıyor. Ölçüm iPhone'dan tanılama raporuyla gelecek (masaüstü GPU'su gösterge değil).",
      "Ölçüm tazeliği: `subscribeViewport()` (visualViewport resize/scroll) — MealActionSheet ve ProductGuide yerleşimi iOS'ta bayat `innerHeight` ile yerleşiyordu.",
      "index.html: `apple-mobile-web-app-title` + apple-touch-icon `sizes`.",
      "Doğrulama: Preview'da `?emulate=island` → MealForm geri düğmesi 73→113 px (emülasyon kapalıyken 14→54, masaüstü değişmedi); tarama sheet'i kapatma X'i 73 px; çift dokunuş '⇄ Front camera'; `--kb: 300px` → gövde padding-bottom 316 px. Kapı: typecheck 0 · test 972/972 · check:i18n 3/3 OK · build ✓.",
      "Taklit edilemeyenler (dürüstçe): gerçek inset değerleri, gerçek iOS WebKit davranışı, klavye, kamera donanımı — son kapı arkadaşın telefonu ve 6 maddelik teyit listesi (docs/superpowers/plans/2026-09-20-ios-hardening.md).",
    ],
  },
  {
    version: "0.30.4",
    date: "2026-09-16",
    summary: {
      tr: "Öğün eklerken yapay zekâ hatası alındığında artık hatanın sebei sunucu günlüğüne kaydediliyor: “x saniye sonra tekrar dene” tarzı hataların hangi dakikada, hangi sağlayıcı kademesinde tıkandığı bundan sonra kanıtlı görülebilecek.",
      en: "When an AI error occurs while logging a meal, the cause is now recorded in the server log: for “retry in x seconds” style errors, the exact minute and the failing provider tier can now be traced with evidence.",
    },
    items: [
      {
        type: "improved",
        tr: "Yapay zekâ hataları artık iz bırakıyor: hız sınırı, zaman aşımı ya da sağlayıcı hatası ayrımı sunucu günlüğüne kaydediliyor. Aynı hatayı tekrar yaşarsan sebei tahmin etmek yerine dakikasıyla birlikte görebileceksin.",
        en: "AI errors now leave a trace: rate limit, timeout and provider failures are recorded in the server log. If the same error happens again, you will see the reason with its timestamp instead of guessing.",
      },
    ],
    dev: [
      "Motivasyon: canlıda “x sn sonra tekrar dene” olayının izi yoktu — server/ai.js hataları yalnızca HTTP yanıtına çeviriyordu, tek console.error bile yoktu; kova 429'u ile upstream kota hatası ayırt edilemiyordu.",
      "server/aiLog.js (yeni izole modül): 200 kayıtlık ring buffer + sağlayıcı başına calls/ok/errors + kova doluluk snapshot'ı; hata durumunda tek satır “[ai] {...}” JSON stdout'a (journalctl'de grep '\\[ai\\]'). PII yok: prompt/görsel/uid kaydedilmez; modül asla throw etmez.",
      "server/ai.js: her sağlayıcı adımı (gemini-tier1/2/3, nim, nim-vision, opencode) callLLM dönüşlerinde aiLog.record — kova 429'u retryAfter ile, upstream hatada sağlayıcının gerçek HTTP kodu (502'ye çevrilmeden), timeout/unreachable 504, 200'de gecikme. Davranış değişikliği yok.",
      "server/index.js: izinli desen (1 require + 1 if bloğu) ile GET /api/ai/status — oturum kapısı ardında, PUBLIC_PATHS'e eklenmedi; sahibin teşhis ucu (son kayıtlar + kova dolulukları).",
      "Doğrulama: +15 yeni test (aiLog birim + ai entegrasyon), toplam 886/886 yeşil; typecheck / check:i18n / build yeşil.",
    ],
  },
  {
    version: "0.30.3",
    date: "2026-09-15",
    summary: {
      tr: "Yeni kayıt olan kullanıcıda kurulum sonrası sürüm notları ekranı ile tanıtım turu aynı anda açılıyordu; sıra artık net: önce kurulum, sonra kısa tur, en son sürüm notları.",
      en: "For new users the release-notes screen and the walkthrough used to open at the same time right after setup; the order is now clear: setup, then the short tour, then the release notes.",
    },
    items: [
      {
        type: "fixed",
        tr: "Yeni hesapta kurulum sihirbazını bitirdiğinde tanıtım turu, “Ne Var Yeni?” ekranı açıkken başlıyordu ve iki ekran üst üste biniyordu. Artık kurulum → tur → sürüm notları sırasıyla açılıyor; ikisi hiçbir koşulda aynı anda görünmüyor.",
        en: "On a new account the walkthrough started while the “What's new?” screen was open, so the two overlapped. They now appear in order — setup, tour, release notes — and never at the same time.",
      },
    ],
    dev: [
      "Kök neden: `sihirbaziAtla` bayrağı profili yazmadan ÖNCE açıyordu (`setSihirbazKapatildi(true)` → `await updateConfig`). O ağ turu boyunca hem `sihirbazAcik` hem `guideAcik` false kalıyor, sürüm popup'ı efektini tetikliyordu; yazma dönünce tur bayrağı true olup popup'ın üstüne biniyordu. Tarayıcıda üretildi (izole boş DB): 15 ms'de [], 22 ms'de [Ne Var Yeni?], 55 ms'de [Ne Var Yeni? | Hızlı Tur].",
      "Düzeltme iki katmanlı: (1) `guideAcik` artık `hasCompletedOnboarding || sihirbazKapatildi` kullanır — kapatma zaten tamamlanma sayıldığı için tur AYNI render'da sıraya girer ve ağ turunu beklemez; (2) `shouldShowGuide` yeni bir `changelogOpen` kapısı aldı, yani tur popup açıkken başlamaz (Ayarlar > “Ne Var Yeni?” tur sırası beklerken elle açılabiliyor). Kapı KARŞILIKLI: popup da tur/sihirbaz açıkken açılmaz.",
      "Doğrulama (izole boş DB + üretim derlemesi): kapatma yolu 18 ms'de yalnız [Hızlı Tur]; tamamlama yolu (5/5 “Hedeflerimi Kaydet”) 76 ms'de yalnız [Hızlı Tur]; tur “Atla” → 22 ms'de [Ne Var Yeni?]. Üç senaryoda da üst üste binme yok.",
      "guide.test.ts +3 test: popup açıkken tur başlamaz, popup kapanınca başlar (kapı kalıcı engel değil), `forceOpen` bile popup açıkken beklemez.",
    ],
  },
  {
    version: "0.30.2",
    date: "2026-09-15",
    summary: {
      tr: "Kurulum sihirbazı yenilendi: soru sayacı artık anlaşılır, küçük ekranlarda hiçbir şey taşmıyor ve adımlar arasında geçerken yön hissi var. Giriş/kayıt ekranının üstünde bir dil seçici var — telefonun dili neyse o seçili gelir, kayıt olmadan önce değiştirebilirsin. Arayüzü İngilizce veya Lehçe kullandığında artık hiçbir yerde Türkçe metin kalmıyor: kalori halkası, sağlık skoru, dışa aktarma başlıkları, ay/gün adları ve hata mesajları dahil her şey seçtiğin dilde.",
      en: "The setup wizard has been refreshed: the step counter is clearer, nothing overflows on small screens and moving between steps now has a direction. There is a language picker above the sign-in/sign-up form — it defaults to your phone's language and you can change it before creating an account. When you use the interface in English or Polish, no Turkish text is left anywhere: the calorie ring, health score, export headers, weekday names and error messages are all in your language.",
    },
    items: [
      {
        type: "improved",
        tr: "Kurulum sihirbazı elden geçirildi: “1 / 5” sayacı yerine beş bölmeli bir ilerleme göstergesi, adımlar arasında sağdan/soldan gelen yumuşak geçiş ve seçeneklerin kademeli girişi.",
        en: "The setup wizard was reworked: a five-segment progress indicator instead of the “1 / 5” badge, gentle direction-aware transitions between steps and a staggered entrance for the options.",
      },
      {
        type: "fixed",
        tr: "Küçük ekranlarda (320–360 px) sihirbazdaki başlık ve sayaç üst üste biniyordu; hedef adımındaki kartların iç boşluğu hiç uygulanmıyordu ve makro değerleri üç haneli olduğunda kırpılıyordu. Hepsi düzeltildi.",
        en: "On small screens (320–360 px) the wizard's title and counter collided; the goal step's cards had no inner padding at all, and three-digit macro values were clipped. All fixed.",
      },
      {
        type: "new",
        tr: "Giriş/kayıt ekranının üstünde dil seçici: telefonunun dili otomatik seçili gelir, hesap açmadan önce Türkçe/English/Polski arasında geçebilirsin. Seçim anında tüm ekran o dile döner.",
        en: "A language picker above the sign-in/sign-up form: it starts with your phone's language and you can switch between Türkçe/English/Polski before creating an account. The screen switches immediately.",
      },
      {
        type: "fixed",
        tr: "Kahraman kalori halkasının altındaki metinler (“kcal kaldı”, “Hedefe ulaşıldı”, “kcal aşıldı”) ve ekran okuyucu açıklaması artık seçtiğin dilde.",
        en: "The text under the hero calorie ring (“kcal left”, “Goal met”, “kcal over”) and its screen-reader description now follow your language.",
      },
      {
        type: "fixed",
        tr: "Beslenme Hedefleri ekranının başlığı, sağlık skoru cümlesi (“Kalori ve protein yolunda”) ve CSV dışa aktarma sütun başlıkları artık çevriliyor.",
        en: "The Nutrition Goals heading, the health-score sentence and the CSV export column headers are now translated.",
      },
      {
        type: "fixed",
        tr: "Haftanın gün adları (takvim şeritleri ve grafikler) dil değiştirdiğinde artık anında güncelleniyor — önceden sayfa yenilenene kadar eski dilde kalıyordu.",
        en: "Weekday names (calendar strips and charts) now update immediately when you change the language — they used to stay in the old language until you refreshed the page.",
      },
      {
        type: "fixed",
        tr: "“Beslenme Hedeflerini Düzenle” ekranındaki Profil Adı kutusu, sesli olarak saklanan gömülü profil adını gösteriyordu: İngilizce arayüzde “Varsayılan” yazıyordu. Artık seçtiğin dilde görünüyor (“Default”, “Domyślny”) — ama adı değiştirmediysen kaydettiğinde veriye çevrilmiş hâli yazılmıyor, ad dile bağlı kalmaya devam ediyor. Kendi yazdığın ad ise aynen korunuyor.",
        en: "The Profile Name box on the “Edit Nutrition Goals” screen showed the built-in profile's stored name, which is kept in Turkish: it read “Varsayılan” even in the English interface. It now follows your language (“Default”, “Domyślny”) — and if you did not rename it, saving no longer writes the translated name into your data, so it keeps following the language. A name you typed yourself is preserved exactly.",
      },
      {
        type: "fixed",
        tr: "Giriş/kayıt hataları, kamera ve görsel hataları, AI hata mesajları, alışveriş çakışması uyarısı ve “besin hafızaya kaydedildi ama bugüne eklenemedi” bildirimi dahil tüm hata metinleri seçtiğin dilde.",
        en: "All error messages follow your language: sign-in/sign-up errors, camera and image errors, AI errors, the sync conflict warning and the “saved to food memory but not added to today” notification.",
      },
      {
        type: "improved",
        tr: "AI analizi artık yanıtı senin dilinde üretiyor: İngilizce arayüzde yemek adları da İngilizce gelir.",
        en: "AI analysis now answers in your language: in the English interface the food names come back in English too.",
      },
    ],
    dev: [
      'Kapı: scripts/check-i18n.mjs artik Uc kontrol yapar — PARITY (3 dil anahtar/placeholder), KEYS (kodda t("...") ile istenen her anahtar locale\'de var mi) ve HARDCODED (sabit Turkce metin dedektoru).',
      "HARDCODED dedektoru uc imzayi birlikte arar: Turkce'ye ozgu harfler, `\\u01xx` kacislari ve ASCII Turkce kelime listesi (Hedef/Beslenme/Ekle...). Muafiyet: satir bazli `// i18n-exempt: <gerekce>` + 3 dosya (changelog.ts, i18n.ts, goals.ts profil ADLARI veri degeri).",
      "ring.ts artik SAF: cevrilmis metin degil `{key, params}` doner (RingMessage); sayilar locale-duyarli formatNumber ile METIN olarak tasinir. Ceviri CalorieRing'de t() ile yapilir. ring.test.ts anahtar+param sozlesmesini ve uc dilde cevrilebilirligini dogrular.",
      "healthScore.ts: Turkce ek uretecleri (getPlainName/getLocativeName/'ve') silindi; liste baglaci `format.ts: formatList` ile Intl.ListFormat uzerinden dile gore uretilir (ES2022 oldugu icin korumali calisma-zamani erisimi).",
      "format.ts: WEEKDAY_SHORT import aninda bir kez hesaplanan sabitti -> dil degisince takvim adlari bayatliyordu (WeekStrip/TrendChart/ReportView/WeekBars). Artik `weekdayShortList()` locale anahtarina bagli onbellekle calisir.",
      "nutrients.ts: `label`/`compactLabel` (Turkce etiketler) ve `short` (mono onek 'S'/'DY') alanlari kaldirildi -> `nutrient.<key>` ve `nutrientShort.<key>` anahtarlari. CSV basliklari ve 'eksik veri' rozeti artik dile duyarli.",
      "exporters.ts: validateBackup/exportMealsToCsv/exportAliasesToCsv `t: TFunction` alir (computeHealthScore ile ayni desen). off.ts missingLabels(food, t).",
      "server/ai.js: istemler TR/EN/PL sablonlarina ayrildi (PROMPTS); `lang` parametresi normalizeLang ile en/tr/pl'ye dusurulur, taninmazsa 'en'. Hata govdelerine kararli `code` eklendi (ai_disabled/ai_rate_limit/ai_timeout/...), istemci code'u i18n'e esler.",
      "server/index.js: /api/ai/parse ve /api/ai/vision'a `lang: b.lang` (2 satir; kullanici onayi alindi). Baska degisiklik yok.",
      "offlineSync.ts: cakisma mesaji artik IndexedDB'ye METIN degil `conflict` KODU olarak yazilir; SyncStatus operationErrorText() ile aktif dile cevirir (operasyon gunlerce kuyrukta kalabilir, dil degisebilir).",
      "bilesenler/LanguagePicker.tsx (yeni): AuthScreen (compact) ve SettingsSheet (full) ayni bileseni kullanir. Acilir menu yok, satir ici 3 segment -> yeni overlay/diyalog dogmaz (AGENTS.md K9).",
      "OnboardingModal: gecersiz `p-4.5` siniflari kaldirildi (Tailwind 3.4 spacing'de 4.5 yok -> ic bosluk hic uygulanmiyordu), `onboarding.stepStatus` {{total}} aldi, stepCounter eklendi, adim 5 izgarasi 2/3 kolona duyarli, adim basligi odaklanir (ekran okuyucu duyurur).",
      "index.css: .wizard-step-forward/back (18px yonlu translate3d + opacity, --ease-glass) ve .wizard-opt-in (menuItemIn yeniden kullanimi + inline animation-delay).",
    ],
  },
  {
    version: "0.30.1",
    date: "2026-09-15",
    summary: {
      tr: "Yeni hesaplarda kurulumun hemen ardından altı adımlık kısa bir tur başlıyor: tur uygulamayı baştan gezmez, ekranda duran ilgili bölümü vurgular ve istediğin an atlanabilir. Ayarlar'daki “Kilo & Vücut Geçmişi” ekranı artık gerçekten senin verilerini gösteriyor — son ölçümün, hedef kilon, yolun yüzde kaçını aldığın, kilo grafiği ve tüm ölçümlerinin listesi; önceden herkese aynı sabit değerleri gösteriyordu. Hedef kilonu artık Profil Bilgileri'nden değiştirebilirsin ve Ayarlar daha anlaşılır bir sıraya girdi.",
      en: "New accounts now get a short six-step tour right after setup: it doesn't march you through the app — each step highlights the part of the screen that's already there, and you can skip it at any time. The “Weight & Body History” screen in Settings now shows your real data — your latest measurement, your target weight, how far along you are, the weight chart and the full list of your measurements; it used to show the same fixed placeholders to everyone. You can now change your target weight in Profile too, and Settings itself is ordered more sensibly.",
    },
    items: [
      {
        type: "new",
        tr: 'Yeni hesapta ilk kurulumdan sonra altı adımlık kısa bir rehber açılıyor; her adımda "Sonraki" ile ilerler, "Atla" ile çıkarsın. Rehber her adımda ekrandaki ilgili bölümü vurguluyor (kalori özeti, öğün ekleme, Hafıza, + düğmesi, İlerleme, Ayarlar), yani gerçek arayüzü öğretiyor.',
        en: 'A short six-step guide now appears after first-time setup; move on with "Next" or leave with "Skip". Each step highlights the relevant part of the screen (calorie summary, adding a meal, Memory, the + button, Progress, Settings) so you learn the real interface.',
      },
      {
        type: "improved",
        tr: "Rehberi Ayarlar'dan istediğin zaman yeniden başlatabilirsin; gördükten sonra kendiliğinden tekrar çıkmaz ve hesabına bağlıdır (başka bir cihazda da yine çıkmaz).",
        en: "You can restart the tour from Settings at any time; it won't come back on its own and it's tied to your account (so it stays dismissed on your other devices too).",
      },
      {
        type: "fixed",
        tr: "“Kilo & Vücut Geçmişi” ekranındaki sahte değerler kaldırıldı: “mevcut kilo” artık en son ölçümün, “hedef kilo” ise gerçekten belirlediğin hedef; ilerleme çubuğu bu iki değere göre hesaplanıyor.",
        en: "The fake numbers on the “Weight & Body History” screen are gone: “current weight” is your latest measurement, “target weight” is the goal you actually set, and the progress bar is computed from those two.",
      },
      {
        type: "new",
        tr: "O ekranda artık ölçüm geçmişin listeleniyor (tarih, kilo ve önceki ölçüme göre fark) ve yanlış/eski bir kaydı tek dokunuşla silebiliyorsun.",
        en: "That screen now lists your measurement history (date, weight and the change since the previous one) and lets you delete a wrong or stale entry with one tap.",
      },
      {
        type: "new",
        tr: "Hedef kilonu Profil Bilgileri'nde değiştirebilirsin — kurulum sırasında girdiğin bu değer şimdiye kadar hiçbir yerde kullanılmıyordu.",
        en: "You can change your target weight in Profile — the value you entered during setup was never used anywhere until now.",
      },
      {
        type: "improved",
        tr: "Kurulumda girdiğin kilo, kilo geçmişinin başlangıç ölçümü olarak kaydediliyor; geçmiş boş kalmıyor ve ilerleme yüzdesi ilk günden anlamlı.",
        en: "The weight you enter during setup is now saved as the starting measurement of your weight history, so the history isn't empty and the progress percentage is meaningful from day one.",
      },
      {
        type: "improved",
        tr: "Ayarlar yeniden sıralandı: veri yedekleme/gizlilik/geri bildirim kendi bölümünde, bölüm başlıkları içeriğiyle uyumlu ve “Çıkış Yap” en sonda.",
        en: "Settings was reordered: data backup, privacy and feedback now sit together, section titles match what's inside them, and “Log out” is last.",
      },
      {
        type: "fixed",
        tr: "Profil bilgileri (ad, yaş, boy, kilo) artık hesabına kaydediliyor — önceden yalnızca bu cihazda saklanıyordu; profil kartı ve alanlar da boşken uydurma değerler (29 yaş / 78 kg gibi) göstermiyor.",
        en: "Your profile info (name, age, height, weight) is now saved to your account — it used to live only on this device; the profile card and fields no longer show made-up values (like age 29 / 78 kg) when empty.",
      },
      {
        type: "fixed",
        tr: "Android geri tuşu, Escape ve ekranın dışına dokunma rehberi temiz biçimde kapatıyor; arka plandaki sayfa kilitli kalıyor ve kapanınca odak açtığın yere dönüyor.",
        en: "The Android back button, Escape and tapping outside close the tour cleanly; the page behind stays locked and focus returns to where you opened it.",
      },
    ],
    dev: [
      'Kok neden: SettingsSheet\'teki weight alt-gorunumu gercek veriye baglanmamis bir yer tutucuydu — mevcut kilo localStorage->profile.weightKg->literal "78", hedef kilo i18n `settings.targetWeightValue` (3 dilde sabit "75 kg"), cubuk sabit `w-3/4`.',
      "Onboarding'in topladigi `profile.targetWeightKg` uygulamada HIC okunmuyordu (grep: yalnizca OnboardingModal + tdee tipi) — hedef kilo artik tek dogruluk kaynagi bu alan.",
      "lib/weight.ts: sortedEntries/latestEntry/seedEntry/parseBodyStats/profileWeightEntries/weightProgress (saf + testli). weightProgress tek formulle iki yonde calisir ve [0,1] kirpilir; |hedef-baslangic|<0.05 ise pct=null.",
      "components/WeightSettings.tsx (yeni): ozet + gercek ilerleme + RangePicker/WeightTrendCard + olcum listesi (tek tek silme); yazma yolu WeightCard'in kendisi (tek yazar).",
      "profileWeightEntries: yalnizca kilo alani BU oturumda duzenlendiyse yazar — sadece adi duzeltmek icin kaydetmek bugunun olcumunu bayat form degeriyle eziyordu.",
      "handleSaveProfile artik `config.profile`a yaziyor (onceden SADECE localStorage) ve form onceligi config-first'e cevrildi; `hasCompletedOnboarding` spread ile korunuyor.",
      "Sihirbaz bitisinde `seedEntry` ile bugune baslangic olcumu yazilir (try/catch — kurulumu bloklamaz; o gun kayit varsa dokunmaz).",
      'Uydurma veri temizligi: avatar fallback literal `"EB"` -> jenerik ikon; form varsayilanlari "29"/"78"/"178" -> bos; profil kartindaki kg yalnizca gercek deger varsa yazilir.',
      'Ayarlar sirasi: veri satiri Hesap & Profil -> Veri & Destek (ilk satir); kilo satiri hedeflerin altina; Destek blogu veri/gizlilik/geri bildirim/destek/yardim/surum sirasinda; `settings.accountActions` basligi "Hesap Islemleri" -> "Uygulama & Hesap"; olu anahtar `targetWeightValue` 3 dilden silindi (796 -> 814 anahtar).',
      "Backend DEGISMEDI; `config.weight` sekli (`{entries}`) ayni — migration yok.",
      "lib/guide.ts (saf): GUIDE_VERSION + parseGuideState/isGuideDone/shouldShowGuide + GUIDE_STEPS; guide.test.ts karar matrisini ve adim tablosunu kilitler.",
      "Rehber durumu `config.guide` altinda (RESERVED_CONFIG_KEYS'e dokunulmadi; anahtar `^[a-z][a-z0-9_]{0,31}$` desenine uyuyor) — backend DEGISMEDI.",
      "components/ProductGuide.tsx: tek portal, uc katman (seffaf perde + box-shadow spotlight + kart); yerlesim lib/anchor.placeAnchoredPanel ile, odak/geri-tusu useDialogFocus/useModalHistory/useBodyScrollLock ile (elle focus trap YOK).",
      "Kapilanma yolu = skipped, son adimda Tamam = completed; niyet ref'te tutulup useModalHistory'nin onClose'unda okunuyor (geri tusu ile X ayni onClose'a dusuyor).",
      "data-guide-target isaretleri: StatCardCarousel (day-summary), DayView iki ekleme CTA'si (add-meal), BottomNav sekmeleri (${tab.id}-tab) + FAB (fab).",
      "Hedef bulunamazsa kart ekranin ortasina duser (tur yarida kesilmez); changelog popup'i rehber kapanana kadar erteleniyor.",
    ],
  },
  {
    version: "0.30.0",
    date: "2026-09-13",
    summary: {
      tr: "Bir öğüne uzun basarak (ya da satırdaki ⋮ düğmesiyle) işlem menüsünü açabilirsin: şablon olarak kaydet, aynısından bir tane daha ekle, düzenle, seç, tarif olarak kaydet (100 g) ve sil. Menü, dokunduğun satırın yanında yüzen yuvarlak bir panel olarak açılır; parmağını kaldırırken aksiyon kendiliğinden çalışmaz ve arkadaki sayfa kaymaz.",
      en: "Long-press a meal (or use its ⋮ button) to open its actions: save as a template, add another one, edit, select, save as a recipe (100 g) and delete. The menu floats as a rounded panel next to the row you touched; lifting your finger won't trigger an action, and the page behind stays put.",
    },
    items: [
      {
        type: "new",
        tr: "Öğüne uzun basınca işlem menüsü açılıyor; öğünü tek dokunuşla şablon olarak kaydedebiliyorsun.",
        en: "Long-pressing a meal opens an action menu; you can save the meal as a template with one tap.",
      },
      {
        type: "new",
        tr: "Menü, dokunduğun satıra demirlenen yüzen yuvarlak bir panel: basış noktasından büyüyerek açılır, satırlar 30 ms arayla gelir, kapanırken aynı yoldan geri çekilir.",
        en: "The menu is a floating rounded panel anchored to the row you touched: it grows from your press point, its rows arrive 30 ms apart, and it retracts the same way when it closes.",
      },
      {
        type: "new",
        tr: "Uzun basarken satırın altında 500 ms'lik bir dolgu göstergesi ilerliyor: ne kadar tutman gerektiğini ve basışın nereye gittiğini gösterir.",
        en: "While you hold, a 500 ms fill indicator advances along the bottom of the row, showing how long to hold and where the press is heading.",
      },
      {
        type: "new",
        tr: "Menüden öğünü bugüne kopyalayabilir, seçim moduna alabilir ve tarif olarak kaydedebilirsin.",
        en: "From the menu you can copy a meal to today, add it to a selection, or save it as a recipe.",
      },
      {
        type: "fixed",
        tr: "Uzun basıp parmağını kaldırınca menü kendiliğinden bir aksiyon çalıştırmıyor ya da kapanmıyor (parmağın kalkışı menüye geçmiyor).",
        en: "Lifting your finger after a long press no longer triggers or dismisses the menu by itself (the release doesn't leak into the menu).",
      },
      {
        type: "fixed",
        tr: "Menü açıkken arkadaki sayfa hiç kaymıyor; kaydırma denemeleri menü kapanana kadar yutulur.",
        en: "While the menu is open the page behind cannot scroll; scroll attempts are swallowed until it closes.",
      },
      {
        type: "fixed",
        tr: "Kaydedilmiş şablonlar Bugün sekmesinde yeniden görünüyor (tek dokunuşla ekleme çipleri).",
        en: "Saved templates are visible again on the Today tab as one-tap add chips.",
      },
      {
        type: "improved",
        tr: '"Şablon olarak kaydet" ve "Tarif olarak kaydet (100 g)" artık ne yaptıklarını söylüyor: şablon öğünü tek dokunuşla geri getirir, tarif hafızada 100 g\'ı üzerinden hesaplanan yeni bir besin yaratır.',
        en: '"Save as a template" and "Save as a recipe (100 g)" now say what they do: a template brings the meal back with one tap, a recipe creates a new food in memory measured per 100 g.',
      },
      {
        type: "improved",
        tr: "Menü klavyeyle de tam kullanılabiliyor: Tab panelin içinde kalır, Escape kapatır ve kapanınca odak menüyü açtığın satıra geri döner.",
        en: "The menu is fully keyboard-usable: Tab stays inside the panel, Escape closes it, and focus returns to the row you opened it from.",
      },
      {
        type: "fixed",
        tr: "Menüdeki satırlar (sil, düzenle, şablon kaydet) artık çıkış animasyonunu beklemeden kapanmıyor; bekleme süresi kısaltıldı ve hareket her aksiyonda aynı.",
        en: "Menu rows (delete, edit, save as template) no longer drop the panel without its exit motion; the wait is shorter and every action now moves the same way.",
      },
      {
        type: "fixed",
        tr: "Tam ekran pencerelerde (öğün ekle/düzenle, besin ekle, tarif, besin detayı, ilk kurulum) klavye kullanırken Tab artık pencerenin dışına kaçmıyor, Escape kapatıyor ve kapanınca odak açtığın yere dönüyor.",
        en: "In full-screen sheets (add/edit meal, add food, recipe, nutrition detail, onboarding) Tab no longer escapes the window, Escape closes it, and focus returns to where you opened it.",
      },
    ],
    dev: [
      "lib/mealActions.ts (saf): mealToTemplate, duplicatePayload, buildRecipePreset, canSaveAsRecipe, mealMenuActions, mealSheetReducer.",
      "Uzun basma: lib/longPress.ts + hooks/useLongPress.ts; usePressSpring handler'lari ile birlestirildi, sentetik click yutulur, `holding` dolgu gostergesini besler.",
      "Basış kapısı (lib/pressGate.ts + hooks/usePressGate.ts): iki fazlı (basili: zaman asimi yok / birakildi: 400 ms click penceresi); capture asamasinda click yutulur, `data-gated` hover/active'i sondurur. Sizinti uretim derlemesinde olculdu (click perdeye dusuyordu).",
      "lib/anchor.ts (saf): placeAnchoredPanel — alt/ust secimi, kenar kisitlari, transform-origin basis noktasindan; MealActionSheet artik paylasilan Modal'i degil kendi yuvarlak panelini kullaniyor (portal + FAB malzeme dili).",
      "Arka plan kilidi: onTouchMove preventDefault React 17+ (passive) yuzunden ETKISIZDI — wheel/touchmove icin pasif olmayan pencere dinleyicisi eklendi; panelin kendi govdesi muaf.",
      "Animasyon: index.css .menu-panel-in/out, .menu-item-in (30 ms stagger), .menu-step-in, .hold-fill — iki temada da calisir (velvet dahil).",
      "Sablon cipleri enableScan'den ayrildi (o bayrak artik hic true gecmiyordu — cipsler ölüydü); HistoryPage showTemplates={false}.",
      "Menu → MealForm/RecipeBuilder gecisi afterHistoryBackSettles ile sarili (zombi gecmis girdisi yok).",
      "updateConfig cevrimdisi kuyruga girmedigi icin 'Sablona ekle' offline'da pasif; sil/cogalt kuyruga girer.",
      "Inceleme sertlestirmesi: useLongPress onPointerLeave + pencere seviyesinde pointerup emniyeti (capture kaybolsa da jest sonlanir); clearClickSuppression artik gercekten donuyor (tipcheck kirikti).",
      "Simetrik cikis TEK yoldan yonetiliyor: MealActionSheet.closeThen(cikis animasyonu → aksiyon) — sil/sablon/cogalt/duzenle/sec/tarif yollarinin HEPSI ayni hareketi izler; unmount'ta cikis zamanlayicisi temizlenir.",
      "aria-modal iddiasi karsilandi: Tab tuzagi + kapanista odak iadesi (Modal.tsx deseni). menu-panel-out artik girisin baslangic degerine (scale 0.92) doner.",
      "anchor: kenar bosluklari yalnizca sigdiginda uygulanir (cok dar WebView'da tasma yok); kullanilmayan PANEL_MIN_WIDTH kaldirildi.",
      "Diyalog odak yonetimi tek kaynakta: lib/focusTrap.ts (saf: FOCUSABLE_SELECTOR, nextTrapIndex, acik diyalog yigini) + hooks/useDialogFocus.ts. Modal/ScanSheet/MealActionSheet'teki uc elle kopya teklesti; OnboardingModal ve dort data-modal tam-ekran sheet (MealForm, RecipeBuilder, AliasForm, NutritionSheet) ayni hook'a baglandi — aria-modal ilan edip tuzak kurmayan iddia kapandi.",
      "Ic ice diyaloglarda Escape artik tek katmani kapatir (kamera sheet'i icindeki onay karti + Modal ayni olayda ikisi birden kapaniyordu) — yigin tepesini lib/focusTrap.ts belirler.",
      "Olcumle bulunan iki hata: (1) kapsayici `visibility: hidden` iken focus() SESSIZCE basarisiz oluyordu (yerlesim olculmeden once odak cagriliyordu) — hook artik `ready` ile yeniden deniyor ve basariyi olcuyor; (2) odagi tasiyan efekt ayri bir efekte bolununce previouslyFocused artik panelin kendisi oluyordu ve kapanista odak BODY'ye donuyordu — yakalama ref'e alinip odak denemesinden ONCE yapiliyor.",
      "Menu cikis animasyonu 160 ms → 120 ms (MealActionSheet EXIT_MS + index.css menu-panel-out/menu-scrim-out birlikte): sil 159 ms, duzenle 166 ms (click→form), Escape 30 ms.",
    ],
  },
  {
    version: "0.29.0",
    date: "2026-09-08",
    summary: {
      tr: "Kayıtlı besinler için varsayılan birim seçebilirsin. Yeni öğünlerde yumurtayı adet, protein tozunu ölçek gibi kendi alışkanlığına uygun şekilde kullanmak artık daha hızlı.",
      en: "You can now choose a default unit for saved foods. New meals can start with the unit you actually use, such as pieces for eggs or scoops for protein powder.",
    },
    items: [
      {
        type: "new",
        tr: "Her kayıtlı besin için varsayılan birim belirleme desteği eklendi.",
        en: "Added support for choosing a default unit for each saved food.",
      },
      {
        type: "improved",
        tr: "Yeni öğünlerde varsayılan birimin porsiyon miktarı otomatik olarak doğru dönüştürülüyor.",
        en: "Default meal quantities are now automatically converted to the selected unit.",
      },
    ],
    dev: ["Alias defaultUnit alanı; g fallback'i ve özel birim serving dönüşümü."],
  },
  {
    version: "0.28.9",
    date: "2026-09-07",
    summary: {
      tr: "Güvenlik iyileştirmeleri yapıldı: beklenmedik hatalar artık detay sızdırmıyor, öğün ve besin kayıtlarında giriş doğrulaması güçlendirildi.",
      en: "Security improvements: unexpected errors no longer leak details, and stricter input validation was added for meal and food entries.",
    },
    items: [
      {
        type: "fixed",
        tr: "Beklenmedik hatalarda teknik detayların (iç klasör yolları vb.) ekrana düşmesi engellendi.",
        en: "Unexpected errors no longer expose technical details (such as internal file paths) on screen.",
      },
      {
        type: "fixed",
        tr: "Öğün ve besin kayıtlarında giriş doğrulaması güçlendirildi: geçersiz kayıtlar sunucuda reddediliyor.",
        en: "Input validation strengthened for meal and food entries: invalid records are now rejected on the server.",
      },
    ],
    dev: [
      "Beklenmedik 500'ler client'a genel mesaj döner (madde 13).",
      "server/meals.js izole modülü ile /api/day öğe doğrulaması (madde 6,25).",
    ],
  },
  {
    version: "0.28.8",
    date: "2026-09-04",
    summary: {
      tr: "Artık uygulama içinden doğrudan geri bildirim gönderebilir ve yeni özellik isteyebilirsin. Ayrıca her güncellemeden sonra nelerin değiştiğini bu changelog ekranından görebilirsin.",
      en: "You can now send feedback and request new features right from the app. You can also see what changed in every update from this in-app changelog screen.",
    },
    items: [
      {
        type: "new",
        tr: 'Uygulama içinden geri bildirim ve özellik isteği gönderebilirsin ("Özellik iste ve geri bildirim" bölümünde).',
        en: 'Send feedback and feature requests from inside the app (in the "Request a feature & feedback" section).',
      },
      {
        type: "new",
        tr: "Her sürüm sonrası değişiklikleri sana gösteren changelog eklendi (bu ekran).",
        en: "Added a changelog that shows you what changed after each release (this screen).",
      },
    ],
    dev: [],
  },
  {
    version: "0.28.0",
    date: "2026-08-31",
    summary: {
      tr: "0.28 serisiyle uygulama çevrimdışı da kullanılabilir hale geldi: internet olmasa bile kayıtlarını tutar, bağlanınca otomatik senkronize eder. Arayüz Türkçe, İngilizce ve Lehçe olarak tamamen çevrildi; kamera ve barkod tarama elden geçirildi. Ayrıca Android (Play Store) hazırlıkları başladı.",
      en: "With the 0.28 series the app now works offline: you can keep logging without an internet connection and it syncs automatically once you're back online. The whole interface is now fully translated into Turkish, English and Polish; camera and barcode scanning were reworked. Android (Play Store) groundwork also began.",
    },
    items: [
      {
        type: "new",
        tr: "Çevrimdışı destek: internet olmadan da kayıt yapabilir, verilerin bağlantı gelince otomatik senkronize olur.",
        en: "Offline support: log entries without an internet connection; data syncs automatically when you're back online.",
      },
      {
        type: "new",
        tr: "Tüm arayüz Türkçe, İngilizce ve Lehçe dillerine eksiksiz çevrildi.",
        en: "The full interface is now translated into Turkish, English and Polish.",
      },
      {
        type: "improved",
        tr: "Kamera ve barkod tarama deneyimi iyileştirildi.",
        en: "Camera and barcode scanning experience improved.",
      },
      {
        type: "improved",
        tr: "Android sürümü ve Play Store yayını için hazırlıklar başladı.",
        en: "Preparations started for an Android build and Play Store release.",
      },
    ],
    dev: [
      "feat(offline): yazma kuyrugu + projection + conflict korumali sync + SyncStatus UI",
      "feat(offline): sync cift sekme korumasi (Web Locks) + arama/barkod/kamera cevrimdisinda kilitli",
      "feat(i18n): react-i18next kurulumu + EN/TR/PL tam geçiş (Sayfalar/Modal'lar/leaf card'lar)",
      "fix(camera): ScanSheet elle giriş + önizleme geri navigasyonu; barkod modunda manuel giriş",
      "feat(capacitor): Android platformu + Play Store sarmalayıcı hazırlığı",
      "feat(ai): fotoğraf yükleme için tek seferlik onay + Sentry crash raporlama",
    ],
  },
];

export const CHANGELOG_LATEST = CHANGELOG[0]?.version ?? null;
