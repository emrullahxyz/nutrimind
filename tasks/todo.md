# tasks/todo.md

**Güncel olan tek bölüm aşağıdaki `## AÇIK İŞLER` bloğudur.** Altındaki faz kayıtları tarihçedir
(silinmez, yalnızca eklenir). Ayrıntılı uygulama planları `docs/superpowers/plans/` altında tutulur
ve tamamlanınca `docs/archive/superpowers/`'e taşınır. (Eski `~/.claude/plans/` yolu artık
kullanılmıyor; CLAUDE.md de yalnızca AGENTS.md'ye köprüdür.)

## AÇIK İŞLER

- [ ] **Kilo geçmişini toplu temizleme** — v0.30.1'de yanlış/eski ölçümler TEK TEK
      silinebiliyor (Ayarlar → Kilo & Vücut Geçmişi); "tümünü temizle" ya da "tüm geçmişi
      tarihle birlikte dışa aktar" istenirse eklenmeli (geri dönüşsüz olduğu için onay diyaloglu).
- [ ] **Saide'nin Google girişi** — Google Cloud Console → OAuth consent screen ("Testing") →
      **Test users** listesine eklenmeli; eklenmezse Google onu reddeder (parolayla giriş çalışır).
- [ ] **Play Store yayını** — keystore üret → SHA-256 fingerprint →
      `public/.well-known/assetlinks.json` placeholder'ını doldur → signed AAB → Console yükleme.
      Adımlar: `docs/archive/superpowers/2026-08-26-play-store-readiness.md` Task 21.
- [x] ~~**Uygulamada "çıkış yap" düğmesi yok.**~~ — VAR: Ayarlar → Uygulama & Hesap →
      Çıkış Yap (onay diyaloglu, kırmızı). Kayıt 2026-09-15'te güncellendi.
- [x] ~~**Uygulamada parola değiştirme ekranı yok**~~ — VAR: Ayarlar → Hesap & Profil →
      Parola Değiştir. Kayıt 2026-09-15'te güncellendi.
- [ ] **Prod `.env`: `NUTRI_AI_RATE_VISION`** (varsayılan 5/dk, `server/ai.js`) — birkaç denemeden
      sonra vision rate limit'e takılıyor; kod değişikliği gerekmiyor, tek satır env.

**Bu taramada kapatılanlar (2026-09-13):** a11y kalemlerinin ikisi de doğrulandı ve kapandı —
`OnboardingModal.tsx:448` `w-20 sm:w-24` (320 px taşması) ve `FormBits.tsx:17,51,88` `useId`+`htmlFor`
eşleşmesi. Odak tuzağı işi de tamamlandı (`useDialogFocus`, v0.30.0). İki superpowers planı
(play-store Task 17-20/22/23 · offline Task 1-7) dosya bazında doğrulanıp arşive taşındı:
`docs/archive/superpowers/`.

---

## FAZ A — Kamera + AI (ACİL, tek başına deploy)

- [x] **A0** Ön koşul: AI gerçekten cevap veriyor mu?
      → `POST /api/ai/vision` **200**, 3.8 sn, Gemini Türkçe `healthNote` döndü.
      Önceki turdaki "kota 0" durumu geçmiş. `mode:"food_photo"` de doğru dala düşüyor.
- [x] **A1** `src/lib/camera.ts`: kamera yaşam döngüsünü barkod dedektöründen ayır
      (`useCameraStream`, `useBarcodeDetection`, `cameraSupported`)
- [x] **A2** `captureVideoFrame()` + `cropRectFor()` — kareyi çerçeveye kırparak yakala
- [x] **A3** `ScanSheet` tam ekran + moda göre kesikli çerçeve + maske + deklanşör
- [x] **A4** "Food Label → galeri" bug'ı: `fileInputRef.click()` kaldır
- [x] **A5** Deklanşör → `parseMealImage()` → `onVisionResult()`; `"food_photo"` modu
- [x] **A6** "Analiz ediliyor…" örtüsü + iptal; `healthNote`'u hata mesajı olarak kullan
- [x] **A7** `cameraError` sıfırlanabilsin (`retry()`)
- [x] **A8** Elle barkod yedeği tam ekranda erişilebilir kalsın
- [x] **A9** _(tur içinde eklendi)_ "Sadece öğüne" — hafızaya yazmadan bugüne ekle
- [x] **A10** _(tur içinde eklendi)_ `client_secret_*.json` `.gitignore`'a alındı
- [x] **Kapı** typecheck 0 · test 407/407 · build ✓
- [x] **Doğrulama** sahte `MediaStream` ile dev VE üretim derlemesinde
- [x] **Commit + deploy** — `6f1b3d5`; canlı varlıklar yerel derlemeyle byte-byte aynı
      (`index-B0VtLohp.js` 413717 B, `index-nwg9SSA0.css` 58074 B). `server/ai.js` de
      senkronlandı (yedek: `ai.js.bak-2026-08-06-0857`), `nutri-api` aktif,
      canlı `/api/ai/vision` **200** döndü — önceki turdaki "Gemini kotası 0" sorunu geçmiş.

## FAZ A2 — gerçek cihaz geri bildirimi (telefonda test sonrası)

Dördü de doğrulandı ve düzeltildi:

- [x] **Bulanık görüntü + "etiketi bazen algılamıyor"** — tek kök sebep: `getUserMedia`
      HİÇBİR çözünürlük istemiyordu, tarayıcı düşük varsayılan seçiyordu. `width/height
  ideal 2560×1440` eklendi. AI'a giden etiket görseli **265×390 → 607×893** (piksel
      sayısı ~5 katı). Etiket JPEG kalitesi 0.85 → 0.92 (ince yazıyı en çok artefakt yiyor).
- [x] **Yakın çekimde odak** — `track.applyConstraints({advanced:[{focusMode:"continuous"}]})`,
      desteklemeyen cihazda sessizce yutuluyor (catch yolu tarayıcıda doğrulandı).
- [x] **"Kamera bazen hiç açılmıyor"** — `BottomNav.tsx:115` FAB menüsü kapanırken
      `history.back()` çağırıyor ama `markProgrammaticBack()` **çağırmıyordu**. Geciken
      `popstate` yeni açılan tarayıcıyı anında kapatıyordu. Yarış olduğu için aralıklıydı.
      Ölçüm: FAB > Yemek Taraması **0/5 → 8/8** açılıyor.
- [x] **Sahte "uygulamadan çıkmak için…" uyarısı** — sayaç yalnızca modalın dinleyicisini
      koruyordu; App'in global dinleyicisi aynı olayı görüp "kullanıcı kökte geri bastı"
      sanıyordu. `consumeProgrammaticBack(event)` artık olay-farkında: aynı olay için tüm
      dinleyiciler `true` alır, sayaç bir kez düşer. App de katıldığı için sayaç birikmesi
      (gerçek geri basışın yutulması) imkânsız. Ölçüm: 8/8 denemede uyarı **yok**, menüyü
      dışarı tıklayıp kapatınca da yok, **gerçek** geri basışta uyarı hâlâ çıkıyor.
- [x] Kapı: typecheck 0 · test **414/414** · build ✓
- [x] Commit + deploy — `6c81399`; canlı `index-C1xEnRqy.js` 414267 B, yerel derlemeyle aynı

## FAZ A3 — ikinci tur cihaz geri bildirimi

