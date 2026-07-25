# Handoff: Nutrimind — Besin Hafızalı Beslenme Takip Uygulaması

## Overview
Nutrimind, kalori/makro takibinden öte **kullanıcının konuşma biçimini ve ürün tercihlerini öğrenen** bir beslenme günlüğüdür. Kullanıcı doğal dille "2 yumurta, yoğurt ve protein shake içtim" yazar; sistem daha önce öğrendiği takma adlardan (alias) ürünleri otomatik eşleştirir, güven puanına göre gerekiyorsa onay ister, öğünü kaydeder ve günlük istatistikleri günceller.

Ürünün çekirdek farkı **besin hafızası**: "yoğurt" = Eker Süzme Yoğurt, "protein tozu" = KFD WPC 82 gibi eşleştirmeler bir kez öğrenilir, sonra otomatik uygulanır. Güven puanı yükseldikçe onay adımı görünmez olur.

Öncelikler: hızlı kullanım, minimum tıklama, mobil öncelikli, karanlık tema.

## About the Design Files
Bu paketteki dosyalar **HTML ile oluşturulmuş tasarım referanslarıdır** — hedeflenen görünüm ve davranışı gösteren prototiplerdir, doğrudan kopyalanacak üretim kodu değildir. Dosyalar bir "Design Component" (`.dc.html`) formatında yazılmıştır ve çalışmak için yanlarındaki `support.js` çalışma zamanına ihtiyaç duyar; amaçları yalnızca görsel/davranışsal referans olmaktır.

Görev: bu tasarımları **hedef kod tabanının kendi ortamında yeniden oluşturmaktır** (React/React Native, Vue, SwiftUI, Flutter vb.), o ortamın yerleşik desenleri ve kütüphaneleriyle. Henüz bir ortam yoksa, proje için en uygun çatıyı seçip tasarımları orada uygulayın. HTML doğrudan gönderilmemelidir.

Backend bu handoff kapsamında değildir — aşağıdaki **Data Model** bölümü, Claude Code'ta backend'i kurarken sözleşme (contract) olarak kullanılmak üzere verilmiştir.

## Fidelity
İki set dosya var, farklı fidelity seviyelerinde:

- **`Besin Hafızası.dc.html` — High-fidelity (hifi).** Final renkler, tipografi, boşluk ve etkileşimlerle premium karanlık tema mockup'ları. Mimari diyagram + mobil ekranlar + masaüstü hafıza yönetimi + trend. UI'ı bu dosyadaki değerlerle piksel hassasiyetinde yeniden oluşturun.
- **`Wireframes.dc.html` — Low-fidelity (lofi).** Yapı ve akışı gösteren sketch wireframe'ler (13 ekran, 2 tur). Bunları düzen/işlevsellik rehberi olarak kullanın; stillendirmede hifi dosyasındaki (ve kendi tasarım sisteminizdeki) değerleri uygulayın.

Öncelik çakışırsa **hifi dosyası** bağlayıcıdır.

---

## Design Tokens (hifi — `Besin Hafızası.dc.html`)

### Renkler
| Rol | Hex |
|---|---|
| Arka plan (app) | `#08090a` |
| Yüzey / kart | `rgba(255,255,255,0.045)` |
| Kart kenarlık | `rgba(255,255,255,0.08)` |
| Yükseltilmiş yüzey (masaüstü panel) | `#0c0d10` / `#15161a` |
| Metin — birincil | `#f5f5f7` |
| Metin — ikincil | `#a1a1aa` |
| Metin — üçüncül / placeholder | `#71717a` / `#52525b` |
| **Protein (yeşil)** | `#34d399` |
| **Karbonhidrat (turuncu)** | `#fb923c` |
| **Yağ (sarı)** | `#fbbf24` |
| **Lif / hafıza (mor)** | `#a78bfa` |
| Marka aksanı / birincil CTA | `#34d399` (yeşil dolgu, metin `#062e22`) |
| Uyarı / çakışma | `#fbbf24` (sarı) |
| Yıkıcı (sil) | `#ff8080` üzerinde `rgba(255,80,80,.1)` |

Makro renkleri veri görselleştirmede tutarlı; bar arka planları `rgba(<renk>,0.15–0.2)`, dolgular tam renk.

