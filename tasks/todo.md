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
- [ ] **D** DB göçü — **EN RİSKLİ**, `server/index.js` değişikliği için ayrıca onay alınacak
- [ ] **E** Oturum + e-posta/şifre (bayrak kapalı)
- [ ] **F** Giriş ekranı + frontend kapısı
- [ ] **G** Kayıt sihirbazı (reflog'dan kurtar + `goals` hatasını düzelt + premium görünüm)
- [ ] **H** Google girişi (redirect akışı)
- [ ] **I** Prod'da bayrağı çevir + nginx basic-auth kaldır

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
