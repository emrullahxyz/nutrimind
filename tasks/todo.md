# tasks/todo.md

Bu dosya CLAUDE.md'nin "Görev Yönetimi" bölümünün istediği çalışan plandır. Onaylı plan
`~/.claude/plans/` altında; buradaki liste onun yürütme takibidir.

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
- [x] **A9** *(tur içinde eklendi)* "Sadece öğüne" — hafızaya yazmadan bugüne ekle
- [x] **A10** *(tur içinde eklendi)* `client_secret_*.json` `.gitignore`'a alındı
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
tek satır. Kullanıcı "sonra çözeriz" dedi — **bekliyor.**

### Kalan borç (ayrı bir iş)
`MealForm`/`AliasForm`/`NutritionSheet`/`RecipeBuilder` `Modal`'ın geçmiş mantığını
elle KOPYALIYOR ve temizlikte `history.back()` yerine `replaceState` kullanıyor —
bu yüzden her form açılışı geçmiş yığınına harcanmış bir girdi bırakıyor. Doğrusu
tek bir `useModalHistory` hook'una çıkarmak; aynı hata sınıfı (L9) böylece üçüncü
kez tekrarlanmaz. Kapsam 5 bileşen, ayrıca planlanmalı.

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
      noktasının kapsamlanması. **Kullanıcı onayı alındı** (CLAUDE.md'nin donmuş dosya kuralı).
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

### Kalan küçük işler (kullanıcıya önerildi, henüz onaylanmadı)
- Uygulamada **çıkış yap** düğmesi yok.
- Uygulamada **parola değiştirme** ekranı yok (şimdilik `setpassword.js` ile sunucudan).

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

| Ne | Sonuç |
|---|---|
| Kamera tam ekran açılıyor ve **açık kalıyor** | ✅ 375×753 video, `object-cover` |
| "Etiket"e basınca galeri açılıyor mu | ✅ **hayır** (dosya seçici casusu 0 kayıt) |
| Mod değişimi kamerayı yeniden başlatıyor mu | ✅ hayır (tek `getUserMedia`) |
| Deklanşör → kırpma | ✅ 265×390 gönderildi; kenar gürültüsü **%0** |
| Gemini kırpılmış etiketi okudu | ✅ 250 kcal / 12 P / 30 K / 8 Y / 3 L — birebir |
| Geri tuşu (üretim derlemesi) | ✅ modal kapanıyor **ve** kamera duruyor (`track.stop`) |
| "Sadece öğüne", ifade boşken | ✅ aktif; öğün +1, hafıza değişmedi, `sources` yok |

**İki yanlış ölçüm, düzeltildi.** (a) Panel gizliyken `getBoundingClientRect` donuk değer veriyor —
çerçeve üç modda da aynı sanılmıştı; inline stiller doğruydu. (b) Dev'de geri tuşu çalışmıyor
göründü; sebebi React StrictMode'un efekti iki kez çalıştırması. Üretim derlemesinde doğru çalışıyor
(`vite preview`'a `/api` vekili eklendi ki bu doğrulama yapılabilsin).

**Geçici bir upstream hatası görüldü:** ilk deklanşör isteği Gemini'den 502 aldı, aynı görsel
sonraki üç denemede 200 döndü. Uygulama bunu doğru karşıladı (tarayıcı açık kaldı, doğru mesaj).
