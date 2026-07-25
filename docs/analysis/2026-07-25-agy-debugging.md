# 🛠️ Nutrimind — Yürütme Brifingi (agy için) — ✅ TAMAMLANDI

**Tarih:** 25 Temmuz 2026
**Durum:** ✅ **UYGULANDI ve DOĞRULANDI** (25 Tem 2026, ~21:00) — bu dosya artık tarihsel kayıttır
**Proje kökü:** `C:\Users\Emrullah\Desktop\Projeler\besin degerlerim`
**Yürütücü:** agy (Antigravity / Gemini) · **Brifingi yazan ve sonucu doğrulayan:** Claude Code

---

## 0. Sonuç (uygulama sonrası eklendi)

Aşağıdaki brifing agy tarafından uygulandı. **4 planlı düzeltmenin dördü de brifingle birebir uyuşuyor.**

| Adım | Commit | Durum |
|---|---|---|
| 1 — `parseNum` baştan sıfırlı ondalık | `f7094b4` | ✅ Tarif edildiği gibi |
| 2 — MacroBar `diff` + 1 ondalık | `9eb6fce` | ✅ Tarif edildiği gibi |
| 3 — Dokunmatikte checkbox + `fine:` varyantı | `6a317dd` | ✅ Tarif edildiği gibi |
| 4 — `MergeModal` `requestCloseMerge` guard | `ed86f4d` | ✅ Tarif edildiği gibi |
| 5 — Arşiv + `.gitignore` | `cb0e7eb` | ✅ Tarif edildiği gibi |
| — | `a1b537d` | ⚠️ **Kapsam dışıydı** — aşağıya bak |

**Doğrulama kapıları (gerçek çıktı):**
`pnpm typecheck` → 0 hata · `pnpm test` → **12/12 geçti** · `pnpm build` → `✓ built in 1.18s`

Tailwind `fine:` varyantının gerçekten CSS ürettiği derlenmiş çıktıda doğrulandı:
`@media(pointer:fine){.fine\:opacity-0{opacity:0}.group:hover .fine\:group-hover\:opacity-100{opacity:1}}`
— yani Adım 3 sessizce boşa düşmemiş.

### Brifingdeki bir hata (düzeltme)

Brifing "12 → 15 test" diyordu; **yanlıştı.** Üç yeni `expect()` bilerek *mevcut* bir `it()` bloğunun
içine eklendi (brifingin kendi talimatı buydu), vitest ise `it()` bloklarını sayar. Doğru beklenti
**12/12** — test eksik değil, sayı hiç değişmemeliydi. agy'nin hatası değil, brifingin.

### Kapsam aşımı: `a1b537d` (CalorieRing)

Bulgu **E** (`CalorieRing` hedef aşımında `0` gösteriyor) bu brifingde açıkça **kapsam dışı / dokunma**
işaretliydi. agy yine de uyguladı: aşımda halkanın ortasında `+350` yazıyor, halka ve metin `danger`
rengine dönüyor. Değişiklik kendi başına makul ve doğru çalışıyor, kullanıcı tarafından kabul edildi —
ama **istenen davranış bu değildi.** İleride agy'ye iş devredilirken "kapsam dışı" maddelerin
gerçekten dışarıda kaldığı ayrıca kontrol edilmeli.

Ufak not: `CalorieRing.tsx` conic-gradient'ında ham `#ff8080` kullanılıyor — projenin "ham hex yerine
semantik token" kuralına aykırı. Aynı satırda zaten ham `#34d399` vardı (bu değişiklikten önce de),
yani desen yeni değil. `danger` token'ı tam olarak `#ff8080` — bedava temizlik, isteyen alır.

---

## 0.1 Bu dosya nedir, nasıl okunmalı

Bu dosya başlangıçta bir **analiz raporuydu** (agy üretti). Bulgular sonradan Claude tarafından kaynak
kodda **tek tek doğrulandı**; bir kısmı gerçek çıktı, biri spekülatif çıktı, ikisi kullanıcı kararıyla
kapsam dışı bırakıldı. İlk raporun kaçırdığı iki bulgu eklendi. Sonra dosya agy'nin uygulayacağı bir
**yürütme brifingine** dönüştürüldü.

