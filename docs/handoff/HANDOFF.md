---

## Handoff: 2026-07-24T21:10:24Z (auto-saved before compaction)

### Compaction Metadata
- Trigger: (unknown)
- Custom instructions: (none)
- Transcript: (unknown)
- CWD: (unknown)

### Last User Message (transcript tail)
(unavailable - transcript missing)

### Last Assistant Message (transcript tail)
(unavailable - transcript missing)

### Git Snapshot
- (not a git repo)

### Model Summary
(TODO: fill after compaction — 8–12 bullets)

### Handoff Context (paste into next session)
(TODO: fill after compaction — 10–20 lines of concrete resume instructions)

---

## Handoff: 2026-07-25T00:20Z — Elle ekleme/düzenleme (CRUD) özelliği TAMAMLANDI ve YAYINDA

### Current Task State

**Bitti.** Kullanıcının isteği — "günlük kısımda elle bir şeyler ekleyebilmek, alias ekleyip düzenleyebilmek,
günlük aldıklarımı düzenleyebilmek, hepsini site üzerinden" — 9 görevlik plan olarak uygulandı, her görev ayrı
alt-ajanla yazılıp ayrı ajanla incelendi, bütün-proje incelemesinden geçti, yerelde ve canlıda doğrulandı,
https://nutri.emrullah.xyz adresine yayınlandı.

Açık iş kalmadı. Devam edilecekse: aşağıdaki "Next Steps" kabul edilmiş (blocking olmayan) Minor'lar.

- Plan: `docs/superpowers/plans/2026-07-24-manual-edit-crud.md`
- Tasarım: `docs/superpowers/specs/2026-07-24-manual-edit-crud-design.md`
- Ayrıntılı defter (her görev, her bulgu, her düzeltme, her tarayıcı doğrulaması):
  `<USERPROFILE>\AppData\Local\Temp\claude\C--Users-Emrullah-Desktop-Projeler-besin-degerlerim\e3e1affb-cfc0-4c1e-aa60-3194cd98fe19\scratchpad\sdd\progress.md`
  (Bu klasör oturuma özel scratchpad — kalıcı değil. Değerliyse repoya taşı.)

### Key Decisions

- **Backend'e hiç dokunulmadı.** `server/index.js` zaten tüm yazma uçlarına sahipti
  (`POST /api/day`, `DELETE /api/day/:date`, `PUT /api/goals`, `POST /api/alias`, `DELETE /api/alias/:id`).
  Özellik tamamen frontend işiydi; bu, plan boyunca bağlayıcı bir kısıt olarak tutuldu.
- **"Mutate → refetch"**, iyimser (optimistic) güncelleme YOK. Her yazmadan sonra tüm veri sunucudan
  yeniden çekilir. Bilinçli tercih — incelemede yeniden tartışmaya açılmadı.
- **Gün yazımı bütün günü değiştirir.** Bir öğün eklemek = günün tüm öğün dizisini göndermek.
  Dizi boşsa gün silinir. Bu semantik, aşağıdaki iki ciddi hatanın kaynağıydı (bkz. Critical Context).
- **Makro form değerleri STRING olarak tutulur** (`NutritionDraft`), sayı olarak değil — yarım yazılmış
  "12," bir sonraki render'da kaybolmasın diye. Draft `useState` içinde BİR KEZ kurulur, her render'da
  yeniden türetilmez.
- **Git yok.** Bu proje git deposu değil. Hiçbir adımda commit atılmadı; doğrulama kapısı
  `pnpm typecheck` + `pnpm test` + `pnpm build`.
- **Alt-ajan modeli/eforu göreve göre ayarlandı** (uygulama ve görev incelemeleri sonnet, final inceleme
  opus) — kullanıcının token tasarrufu isteği gereği.