- [x] **"Fotoğrafı seçtim, hiçbir tepki yok"** — görsel analiz aslında BAŞARILIYDI
      (kullanıcının `IMG20260806094312.jpeg` dosyası: 476 KB gönderildi, 200 döndü,
      Gemini "Lipton Ice Tea Sparkling (100ml), 2 kcal" okudu) ama sonuç sessizce
      düşüyordu. Sebep L9'un aynısı: `MealForm`, `AliasForm`, `NutritionSheet`,
      `RecipeBuilder` `popstate` dinliyor ama paylaşılan sayaca **katılmıyordu**.
      `ScanSheet` kapanırken doğan `back()`, yeni açılan öğün formunu anında
      kapatıyordu. Ölçüm: artık "Lipton" ekranda, form açık.
- [x] **Ultra-geniş kamera kullanılıyordu** — `facingMode:"environment"` yalnızca
      "arkaya bakan bir kamera" der. Ultra-geniş lensler genelde SABİT ODAKLI →
      etiket yakın çekimde net çıkmıyor. `pickBackCameraDeviceId()` izin alındıktan
      sonra cihazları sayıp ana kameraya geçiyor (yardımcı lensler elenir; Android'de
      en küçük `camera2 N` indeksi ana kameradır). Etiketler boşken **null** döner —
      yanlış kamerayı seçmektense dokunmamak doğru. Ölçüm: cihaz ultra-genişi verdi
      (1280×960), kod ana kameraya geçti (2560×1440).
- [x] Kapı: typecheck 0 · test **422/422** · build ✓
- [x] Commit + deploy — `007e834`; canlı `index-C304DqZ7.js` 415512 B, yerel derlemeyle aynı

**Kullanıcı doğrulaması (2026-08-06):** ✅ ana kamera açılıyor, odaklama çok iyi çalışıyor.
Kalan tek şikâyet: birkaç denemeden sonra AI hatası → **rate limit**. `NUTRI_AI_RATE_VISION`
sunucuda varsayılan **5/dk** (`server/ai.js:77`). Kod değişikliği gerekmiyor, prod `.env`'de
tek satır. → **AÇIK İŞLER'e taşındı.**

### ~~Kalan borç (ayrı bir iş)~~ — KAPANDI (2026-09-13)

`MealForm`/`AliasForm`/`NutritionSheet`/`RecipeBuilder`, `Modal`'ın geçmiş mantığını elle
kopyalıyordu ve temizlikte `history.back()` yerine `replaceState` kullanıyordu — her form açılışı
geçmiş yığınına harcanmış bir girdi bırakıyordu. Doğrusu tek bir `useModalHistory` hook'una
çıkarmaktı.

**Durum (ölçüldü):** dört bileşenin de artık `popstate` dinleyicisi **0**; hepsi `useModalHistory`
kullanıyor. Aynı turda odak yönetimi de `useDialogFocus` altında tekleşti (2026-09-13 çalışması,
v0.30.0). Kural olarak yazıldı: AGENTS.md madde 9 — bu hata sınıfı (L9) bir daha elle
tekrarlanmasın.

## Sonraki fazlar (onaylı planda ayrıntılı)

- [x] **B** Saf auth ilkelleri — `server/auth.js` (Claude: scrypt/çerez/limit/köken),
      `src/lib/authRules.ts` + paylaşılan `authRules.cases.json` + iki test dosyası (agy).
      Uygulamanın davranışı DEĞİŞMEDİ; hiçbir yerden çağrılmıyor. Test 422 → **480**.
      Kayma koruması: iki test de AYNI vaka tablosunu kendi uygulamasına karşı koşuyor.
      agy'nin diff'i denetlendi: **kapsam ihlali yok**. (Turda iki silinmiş dosya görüp agy'yi
      suçlamıştım; onları kullanıcı silmişti — bkz. L11.)
