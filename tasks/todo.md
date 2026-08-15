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

---

## Review — Kapsamlı QA (2026-08-09, rapor-only)

**Kararlar:** rapor-only (kod değişikliği YOK; `server/index.js` donmuş). AI kill-switch davranışı
test edildi (503 + UI hatası), Gemini anahtarı kullanılmadı. Ortam: `NUTRI_DB=server/data.qa.db`
scatch DB + `pnpm preview` (4173). Detaylı rapor: `docs/qa/2026-08-09-bulgu-raporu.md`.

**Sonuç:** 11 fazdan Faz 0-10 tamamlandı; **7 bulgu** (1 SEV3 + 6 SEV4), Faz 8 (back-stack/nav)
**0 bulgu**. Tarihsel bug'ların tamamı (onboarding 400, bayat-profil ezme, FAB yeniden açılma,
sahte çıkış toast'ı, ilk-yükleme ölü ekranı) **FIXED ve doğrulandı**.

| Sev | Alan | Kısa açıklama | File:line |
|---|---|---|---|
| SEV3 | Öğün girişi | NutritionSheet aç-kaydet 2 ondalığı sessizce 1 ondalığa tırnaklıyor | `NutritionSheet.tsx:22-33` |
| SEV4 | Ana ekran | Öğün satırı seçim modunda çift birim "800 kcal kalori" | `MealRow.tsx:58` |
| SEV4 | Öğün girişi | Negatif makro kabul edilip kayıtta sessizce 0'a clamp'leniyor | `MealForm.tsx:576-585` |
| SEV4 | Öğün girişi | Miktar 1g minimumsuz — "0.5" → 0 kcal öğün | `MealForm.tsx:234-239` |
| SEV4 | Ana ekran | Öğün satırı makroları tr-TR virgülü atlıyor ("12.5g P") | `MealRow.tsx:87-95` |
| SEV4 | Trend | "Son 7 gün ort." aslında son 7 KAYITLI gün — etiket belirsiz | `trend.ts:213` |
| SEV4 | Ana ekran | Girilmemiş çekirdek makro "0g", mikro "—" — ilke tutarsız | `MacroCardGrid.tsx` |

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

| Bulgu | Dosya | Çözüm |
|---|---|---|
| SEV3 aç-kaydet tırnaklama | `NutritionSheet.tsx` | `scaleMealNutrition` export + m=1'de lossless erken-dönüş (stepper m≠1 yuvarlaması korunuyor) |
| SEV4 çift birim | `MealRow.tsx` | seçim modu `formatKcal`→çıplak `{kcal}`, normal modla birebir |
| SEV4 negatif makro | `FormBits.tsx` | `acceptsNumericEntry` + `NumField`/`EditableStat` onChange guard'ı (uygulama geneli: MealForm, AliasForm, RecipeBuilder, ScanSheet, WeightCard, NutritionSheet) |
| SEV4 1g minimum | `nutrition.ts` + `MealForm.tsx` | `clampMinGrams` saf fonksiyon; `handleGramsChange` gram biriminde uygular (gram dışı 0.5 meşru) |
| SEV4 tr-TR makro | `MealRow.tsx` | `macroNum` = `formatNumber(v, tamsayı?0:1)` → "12,5g P" |
| SEV4 trend etiketi | `TrendPage.tsx` | "Son 7 kayıtlı gün ort." + "Önceki 7 kayıtlı güne göre" |

**Testler:** 589/589 (`+15`: `NutritionSheet.test.ts` yeni 7, `acceptsNumericEntry` 4,
`clampMinGrams` 4). `pnpm typecheck` 0 hata. `pnpm build` ✓.

**Tarayıcı doğrulaması (preview, scratch DB):** #1 `8.75`→aç/kaydet→DB `8.75` (mutasyon yok);
#2 seçim modu "800 kalori"; #3 Protein `-5` reddedildi (hem NutritionSheet hem Elle modu), pozitif
kabul; #4 Miktar `0.5`→`1`, `0` korundu, `200` geçti; #5 satır "12,5g P"; #6 trend kutuları
"kayıtlı" içeriyor. Temizlik: scratch DB silindi, listener yok, `server/data.db` dokunulmadı.

## Düzeltme İncelemesi (2026-08-09, kullanıcı bildirimi: 2 sorun)

QA turu deploy'undan sonra kullanıcı iki yeni sorun bildirdi; ikisi de saf frontend,
`server/index.js` dokunulmadı (donmuş kural).

| Sorun | Dosya | Çözüm |
|---|---|---|
| **Bug** İlerleme drilldown'ında düzenleme ekranı ekranın en üstünde açılıyor | `src/index.css` | `.anim-zoom` `fill-mode: both` → `backwards`. `both`/`forwards` + `transform` animasyonu, animasyon bitse bile sarmalı `position:fixed` torunlar için KALICI containing block yapıyor (WebKit Bug 176858). Portal olmayan `NutritionSheet`/`MealForm` `fixed inset-0` ile viewport yerine sarmalın tepesine hizalanıyordu. Görsel kayıp yok: `zoomIn` son karesi `transform:none` |
| **UX** Uzun öğün ismi tek satırda `...` ile kesiliyor, okunmuyor | `src/components/MealRow.tsx` | `<h4 truncate>` → `ExpandableMealName` (mevcut desen, `FormBits.tsx:394`): varsayılan 2 satır, isme dokununca `line-clamp-none` (tam açılır), `stopPropagation` sayesinde kartın geri kalanına tıklamak hâlâ düzenlemeye girer. Seçim modu `truncate` kalır (kasıtlı) |

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