### Tipografi
- **UI/başlık fontu:** `Manrope` (Google Fonts), ağırlıklar 400–800.
- **Teknik/mono font:** `JetBrains Mono` (Google Fonts) — etiketler, sayısal değerler, şema alanları, güven puanları.
- Wireframe fontu (lofi'ye özel, üretimde kullanmayın): `Kalam`.
- Ölçek örnekleri: kapak başlığı 76px/800/-.035em; bölüm başlığı 44px/800/-.03em; kart başlığı 15–19px/700–800; gövde 14–17px/400–600; mono etiketler 10–13px, letter-spacing .06–.14em, çoğunlukla uppercase.
- `text-wrap: pretty` uzun paragraflarda.

### Boşluk & şekil (Apple-benzeri)
- Köşe yarıçapı: kartlar 18–24px, küçük çipler 10–16px, telefon çerçevesi 38–46px, butonlar 16–22px, pill'ler 22px.
- Kart iç boşluğu genelde 14–18px; bölümler arası 40–180px (canvas board).
- Cam efekti: translucent yüzey + gerektiğinde `backdrop-filter: blur(3px)`.
- Gölge: `0 40–70px 90–130px -20…-40px rgba(0,0,0,.7–.9)` + `inset 0 0 0 1px rgba(255,255,255,.06)`.

### Hareket
- Nazik/hafif. Örnek: eşleştirme sırasında yanıp sönen nokta — `@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}` (1s infinite).
- Aşırı gradient/parlaklıktan kaçının; premium startup hissi hedeflenir.

---

## Screens / Views

### Hifi ekranlar (`Besin Hafızası.dc.html`)
Tek bir pan/zoom board'da, bölümler halinde:

**01 · Sistem Mimarisi** — 6 tablolu DB şeması kartları + 5 adımlı eşleştirme hattı (aşağıdaki Data Model / Matching Pipeline'a bakın).

**02 · Mobil — Sohbet / Ana ekran**
- Amaç: tek cümleyle öğün ekleme başlangıcı.
- Düzen: dikey flex. Üstte selam + tarih + avatar (38px yeşil daire). Sabitlenmiş "bugün" mini kartı: büyük kcal (`1.480 / 2.100 · kalan 620`) + 4 mikro makro barı. Altında sohbet dizisi (sistem balonu solda `rgba(255,255,255,.05)` 18px radius; kullanıcı balonu sağda yeşil gradient `#34d399→#10b981`, metin `#062e22`). "Hafızandan eşleştiriyorum…" mor durum balonu (pulse nokta).
- Alt composer (sabit): hızlı çipler satırı (↺ Dün gibi, ☕ Kahvaltım, 🥤 Shake), sonra giriş pill'i — placeholder "Ne yedin?", kamera + mikrofon ikonları, 42px yeşil gönder dairesi.

**02 · Mobil — Akıllı eşleştirme / Onay**
- Amaç: ayrıştırılan öğeleri onaylama.
- Ham metin alıntısı (italik). Öğe kartları:
  - Eşleşen (yeşil ✓ rozet) — miktar stepper'ı (− sayı +).
  - Hafıza eşleşmesi (mor ✦ rozet) — "yoğurt → Eker Süzme Yoğurt", sağda güven `%96`.
  - Belirsiz (sarı ! rozet) — "Lavaş — hangisi?" iki aday seçenek kartı, güven yüzdeleriyle.
- Alt: toplam kcal + birincil "Onayla ve kaydet" (yeşil dolgu).

**02 · Mobil — Günlük özet**
- Amaç: günün rakamsal/görsel özeti.
- Tarih gezinme (‹ Bugün ›). Büyük kalori halkası: `conic-gradient(#34d399 0 70%, rgba(255,255,255,.06) 70% 100%)`, ortada iç daire `#08090a`, "620 kcal kaldı / 1.480 / 2.100".
- 4 makro barı (protein/karb/yağ/lif) değer + hedef + renkli dolgu.
- Öğün dökümü: Kahvaltı 432, Öğle 600, Akşam 448 (sonuncu yeşil "yeni" vurgusu).

**03 · Besin Hafızası (çekirdek)**
- **Tek dokunuşla öğret (bottom sheet):** karartılmış zemin + alttan sheet. Başlık `"lavaş" öğrenilsin mi?`, arama alanı, radyo-seçmeli sonuç kartları (önerilen mor kenarlı), "+ Yeni ürün tanımla". Butonlar: "Sadece bu sefer" (hayalet) + "Hep hatırla ✦" (mor dolgu `#a78bfa`, metin `#1e1b4b`).
- **Yapay zekâ açıklaması:** "Neden bu ürün?" ekranı. Seçili ürün + güven metre (`%96`, mor gradient). Gerekçe listesi (🧠 son 8 kayıt, 🏷️ markayı sen tanımladın, ⏰ saat/öğün uygun). Butonlar: "Başka ürün" / "Doğru, kaydet".

**04 · Masaüstü — Hafıza yönetimi**
- Sabit 1140px pencere (macOS trafik ışıkları). Sol sidebar 216px (nav: Bugün, Öğünler, Besinler, **Hafıza** aktif, İstatistik + kullanıcı kartı "tek kullanıcı · v0.1"). Orta içerik: başlık + "37 ifade öğrenildi" + arama + "+ Yeni besin". **Çakışma banner'ı** (sarı). Alias tablosu: kolonlar İFADE · EŞLEŞEN ÜRÜN · GÜVEN (barlı) · KULLANIM · SON. Sağ rail 308px: seçili ifade detayı, **çakışma çözücü** (radyo seçim + "Birincil yap ve öğret"), son 14 gün kullanım bar grafiği, Düzenle/Sil.

**05 · Trend & giriş yöntemleri**
- Haftalık kalori bar grafiği (hedef çizgisi dashed, bugün açık vurgulu), "6 gün seri". Alt istatistik çipleri (ort. protein ▲%12, ort. lif hedef altı, %92 otomatik eşleşme).
- Öğün ekleme yolları listesi: Yazarak (MVP), Sık kullanılanlar (MVP), Sesli, Barkod/fotoğraf (İLERİDE), **AI/veritabanı ingest (ADMIN)** — sunucu tarafı toplu besin/alias yükleme.
- Çok-kullanıcı notu: her tablo `user_id` kapsamlı, paylaşılan global besin kataloğu, alias/hafıza kullanıcıya özel, RLS-ready.

### Lofi ekranlar (`Wireframes.dc.html`)
**Tur 1 — 7 çekirdek ekran:** 1a Dashboard · 1b Öğün ekleme · 1c Besin hafızası/alias · 1d Öğün geçmişi · 1e Günlük besin değerleri · 1f Besin detay · 1g İstatistik & analiz. Her ekranın altında Türkçe açıklaması var.

**Tur 2 — 6 ek özellik ekranı:** 2a Akıllı hatırlatıcı & öneriler · 2b Öğün şablonları/kombinasyon hafızası · 2c Su & takviye takibi · 2d Öğrenme & otonomi ayarları (güven eşiği kaydırağı) · 2e Haftalık özet (paylaşılabilir) · 2f "Yanlış eşleşme" düzeltme döngüsü.

---

## Interactions & Behavior
- **Öğün ekleme akışı:** sohbet girişi → NLP ayrıştırma → alias/hafıza eşleştirme → güven puanı → (≥ eşik otomatik / altı onay sorusu) → onay → kayıt → günlük istatistik güncelleme. Ortalama iki dokunuş hedeflenir.
- **Miktar:** doğal dilden çıkarım ("2 yumurta", "1 kase yoğurt") + hızlı stepper ile düzeltme + gram girişi.
- **Öğretme:** yeni/belirsiz ifadede bottom sheet; "Hep hatırla" alias'ı `confidence` ve `use_count` ile kaydeder; "Sadece bu sefer" öğrenmeden ekler.
- **Çakışma:** aynı `phrase` birden çok `food_id`'ye işaret ederse sarı uyarı; kullanıcı birincil seçer.
- **Düzeltme döngüsü (2f):** yanlış eşleşme işaretlenince ilgili alias güveni düşer (örn. %94→%60), yeni seçim öğrenilir, 2 doğru kullanımda tekrar yükselir.
- **Otonomi (2d):** güven eşiği kaydırağı — "bu güvenin üstünü sormadan ekle" (varsayılan ~%88); "belirsizde her zaman sor" ve "yeni ürünü otomatik öğren" toggle'ları.
- **Öneriler (2a):** hedef açığı + öğün saatine göre bağlamsal öneri kartı/bildirimi; "Ekle" veya "Sonra".

## State Management
- Günlük seçili tarih; günlük toplamlar (kcal, protein, karb, yağ, lif) ve hedefler.
- Aktif öğün taslağı: ham metin, ayrıştırılmış öğeler (miktar+birim), her öğe için eşleşen `food_id` + `confidence` + durum (eşleşti / hafıza / belirsiz).
- Alias sözlüğü (phrase→food_id, confidence, use_count) — istemci tarafında önbelleğe alınabilir.
- Ayarlar: otomatik-ekleme güven eşiği, belirsizde sor, otomatik öğren.
- Su/takviye sayaçları; şablonlar; haftalık aggregate.
- Veri çekme: besin kataloğu araması, kullanıcı alias'ları, öğün/günlük toplam okuma-yazma.

---

## Data Model (backend sözleşmesi)
Tüm tablolar `user_id` ile kapsanmıştır (RLS-ready). `foods` hem global (user_id NULL) hem kullanıcıya özel olabilir; `aliases` ve öğün verisi kullanıcıya özeldir.

- **users** — `id uuid PK`, `display_name text`, `locale ('tr'|'en')`, `goals jsonb` (kcal/protein/karb/yağ/lif hedefleri), `created_at ts`.
- **foods** — `id uuid PK`, `user_id fk NULL` (NULL = global katalog), `brand text`, `name text`, `per_100g` (kcal, protein, karb, yağ, lif), `serving_units jsonb` (örn. `{"adet":50,"kase":200,"ölçek":30}`).
- **aliases** *(hafıza)* — `id uuid PK`, `user_id fk`, `phrase text` (örn. "yoğurt"), `food_id fk → foods`, `confidence numeric 0–1`, `use_count int`, `created_at ts`. Aynı (user_id, phrase) birden çok food_id'ye işaret edebilir → çakışma; biri "birincil".
- **meals** — `id uuid PK`, `user_id fk`, `eaten_at ts`, `slot ('sabah'|'öğle'|'akşam'|'ara')`, `raw_text text`.
- **meal_items** — `id uuid PK`, `meal_id fk → meals`, `food_id fk → foods`, `qty numeric` + `unit`, `computed` (kcal, protein, karb, yağ, lif — kayıt anında hesaplanır).
- **daily_totals** — `user_id fk`, `date`, `kcal`, `protein`, `karb`, `yağ`, `lif`. Materialized view / aggregate olarak önerilir.

### Matching Pipeline (5 adım)
1. Serbest metin ("2 yumurta, yoğurt…").
2. NLP ayrıştırma → (miktar + birim + öğe ifadesi) listesi.
3. Alias eşleştirme → kullanıcının `aliases` kaydından `phrase`→`food_id`.
4. Güven puanı → `confidence ≥ eşik` (varsayılan 0.8) otomatik; altı ise onay sor / seçenek göster.
5. Onay + kayıt → `meals` + `meal_items` yaz, ilgili alias `use_count++` ve confidence güncelle, `daily_totals` yenile.

### Çok kullanıcıya geçiş
Auth + satır-seviye güvenlik (RLS) eklenince aynı UI çoklu profili taşır. Global besin kataloğu paylaşılır; alias'lar/hafıza ve öğünler kullanıcıya özel kalır. Ayrıca **admin ingest** yolu: sunucu tarafında toplu besin/alias yükleme (AI destekli).

---

## Assets
Özel görsel/ikon yok. İkonlar emoji ile temsil edilmiştir (☕🥗🍽️🥤💧☕💊🔔) — üretimde kod tabanının ikon setiyle (SF Symbols, Lucide vb.) değiştirin. Fontlar Google Fonts'tan: **Manrope**, **JetBrains Mono** (Kalam yalnızca lofi wireframe estetiği içindir, üretimde kullanmayın). Grafikler CSS/basit inline SVG polyline ile çizilmiştir — üretimde bir grafik kütüphanesi kullanın.

## Files
- `Besin Hafızası.dc.html` — hifi tasarım (mimari + mobil + masaüstü + trend).
- `Wireframes.dc.html` — lofi wireframe seti (13 ekran, 2 tur).
- `support.js` — `.dc.html` dosyalarını tarayıcıda açmak için gereken çalışma zamanı (yalnızca önizleme için; üretim kodu değildir).

Dosyaları tarayıcıda açmak için `.dc.html` ile `support.js` aynı klasörde olmalıdır.