- [x] **C** Service worker sızıntısı — `public/sw.js`. v1 HER başarılı GET'i koşulsuz
      önbelleğe yazıyordu: `/api/data` yanıtları (kullanıcının tüm beslenme verisi) Cache
      Storage'a düşüyor ve ağ tökezleyince oradan servis ediliyordu. Çok kullanıcıda bu
      doğrudan sızıntı olurdu. Düzeltme: `/api/*` hiç önbelleğe girmiyor, yalnızca
      same-origin, `nutrimind-v2` + `activate`'te eski cache'in **silinmesi**.
      Tarayıcıda ölçüldü (v1'e sahte kullanıcı verisi konup yeni SW yüklendi):
      v1 silindi ✓ · v2 yalnızca `/`, JS, CSS, logo içeriyor ✓ · SW kontroldeyken
      `/api/data` çağrıldı, önbelleğe girmedi ✓ · Google Fonts artık önbelleklenmiyor ✓
      **Davranış değişikliği:** çevrimdışıyken uygulama kabuğu yükleniyor ama veri
      gelmiyor ("Veri alınamadı" ekranı). Gerçek çevrimdışı desteği kullanıcıya göre
      anahtarlanmış bir IndexedDB deposu ister — ayrı bir iş.
      Deploy edildi (`7ed7163`): canlı `sw.js` HTTP 200, `nutrimind-v2` + `/api/` filtresi doğrulandı.
- [x] **D** DB göçü v0 → v2. `server/migrate.js` (+12 test) ve `server/index.js`'te 19 sorgu
      noktasının kapsamlanması. **Kullanıcı onayı alındı** (AGENTS.md madde 1'in donmuş dosya kuralı).
      Oturum kavramı YOK — `currentUserId()` sabit sahibi döndürüyor, uygulama aynen bugünkü
      gibi çalışıyor. Faz E'de değişecek TEK yer o fonksiyon.
      **Prod yedeği:** `data.db.bak-2026-08-06-1030` (sunucuda + yerel kopya), integrity ok.
      **Gerçek verinin kopyasında doğrulandı:** göç 6 ms, 18 gün / 38 besin / 5 config
      korundu, üç tablonun içeriği **byte-byte aynı**, gidiş-dönüş birebir geri getiriyor.
      **Sunucu açılışta göçü otomatik yaptı**, `/api/data` veriyi bozulmadan döndürdü
      (hedef 2530 kcal, 20 Tem–6 Ağu). Dört yazma ucu da 200.
      **İzolasyon kanıtı:** ikinci kullanıcının verisi `/api/data`'da hiç görünmüyor;
      `weight` anahtarı ikisinde de var ve karışmıyor (v0'da bu PK çakışmasıydı).
      **Saldırı denemeleri:** başkasının besinini id ile ezmek → 404, silmek → kayda
      dokunmuyor. `aliasExists` bilerek kapsamsız (id'ler global benzersiz olmalı).
      ⏳ **Prod'a deploy EDİLMEDİ** — göç, yeni `index.js` sunucuya gittiği anda çalışacak.
- [x] **E** Oturum + e-posta/şifre, bayrak KAPALI (`a745737`). `server/auth.js` saf bırakıldı,
      DB/HTTP işi `server/authRoutes.js`'te. İzole modül sözleşmesi `{status, body}` →
      `{status, body, headers?}` genişletildi (Set-Cookie + Retry-After için). `index.js`'e
      11 satır, TEK önek bloğu. `setpassword.js` ile sahip parolası kuruluyor —
      "parolasız satırı sahiplen" akışı bilerek yazılmadı (hesap ele geçirme dalı).
- [x] **H** Google girişi (`37f1328`) — **sıra değişti, F'ten önce yapıldı** ki giriş ekranı
      bir kez yazılsın. `index.js`'e **sıfır satır** (E'deki önek bloğu sayesinde).
      Redirect + PKCE seçildi, GIS değil: GIS tarayıcıya sürüm sabitlenemeyen üçüncü taraf
      JS sokuyor ve erişilemezse buton sessizce hiç render olmuyor.
      Testler gerçek RSA anahtarıyla, ağa çıkmadan: bozuk imza, kurcalanmış payload,
      `alg:none`, HS256 düşürme, **başka uygulama için üretilmiş geçerli token** (`aud`),
      yanlış issuer, süresi dolmuş, bilinmeyen `kid` — hepsi reddediliyor.
      Callback yolu kullanıcının Console'da KAYITLI adresine uyduruldu.
      ✅ **Kullanıcı gerçek Google girişini yaptı:** mevcut hesaba BAĞLANDI (yeni hesap
      açılmadı), `display_name` Google'dan doldu, parola girişi yan yana çalışıyor.
- [x] **F** Giriş ekranı + ön yüz kapısı + **oturum zorunluluğu** (`38031f7`).
      Kapı `<ErrorBoundary>` ile `<DataProvider>` ARASINA — içeride olsaydı oturumsuz
      ziyaretçi giriş formu yerine "Veri alınamadı" ölü ekranını görürdü.
      401 gelince `AuthProvider` `anon`'a düşüyor, bu da `DataProvider`'ı komple unmount
      edip terminal `stale`/`err` durumlarını atıyor — `data.tsx`'e hiç dokunulmadı.
      `authApi.ts` bilerek `api.ts`'ten ayrı: orada 401 "parolan yanlış", burada "oturumun
      düştü"; karışsalardı yanlış parola kullanıcıyı giriş ekranına atardı.
      ⚠️ **Bu faz sırasında bulundu:** bayrak açıkken çerezsiz `/api/data` **200 + tüm veriyi**
      dönüyordu — giriş ekranı kozmetikti. Kullanıcı onayıyla `index.js`'e oturum kapısı
      bağlandı: `/api/auth/*` ve `/api/health` dışındaki her uç 401 (AI ve OFF dahil —
      basic-auth kalkınca `/api/ai/vision` açık kalırsa Gemini kotasını yakar).
      Ayrıca bir bug yakalandı: `currentUserId(req)` değişikliği, modül yüklenirken
      argümansız çağrılan tohumlama satırını `null`'a düşürüp sunucuyu **açılışta**
      öldürüyordu. İlk ölçüm bunu görmedi çünkü eski süreç hâlâ portu tutuyordu (L12).
- [x] **G** Kayıt sihirbazı — reflog'dan kurtarıldı (`OnboardingModal.tsx` 539 satır,
      `tdee.ts` 136, `tdee.test.ts` 51), **asıl hata düzeltildi**, palete oturtuldu, bağlandı.
      **Asıl hata:** hedefler `updateConfig("goals", …)` ile yazılıyordu ama `goals`
      `RESERVED_CONFIG_KEYS` içinde → uç **400** dönüyordu. Kullanıcı 5 adımı dolduruyor,
      "Kaydet"e basıyor ve hedefler **hiç kaydedilmiyordu**. Artık `updateGoals`
      (`PUT /api/goals` → **200**, ölçüldü).
      **Tetik İKİ koşula bağlı:** profil kurulmamış **VE** hesapta hiç gün yok. Tek koşula
      bağlansaydı 18 günlük verisi olan mevcut kullanıcının karşısına da çıkardı.
      **Palet:** 55 ham hex (subagent) + 50 `purple/indigo/amber` (agy) temizlendi. Mor
      bilerek kaldırıldı: bu projede mor `memory`, yani "besin hafızası" özelliğinin rengi;
      sihirbazda kullanmak yanlış anlamsal sinyal verirdi. Gradient ve mor glow gölgesi de
      kaldırıldı — uygulamanın hiçbir yerinde gradient yok.
      **Bu fazda yakalanan İKİNCİ hata:** `handleFinish` kaydettikten hemen sonra `onClose`
      çağırıyor; kapatma yolum profili BAYAT değerle üzerine yazıp yaş/boy/kilo/BMR/TDEE'yi
      siliyordu (ilk ölçümde `profile` yalnızca `{hasCompletedOnboarding:true}` içeriyordu).
      Ref guard'ı eklendi; ikinci ölçümde profil **11 alanla** tam kaydedildi.
      Tarayıcıda uçtan uca: 5 adım, BMR 1582 / TDEE 2452, `PUT /api/goals` 200,
      `PUT /api/config/profile` **tek** çağrı 11 alan, modal kapandı.
- [x] **I** Prod'a alma — **iki adımda** (kullanıcının seçimi: önce giriş kapalı gitsin, dene,
      sonra aç). Sıra bozulmadı: yedek → env → dosyalar → göç → doğrula → bayrak → basic-auth.

      **Adım 1 (giriş KAPALI):** `data.db.bak-2026-08-07-0620`, `index.js.bak-…`, `.env.bak-…`
              yedekleri alındı. `.env`'e ayarlar **göçten ÖNCE** yazıldı (`NUTRIMIND_OWNER_EMAIL`
              yalnızca göç anında okunuyor). 6 sunucu dosyası md5 eşleşmesiyle gitti.
              Canlı log: `şema göçü: v0 → v2 { days: 18, aliases: 38, config: 5 }` — sahipsiz satır 0,
              `integrity_check ok`, servis hatasız, `/api/ai/parse` 200. Ön yüz de deploy edildi.
              ✅ Kullanıcı telefonda doğruladı: giriş yapılıyor, veriler yerinde.

              **Adım 2 (giriş AÇIK + basic-auth kaldırıldı):**
              - Sahip parolası kuruldu; Saide'nin hesabı `--create` ile açıldı (kayıt kapalı kaldı).
              - nginx `app.conf` yedeklendi, `auth_basic` iki bloktan da kaldırıldı, `nginx -t` geçti.
              - Dışarıdan HTTPS doğrulaması: ana sayfa 200, `/api/data` `/api/auth/me`
                `/api/ai/vision` **401**, `/api/health` 200. Emrullah girişi → 18 gün/38 besin;
                Saide girişi → **0 gün/0 besin, sızıntı yok**. Çerez `__Host-nm_session`.

              **Bu adımda yakalanan iki güvenlik açığı (planda yoktu):**
              1. `setpassword.js` e-posta bulunamazsa **sahip hesabını devralıyordu** — Saide'nin
                 adresiyle çalıştırmak Emrullah'ın hesabının e-postasını değiştirip üzerine yazardı.
                 Artık sahip yalnızca HÂLÂ SAHİPSİZKEN (yer tutucu e-posta + parola yok)
                 devralınabiliyor; yeni hesap için açık `--create` gerekiyor.
              2. nginx `X-Forwarded-For` göndermiyordu → IP başına hız sınırı herkesi tek kovaya
                 (127.0.0.1) düşürüyordu, yani bir saldırgan tüm kullanıcıları kilitleyebilirdi.
                 Başlık eklendi VE kod `X-Real-IP`'ye de düşecek şekilde sağlamlaştırıldı (YunoHost
                 vhost'u yeniden üretirse elle eklenen satır kaybolabilir).