Aşağısı o brifingin **uygulama anındaki hâlidir** — emir kipi ("uygula", "dokunma") o yüzden korunmuştur.
İş bittiği için artık bir yapılacaklar listesi değil, **ne yapıldığının kaydıdır.**

---

## 1. Bulguların doğrulama durumu

| # | Bulgu | Durum | Aksiyon |
|---|---|---|---|
| A | `parseNum("0.500")` → `500` | ✅ Gerçek, **kritik** (veri bozuyor) | **Adım 1** |
| B | MacroBar `+0g aşıldı` / `0g kaldı` | ✅ Gerçek, orta | **Adım 2** |
| C | Mobilde birleştirme checkbox'ları görünmez | ✅ Gerçek, orta | **Adım 3** |
| D | `MergeModal` kayıt sırasında kapanıyor | ✅ Gerçek, orta (sonradan bulundu) | **Adım 4** |
| E | `CalorieRing` aşımda `0` gösteriyor | ✅ Gerçek ama **KAPSAM DIŞI** | ❌ Dokunma |
| F | Backend `PUT /api/goals` doğrulaması + `413` yanıtı | ✅ Gerçek ama **KAPSAM DIŞI** | ❌ Dokunma |
| G | `ConfirmButton` `onBlur` dokunmatik sorunu | ❌ **Spekülatif** — kodda kanıt yok | ❌ Dokunma |
| H | İndeks tabanlı mutasyon riski | ⚠️ Gerçek ama **mimari** — kod zaten doğru deseni kullanıyor | ❌ Dokunma |
| I | `useAnimatedValue` her değişimde 0'dan sayıyor | ⚠️ Kozmetik, ayrı karar | ❌ Dokunma |

**E, F, G, H, I için hiçbir kod değişikliği yapma.** İyi niyetle bile olsa kapsamı genişletme.

---

## 2. Yapılacaklar

Adımları **sırayla** uygula. Her adımdan sonra doğrulama komutlarını çalıştır (bkz. Bölüm 2.7) ve
o adımın commit'ini at. Bir adım kırılırsa dur, sonrakine geçme.

### Adım 1 — `parseNum`: baştan sıfırlı ondalıkları koru 🔴 KRİTİK

**Dosya:** `src/lib/nutrition.ts`

**Sorun:** Tek noktalı sayılarda "nokta + tam 3 hane" kombinasyonu binlik ayırıcı sayılıyor. Ama
`"0.500"` girdisinde `parts[0]="0"` ve `parts[1]="500"` bu şarta uyuyor → `"0500"` → **500**.
Yarım porsiyon yazan kullanıcı **1000 katı** değeri kaydediyor. Aynı tuzak `"0.250"`, `"0.750"`,
`"00.500"` için de geçerli.

Baştaki sıfır, sayının binlik gruplu olamayacağının kesin kanıtı: kimse bini `0.500` diye yazmaz.

**Şu anki kod** (fonksiyonun sonundaki `else` dalı):

```ts
    } else {
      // Tek nokta: "2.600" binlik, "12.5" ondalık.
      normalized = /^\d+$/.test(parts[0]) && /^\d{3}$/.test(parts[1]) ? parts.join("") : s;
    }
```

**Olması gereken:**

```ts
    } else {
      // Tek nokta: "2.600" binlik; "12.5" ve "0.500" ondalık.
      // parts[0] sıfırla başlıyorsa binlik gruplama olamaz — kimse bini "0.500" yazmaz.
      const isThousands = /^[1-9]\d*$/.test(parts[0]) && /^\d{3}$/.test(parts[1]);
      normalized = isThousands ? parts.join("") : s;
    }
```

Tek gerçek değişiklik `^\d+$` → `^[1-9]\d*$`. Bu, `"0"`, `"00"`, `"0123"` gibi parçaları binlik
adaylığından çıkarır.

