# Tasarım: Nutrimind — Elle Ekleme & Düzenleme (yazma arayüzü)

**Tarih:** 2026-07-24
**Durum:** Onaylandı (kullanıcı) — uygulamaya hazır

## 1. Amaç

Nutrimind frontend'i şu an tamamen **salt-okunur**. Backend (`server/index.js`)
ise tüm CRUD uçlarına zaten sahip. Bu iş, mevcut uçlara bağlanan **ekleme /
düzenleme / silme arayüzünü** frontend'e ekler; böylece kullanıcı site
üzerinden (agy/API'ye gerek kalmadan):

1. Günlüğe elle öğün ekleyebilir (çift mod: hafızadan seç / elle gir),
2. Kayıtlı günlük öğünleri düzenleyip silebilir,
3. Alias (besin hafızası) ekleyip düzenleyip silebilir,
4. Kalori/makro hedefini düzenleyebilir.

## 2. Kapsam

**Dahil:** öğün ekle (çift mod), öğün düzenle/sil, alias ekle/düzenle/sil,
goals düzenle. Tümü mevcut backend uçlarına bağlı, frontend işi.

**Hariç (YAGNI):** NLP sohbet/otomatik eşleştirme akışı, güven skoru, çakışma
çözücü, çok-kullanıcı, sesli/barkod giriş. (README'de tanımlı ama bu turda değil.)

## 3. Backend sözleşmesi (mevcut — değişmeyecek)

`server/index.js`, `https://nutri.emrullah.xyz` (nginx basic-auth arkasında):

- `GET    /api/data`      → `{ goals, days, aliases }`
- `POST   /api/day`       → `{ date, meals:[{name,nutrition}] }` (günü upsert — tüm diziyi değiştirir)
- `DELETE /api/day/:date` → günü sil
- `PUT    /api/goals`     → `{ kcal,protein,carbs,fat,fiber }`
- `POST   /api/alias`     → `{ id?, triggers[], name, brand?, serving_g, nutrition }` (upsert)
- `DELETE /api/alias/:id` → alias sil

Not: `days[date]` backend'de `[{name, nutrition}]` düz dizisi. Belirli bir öğünü
düzenlemek/silmek = diziyi index'te değiştir → tüm günü yeniden POST et.

## 4. Mimari yaklaşım — veri tazeleme

**Karar: "yaz → yeniden çek" (mutate → refetch).** Her yazma işleminden sonra
`fetchData()` tekrar çağrılıp context güncellenir. Tek kullanıcı + düşük frekans
için en sağlam ve en az kodlu yol.

Değerlendirilen alternatif — optimistic local update: daha hızlı hissettirir ama
drift riski + fazladan karmaşıklık; bu ölçekte gereksiz. **Reddedildi.**

## 5. Katmanlar / dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/api.ts` | Yeni saf fetch'ler: `saveDay(date, meals)`, `deleteDay(date)`, `saveGoals(goals)`, `saveAlias(alias)`, `deleteAlias(id)` |
| `src/lib/data.tsx` | DataProvider → mutable state (`goals/days/aliases`) + `refresh()` + aksiyon sarmalayıcıları (API çağır → refresh). Context değeri `AppData & Actions` |
| `src/components/Modal.tsx` *(yeni)* | Dark-theme modal/bottom-sheet kabuğu (Esc/overlay ile kapanır) |
| `src/components/MealForm.tsx` *(yeni)* | Öğün ekle/düzenle — 2 mod sekmesi |
| `src/components/AliasForm.tsx` *(yeni)* | Alias ekle/düzenle |
| `src/components/GoalsForm.tsx` *(yeni)* | Hedef (goals) düzenle |
| `src/components/DayView.tsx` | "+ Öğün ekle" butonu + her öğün satırına düzenle/sil |
| `src/pages/AliasPage.tsx` | "+ Yeni besin" butonu + her karta düzenle/sil |
| `src/pages/DailyPage.tsx` | Başlık satırına küçük "Hedef" (⚙/düzenle) butonu → GoalsForm modal'ı açar |

## 6. Bileşen davranışları

### 6.1 MealForm (çift mod)
- **Mod A "Hafızadan":** alias seç (dropdown/arama) → miktar (gram, varsayılan
  `alias.serving_g`) → makrolar lineer ölçekle canlı önizlenir
  (`nutrition[k] × miktar / serving_g`). İsim otomatik alias adı (düzenlenebilir).
- **Mod B "Elle":** isim + `kcal/protein/carbs/fat/fiber` elle.
- **Düzenleme:** mevcut `MealItem` "Elle" moduna yüklenir (isim + makrolar).
- **Kaydet:** o günün `meals` dizisini kur (ekle→push / düzenle→index'te değiştir)
  → `saveDay(date, meals)`. `meals` öğeleri `{name, nutrition}` biçiminde.

### 6.2 Öğün silme (DayView)
- Satırda sil → onay → o index diziden çıkar → `saveDay(date, meals)`;
  dizi boşalırsa `deleteDay(date)`.

### 6.3 AliasForm
- Alanlar: `triggers` (enter/virgülle çip listesi), `name`, `brand` (ops.),
  `serving_g`, `nutrition` (5 alan).
- Ekle: `id` yok → backend üretir. Düzenle: mevcut `id` ile upsert.
- Sil (AliasPage kartında): onay → `deleteAlias(id)`.

### 6.4 GoalsForm
- `kcal/protein/carbs/fat/fiber` elle → `saveGoals(goals)`.
- Giriş noktası: `DailyPage` başlık satırındaki küçük "Hedef" butonu modal'ı açar.

## 7. Nerede düzenlenebilir
`DayView` hem **Günlük (bugün)** hem **Geçmiş → gün detayı**nda kullanıldığından,
öğün ekleme/düzenleme/silme her iki yerde de otomatik çalışır.

## 8. UI deseni
Formlar `Modal` içinde (mobilde alttan sheet, masaüstünde ortalı). Hifi dili:
yeşil birincil CTA, mor hafıza aksanı, JetBrains Mono sayılar, sil = kırmızımsı
(`#ff8080` üzeri `rgba(255,80,80,.1)`). Ham hex yerine semantik Tailwind sınıfları.

## 9. Doğrulama & hata
- Zorunlu alanlar: öğün adı boş değil; alias'ta ≥1 trigger + ad; makrolar sayısal
  ve ≥ 0. Geçersizse Kaydet pasif.
- API hatası → form içinde satır-içi hata mesajı; kaydet sırasında buton "…"
  durumuna geçer. Global veri hatası zaten `DataProvider` Center ekranında.

## 10. Test / doğrulama (local-first)
`pnpm typecheck` sıfır hata + `pnpm dev` (http://localhost:5173):
öğünü iki modla ekle, düzenle, sil; alias ekle/düzenle/sil; goals düzenle;
her işlem sonrası kalori halkası + makro barları + Geçmiş güncelleniyor mu.
Local doğrulanınca `pnpm deploy` ile canlıya (`nutri.emrullah.xyz`).

## 11. Notlar
- Yazma uçları nginx basic-auth arkasında; tarayıcı auth'u önbelleğe aldığından
  aynı-origin `fetch` çalışır (GET zaten çalışıyor).
- Proje git deposu değil → tasarım dokümanı commit edilmez, dosya olarak tutulur.