- [x] **Kullanıcı doğrulaması:** ✅ Google ile giriş sorunsuz çalıştı.
      ⚠️ Ama ilk açılışta "Veri alınamadı (API 401)" ölü ekranı görüldü, yenileyince düzeldi.
      **Sebep nginx'te:** hiçbir dosyaya `Cache-Control` gönderilmiyordu → tarayıcı
      `index.html`'i doğrulamadan önbellekten verdi → ESKİ JS çalıştı. Teşhisi veren ipucu
      mesajın kendisiydi: "API 401" metni yeni kodda YOK (yeni sürüm "Oturum sona erdi" der).
      **Düzeltildi:** `index.html` + `sw.js` → `no-cache`; `/assets/*` → `immutable`, 1 yıl.
      Doğrulandı. Bu, Saide'nin ilk açılışını ve GELECEK her güncellemeyi de koruyor (L13).

- [ ] **Saide'nin ilk girişi bekliyor.** ⚠️ Google ile girebilmesi için Google Cloud
      Console'da **Test users** listesine eklenmesi gerekiyor (consent screen "Testing"
      modunda). Eklenmezse Google onu reddeder; parolayla giriş her hâlükârda çalışır.
      → **AÇIK İŞLER'e taşındı.**

### Kalan küçük işler (kullanıcıya önerildi, henüz onaylanmadı)

- Uygulamada **çıkış yap** düğmesi yok.
- Uygulamada **parola değiştirme** ekranı yok (şimdilik `setpassword.js` ile sunucudan).

→ İkisi de **AÇIK İŞLER'e taşındı** (2026-09-13).

---

## Review — Faz A

**Kök sebep.** "Kamera yemek tanıma yapamıyor"un sebebi eksik bir özellik değil, bir kilitti:
`cameraScanSupported()` (off.ts:365) kamerayı açmadan önce `BarcodeDetector` arıyordu ve
`useOffScanner`'ın efekti dedektör yoksa kamerayı hiç başlatmıyordu. Yemek/etiket okuma barkoda
ihtiyaç duymadığı hâlde ona bağlıydı. Kamera (`useCameraStream`) ile barkod (`useBarcodeDetection`)
ayrıldı; `useOffScanner` artık ikisinin bileşimi, `OffSearch`'ün API'si değişmedi.

**Galeri bug'ı.** `ScanSheet.tsx:382-393` "Food Label"a basınca `fileInputRef.current?.click()`
çağırıyordu — canlı etiket okuma diye bir şey yoktu. Galeri artık yalnızca kendi düğmesinde.

**Çerçeve işlevsel hâle geldi.** Kesikli dikdörtgen artık dekor değil: `cropRectFor` onu videonun
kendi piksellerine çeviriyor ve kare tam oraya kırpılıyor.

**Tarayıcıda ölçülen kanıtlar** (gerçek kamera yok; `getUserMedia` canvas tabanlı gerçek bir
`MediaStream` ile sarmalandı):

| Ne                                            | Sonuç                                                   |
| --------------------------------------------- | ------------------------------------------------------- |
| Kamera tam ekran açılıyor ve **açık kalıyor** | ✅ 375×753 video, `object-cover`                        |
| "Etiket"e basınca galeri açılıyor mu          | ✅ **hayır** (dosya seçici casusu 0 kayıt)              |
| Mod değişimi kamerayı yeniden başlatıyor mu   | ✅ hayır (tek `getUserMedia`)                           |
| Deklanşör → kırpma                            | ✅ 265×390 gönderildi; kenar gürültüsü **%0**           |
| Gemini kırpılmış etiketi okudu                | ✅ 250 kcal / 12 P / 30 K / 8 Y / 3 L — birebir         |
| Geri tuşu (üretim derlemesi)                  | ✅ modal kapanıyor **ve** kamera duruyor (`track.stop`) |
| "Sadece öğüne", ifade boşken                  | ✅ aktif; öğün +1, hafıza değişmedi, `sources` yok      |

**İki yanlış ölçüm, düzeltildi.** (a) Panel gizliyken `getBoundingClientRect` donuk değer veriyor —
çerçeve üç modda da aynı sanılmıştı; inline stiller doğruydu. (b) Dev'de geri tuşu çalışmıyor
göründü; sebebi React StrictMode'un efekti iki kez çalıştırması. Üretim derlemesinde doğru çalışıyor
(`vite preview`'a `/api` vekili eklendi ki bu doğrulama yapılabilsin).

**Geçici bir upstream hatası görüldü:** ilk deklanşör isteği Gemini'den 502 aldı, aynı görsel
sonraki üç denemede 200 döndü. Uygulama bunu doğru karşıladı (tarayıcı açık kaldı, doğru mesaj).

---

## Review — Kapsamlı QA (2026-08-09, rapor-only)

**Kararlar:** rapor-only (kod değişikliği YOK; `server/index.js` donmuş). AI kill-switch davranışı
test edildi (503 + UI hatası), Gemini anahtarı kullanılmadı. Ortam: `NUTRI_DB=server/data.qa.db`
scatch DB + `pnpm preview` (4173). Detaylı rapor: `docs/archive/qa/2026-08-09-bulgu-raporu (yapıldı).md`.

**Sonuç:** 11 fazdan Faz 0-10 tamamlandı; **7 bulgu** (1 SEV3 + 6 SEV4), Faz 8 (back-stack/nav)
**0 bulgu**. Tarihsel bug'ların tamamı (onboarding 400, bayat-profil ezme, FAB yeniden açılma,
sahte çıkış toast'ı, ilk-yükleme ölü ekranı) **FIXED ve doğrulandı**.

| Sev  | Alan        | Kısa açıklama                                                       | File:line                  |
| ---- | ----------- | ------------------------------------------------------------------- | -------------------------- |
| SEV3 | Öğün girişi | NutritionSheet aç-kaydet 2 ondalığı sessizce 1 ondalığa tırnaklıyor | `NutritionSheet.tsx:22-33` |
| SEV4 | Ana ekran   | Öğün satırı seçim modunda çift birim "800 kcal kalori"              | `MealRow.tsx:58`           |
| SEV4 | Öğün girişi | Negatif makro kabul edilip kayıtta sessizce 0'a clamp'leniyor       | `MealForm.tsx:576-585`     |
| SEV4 | Öğün girişi | Miktar 1g minimumsuz — "0.5" → 0 kcal öğün                          | `MealForm.tsx:234-239`     |
| SEV4 | Ana ekran   | Öğün satırı makroları tr-TR virgülü atlıyor ("12.5g P")             | `MealRow.tsx:87-95`        |
| SEV4 | Trend       | "Son 7 gün ort." aslında son 7 KAYITLI gün — etiket belirsiz        | `trend.ts:213`             |
| SEV4 | Ana ekran   | Girilmemiş çekirdek makro "0g", mikro "—" — ilke tutarsız           | `MacroCardGrid.tsx`        |

**Doğrulanan kritik akışlar (bulgu değil):** AI kill-switch 503 + zarif hata; kamera yoksa galeri/elle
barkod canlı; onboarding tamamla+atla (hedef 3015 v2, profil korunuyor); çift-geri çıkış toast'ı;
FAB→modal yığınlama; gün silme + History drilldown; alias öğretme 3 yol ayrımı; hedef `{}` PUT → 400.

**Bir yanlış ölçüm düzeltildi:** sihirbaz açıkken FAB'a "tıklayabildim" göründü — programatik
`.click()` yığınlamayı aşıyor; gerçek dokunuş modal z-[9999] tarafından engelleniyor (FAB z-50).
Bulgu değil.

**Önerilen kuyruk (rapor-only olduğu için HİÇBİRİ yapılmadı):**

1. (SEV3) `NutritionSheet` aç-kaydet dönüşümü: `fromDraft` gösterilen değeri yazıyor; çözüm çarpan
   mantığını gösterimden ayırmak.
2. (SEV4) `MealRow` seçim modu `formatKcal` ile normal mod çıplak `{kcal}` — biri tutarlılaştırılmalı.
3. (SEV4) Negatif makro input'u inline reddetmek (kayıt clamp'ı doğru ama sessiz).
4. (SEV4) Miktar alanına 1g altı reddi (VisionReview `MIN_VISION_MULTIPLIER` ile aynı kural).
5. (SEV4) `formatNumber`'ı `MealRow` makrolarına uygulamak (tr-TR virgül).
6. (SEV4) Trend etiketi "kayıtlı" ibaresini netleştirmek; `goalVaries` mantığı değil.
7. (SEV4) Çekirdek makro gösteriminde "bilinmiyor" durumu (0 yerine) — `nutrients.ts` sözleşmesiyle
   birlikte karar verilmeli; tek dokunuş değil, tasarım kararı.

