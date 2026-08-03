# 📑 Nutrimind — Detaylı Kodbase & Sistem Analiz Raporu

**Tarih:** 3 Ağustos 2026  
**Proje:** Nutrimind (`C:\Users\Emrullah\Desktop\Projeler\besin degerlerim`)  
**Rapor Türü:** Derinlemesine Kod Tabanı, UI/UX, Mimari ve Dayanıklılık Taraması (Debugging Audit)

---

## 1. 🏗️ Mimari & Durum Yönetimi (State & Data Flow Audit)

### 🔴 Risk 1: `stale: true` (Bayat Veri) Durumunda Kurtarma (Recovery) Mekanizması Eksikliği
- **Konum:** `src/lib/data.tsx` (`DataProvider`)
- **Tespit:** Sunucuya herhangi bir yazma aksiyonu (öğün ekleme/silme, alias güncelleme vs.) başarılı olduktan **sonra** arka plandaki `refresh()` çağrısı ağ kesintisi veya geçici sunucu hatası nedeniyle başarısız olursa, `setStale(true)` tetikleniyor.
- **Etki:** `stale: true` olduğunda uygulama terminal ekrana düşüyor (`<Center>Kaydedildi, ancak veriler yenilenemedi — sayfayı yenileyin.</Center>`). Ancak bu ekranda **"Yeniden Dene"** butonu bulunmuyor. Kullanıcı manuel F5 yapmadıkça uygulama kilitli kalıyor.
- **Çözüm Önerisi:** Terminal mesajının altına `refresh()` fonksiyonunu tekrar çağıracak bir *"Tekrar Dene"* butonu eklenmesi.

---

### 🟡 Risk 2: Çoklu Öğün Yazımında State Closure (Bayat Nesne) Riski
- **Konum:** `src/components/MealForm.tsx` (`save()` fonksiyonu)
- **Tespit:** `ScanSheet.tsx` içerisinde iki aşamalı kayıt yapılırken `fetchData()` ile sunucudan güncel veri çekilmesi (stale closure tuzağını önlemek için) doğru bir şekilde uygulanmış. Ancak `MealForm.tsx` içerisindeki `save()` fonksiyonu doğrudan React context'indeki `days` closure'ına bakarak `mealsOf(days, date)` çalıştırıyor.
- **Etki:** Kullanıcı hızlıca art arda öğün eklerse veya eşzamanlı iki işlem gerçekleşirse, ikinci işlem henüz state'e yansımamış eski `days` dizisinin üzerine yazabilir ve son eklenen öğün silinebilir.

---

### 🟡 Risk 3: Öğün Silinme/Sıralama Değişiminde `editIndex` Kayması
- **Konum:** `src/components/DayView.tsx`
- **Tespit:** `DayView` içerisinde `editIndex` state'i `number` indeks olarak tutuluyor. Eğer bir öğün formu açıkken arka planda veya başka bir sekmede (örneğin websocket/poll ile) öğün silinirse veya sıralama değişirse, açılmış olan form yanlış indeksteki öğünün üzerine yazabilir.
- **Çözüm Önerisi:** Düzenleme formuna sayısal indeks (`number`) yerine benzersiz öğün ID'si (`meal.id`) ile referans verilmesi daha güvenlidir.

---

## 2. 🎨 UI/UX & Mobil Kenar Durumları (Edge Cases Audit)

### 🟡 Risk 4: Üst Üste Açılan Modallarda `body.style.overflow` Çakışması
- **Konum:** `src/components/Modal.tsx`
- **Tespit:** `Modal` bileşeni açıldığında `document.body.style.overflow = "hidden"` yapıyor, kapandığında ise önceki `prev` değerini geri yüklüyor.
- **Etki:** İç içe modal veya sheet açıldığında (ör. `MealForm` açıkken içinden `ScanSheet` veya `AliasPicker` açıldığında), içteki modal kapandığında `document.body.style.overflow` değeri üstteki modal henüz kapanmamışken `"visible"` durumuna dönebilir. Bu da modal arkasındaki ana sayfanın kaydırılmasına izin verir.