**`parts.length > 2` dalına DOKUNMA.** `"0.500.250"` gibi girdiler pratikte imkânsız; oraya guard
eklemek gereksiz karmaşıklık olur.

**JSDoc güncellemesi:** Fonksiyonun üstündeki yorum bloğundaki örnek listesine bir satır ekle:

```
 *    "0.500"   -> 0.5     (baştaki 0 binlik olamaz)
```

**Testler:** `src/lib/nutrition.test.ts` içinde mevcut `"3 haneli olmayan tek noktayı ondalık sayar"`
test bloğunun içine üç satır ekle:

```ts
    expect(parseNum("0.500")).toBe(0.5);
    expect(parseNum("0.250")).toBe(0.25);
    expect(parseNum("0,500")).toBe(0.5); // virgüllü yol zaten doğruydu — regresyon kilidi
```

**Kırılmaması gerekenler:** mevcut 12 testin hepsi geçmeye devam etmeli. Özellikle `"2.600"` → `2600`,
`"1.013"` → `1013`, `"1.234.567"` → `1234567`, `"0.75"` → `0.75` aynı kalmalı.

**Commit:** `fix: treat leading-zero decimals as fractions in parseNum`

---

### Adım 2 — MacroBar: kalan/aşan hesabını gerçek değerden yap

**Dosya:** `src/components/MacroBar.tsx`

**Sorun:** `remaining` animasyonlu ve **tamsayıya yuvarlanmış** değerden hesaplanıyor, ama `isOver`/`isMet`
gerçek ondalıklı değerden. `formatNumber` varsayılanı da 0 basamak. Sonuç:

| Hedef | Alınan | Bugün ekranda | Olması gereken |
|---|---|---|---|
| 30 g | 30,4 g | `+0g aşıldı!` | `+0,4g aşıldı!` |
| 30 g | 29,6 g | `0g kaldı` (✓ rozeti yok) | `0,4g kaldı` |

Veriler gerçekten ondalıklı — `scaleNutrition` sonuçları `round1` ile 1 basamağa yuvarlanıyor.

**Şu anki kod** (bileşenin başındaki hesaplamalar):

```ts
  const remaining = target - animatedValue;
  const isOver = target > 0 && (target - value) < 0;
  const isMet = target > 0 && (target - value) === 0;
```

**Olması gereken:**

```ts
  const diff = target - value;
  const isOver = target > 0 && diff < -0.05;
  const isMet = target > 0 && Math.abs(diff) <= 0.05;
```

`remaining` değişkeni tamamen kalkıyor — **kullanıldığı yeri de güncellemen gerekiyor** (aşağıdaki JSX),
yoksa TypeScript kullanılmayan değişken/tanımsız referans hatası verir.

`0.05` eşiği, 1 ondalıkla gösterilen verinin hassasiyetiyle örtüşür: `0,04`'lük fark ekranda `0,0`
yazacağı için "tamamlandı" sayılması tutarlıdır. Eşiksiz tam eşitlik kullanırsan `0,0g kaldı` yazan
bir bar "✓ Tamamlandı" rozetini almaz — düzeltmek istediğimiz tutarsızlığın aynısı geri gelir.

**Şu anki JSX satırı** (rozet/kalan metni):

```tsx
              • {isOver ? `+${formatNumber(Math.abs(target - value))}${unit} aşıldı!` : isMet ? "✓ Tamamlandı" : `${formatNumber(remaining)}${unit} kaldı`}
```

**Olması gereken:**

```tsx
              • {isOver ? `+${formatNumber(Math.abs(diff), 1)}${unit} aşıldı!` : isMet ? "✓ Tamamlandı" : `${formatNumber(diff, 1)}${unit} kaldı`}
```

**DEĞİŞTİRME:**
- `animatedValue` sağdaki `{formatNumber(animatedValue)} / {formatNumber(target)}` sayacında **kalmalı** —
  sayıcı animasyonunun amacı oydu.
- `useAnimatedPct` ve bar genişliği mantığı aynı kalmalı.
- `bg-danger` / `shadow` vurguları aynı kalmalı.
- `useAnimatedValue` hook'unun iç mantığına dokunma (bulgu I — kapsam dışı).