## Düzeltme İncelemesi (2026-08-09)

Kullanıcı onayıyla bulgular **çözüldü** (plan: `imdi-senden-derinlemesine-bi-stateful-swan.md`).
7 bulgudan 6'sı düzeltildi; 7. (çekirdek makro "0g" vs mikro "—") kullanıcı kararıyla **değişiklik
yok** — "çekirdek her-zaman-sayı" sözleşmesi korunuyor, rapor nota olarak kalır. `server/index.js`
dokunulmadı.

| Bulgu                     | Dosya                           | Çözüm                                                                                                                                                           |
| ------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEV3 aç-kaydet tırnaklama | `NutritionSheet.tsx`            | `scaleMealNutrition` export + m=1'de lossless erken-dönüş (stepper m≠1 yuvarlaması korunuyor)                                                                   |
| SEV4 çift birim           | `MealRow.tsx`                   | seçim modu `formatKcal`→çıplak `{kcal}`, normal modla birebir                                                                                                   |
| SEV4 negatif makro        | `FormBits.tsx`                  | `acceptsNumericEntry` + `NumField`/`EditableStat` onChange guard'ı (uygulama geneli: MealForm, AliasForm, RecipeBuilder, ScanSheet, WeightCard, NutritionSheet) |
| SEV4 1g minimum           | `nutrition.ts` + `MealForm.tsx` | `clampMinGrams` saf fonksiyon; `handleGramsChange` gram biriminde uygular (gram dışı 0.5 meşru)                                                                 |
| SEV4 tr-TR makro          | `MealRow.tsx`                   | `macroNum` = `formatNumber(v, tamsayı?0:1)` → "12,5g P"                                                                                                         |
| SEV4 trend etiketi        | `TrendPage.tsx`                 | "Son 7 kayıtlı gün ort." + "Önceki 7 kayıtlı güne göre"                                                                                                         |

**Testler:** 589/589 (`+15`: `NutritionSheet.test.ts` yeni 7, `acceptsNumericEntry` 4,
`clampMinGrams` 4). `pnpm typecheck` 0 hata. `pnpm build` ✓.

**Tarayıcı doğrulaması (preview, scratch DB):** #1 `8.75`→aç/kaydet→DB `8.75` (mutasyon yok);
#2 seçim modu "800 kalori"; #3 Protein `-5` reddedildi (hem NutritionSheet hem Elle modu), pozitif
kabul; #4 Miktar `0.5`→`1`, `0` korundu, `200` geçti; #5 satır "12,5g P"; #6 trend kutuları
"kayıtlı" içeriyor. Temizlik: scratch DB silindi, listener yok, `server/data.db` dokunulmadı.

## Düzeltme İncelemesi (2026-08-09, kullanıcı bildirimi: 2 sorun)

QA turu deploy'undan sonra kullanıcı iki yeni sorun bildirdi; ikisi de saf frontend,
`server/index.js` dokunulmadı (donmuş kural).

| Sorun                                                                        | Dosya                        | Çözüm                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bug** İlerleme drilldown'ında düzenleme ekranı ekranın en üstünde açılıyor | `src/index.css`              | `.anim-zoom` `fill-mode: both` → `backwards`. `both`/`forwards` + `transform` animasyonu, animasyon bitse bile sarmalı `position:fixed` torunlar için KALICI containing block yapıyor (WebKit Bug 176858). Portal olmayan `NutritionSheet`/`MealForm` `fixed inset-0` ile viewport yerine sarmalın tepesine hizalanıyordu. Görsel kayıp yok: `zoomIn` son karesi `transform:none` |
| **UX** Uzun öğün ismi tek satırda `...` ile kesiliyor, okunmuyor             | `src/components/MealRow.tsx` | `<h4 truncate>` → `ExpandableMealName` (mevcut desen, `FormBits.tsx:394`): varsayılan 2 satır, isme dokununca `line-clamp-none` (tam açılır), `stopPropagation` sayesinde kartın geri kalanına tıklamak hâlâ düzenlemeye girer. Seçim modu `truncate` kalır (kasıtlı)                                                                                                             |

**Kök neden (bug):** drilldown'ı saran `.anim-zoom` (`animation: zoomIn … both`) `transform`
animasyon ediyor; `fill-mode: both/forwards`, animasyon BİTSE bile tarayıcının o elemanı
`position: fixed` torunları için kalıcı containing block olarak ele almasına yol açıyor. Bugün
sekmesinde transform sarmalı yok → orada doğruydu. Ders: `tasks/lessons.md` → **L14**.

**Testler:** 589/589 (değişmez), `pnpm typecheck` 0 hata, `pnpm build` ✓. Unit test eklenmedi:

1. düzeltme saf CSS, 2. mevcut bileşeni yeniden kullanıyor — ikisi de tarayıcıda doğrulandı.

**Tarayıcı doğrulaması (preview, scratch DB):** Bug 1 — drilldown'da öğüne tıkla → `NutritionSheet`
viewport tepesinde (top 0); "Öğün ekle" → `MealForm` aynı; "Ekstra Besin" yolu aynı; Bugün
sekmesinde öğüne tıklamak ortada açıyor (regresyon yok); FAB menüsü ve hafta barı tooltip'i
(`.anim-zoom` kullananlar) hâlâ düzgün. Bug 2 — uzun isim 2 satır; isme tıkla → tamamı açılır,
tekrar tıkla → kapanır; kartın isim-dışı alanına tıkla → düzenlemeye girer; kısa isim 1 satır
(yükseklik bozulmadı). Temizlik: server'lar durduruldu, scratch DB silindi, `server/data.db`
dokunulmadı.

## Gece Camı (Ethereal Glass) — İkinci Tema (2026-08-14)

