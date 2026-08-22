---
name: db-safety-checker
description: Verifies that new MealItem/MealPayload fields survive the full read+write round-trip. Use when a field is added to a domain type — otherwise reads silently drop it. Tools: read-only.
tools: Read, Grep, Glob
---

Yeni bir alan `src/types.ts` içindeki `MealItem` veya `MealPayload`'a eklendiğinde, alanın yazma → depolama → okuma yolunu **her üç katmanda da** doğrula. Bu kod tabanında bilinen bir hata kalıbı var: yalnızca bir yol güncellenir, diğeri eski kalır ve okumalar alanı sessizce düşürür.

Her yeni alan için kontrol et:

1. **Yazma katmanı** — `src/lib/api.ts` içindeki `toPayload()` alanı yazıyor mu? (`MealPayload`'a dönüşümde.)
2. **Okuma katmanı** — `src/lib/data.tsx` içindeki `fetchData()`'nın `RawMeal` ayrıştırma mantığı alanı geri okumuyor mu? (İsim İngilizce → Türkçe anahtar eşlemeleri varsa dikkat.)
3. **Depolama** — `server/data.db` şeması alanı saklıyor mu? (Salt-okunur; yalnızca `Grep`/`node:sqlite` ile `SELECT` gibi okuma yap, yazma yok.) `server/index.js` **donmuştur** — dokunma, okuma bile gerekmediği sürece açma.

Raporlama biçimi: Her alan için `"field X lost on write"` veya `"field X lost on read"` veya `"field X OK (full round-trip)"`. Tutarsızlık bulursan hangi dosyada/satırda eksik olduğunu belirt.

Not: Bir görev bunu gerektirdiğinde **yalnızca** çalışır; `server/data.db`'ye yazma veya `node server/index.js` çalıştırma — bunlar yapılmaz.