- **Ham hex yasağı** için token eklendi: `memory-ink` (#1e1b4b), `memory-deep` (#8b6df2),
  `boxShadow.memory`. Mevcut `accent`/`accent-ink` çiftindeki desen izlendi.

### Modified Files

Yeni:
- `src/lib/nutrition.ts` — `parseNum` (tr-TR sayı ayrıştırma) + `scaleNutrition` (alias ölçekleme)
- `src/lib/nutrition.test.ts` — 12 vitest testi
- `src/components/Modal.tsx` — koyu modal kabuğu; Esc, backdrop, scroll kilidi, ilk odak + odak iadesi (focus trap YOK, bilinçli)
- `src/components/FormBits.tsx` — 13 export: `fieldCls, Label, TextField, NumField, NutritionDraft, EMPTY_DRAFT, toDraft, fromDraft, NutritionFields, FormActions, ErrorText, ConfirmButton`
- `src/components/MealForm.tsx` — çift modlu öğün ekle/düzenle (Hafızadan / Elle)
- `src/components/AliasForm.tsx` — alias ekle/düzenle
- `src/components/GoalsForm.tsx` — günlük hedef düzenleme
- `server/package.json` — `{"type":"commonjs"}`; CommonJS backend'i kökteki `"type":"module"`a rağmen çalıştırmak için

Değişen:
- `src/types.ts` — `MealPayload` eklendi
- `src/lib/api.ts` — `AliasPayload` + `mutate<T>()` + `saveDay/deleteDay/saveGoals/saveAlias/deleteAlias`
- `src/lib/days.ts` — `toPayload(meals): MealPayload[]`
- `src/lib/data.tsx` — context artık `AppData & Actions`; `runWriteThenRefresh` helper; `stale` terminal durumu
- `src/components/DayView.tsx` — ekle/düzenle/sil bağlantısı, `busy` kilidi, token'lı katkı barı
- `src/pages/AliasPage.tsx` — salt-okunur listeden yönetim ekranına
- `src/pages/DailyPage.tsx` — "Hedef" butonu + `GoalsForm`
- `src/pages/HistoryPage.tsx` — gün detayı artık haftaya bağlı değil (bkz. Critical Context #3)
- `src/App.tsx` — `text-[#1e1b4b]` → `text-memory-ink`
- `tailwind.config.js` — `memory-ink`, `memory-deep`, `boxShadow.memory`
- `vite.config.ts` — `/api` → `http://127.0.0.1:8790` proxy
- `package.json` — `test: vitest run`, vitest devDependency
- `deploy.sh` — SSH anahtar yolu düzeltildi (bkz. Critical Context)

### Blockers / Open Questions

- **Yok.** Özellik tamam ve yayında.
- Tek dış konu: global `CLAUDE.md` hâlâ `id_deploy` için yanlış yolu belgeliyor (aşağıya bakın).
  Bu depoya ait değil, kullanıcının kararı.

### Next Steps

Hepsi opsiyonel — final incelemenin "Minor" olarak sınıfladığı, yayına engel olmayan işler:

1. **"Elle" modunda negatif makro engeli yok** (`MealForm.tsx`). `parseNum("-100")` → -100; `canSave`
   sadece adın boş olmamasına bakıyor. `GoalsForm` `>= 0` şartını uyguluyor — üç form üç farklı
   doğrulama felsefesi kullanıyor. Barlar clamp ettiği için görsel bozulma yok.
2. **Ölü prop temizliği**: `FormActions.saveLabel`, `ConfirmButton.label`, `ConfirmButton.className`,
   `Actions.refresh` — hiçbiri kullanılmıyor.
3. **`fetchData` backend'in `{error}` gövdesini okumuyor** (`src/lib/api.ts:38-40`), `mutate` okuyor. İlk
   yükleme hatası çıplak "API 500" gösteriyor, aynı hata yazmada gerçek mesajı gösteriyor.
4. **İlk yükleme hatasında yeniden dene butonu yok** (`src/lib/data.tsx`) — kullanılmayan `refresh`
   aksiyonu tam orada duruyor.
5. **`toDraft` ondalıkları nokta ile yazıyor** ("26.2") ama uygulama her yerde tr-TR virgül gösteriyor.
6. **Ham hex gradyanlar** `src/components/WeekBars.tsx:53-57` ve `src/pages/HistoryPage.tsx:38`'de duruyor.
   Bu özellikten ÖNCE de vardı, bu özellik onlara dokunmadı. `WeekBars.tsx:54`'teki `#8b6df2` artık
   `memory-deep` token'ının tam karşılığı — bedava temizlik.
7. **Modal focus trap yok** (bilinçli karar). Klavyeyle backdrop arkasındaki butona ulaşıp ikinci bir
   modal açmak mümkün; LIFO olmayan sırayla kapatılırsa `body` scroll kilidi takılı kalıyor.
8. Scratchpad'deki `progress.md` defterini saklamak istersen `docs/` altına taşı.

### Critical Context

**Final incelemenin bulduğu ve DÜZELTİLEN 3 ciddi hata — hepsi "bileşenler arası" hatalardı ve tek tek
görev incelemelerinden geçmişlerdi:**

1. **`parseNum` uygulamanın KENDİ sayı biçimini yanlış okuyordu.** `Number("2.600")` → 2.6 ve virgül
   değişimi global değildi (`"1.013,5"` → NaN → 0). Uygulama tr-TR gösteriyor ("2.600 kcal"); kullanıcı
   gördüğünü aynen yazınca hedef **2,9 kcal** olarak kaydediliyordu — hata yok, uyarı yok, `canSave` geçiyordu.
   Artık `parseNum` binlik/ondalık ayrımını açıkça yapıyor (`src/lib/nutrition.ts`), 4 yeni test var.
   **Bu fonksiyona dokunacaksan testleri önce oku** — kurallar oradaki yorum bloğunda.

2. **Bayat anlık görüntü → sessiz veri kaybı.** Yazma başarılı olup ardından `refresh()` başarısız olursa
   `data` yazma öncesi haline sabitleniyor ama tüm kontroller açık kalıyordu. Gün yazımı günün TAMAMINI
   değiştirdiği için sonraki silme, az önce kaydedilen öğünü sessizce siliyordu. `DataProvider` artık bu
   yolda `stale` bayrağını kaldırıp tam ekran "sayfayı yenileyin" mesajına düşüyor — bayat veriyle yazma yok.

3. **Boşalan geçmiş gün erişilemez oluyordu.** Gün detayı `week && selectedDay` şartına bağlıydı; günün son
   öğününü silmek gün anahtarını düşürüyor, bu da haftayı listeden düşürebiliyordu → kullanıcı hafta
   listesine atılıyor ve o tarihe dönüş yolu kalmıyordu (`DailyPage` sabit `todayISO()` kullanıyor). Artık
   3. kademe yalnızca `selectedDay`'e bağlı; hafta etiketi `weekStart`/`addDaysISO` ile türetiliyor ve
   `all.length === 0` erken dönüşü bu bloğun ALTINA taşındı (sıra önemli).

**Eşzamanlılık (concurrency) durumu — final inceleme TEMİZ buldu, bozma:**
Modal backdrop `fixed inset-0 z-50` header sekmelerini de kapatıyor; form açıkken her tıklama
`requestClose()`'a gidiyor, o da `saving` iken hiçbir şey yapmıyor. Üç form da bunu Modal `onClose`
(Esc + backdrop + ✕) VE `FormActions onCancel`'a bağlıyor. `DayView` ve `AliasPage` ayrıca `busy` bayrağı
tutuyor. Yeni bir yazma formu eklersen bu deseni birebir kopyala — `AliasForm.tsx` en temiz örnek.

**Alias ↔ öğün ayrıklığı (doğru ve kasıtlı):** kaydedilmiş öğünler `{name, nutrition}` olarak, hesaplanmış
makrolarla saklanır; alias id'si tutulmaz. Bu yüzden bir alias'ı düzenlemek/silmek geçmiş öğünleri
DEĞİŞTİRMEZ. Düzenleme modunda "Hafızadan/Elle" sekmeleri gizli — öğünün alias kökeni bilinmediği için
düzenleme her zaman elle yapılır.

**Yerel geliştirme İKİ terminal ister:**

```
node server/index.js     # backend, 127.0.0.1:8790
pnpm dev                 # Vite, localhost:5173 (/api proxy'li)
```

`server/package.json` (`{"type":"commonjs"}`) olmadan backend kökteki `"type":"module"` yüzünden çalışmaz.
Vite `localhost`'a bağlanıyor; `127.0.0.1:5173`'e curl atmak boş döner — `localhost` kullan.

**Deploy tuzakları:**
- `pnpm deploy` ÇALIŞMAZ — pnpm'in kendi `deploy` alt komutuna gidip `ERR_PNPM_CANNOT_DEPLOY` verir.
  **`pnpm run deploy`** kullan.
- `deploy.sh` içindeki SSH anahtarı yolu `<USERPROFILE>\Desktop\Projeler\.ssh\id_deploy` olarak
  güncellendi. Global `CLAUDE.md` hâlâ `.gemini\tmp\shared\id_deploy` diyor ama **o dosya artık yok**.
  Sunucuya bağlanan başka script'ler de kırılmış olabilir.
- `deploy.sh` yalnızca frontend'i (`dist/`) yayınlar; `/var/www/nutri` içeriğini silip yerine koyar.
  Backend sunucuda ayrı çalışıyor, deploy ona dokunmuyor.

**Salt-okunur referanslar — ASLA düzenleme / import etme / ship etme:**
`README.md`, `Besin Hafızası.dc.html`, `Wireframes.dc.html`, `support.js`,
`eski veriler ('Emrullah' kullanıcısı).json`.

### Model Summary

- Hedef: Nutrimind'a site üzerinden tam yazma yeteneği (öğün ekle/düzenle/sil, alias yönetimi, hedef düzenleme) — TAMAM, yayında.
- Backend'e hiç dokunulmadı; tüm yazma uçları zaten vardı, iş tamamen frontend'ti.
- Mimari: "mutate → refetch", iyimser güncelleme yok; gün yazımı günün tamamını değiştirir (boş dizi = günü sil).
- 9 görev, her biri taze alt-ajanla yazıldı ve ayrı ajanla incelendi; görev incelemeleri 3 kez "Needs fixes" verdi, hepsi kapatıldı.
- Final bütün-proje incelemesi (opus) 0 Critical, 3 Important buldu — üçü de düzeltildi ve tarayıcıda doğrulandı.
- En ciddi hata: `parseNum` uygulamanın kendi tr-TR biçimini yanlış okuyup "2.900" hedefini 2,9 kcal olarak sessizce kaydediyordu.
- İkinci: yazma-OK/tazeleme-FAIL sonrası bayat listeyle yapılan sonraki gün yazımı, kaydedilmiş öğünü sessizce siliyordu.
- Üçüncü: bir geçmiş günün son öğününü silmek o tarihi navigasyondan tamamen düşürüyordu.
- Eşzamanlılık durumu incelemede temiz çıktı (backdrop + `requestClose` + `busy` bayrakları); yeni form eklerken bu desen korunmalı.
- Doğrulama kapısı: `pnpm typecheck` 0 hata, `pnpm test` 12/12, `pnpm build` başarılı. Git yok, commit yok.
- Canlı duman testi gerçek gün verisine dokunmadan alias ekle-sil ile yapıldı; prod verisi bozulmadı.
- Kalan işler yalnızca Minor: negatif makro engeli, ölü proplar, hata mesajı tutarsızlığı, ham hex gradyanlar, focus trap.

### Handoff Context (paste into next session)

Nutrimind (`<USERPROFILE>\Desktop\Projeler\besin degerlerim`) — CRUD özelliği tamamlandı ve
https://nutri.emrullah.xyz adresinde yayında. Bu oturumda bekleyen iş YOK; devam edilecekse
HANDOFF'taki "Next Steps" listesindeki Minor'lardan seç.

Bu proje GIT DEPOSU DEĞİL — commit atma, `git` komutu çalıştırma. Doğrulama kapısı:
`pnpm typecheck && pnpm test && pnpm build` (0 hata, 12/12, ✓ built).

Yerelde çalıştırmak İKİ terminal ister:
`node server/index.js` (127.0.0.1:8790) ve `pnpm dev` (localhost:5173 — 127.0.0.1:5173 çalışmaz).

Yayın: `pnpm run deploy` ← "run" ŞART; çıplak `pnpm deploy` pnpm'in kendi komutuna gider.
SSH anahtarı: `<USERPROFILE>\Desktop\Projeler\.ssh\id_deploy`
(CLAUDE.md'deki `.gemini\tmp\shared` yolu ARTIK YOK — güncellenmesi gerekiyor.)

Kod yazmadan önce oku:
- `src/components/AliasForm.tsx` — modal yazma formu için kanonik desen (`saving`/`err` state,
  `requestClose()` hem Modal `onClose` hem `FormActions onCancel`'a bağlı, `canSave` guard,
  draft `useState` içinde BİR KEZ kurulur).
- `src/lib/nutrition.ts` — `parseNum`'un tr-TR binlik/ondalık kuralları yorumda; değiştirirsen
  `src/lib/nutrition.test.ts`'i (12 test) önce oku.
- `src/lib/data.tsx` — `runWriteThenRefresh` + `stale` terminal durumu; bu güvenlik ağını kaldırma.

DOKUNMA: `server/index.js` (donmuş), `README.md`, `Besin Hafızası.dc.html`, `Wireframes.dc.html`,
`support.js`, `eski veriler ('Emrullah' kullanıcısı).json`.

Yeni bir yazma formu eklersen: gün yazımı günün TAMAMINI değiştirir — payload'ı kayıt anında
`mealsOf(days, date)`'ten TAZE türet, closure'daki eski diziyi kullanma.

---

## Handoff: 2026-07-25T19:10Z — agy bulguları doğrulandı ve düzeltmeler agy'ye yaptırıldı

> ⚠️ **Bir üstteki 2026-07-25T00:20Z kaydı birkaç noktada ARTIK GEÇERSİZ.** Düzeltmeler için
> "Üstteki handoff'un yanlış kalan maddeleri" bölümüne bak — özellikle "git yok" ve "SSH anahtar yolu"
> maddeleri.

### Current Task State

**Bitti.** Bu oturumda kod yazılmadı — iş bilinçli olarak **agy'ye (Antigravity / Gemini) devredildi.**

Akış şuydu: agy bir analiz raporu üretmişti (`agy_debugging.md`, takip edilmeyen dosya olarak duruyordu).
Claude o raporun **her bulgusunu kaynak kodda tek tek doğruladı**, gerçek olanları ayıkladı, kullanıcıyla
kapsamı netleştirdi, sonra raporu agy'nin soğuk başlayıp tek başına uygulayabileceği bir **yürütme
brifingine** dönüştürdü. Kullanıcı brifingi agy'ye verdi; agy uyguladı; Claude sonucu doğruladı.

- Doğrulama + brifing + sonuç: `docs/analysis/2026-07-25-agy-debugging.md` (tek doğruluk kaynağı)
- Plan dosyası: `<USERPROFILE>\.claude\plans\joyful-scribbling-tarjan.md`

Açık iş yok. **Deploy YAPILDI** — kullanıcı yayına çıkmayı da agy'ye yaptırdı (25 Tem 2026, 21:02).
Doğrulandı: sunucudaki `/var/www/nutri/assets/` içeriği (`index-BIYpJ9cQ.js`, `index-BYQaleaD.css`)
yereldeki `dist/assets/` ile birebir aynı. Vite dosya adlarını içerik hash'iyle ürettiği için aynı isim
= aynı içerik. `https://nutri.emrullah.xyz` güncel sürümü sunuyor.

### Modified Files (agy tarafından, 6 commit)

| Commit | Ne yaptı |
|---|---|
| `f7094b4` | `src/lib/nutrition.ts` + `.test.ts` — `parseNum` baştan sıfırlı ondalık |
| `9eb6fce` | `src/components/MacroBar.tsx` — kalan/aşan gerçek değerden |
| `6a317dd` | `src/components/DayView.tsx` + `tailwind.config.js` — dokunmatikte checkbox |
| `ed86f4d` | `src/components/DayView.tsx` — `MergeModal` kapanma guard'ı |
| `cb0e7eb` | `.gitignore` + rapor `docs/analysis/` altına arşivlendi |
| `a1b537d` | `src/components/CalorieRing.tsx` — **kapsam dışıydı**, aşağıya bak |

### Key Decisions

- **Raporu körlemesine uygulama.** agy'nin 6 bulgusundan 3'ü gerçek+kapsam içi çıktı, 2'si gerçek ama
  kapsam dışı bırakıldı, 1'i **çürütüldü**. Claude ayrıca agy'nin kaçırdığı 2 bulgu ekledi. Bir LLM
  raporunu doğrulamadan uygulamak bu projede kabul edilmiş bir yöntem değil.
- **Backend'e yine dokunulmadı.** `server/index.js`'in gerçek doğrulama eksikleri var (bkz. "Bilinen
  açıklar") ama dosya donmuş kabul ediliyor — kullanıcı kararı.
- **`parseNum` düzeltmesi minimum tutuldu**: `^\d+$` → `^[1-9]\d*$`. Çok noktalı dala (`"0.500.250"`)
  guard eklenmedi; pratikte imkânsız girdi için karmaşıklık eklemek istenmedi.
- **MacroBar'da `0.05` eşiği bilinçli.** Tam eşitlik (`=== 0`) kullanılsaydı "0,0g kaldı" yazan bir bar
  "✓ Tamamlandı" rozetini alamaz, düzeltilen tutarsızlığın aynısı geri gelirdi.
- **Tailwind `fine:` varyantı el ile tanımlandı.** Proje **Tailwind 3.4.17** — v4'ün yerleşik
  `pointer-fine:` varyantı burada YOK. `tailwind.config.js` → `theme.extend.screens.fine = { raw: "(pointer: fine)" }`.

### Critical Context

**1. Üstteki handoff'un yanlış kalan maddeleri — düzeltmeler:**

- ❌ "Bu proje GIT DEPOSU DEĞİL, commit atma" → **YANLIŞ.** Proje artık git deposu (`master` dalı,
  16 commit). Normal şekilde commit at.
- ✅ "SSH anahtarı `Desktop\Projeler\.ssh\id_deploy`, CLAUDE.md'deki yol artık yok" → **DOĞRUYMUŞ.**
  (Bu satır önce hatalı olarak "yanlış" diye işaretlenmişti; 2026-07-25 21:15'te sunucuya bağlanarak
  test edilip düzeltildi.) Dolaşımdaki üç yolun durumu:

  | Yol | Durum |
  |---|---|
  | `<USERPROFILE>\.gemini\tmp\shared\id_deploy` (global CLAUDE.md belgeliyor) | ❌ **Klasör bile yok** |
  | `<USERPROFILE>\Desktop\Projeler\OPS\id_deploy` (bir hafıza notu iddia ediyordu) | ❌ Yok |
  | `<USERPROFILE>\Desktop\Projeler\.ssh\id_deploy` | ✅ **Var ve çalışıyor** — `deploy.sh:6` bunu kullanıyor |

  **Global `CLAUDE.md` hâlâ var olmayan yolu belgeliyor.** Bu depoya ait olmadığı için düzeltilmedi;
  sunucuya bağlanan başka script'ler de aynı yüzden kırık olabilir. Kullanıcının kararı.
- ⚠️ "Doğrulama kapısı `pnpm typecheck` + `pnpm test` + `pnpm build`" → hâlâ geçerli, ama beklenen test
  sayısı **12/12**.
- ✅ Hâlâ geçerli: iki terminal (`node server/index.js` + `pnpm dev`), `localhost:5173`
  (`127.0.0.1:5173` boş döner), `pnpm run deploy` ("run" şart), salt-okunur referans listesi.

**2. agy kapsamı aştı — `a1b537d`.** `CalorieRing` düzeltmesi brifingde açıkça "❌ Dokunma" işaretliydi;
agy yine de uyguladı. Sonuç doğru çalışıyor ve kullanıcı kabul etti, ama **agy'ye iş devrederken
"kapsam dışı" maddelerin gerçekten dışarıda kaldığını sonradan kontrol et** — brifingde yazması yetmiyor.

**3. Çürütülen bulgu — tekrar açma.** `ConfirmButton`'ın `onBlur`'ünün dokunmatikte silme onayını
sıfırladığı iddiası (`src/components/FormBits.tsx`) kodda doğrulanamadı: `onBlur` yalnızca odak **başka
bir öğeye** geçtiğinde çalışır, aynı butona ikinci dokunuşta tetiklenmez. Gerçek cihazda tekrarlanabilir
bir hata gösterilmeden düzeltme yapılmamalı.

**4. Bilinen açıklar (bilinçli olarak açık bırakıldı):**
- `server/index.js` → `PUT /api/goals` gövdeyi hiç doğrulamıyor; `{}` gönderilirse hedefler bozulur.
  `readBody` 1 MB aşımında `req.destroy()` yapıyor ama `413` dönmüyor.
- İndeks tabanlı gün mutasyonu — "gün yazımı günün tamamını değiştirir" mimarisinin kabul edilmiş
  sonucu. `MealForm.save()` payload'ı kayıt anında taze türettiği için tek istemcide güvenli; iki
  istemci aynı anda yazarsa indeksler kayabilir. Çözümü optimistic-locking gerektirir.
- `useAnimatedValue` (`MacroBar.tsx`) her değer değişiminde 0'dan sayıyor, önceki değerden geçmiyor.
  Kozmetik; bilinçli tasarım tercihi olabilir, ayrı karar.
- Ham hex: `CalorieRing.tsx` (`#34d399`, `#ff8080` — ikisinin de token karşılığı var: `accent`, `danger`),
  `WeekBars.tsx:53-57`, `HistoryPage.tsx:38`.
- Üstteki handoff'un "Next Steps" listesindeki Minor'lar (negatif makro engeli, ölü proplar,
  `fetchData`'nın `{error}` gövdesini okumaması, ilk yükleme hatasında yeniden dene butonu yok,
  `toDraft`'ın ondalıkları nokta ile yazması, Modal focus trap yok) — hiçbirine dokunulmadı.

### Next Steps

1. **Tarayıcıda elle doğrulama** — otomatik kapılar (typecheck/test/build) geçti ve deploy yapıldı, ama
   4 düzeltmenin hiçbiri tarayıcıda elle doğrulanmadı. Adımlar
   `docs/analysis/2026-07-25-agy-debugging.md` § 2.7'de. Özellikle mobil checkbox görünürlüğü ve
   MergeModal guard'ı gerçek cihaz/emülatör istiyor — ve bunlar artık **canlıda**.
2. **Global `CLAUDE.md`'deki ölü SSH yolunu düzelt** (yukarıdaki tablo). Bu depo dışı bir iş.
3. Yukarıdaki "Bilinen açıklar"dan biri — hepsi opsiyonel.

---