Kullanıcı `/taste-skill:soft-skill` ile "glass" yönünü seçti; kapsam: mevcut velvet'in YANINA
ikinci, seçilebilir bir tema. Seçici: **Ayarlar → Uygulama Tercihleri** ("Görünüm" kartları:
Koyu İnci / Gece Camı). Değişmez ilke: **byte-identity** — velvet birebir aynı görünür.

- **Altyapı (Görev 1-3):** `tailwind.config.js` `withAlpha()` ile tüm renk token'ları
  `rgb(var(--x) / calc(var(--x-a,1) * <alpha>))` desenine taşındı; `src/index.css` `:root`
  velvet token bloğu + `[data-theme="glass"]` bloğu (cam yüzeyler, orblar, `glassRise`/
  `orbDrift`, `.glass-card`/`.glass-chip`/`.glass-header`, `--svg-*` tam-renk SVG var'ları).
  `src/lib/theme.ts` + `prefs.ts` + `App.tsx` (ThemeProvider en dışta) + `index.html` FOUC
  scripti (glass kullanıcısına velvet flaşı yok).
- **Süpürme (Görev 4, agy delegasyonu):** 4 paralel agy + tamamlayıcı agy; 23 dosyada ham-hex →
  token dönüşümü, her agy `pnpm typecheck` ile doğruladı. Tamamlayıcı agy bucket listemde
  olmayan `BottomNav.tsx`'i yakaladı (5 site). Benim düzeltmem: `MacroCardGrid`'de `${delayClass}`
  template literal olmadan literal string kalmıştı (stagger çalışmazdı) — backtick'e çevrildi.
- **Ayarlar (Görev 5):** statik "Koyu Tema — Varsayılan" satırı → iki kartlı seçici
  (`aria-pressed`, aktif `accent/10` + `border-accent/40`, `--svg-*` makro swatch'ları),
  tıklayınca `setTheme` → anında `data-theme` + localStorage + `theme-color` meta.
- **Doğrulama (Görev 6):** typecheck 0 · 593/593 test · build ✓. Üretim CSS'inde `calc()` alfa
  sözdizimi doğru, her iki tema token'ları mevcut. Tarayıcı: glass'a geçiş, üst bar cam hapi
  (blur 24px + inset ışık), orblar, ambient-glow, seçici etkileşimi; velvet'te body
  `rgb(23,22,34)` (birebir).

**Notlar:** `server/index.js` dokunulmadı; yeni bağımlılık yok. Piksel düzeyi screenshot
karşılaştırması yapılamadı (Browser pane görünür değildi) — byte-identity diff denetimi +
computed-style kontrolleriyle güvence altında. Glass localStorage'da `nutrimind.ui.theme`
anahtarında kalıcı; yoksa varsayılan velvet.

## Review — Glass Motion Pası (Apple Design, 2026-08-14, Görev 7-14 doğrulaması)

`/emil-design-skills:apple-design` + `/emil-design-skills:animate`: kartlara basınç hissi,
grafiklere kesilebilir spring geçişleri, materyal derinliği, dokunsal geri bildirim. Kapsam
yalnızca glass; velvet byte-identity. Yeni bağımlılık YOK (sıfır-bağımlılık rAF spring engine).
`server/index.js` dokunulmadı.

### Merkezî keşif: CSS `var()` pending-substitution tuzağı (FAB stagger "0s" bug'ı)

`animation` KISAYOLUNUN İÇİNDE `var()` varsa kısayol bir "pending-substitution" değeri olur:
parse zamanında açılamadığı için computed-value zamanında uygulanır ve longhand'lerinin
(özellikle `animation-delay`) **tüm** non-important bildirimlerini — özgüllük, kaynak sırası,
inline stiller fark etmeksizin — ezer. Yalnızca `!important` üstesinden gelir. Bu yüzden
`.rise-d-*`, `:nth-child` ve inline `animationDelay` stagger'ları sessizce ölüyordu.

**Düzeltme (Option 2):** kısayol temiz tutulur (`animation: glassRise 0.7s both`), easing
`animation-timing-function: var(--ease-glass)` longhand'ine taşınır. Kısayol böylece normal
cascade'e katılır (implicit delay 0s, alt özgüllüklü kural kazanabilir); var() longhand'i
yalnızca timing-function'ı etkiler (rakip bildirim yok → zararsız). **Kanıt:** reduced-motion
kaldırılınca FAB nth-child 0/30/60/90ms, rise-d 80/140/190/240ms, fadeup inline 120ms —
hepsi uygulanıyor. Dört giriş kuralı da aynı desene taşındı (`.anim-glass-rise`, `.anim-fadeup`,
`.fab-menu > *`, `.anim-scrim`).

### Test ortamı tuzakları (iki kez yanlış ölçüm)

1. **Preview `prefers-reduced-motion: reduce` + `prefers-reduced-transparency: reduce` FORCE**
   ediyor (desktop'ta bile kapatılamıyor). Global reduced-motion bloğu (index.css 632-650)
   tüm `animation-delay: 0ms !important` yapıyor — "0s" ASLINA BAKARSA doğru a11y davranışıydı.
   Gerçek cascade'i görmek için @media bloğu `sheet.deleteRule()` ile geçici kaldırıldı;
   yeniden yükleme geri getiriyor.
2. **CSSOM serileştirme tuzağı:** `el.style.animation` kısayoldan değil longhand'den ayarlandığında
   `""` döner. Ayrıca bu ortamda HER CSSStyleRule `cssRules`'ı truthy-boş döndürüyor — yanlış
   özyineleme selectors taramasını boşaltıyordu (815 kuralın hepsi düz style, katman yok).

### Doğrulama kapısı (hepsi geçti)

| Ne                      | Sonuç                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`        | 0 hata                                                                                                                           |
| `pnpm test`             | 593/593                                                                                                                          |
| `pnpm build`            | ✓ (3.01s)                                                                                                                        |
| Built CSS denetimi      | kısayol temiz + timing longhand'i, 20 glass kuralı, `active:scale-[0.98]` typo düzeltmesi mevcut                                 |
| FAB stagger             | 0/30/60/90ms (reduced-motion kaldırılınca)                                                                                       |
| rise-d / fadeup stagger | 80/140/190/240ms / inline 120ms                                                                                                  |
| Reduced-motion          | FAB delay 0s, fadeup `animation:none`+opacity 1, rise 0s — a11y doğru                                                            |
| Modal perdesi (scrim)   | `.anim-scrim` mevcut, `scrimFade` uygulanıyor, bg `rgba(0,0,0,0.85)`, panel `.anim-fadeup` (ScanSheet Modal'ı üzerinden ölçüldü) |
| Grafik spring           | WeekBars çubuk yükseklikleri 450ms arayla iki örnek birebir → spring hedefe oturmuş, sürüklenme yok                              |
| Blanket basınç          | CSSOM'da `[data-theme="glass"] button:not(:disabled):active { scale(0.97); transform 120ms var(--ease-glass) }`                  |
| Reduced-transparency    | token'lar azaltma bloğu değerlerinde: cal-card-a 0.90, elevated-2-a 0.92, row-a 0.80, bar-a 0.85, well-a 0.85                    |
| Velvet byte-identity    | `data-theme` yok, body `rgb(23,22,34)` (birebir), FAB transition'ı Tailwind default — glass kuralı devre dışı                    |

**Not:** basınç spring'i (usePressSpring) compaction'dan önce doğrulanmıştı ve CSS değişikliklerinden
etkilenmedi. `spring-press` + giriş animasyonu kombinasyonunda `animation-fill-mode: backwards`
düzeltmesi (animasyon bitince inline spring transform'u görünsün) ve `.spring-bar { transition:
none !important }` (MacroBar genişliğini glass'ta spring yönetir) CSS denetiminde yerinde.

**Ders:** `tasks/lessons.md` → CSS `var()`'ı animation kısayolundan uzak tut (L15).

---

## Kayıt sistemi: "İzinli E-postalar" davet listesi (2026-08-15)

Onaylanan plan: `ok-teknik-detay-vermi-sin-recursive-wreath.md`. Yalnızca listeye
eklenen e-postalar kayıt olabilir (Google "yeni" **ve** parola yolu); liste
uygulama içinden (Ayarlar → Hesap & Profil → İzinli E-postalar), yalnızca sahibin
gördüğü ekrandan yönetilir. `server/index.js` dokunulmadı (donmuş).

- [x] `server/googleAuth.js`: `linkDecision`'a `email` + `allowlist` parametreleri; yeni karar `"izinsiz"` (liste dolu + listede değil)
- [x] `server/authRoutes.js`: lazy `signup_allowlist` tablosu, `OWNER_EMAIL`, register kapısı, Google callback `"izinsiz"` → `kayit_izinsiz`, `/api/auth/admin/allowlist` (GET/POST/DELETE, yönetici dışı 403), `/me` → `isAdmin`
- [x] Frontend: `types.ts` `AuthCapabilities.isAdmin`, `authApi.ts` (`kayit_izinsiz` mesajı + 3 çağrı), `auth.tsx` NO_CAPS, `SettingsSheet.tsx` AllowlistForm (ekle/sil, yönetici menü satırı)
- [x] `.env.example`: ALLOW_SIGNUP + OWNER_EMAIL yorumları
- [x] Testler: 37 yeni (linkDecision 7, kapı 4, admin uçları 8, BAYRAKLAR'a OWNER_EMAIL) → 611/611

**Doğrulama:** `pnpm test` 611/611, `pnpm typecheck` 0 hata, `pnpm build` ✓.
HTTP smoke testi (geçici DB, 8791): sahip girişi → `isAdmin:true`; ekle → normalize
`"  Davetli@X.CO "` → `davetli@x.co`; tekrar ekle 409; listedeki kayıt 201; listede
olmayan 403; sil 404/200; sahip olmayan admin uçlarına 403. Temizlik: scratch DB
silindi, `server/data.db` dokunulmadı.

**Prod kalan (kullanıcı onayıyla):** yedek → `{authRoutes,googleAuth}.js` kopyala
(md5) → `.env`'e `NUTRIMIND_ALLOW_SIGNUP=1` → `systemctl restart nutri-api` →
`pnpm run deploy` → telefonla canlı doğrulama. Dikkat: liste boşken kayıt herkese
açık kalır — deploy sonrası hemen kişi eklenmeli.

---

## Öğün uzun-bas menüsü: yüzen panel + basış kapısı (2026-09-13)

Şablon kaydetme v0.26.2'de kaldırılmıştı; geri getirildi ve yalnızca kaydetme değil, **uygulama**
yolu da canlandı (şablon çipleri `enableScan`'e bağlıydı ve o bayrak hiçbir yerde `true`
geçmiyordu). Menü, paylaşılan `Modal`'ın alt-sheet'i olmaktan çıkıp satıra demirlenen yüzen
yuvarlak bir panele dönüştü.

- [x] `lib/anchor.ts` (saf): `placeAnchoredPanel` — alt/üst seçimi, kenar kısıtları, `transform-origin` basış noktasından
- [x] `lib/pressGate.ts` (saf) + `hooks/usePressGate.ts`: iki fazlı basış kapısı (basılı: zaman aşımı yok / bırakıldı: 400 ms `click` penceresi), capture aşamasında yutma, `data-gated`
- [x] `hooks/useLongPress.ts`: `LongPressOrigin` (pointerId + basış noktası) + `holding` dolgu göstergesi
- [x] `components/MealActionSheet.tsx`: portal + FAB malzeme dili, adım makinesi korunur, simetrik çıkış
- [x] `components/MealRow.tsx`: satır ref'i → çapa, ⋮ yolu, 500 ms dolgu çubuğu
- [x] `lib/mealActions.ts`: `canSaveAsRecipe` + `recipeReady` (tarif satırı çözülemeyen öğünde gösterilmez)
- [x] i18n 3 dil: "Şablon olarak kaydet" / "Tarif olarak kaydet (100 g)"
- [x] testler: `anchor.test.ts`, `pressGate.test.ts`, `mealActions` (canSaveAsRecipe + liste filtresi)
- [x] `index.css`: `menu-panel-in/out`, `menu-item-in` (30 ms stagger), `menu-step-in`, `hold-fill` — iki temada da (velvet dahil)
- [x] changelog 0.30.0 girişi güncellendi (aynı sürüm, henüz yayınlanmadı)

**Ölçüm (üretim derlemesi :4173):** uzun basma 537 ms'de açıldı · `side` yer varsa `below`, yoksa
`above` (iki geometride doğrulandı) · stagger 0/30/60/90/120 ms · dolgu `holdFill 0.5s` ·
**parmak kalkışından sonra menü açık kaldı** (kapı tıklamayı yuttu; öncesinde perdeye düşüp
menüyü kapatıyordu) · arka planda `wheel` `defaultPrevented: true`, panel içinde `false` ·
geri tuşu menüyü kapattı, zombi girdi yok · çevrimdışıyken yalnızca şablon satırı pasif ·
şablon kaydet + çoğalt uçtan uca çalıştı · ⋮ yolu kapı kurmadan açıyor.

**Kapı:** typecheck 0 · test 789/789 · check:i18n PARITY OK (777×3) · build ✓
**Temizlik:** `2026-09-13` fixture günü + geçici şablon silindi → veri orijinal halinde
(5 gün, `templates {list: []}`, 6 alias). Not: bu değişiklikler commit edilmedi.

### İnceleme sonrası kalan notlar (aynı tur, 2026-09-13)

İncelemede "düzeltilmedi, not düşüldü" denen iki madde kapatıldı:

- [x] **Diyalog odak yönetimi tek kaynakta:** `lib/focusTrap.ts` (saf: `FOCUSABLE_SELECTOR`,
      `nextTrapIndex`, açık diyalog yığını) + `hooks/useDialogFocus.ts`. `Modal` /
      `ScanSheet` / `MealActionSheet`'teki üç elle kopya tekleşti; `OnboardingModal`
      (aria-modal ilan edip hiç tuzak kurmuyordu) ve dört tam-ekran `data-modal` sheet
      (`MealForm`, `RecipeBuilder`, `AliasForm`, `NutritionSheet`) aynı hook'a bağlandı.
      İç içe diyaloglarda Escape artık TEK katmanı kapatır (kamera sheet'i içindeki onay
      kartı + Modal eskiden birlikte kapanıyordu).
- [x] **Menü çıkış gecikmesi:** `EXIT_MS` 160 → 120 ms (+ `index.css` ile birlikte) —
      simetri korunurken aksiyonların beklediği süre kısaldı.

**Ölçüm (üretim derlemesi :4173):** menü açılışında odak panelde · Tab son→ilk sarma ve
ilk→son sarma (`prevented: true`) · odak panel DIŞINA çıktığında geri çekiliyor · Escape
menüyü kapatıp odağı **⋮ butonuna** geri veriyor · `Düzenle` 166 ms (click→form), MealForm
odak içeride + 17 odaklanabilir öğe + Tab sarması · MealForm Escape 30 ms, RecipeBuilder 11 ms,
AliasForm 19 ms — üçünde de odak TETİKLEYİCİYE döndü · `Sil` onay adımı 10 ms, panel 159 ms'de
gitti, satır 194 ms'de DOM'dan düştü (DB'den de) · konsol 0 hata · veri orijinal hâlinde.

**Ölçümle bulunan iki gerçek hata (düzeltildi):** (1) panel `visibility: hidden` iken
`focus()` sessizce başarısız oluyordu → hook `ready` bayrağıyla yeniden dener ve başarıyı
ÖLÇER; (2) odağı taşıyan efekt ayrı bir efekte bölününce `previouslyFocused` panelin kendisi
oluyordu → odak `<body>`'ye dönüyordu; yakalama ref'e alındı (bkz. `lessons.md` L18/L19).

---

## Ayarlar düzeni + Kilo & Vücut Geçmişi (v0.30.1, 2026-09-15)

Kullanıcı bildirimi: _"Ayarlar bölümü biraz karışık geliyo… mantıklı bi sıralama olmalı"_ +
_"Hedefler&Takip bölümünde kilo&vücut geçmişinde bug var, çok önceden girilen bilgiler mevcut ya
da saçma sapan veriler var."_ → superpowers:systematic-debugging (kök neden önce) + brainstorming
(bounded: sıra/tasarım onayı).

### Kök neden (ölçüldü)

`SettingsSheet.tsx` içindeki `subView === "weight"` bloğu gerçek veriye bağlanmamış bir yer
tutucuydu; üç değerin üçü de uydurmaydı:

| Ekranda görünen | Gerçek kaynağı                                                            |
| --------------- | ------------------------------------------------------------------------- |
| "Mevcut Kilo"   | `localStorage.nutrimind_userweight` → `profile.weightKg` → literal `"78"` |
| "Hedef Kilo"    | `settings.targetWeightValue` i18n metni — 3 dilde de düz `"75 kg"`        |
| İlerleme çubuğu | sabit `w-3/4` (%75)                                                       |

`config.weight.entries` bu ekranda HİÇ okunmuyordu (bu yüzden "çok önceden girilen bilgi"), ve
sihirbazın 2. adımında zorunlu sorulan `profile.targetWeightKg` uygulamada hiçbir yerde
okunmuyordu (grep: yalnızca `OnboardingModal` + `tdee` tipi). Üretim derlemesinde (:4173, gerçek
8790 backend) hiç profili/kilosu olmayan hesapla ekran "78 kg / 75 kg" ve %75 çubuk gösteriyordu;
profil kartı da aynı hesap için "29 yaşında • 78 kg" ve `"EB"` avatar yazıyordu (sabit varsayılanlar).

### Düzeltme

- [x] `lib/weight.ts` (saf + testli): `sortedEntries`, `latestEntry`, `seedEntry`, `parseBodyStats`,
      `profileWeightEntries`, `weightProgress`.
- [x] `components/WeightSettings.tsx` (yeni): özet (son ölçüm + gerçek hedef + hesaplanan ilerleme),
      bugünkü kilo (WeightCard yeniden kullanılır — tek yazar), `RangePicker` +
      `WeightTrendCard` grafiği, ölçüm listesi (tarih/kilo/fark + tek tek silme) ve dürüst boş durum.
- [x] Hedef kilo tek kaynak: `profile.targetWeightKg`, Profil Bilgileri'nde düzenlenebilir
      (mevcut ve atıl `targetWeightLabel/Placeholder` anahtarları settings'e eklendi).
- [x] `handleSaveProfile` artık `config.profile`a yazıyor (önceden SADECE localStorage — ad/yaş/
      boy/kilo cihaza bağlıydı) ve form önceliği config-first'e çevrildi.
- [x] Kilo, geçmişe yalnızca alan o oturumda düzenlendiyse yazılır (`profileWeightEntries`).
- [x] Sihirbaz kilosu, `seedEntry` ile bugünün başlangıç ölçümü olur (try/catch — kurulumu bloklamaz).
- [x] Uydurma veri temizliği: avatar `"EB"` → jenerik ikon; form varsayılanları `29/78/178` → boş;
      profil kartındaki kg yalnızca gerçek değer varsa yazılır.
- [x] Ayarlar sırası: veri satırı Hesap & Profil → Veri & Destek (ilk satır); kilo satırı hedeflerin
      altında; Destek blogu (gizlilik → geri bildirim → [gelen kutusu] → destek → rehber → sürüm
      notları); `settings.accountActions` başlığı → "Uygulama & Hesap"; ölü `targetWeightValue`
      anahtarı 3 dilden silindi.

### Ölçüm (üretim derlemesi :4173 + gerçek backend)

- Boş hesap: "Mevcut Kilo —", "Henüz ölçüm yok", "Hedef Kilo —" + "Profil Bilgileri'nden belirle",
  geçmiş (0) — uydurma sayı yok. Profil kartı artık "29 yaşında • 78 kg" / "EB" göstermiyor.
- 82,4 kg girildi → özet/liste/grafik anında güncellendi; `config.weight` sunucuya yazıldı.
- Hedef 75 kg (Profilden) → **elle hesap doğrulandı**: 3 ölçümle (90 → 86 → 82,4) "Yolun %51'i",
  progressbar value=51, "Hedefe 7,4 kg kaldı", "Başlangıç: 20 Ağu · 90,0 kg"; liste yeni→eski
  ▼3,6 / ▼4,0 / —.
- Silme: 1 Eyl kaydı silindi → toast "Ölçüm silindi.", liste (2), farklar yeniden hesaplandı
  (15 Eyl ▼7,6), sunucuda da girdi gitti.
- Guard iki yönlü doğrulandı: yalnızca ad+hedef kaydedildiğinde bugünün 82,4 ölçümü KORUNDU;
  kilo alanı düzenlenip kaydedildiğinde bugünün kaydı 80'e güncellendi ve `profile.weightKg`
  hesaba yazıldı (2026-08-20 girdisine dokunulmadı).
- Geri tuşu/Geri düğmesi ayarlar listesine döndü, URL kökte kaldı; rehber turu 1→6 sorunsuz
  (Ayarlar adımı sekme vurgusuyla); konsol 0 hata.
- **Temizlik:** geçici test verisi yerel dev hesabından geri alındı — `weight {entries:{}}` ve
  `profile {}` (ikisi de başlangıçta yoktu; okuma tarafında ikisi de "boş" ile aynı), localStorage
  test anahtarları silindi, 5 günlük veri ve `templates` hiç dokunulmadı.

**Kapı:** typecheck 0 · test 850/850 (+21 yeni) · check:i18n PARITY OK (816×3) · build ✓
**Not:** backend DEĞİŞMEDİ, `config.weight` şekli aynı — migration yok. Auth kapalı yerel ortamda
`user` null olduğu için veri/parola/çıkış satırları render edilemedi; sıraları kodda doğrulandı.
Değişiklikler commit edilmedi.