---

### 🟢 Risk 5: iOS Safari Gizlilik/Özel Modda `localStorage` Crash Riski
- **Konum:** `src/lib/usePersistedBool.ts` & `src/lib/prefs.ts`
- **Tespit:** `localStorage.getItem` ve `localStorage.setItem` çağrıları doğrudan yapılıyor.
- **Etki:** Safari Gizli Modunda (Private Browsing) veya depolama izni kısıtlanmış ortamlarda `localStorage` erişimi `DOMException (QuotaExceededError / SecurityError)` fırlatabilir. `try-catch` sarmalı olmaması durumunda uygulama beyaz ekrana düşebilir.

---

## 3. ⚡ Performans ve Bellek Yönetimi (Performance Audit)

### 🟢 Risk 6: `MealForm` Açılışında Tüm Geçmiş Günlerin Taranması (`buildUsageIndex`)
- **Konum:** `src/components/MealForm.tsx`
- **Tespit:** `MealForm` bileşeni her mount olduğunda `buildUsageIndex(days, goals)` fonksiyonu `useMemo` içinde çalıştırılıyor. `days` objesi kullanıcının aylar/yıllar boyunca eklediği binlerce geçmiş kaydı içeriyor.
- **Etki:** Zamanla veri büyüdükçe (1000+ öğün) `buildUsageIndex` ve `rankAliases` hesabı mobilde milisaniyelik gecikmelere (UI lag) yol açabilir. Bu hesaplamanın memoization seviyesi global düzeye taşınabilir veya önbelleklenebilir.

---

### 🟢 Risk 7: `useOffScanner` Kamera Stream Temizliği (Unmount Lifecycle)
- **Konum:** `src/lib/offScanner.ts` & `src/components/ScanSheet.tsx`
- **Tespit:** Kamera tarayıcı kapatıldığında (`ScanSheet` unmount olduğunda) `MediaStreamTrack.stop()` çağrılıyor. Ancak cihaz arka plana alındığında veya sekme değiştirildiğinde kameranın donması durumlarına karşı `visibilitychange` dinleyicisi eklenebilir.

---

## 4. 🛡️ Güvenlik, Hata Yönetimi & Dayanıklılık (Resilience)

### 🟡 Risk 8: Top-Level React `ErrorBoundary` Eksikliği
- **Konum:** `src/App.tsx`
- **Tespit:** Uygulamada kök düzeyde bir React `ErrorBoundary` bileşeni bulunmuyor.
- **Etki:** Eğer beklenmeyen bozuk bir tarih formatı (`formatLongDate`), hatalı bir JSON verisi veya render esnasında fırlatılan bir JavaScript istisnası meydana gelirse, tüm React ağacı unmount olur ve kullanıcı sadece boş beyaz bir ekran görür.
- **Çözüm Önerisi:** `App.tsx`'in en dışına şık bir *"Bir hata oluştu — Sayfayı Yenile"* ErrorBoundary bileşeni eklenmesi.

---

## 5. 🎯 Özet ve Öncelik Matrisi

| # | Konu / Alan | Şiddet / Seviye | Etki Alanı | Tavsiye Edilen Eylem |
|---|---|---|---|---|
| **1** | `stale: true` durumunda kurtarma | 🟡 Orta | UX / Veri Akışı | Sayfa kilidini açacak "Yeniden Dene" butonu eklenmesi |
| **2** | Top-level React ErrorBoundary | 🟡 Orta | Dayanıklılık | `App.tsx` dışına kilitlenme önleyici sarmal eklenmesi |
| **3** | `Modal` scroll-lock çakışması | 🟢 Düşük | UI / UX | `Modal` içi sayac (modal count) yapısına geçilmesi |
| **4** | `localStorage` try-catch sarmalı | 🟢 Düşük | Uyum / Güvenlik | Safari Private mode için fallback eklenmesi |
| **5** | `editIndex` yerine `meal.id` | 🟢 Düşük | Veri Bütünlüğü | Öğün düzenlemede ID bazlı state yapısına geçilmesi |