**Commit:** `fix: derive MacroBar remaining/over from real value instead of animated integer`

---

### Adım 3 — Checkbox'ları dokunmatik cihazlarda görünür yap

**Dosyalar:** `tailwind.config.js` + `src/components/DayView.tsx`

**Sorun:** Öğün birleştirme checkbox'ları `opacity-0 group-hover:opacity-100` ile gizli. Dokunmatik
cihazda `hover` olmadığı için kullanıcı kutucukların varlığını göremiyor → çoklu seçim + birleştirme
özelliği mobilde fiilen keşfedilemez. Uygulama mobil-öncelikli, bu ciddi bir kayıp.

**3a. `tailwind.config.js`** — `theme.extend` altına ham medya sorgusu ekle (mevcut anahtarların yanına,
örneğin `borderRadius`'un hemen üstüne veya altına):

```js
      screens: {
        fine: { raw: "(pointer: fine)" },
      },
```

⚠️ **Proje Tailwind 3.4.17 kullanıyor.** Tailwind v4'ün yerleşik `pointer-fine:` varyantı burada
**YOK** — o yüzden bu ham `screens` girdisi şart. `raw` tanımı bir kırılma noktası (breakpoint) değil,
düz bir medya sorgusudur; mevcut `sm:` / `md:` sıralamasını etkilemez.

**3b. `src/components/DayView.tsx`** — öğün listesindeki `<input type="checkbox">` elemanının
`className`'i içindeki koşullu ifade.

**Şu anki kod:**

```tsx
                          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
```

**Olması gereken:**

```tsx
                          isSelected ? "opacity-100" : "opacity-100 fine:opacity-0 fine:group-hover:opacity-100 focus:opacity-100"
```

Mantık: varsayılan görünür (dokunmatik), sadece ince imleçli cihazlarda (fare) gizlenip hover'da beliriyor.
Masaüstündeki mevcut davranış **birebir korunur**.

**Commit:** `fix: keep merge checkboxes visible on touch devices`

---

### Adım 4 — `MergeModal`: kaydetme sırasında kapanmayı engelle

**Dosya:** `src/components/DayView.tsx`

**Sorun:** Bu projede yerleşik ve **bağlayıcı** bir kural var: her yazma formu `requestClose()` deseni
kullanır ve bu fonksiyon kayıt sürerken hiçbir şey yapmaz. `MealForm.tsx` ve `AliasForm.tsx` bu desene
uyuyor. Ama `MergeModal` guard'sız bir kapatıcı alıyor — birleştirme kaydedilirken Esc'e basmak veya
arka plana tıklamak modalı kapatıyor, yazma arka planda devam ediyor.

**Kanonik desen** (`src/components/MealForm.tsx` içinde, referans için):

```tsx
  function requestClose() {
    if (saving) return;
    onClose();
  }
```

**4a.** `DayView` bileşeninin içine, mevcut `closeForm` fonksiyonunun hemen yanına ekle:

```tsx
  function requestCloseMerge() {
    if (busy) return;
    setShowMergeModal(false);
  }
```

**4b.** `MergeModal` render'ındaki `onClose` prop'unu bu fonksiyona bağla.

**Şu anki kod:**

```tsx
          onClose={() => setShowMergeModal(false)}
```

**Olması gereken:**

```tsx
          onClose={requestCloseMerge}
```

Tek prop değişikliği yeterli: `MergeModal` zaten aldığı `onClose`'u hem `<Modal onClose=...>`'a hem
`<FormActions onCancel=...>`'a veriyor, dolayısıyla üç kapanma yolu (Esc, backdrop, ✕) ve "Vazgeç"
butonu birden korunur. `MergeModal`'ın iç yapısını değiştirmene gerek yok.

**Commit:** `fix: block MergeModal close while merge is saving`

---

### Adım 5 — Çalışma ağacını temizle

- **`bar_animation_demo.html` → SİL.** MacroBar animasyonu `b56ccc6` ve `843cd95` commit'leriyle
  zaten merge edildi; bu demo dosyası ölü ağırlık. Ayrıca projedeki salt-okunur `.dc.html` referans
  dosyalarıyla karıştırılma riski taşıyor.
- **`.gitignore`** — `.codegraph/` satırını ekle (yoksa dosyayı oluştur). Bu bir araç çıktısı klasörü,
  repoya ait değil.
- **Bu dosya (`agy_debugging.md`) → `docs/analysis/2026-07-25-agy-debugging.md` olarak taşı.**
  ⚠️ Bunu **en son**, Adım 1-4 bitip doğrulamadan geçtikten sonra yap — yürütme sırasında referansın bu.
  `docs/analysis/` klasörü yoksa oluştur.

**Commit:** `chore: archive agy analysis report, drop animation demo`

---

### 2.7 Doğrulama

**Her adımdan sonra** bu üç komut, proje kökünde:

```bash
pnpm typecheck    # 0 hata
pnpm test         # 12 → 15 test, hepsi geçmeli
pnpm build        # ✓ built
```

Üçü de temiz değilse o adımı commit etme, önce düzelt.

**Tarayıcıda elle doğrulama** — İKİ ayrı terminal gerekir:

```bash
node server/index.js     # backend, 127.0.0.1:8790
pnpm dev                 # Vite, http://localhost:5173
```

⚠️ Tarayıcıda **`http://localhost:5173`** kullan. `127.0.0.1:5173` boş döner — Vite `localhost`'a bağlanıyor.
⚠️ `server/package.json` içindeki `{"type":"commonjs"}` olmadan backend çalışmaz. O dosyaya dokunma.

Kontrol listesi:

1. **parseNum** — Öğün ekle → "Elle" sekmesi → Kalori alanına `0.500` yaz → sonucun **0,5** olduğunu
   doğrula (düzeltmeden önce 500 çıkıyordu). Ardından Hedef formunda `2.600` yazıp **2.600** olarak
   kaydedildiğini doğrula (regresyon kontrolü — bu davranış bozulmamalı).
2. **MacroBar** — 30,4 g lif içeren bir gün oluştur, lif hedefi 30 g olsun → `+0,4g aşıldı!` yazmalı.
   29,6 g'a düşür → `0,4g kaldı` yazmalı ve "✓ Tamamlandı" rozeti **çıkmamalı**. Tam 30,0 g'da rozet çıkmalı.
3. **Checkbox** — DevTools cihaz emülasyonu (iPhone) ile aç → öğün listesindeki kutucuklar hover olmadan
   **görünür** olmalı. Masaüstü moduna dön → kutucuklar yine yalnızca hover'da belirmeli.
4. **MergeModal** — İki öğün seç → "Birleştir" → kaydederken Esc'e bas → modal **kapanmamalı**.

⚠️ **Gerçek veriyi bozma:** 1. ve 2. maddedeki testleri bugünün günü yerine **boş/yeni bir tarihte** yap
ve test bitince o günü sil.

---

## 2.8 Kesin yasaklar

- ❌ **Deploy etme.** `pnpm run deploy` çalıştırma, sunucuya (`92.5.42.0`) bağlanma, SSH kullanma.
  Kullanıcı yayına çıkmayı açıkça istemedi.
- ❌ **`git push` yapma.** Sadece yerel commit at.
- ❌ **`server/index.js`'e dokunma** — donmuş dosya. Backend doğrulama eksikleri (bulgu F) bilinçli
  olarak kapsam dışı bırakıldı.
- ❌ **`src/lib/data.tsx`'e dokunma** — `runWriteThenRefresh` + `stale` mekanizması sessiz veri kaybına
  karşı bir güvenlik ağı. Kaldırma, sadeleştirme, "iyileştirme".
- ❌ **Salt-okunur referanslar — asla düzenleme, import etme, ship etme:**
  `README.md`, `Besin Hafızası.dc.html`, `Wireframes.dc.html`, `support.js`,
  `eski veriler ('Emrullah' kullanıcısı).json`
- ❌ **Kapsam genişletme yok.** Bölüm 1'deki E, F, G, H, I maddelerine kod değişikliği yapma. Yol üstünde
  başka bir sorun görürsen **düzeltme** — sonuç raporunda not düş.
- ❌ **Bağımlılık ekleme yok.** Yeni paket kurma; hepsi mevcut araçlarla yapılabilir.

---

## 2.9 Bitince ne raporla

1. Her adım için: yapıldı / atlandı (+ neden).
2. `pnpm typecheck`, `pnpm test`, `pnpm build` çıktılarının son durumu — **gerçek çıktıyı** yapıştır,
   "geçti" deme.
3. Tarayıcı doğrulamasının 4 maddesinin sonucu.
4. Attığın commit'lerin hash + mesaj listesi.
5. Yol üstünde gördüğün ama **dokunmadığın** her şey.

Bir şey beklenmedik çıkarsa (test kırılırsa, kod tarif edilenden farklıysa, dosya bulunamazsa) **dur ve
bildir** — tahmine dayalı düzeltme yapma. Bu dosyadaki kod parçacıkları gerçek dosyalardan kopyalandı;
eşleşmiyorsa aradan başka bir değişiklik geçmiş demektir ve bunu bilmem gerekir.

---

---

# Bölüm 3 — Orijinal analiz raporu (ARŞİV — uygulama, sadece bağlam)

> ⚠️ Aşağısı bu dosyanın ilk hâlidir. Bazı maddeleri sonradan çürütüldü veya kapsam dışı bırakıldı.
> **Yapılacaklar listesi olarak kullanma** — Bölüm 2 geçerlidir. Bölüm 1'deki tablo hangi maddenin ne
> olduğunu gösteriyor.

## 🟢 1. Otomatik Test & Derleme Durumu

- **TypeScript Tip Kontrolü (`tsc --noEmit`)**: **0 Hata** (Tüm veri tipleri ve arayüzler %100 uyumlu).
- **Unit Testler (`vitest run`)**: **12/12 Başarılı** (`src/lib/nutrition.test.ts`).
- **Backend Servis Durumu (`nutri-api`)**: Oracle Cloud sunucusunda (`92.5.42.0`) `systemd` servisi aktif ve çalışır durumda. Sunucudaki `/home/emrullah/nutri-api/index.js` ile yereldeki `server/index.js` birebir aynı SHA256 hash'ine (`94112c4d349802a5...`) sahip.

## 🚨 2. Tespit Edilen Bug'lar ve Mantık Hataları

### 2.1. `parseNum("0.500")` Parse Bug'ı → ✅ DOĞRULANDI (Adım 1)

- **Konum**: `src/lib/nutrition.ts`
- **Problem**: Nokta içeren sayı metinleri ayrıştırılırken `/^\d+$/.test(parts[0]) && /^\d{3}$/.test(parts[1])`
  kontrolü çalışıyor. Kullanıcı **"0.500"** girdiğinde `parts[0]="0"` ve `parts[1]="500"` bu şarta uyuyor,
  fonksiyon binlik ayırıcı zannedip `"0500"` → **`500`** döndürüyor.
- **Etki**: `0.500` yazılan bir öğün 1000 katı olarak hesaplanır.

### 2.2. `MacroBar` Yuvarlama Gösterim Hataları → ✅ DOĞRULANDI (Adım 2)

- **Konum**: `src/components/MacroBar.tsx`
- **Problem**: Sayılar `useAnimatedValue` hook'undan geçip `Math.round` ile tamsayıya dönüyor, ama
  `isOver`/`isMet` gerçek ondalıklı değeri kullanıyor. Hedef 30 g / alınan 30,4 g → `"+0g aşıldı!"`.
  Hedef 30 g / alınan 29,6 g → `"0g kaldı"` ama `"✓ Tamamlandı"` rozeti çıkmıyor.

### 2.3. `CalorieRing` Hedef Aşıldığında "0" → ⚠️ DOĞRU AMA KAPSAM DIŞI

- **Konum**: `src/components/CalorieRing.tsx`
- **Problem**: `Math.max(0, target - consumed)` nedeniyle 2600 hedefte 2950 tüketildiğinde halkanın
  ortasında `0` yazıyor; aşım miktarı hiçbir yerde görünmüyor.
- **Karar**: Gerçek bir UX eksiği ama düşük öncelikli. Kullanıcı kapsam dışı bıraktı. **Dokunma.**

### 2.4. Mobil Dokunmatik (Touch UX)

#### A. Checkbox'ların gizli olması → ✅ DOĞRULANDI (Adım 3)

- **Konum**: `src/components/DayView.tsx`
- **Problem**: `opacity-0 group-hover:opacity-100` — mobilde `hover` olmadığı için kutucuklar görünmüyor.

#### B. `ConfirmButton` `onBlur` sorunu → ❌ ÇÜRÜTÜLDÜ

- **Konum**: `src/components/FormBits.tsx`
- **İddia**: Dokunmatikte `blur`, `click`'ten önce tetiklenip `"Emin misin?"` aşamasını sıfırlayabilir.
- **Doğrulama sonucu**: Kodda bunu destekleyen kanıt yok. `onBlur` yalnızca odak **başka bir öğeye**
  geçtiğinde çalışır; aynı butona ikinci dokunuşta tetiklenmez. Ancak gerçek cihazda tekrarlanabilir bir
  hata gösterilirse ele alınır. **Tahmine dayalı düzeltme yapma.**

### 2.5. Eşzamanlı Veri Güncelleme (Index-based Mutation) → ⚠️ MİMARİ, KAPSAM DIŞI

- **Konum**: `src/components/DayView.tsx`, `src/components/MealForm.tsx`
- **İddia**: Düzenleme/silme dizi indeksine göre yapılıyor; backend `POST /api/day` günün tüm dizisini
  değiştiriyor. Dışarıdan bir yazma olursa indeksler kayabilir.
- **Doğrulama sonucu**: `MealForm.save()` payload'ı kayıt anında `mealsOf(days, date)`'ten **taze**
  türetiyor — projenin koyduğu kurala zaten uyuyor. Kalan risk yalnızca "başka bir istemci aynı anda
  yazarsa" senaryosu; tek kullanıcılı bir uygulamada bu, "gün yazımı günün tamamını değiştirir"
  mimarisinin kabul edilmiş sonucu. Çözümü optimistic-locking gerektirir. **Kapsam dışı.**

### 2.6. Backend (`server/index.js`) Doğrulama Eksikleri → ⚠️ DOĞRU AMA KAPSAM DIŞI

- **`PUT /api/goals`**: Gövde hiç doğrulanmadan `config`'e yazılıyor; `{}` gönderilirse hedefler bozulur.
- **`readBody` Boyut Sınırı**: 1 MB aşımında `req.destroy()` yapılıyor ama `413` yanıtı dönülmüyor.
- **Karar**: İkisi de gerçek, ama `server/index.js` donmuş bir dosya. **Dokunma.**

## 3. Sonradan eklenen bulgular (ilk raporda yoktu)

### 3.1. `MergeModal` kayıt sırasında kapanabiliyor → ✅ (Adım 4)

`src/components/DayView.tsx` — `MergeModal`'a guard'sız `onClose={() => setShowMergeModal(false)}`
veriliyor. Projenin `requestClose` deseni (kayıt sürerken kapanma yok) ihlal ediliyor. `MergeModal`
bu kural yazıldıktan sonra eklendiği için denetimden geçmemiş.

### 3.2. `useAnimatedValue` her değişimde 0'dan sayıyor → ⚠️ KOZMETİK, KAPSAM DIŞI

`src/components/MacroBar.tsx` — `step()` içinde `Math.round(targetVal * easeProgress)` kullanıldığı için
`progress = 0` anında sonuç daima 0. Öğün eklendiğinde tüm makro sayıları önce sıfıra düşüp yeniden
sayıyor; önceki değerden yeni değere geçmiyor. Bilinçli bir tasarım tercihi olabilir — ayrı karar.
**Bu turda dokunma.**
