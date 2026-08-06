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

## Sonraki fazlar (onaylı planda ayrıntılı)

- [ ] **B** Saf auth ilkelleri (`server/auth.js` saf yarısı + `src/lib/authRules.ts`)
- [ ] **C** Service worker sızıntısı (`/api/*` önbelleğe girmesin, cache v2 + temizlik)
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
