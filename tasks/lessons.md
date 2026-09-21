# tasks/lessons.md

AGENTS.md "Kendini Geliştirme Döngüsü" gereği: kullanıcıdan gelen her düzeltmeden sonra kalıp
buraya yazılır. Amaç aynı hatayı iki kez yapmamak.

**Numaralandırma kuralı (AGENTS.md madde 10):** mevcut bir `L<n>` numarası DEĞİŞTİRİLMEZ —
`todo.md` ve kod yorumları ona atıf yapar. Yeni ders daima **en büyük + 1** alır. Bölümler artan
sırada tutulur; sıra karışırsa yalnızca blok taşınır, numara değişmez.

---

## L1 — Kod okumak, gerçek cihaz testinin yerini tutmaz

**Olay:** 7 denetim ajanı kamera/barkod akışını "temiz" işaretledi; kullanıcının telefon testi
çürüttü. Sonradan bug tarayıcıda `history.pushState`/`popstate` sarmalanarak **kamerasız** yeniden
üretildi (`Modal`'ın efekti her render'da yeniden kuruluyor, temizliği `history.back()` çağırıyor,
geciken `popstate` modalı kapatıyordu).

**Kural:** Bir akış "çalışıyor görünüyor" diye kapatılmaz. Çalışma zamanını **enstrümante et** —
tarayıcı API'lerini sarmala, olay izini kaydet. Gerçek donanım yoksa donanımı taklit et.

## L2 — Kullanıcının "çalışmıyor" demesi, kod okumasından üstündür

**Olay:** Kod tarafında doğru bağlı görünen `DayView > Tara` yolu için "çalışıyor" yazdım;
kullanıcı "hayır, şimdi test ettim çalışmıyor" dedi ve haklıydı — sorun prop bağlantısında değil,
paylaşılan kamera yaşam döngüsündeydi.

**Kural:** Kullanıcının gözlemi ile kod okuması çelişiyorsa **kod okuması yanlıştır.** Belirtiyi
açıklayan bir mekanizma bulunana kadar arama sürer.

## L3 — Ajan bulgusu doğrulanmadan rapora girmez

**Olay:** agy "Lif'te Bilinmiyor≠Sıfır ihlali" bildirdi; `types.ts:17`'de `fiber: number` zorunlu
alan olduğu için bulgu yanlıştı. Ayrıca kendi "AI hafızayı hiç görmüyor" hipotezim de yanlıştı —
`server/index.js:540` alias'ları zaten geçiriyordu; gerçek sorun çok daha dardı.

**Kural:** Her bulgu, rapora girmeden önce kaynak kodda elle doğrulanır. Kendi hipotezim de dahil.

## L4 — Dosya düzenlemek için script yazma

**Olay:** `ExerciseModal.tsx`'in import'larını Python heredoc ile yeniden yazdım; kullanıcı bunu
açıkça yasakladı.

**Kural:** Dosya değişiklikleri **yalnızca** Write/Edit ile. Python/shell script yok.

## L5 — "Donmuş" dosya kuralı, otonom düzeltme kuralını ezer

**Olay:** CLAUDE.md §6 "hata gelince direkt düzelt, elini tutmasını isteme" diyor ama aynı madde
`server/index.js` için açık istisna koyuyor.

**Kural:** `server/index.js`'te bir bug bulsam bile **önce sor**. Yeni backend mantığı gerekiyorsa
izole modül deseni (`server/ai.js` gibi: asla throw etme, `{status, body}` dön).

## L6 — Kullanıcıya seçenek sunarken premisi doğrula

**Olay:** "Kullanıcı başına ayrı DB" seçeneğini "şema hiç değişmez, göç riski sıfır" diye sundum.
Tasarım incelemesi bunun kısmen yanlış olduğunu gösterdi: oturumun hangi dosyayı açacağını bilmesi
için `users`+`sessions` tablosu her hâlükârda gerekiyor, yani ayrı-dosya yolu da şema ekliyor.
Kullanıcı kararını yanlış premisle vermişti; düzeltilmiş bilgiyle tekrar soruldu.

**Kural:** AskUserQuestion'daki her seçeneğin gerekçesi, sorulmadan önce kodda doğrulanmış olmalı.
Sonradan yanlış çıkarsa **sessizce devam etme** — düzeltip yeniden sor.

## L7 — Dev'deki tuhaflık üretimdeki bug demek değildir

**Olay:** Dev sunucusunda tarayıcı modalinin geri tuşu çalışmıyor göründü ve `history.state` yanlıştı.
Sebep React **StrictMode**'un efektleri dev'de iki kez çalıştırması: Modal push → unmount (back) →
remount (push) → geciken `popstate` yutuluyor. Üretim derlemesinde efekt bir kez çalışıyor ve davranış
doğru.

**Kural:** Yaşam döngüsü/efekt kaynaklı bir tuhaflık görüldüğünde, düzeltmeye geçmeden önce **üretim
derlemesinde** tekrarla (`vite preview`). StrictMode, service worker ve `import.meta.env.PROD` dalları
yalnızca orada gerçek davranışı gösterir. Bunu mümkün kılmak için `preview` de `/api` vekiline muhtaç.

## L8 — Gizli panelde DOM ölçümü güvenilmez

**Olay:** Asist çerçevesi üç modda da aynı ölçüde göründü ve bunu bir hata sanıp `transition`'ı
suçladım. Gerçekte tarayıcı paneli `visibilityState: "hidden"` idi; bu durumda tarayıcı layout
yapmıyor ve `getBoundingClientRect` bayat değer dönüyor. Elemanın **inline stilleri doğruydu.**

**Kural:** Gizli/arka plan sekmede layout'a dayalı hiçbir ölçüme (`getBoundingClientRect`,
`innerText`, geçiş animasyonları) güvenme. Layout'tan bağımsız kanıta bak: inline stil, React
çıktısı, ağ isteğinin gövdesi. Ölçüm aracını suçlamadan önce `document.visibilityState`'i kontrol et.

## L9 — Paylaşılan bir "yut" sayacına TÜM dinleyiciler katılmalı

**Olay:** `markProgrammaticBack`/`consumeProgrammaticBack` sayacını yalnızca modaller
kullanıyordu. İki hata birden çıktı: (a) `BottomNav` sayacı hiç çağırmıyordu, bu yüzden FAB'dan
açılan tarayıcı açılır açılmaz kapanıyordu; (b) sayacı çağıran modal olsa bile App'in global
dinleyicisi aynı `popstate`'i görüp "kullanıcı kökte geri bastı" sanıyor ve sahte çıkış uyarısı
gösteriyordu. Ayrıca tüketecek modal yoksa sayaç birikip gerçek geri basışı yiyordu.

**Kural:** Bir olayı "bizim ürettiğimiz" diye yutan mekanizmada, o olayı gören **her** dinleyici
aynı cevabı almalı ve sayaç **bir kez** düşmeli — bu yüzden olayın kendisi anahtar olarak
kullanılır. Her zaman mount olan bir dinleyici (App'inki) mutlaka katılmalı, yoksa sayaç birikir.
Yeni bir `history.back()` çağrısı eklerken: temizlik artığı mı (işaretle) yoksa kullanıcının
niyeti mi (işaretleme) diye sor.

## L10 — Medya kısıtı istemezsen tarayıcı en düşüğünü verir

**Olay:** `getUserMedia({video:{facingMode}})` çözünürlük istemiyordu. Tarayıcı düşük bir
varsayılan seçtiği için görüntü ekranda bulanık görünüyor VE kırpılan kare AI'a okunamayacak
kadar küçük gidiyordu. Kullanıcı iki ayrı şikâyet olarak bildirdi ("bulanık", "bazen
algılamıyor"); tek kök sebepti.

**Kural:** `getUserMedia`'da her zaman `width/height: {ideal: …}` iste (`ideal` desteklenmezse
hata vermez). Görüntü kalitesi şikâyetlerinde önce elde edilen `videoWidth/videoHeight`'ı ölç —
CSS/görsel katmanı suçlamadan önce akışın kendisine bak.

## L11 — Ajanın çalıştığı sırada oluşan değişiklik, ajanın yaptığı demek DEĞİLDİR

**Olay (2026-08-06, Faz B):** agy'nin turundan sonra `git status`'ta iki silinmiş dosya gördüm
(`Besin Hafızası.dc.html`, `Wireframes.dc.html`) ve bunu "agy kapsam dışına çıktı" diye
raporladım, hatta bu dosyaya bir ders olarak yazdım. **Yanlıştı — dosyaları kullanıcı silmişti.**
Delegasyondan hemen önce aldığım `git status` temizdi, silme agy'nin çalıştığı pencerede belirdi;
kanıtım bu zamanlama çakışmasından ibaretti. Kullanıcı da aynı dizinde çalışıyordu. `git checkout`
ile "geri alarak" kullanıcının bilinçli işini bozdum.

**Kural:** Çalışma dizini paylaşılan bir kaynaktır — bir ajan koşarken kullanıcı da düzenleme
yapabilir. Zamanlama çakışması nedensellik değildir. Bir değişikliği ajana **yüklemeden ve
raporlamadan** önce ya ajanın kendi çıktısında o dosyaya dokunduğuna dair iz bul, ya da
kullanıcıya sor: "bu iki dosya silinmiş, sen mi sildin?" tek cümlelik bir soruydu ve yanlış
suçlamayı da, dosyaya yazdığım yanlış dersi de önlerdi.

**Not:** Dosyaları geri getirmem sonuçta doğru çıktı (kullanıcı gerekli olduklarını bilmeden
silmiş, geri istedi) — ama bu şans eseriydi, gerekçem yanlıştı. Doğru hamle "geri aldım" diye
bildirmek değil, "silinmiş, ne yapayım?" diye sormaktı.

**Değişmeyen kısım:** agy'nin "tamamlandı" raporu yine de bir İDDİA'dır; doğrulama kapısı her
turda bağımsız çalıştırılır (bu turda çalıştırıldı, 480/480 doğrulandı). Ayrıca agy'nin bildirdiği
iki "sorun"dan biri geçersizdi (`dummyHashCache`'in `NUTRI_SCRYPT_N` değişince bayatlayacağı
iddiası — `SCRYPT_N` modül düzeyinde bir sabit, bayatlayamaz). Ajan bulgularını doğrula (bkz. L3).

## L12 — Ölçmeden önce ölçtüğün şeyin GERÇEKTEN yeni kod olduğunu doğrula

**Olay (Faz F):** `server/index.js`'e oturum kapısını bağladım, sunucuyu "yeniden başlattım",
ölçtüm ve kapı çalışmıyor göründü. Gerçekte yeni süreç **hiç açılmamıştı** (`constraint failed`
ile ölmüştü) ve eski süreç hâlâ portu tutup cevap veriyordu. Yani ölçtüğüm şey ESKİ koddu.
"Kapı çalışmıyor" diye yanlış yerde bug arayacaktım; logu okuyunca çıktı — ve asıl bug da
oradaydı: `currentUserId(req)` değişikliği, modül yüklenirken argümansız çağrılan tohumlama
satırını `null`'a düşürüyordu.

**Kural:** Arka planda yeniden başlatılan bir süreci ölçmeden önce (a) başlatma logunun
BAŞARI satırını gör, (b) gerekiyorsa portu dinleyen PID'nin değiştiğini doğrula. `pkill -f`
Windows/git-bash'te sessizce başarısız olabiliyor; port hâlâ eski PID'deyse ölçüm yalan söyler.
Bu, L8'in ("gizli panelde DOM ölçümü güvenilmez") sunucu tarafındaki kardeşi: **önce ölçüm
aracına güven, sonra bulguya.**

## L13 — `Cache-Control` YOKSA tarayıcı kendi kararını verir

**Olay (Faz I sonrası):** Kullanıcı güncellemeden sonra uygulamayı açtı ve
"Veri alınamadı (API 401)" ölü ekranını gördü; yenileyince düzeldi. Mimari bu ekranı
göstermemek üzere kurulmuştu, yani ilk bakışta mimari hatası gibi duruyordu.

**Teşhisi veren ipucu mesajın KENDİSİydi:** "API 401" metni YENİ kodda yok (yeni sürüm 401'i
ayrı ele alıyor ve "Oturum sona erdi" diyor). Demek ki tarayıcıda ESKİ JS çalışmıştı.
Sebep: nginx hiçbir dosyaya `Cache-Control` göndermiyordu. Başlık yokken tarayıcı
"sezgisel tazelik" uyguluyor ve `index.html`'i **doğrulamadan** önbellekten verebiliyor;
o eski HTML de eski JS'i işaret ediyor.

**Kural:** SPA dağıtımında iki sınıf dosya vardır ve ikisi de AÇIKÇA etiketlenmeli:

- `index.html` + `sw.js` → `no-cache` ("önbellekleme" değil, "kullanmadan önce sor")
- hash'li varlıklar → `immutable`, uzun ömür (ad değişince içerik değişir)
  Başlık yokluğu "önbellekleme yok" DEĞİLDİR; tarayıcının kendi kararını vermesidir.

**İkinci ders:** Bir hata mesajının METNİ hangi sürümün çalıştığını söyleyebilir. Mimariyi
suçlamadan önce "bu cümle hangi koddan geliyor?" diye sor.

## L14 — `transform` içeren animasyonun fill-mode'u `both`/`forwards` ise eleman KALICI containing block olur

**Olay (2026-08-09):** Kullanıcı İlerleme → hafta → gün drilldown'ında bir öğüne tıklayınca
düzenleme ekranının ekranın en üstünde, görünmezde açıldığını bildirdi; Bugün sekmesinde aynı
ekran düzgün açılıyordu. Kök neden: drilldown'ı saran `.anim-zoom` (`animation: zoomIn … both`)
`transform` animasyon ediyor; `fill-mode: both/forwards`, animasyon BİTSE bile tarayıcının o
elemanı `position: fixed` torunları için **kalıcı containing block** olarak ele almasına yol açıyor
(CSS Animations spec + WebKit Bug 176858). `NutritionSheet`/`MealForm` portal kullanmıyor
(`Modal.tsx` kullanıyor, bunlar etmiyor) — `fixed inset-0` viewport yerine sarmalın tepesine
(sayfa en üstüne, scroll'un üstüne) hizalandı. Bugün sekmesinde transform sarmalı yok → orada doğru.

**Kural:** `position: fixed` torun üreten bir elemanın üstündeki animasyonda `transform` varsa
fill-mode `backwards` veya `none` olmalı (bitince eleman containing block olmaktan çıkar; son
kare `transform:none` olduğu için görsel kayıp yok). `forwards`/`both` + `transform` = kalıcı
containing block. Aynı sarmal altında inline `fixed` modal açılıyorsa (portal yoksa) özellikle
tehlikeli. Kontrol listesi: "bu modalın atalarında animasyonlu transform var mı?"

## L15 — `animation` kısayolunun içine `var()` koyma: pending-substitution cascade'i ezer

**Olay (2026-08-14, Gece Camı motion pası):** FAB menüsünün stagger gecikmeleri (nth-child
0/30/60/90ms) hep "0s" görünüyordu. Önce JSX boşluk metin düğümlerini suçladım (yanlış — DOM'da
tam 4 buton vardı). Gerçek mekanizma: `animation: fabItemIn 0.38s var(--ease-glass-hover) backwards`
gibi bir kısayolda `var()` varsa, kısayol "pending-substitution" değeri olur — parse zamanında
açılamadığı için computed-value zamanında uygulanır ve **longhand'lerinin tüm non-important
bildirimlerini, özgüllük/sıra/inline fark etmeksizin ezer**. `animation-delay: 30ms` (nth-child,
özgüllük 0,3,0) bile inline `animationDelay`'i bile base kurala karşı kaybediyordu; yalnızca
`!important` kazanıyordu. (Ayrı bir confound: preview ortamı `prefers-reduced-motion: reduce`'u
force ediyor ve küresel blok `animation-delay: 0ms !important` yapıyor — "0s" aslında doğru a11y
davranışıydı. Test cascade'i ancak @media bloğunu `sheet.deleteRule()` ile geçici kaldırarak
görüldü.)

**Kural:** `animation` KISAYOLUNA `var()` KOYMA — özellikle `animation-delay` veya
`animation-duration`'ı var() ile vermek istiyorsan. Kısayol temiz kalır, easing'i
`animation-timing-function: var(...)` longhand'ine taşı. Kısayol böylece normal cascade'e katılır
(implicit delay 0s, alt özgüllüklü `.rise-d-*`/`:nth-child`/inline `animationDelay` kazanabilir);
var() longhand'i yalnızca kendi longhand'ini etkiler (rakip bildirim yoksa zararsız). Bunu kısayola
dokunan her giriş animasyonu kuralında uygula.

## L16 — React `onTouchMove`/`onWheel` içindeki `preventDefault` PASİF dinleyici yüzünden etkisizdir

**Olay (2026-09-13, öğün uzun-bas menüsü):** Menü açıkken arkadaki sayfanın kaymaması istendi.
Perdeye `onTouchMove={(e) => e.preventDefault()}` yazdım — FAB backdrop'unda da aynısı vardı, yani
"kanıtlanmış reçete" sanıyordum. Ölçüm: sentetik `touchmove` sonrası `defaultPrevented: false`.
Sebep: React 17+ `touchstart`/`touchmove`/`wheel` dinleyicilerini **passive** kaydeder; passive
dinleyicide `preventDefault()` sessizce yok sayılır. FAB menüsünün gerçek kilidi `preventDefault`
DEĞİL, perdedeki `touch-none` (tarayıcı düzeyinde `touch-action: none`) imiş — dokunma yolunda
doğru, tekerlek/fare yolunda ise hiç korumuyor.

**Kural:** "Kaydırmayı kilitle" işini CSS `touch-action`/`overscroll-behavior` ile yap; JS ile
yapman gerekiyorsa **pasif olmayan gerçek** `window.addEventListener('wheel'|'touchmove', h, {passive:false, capture:true})`
kullan ve panelin kendi kaydırılabilir gövdesini `panelRef.contains(e.target)` ile muaf tut.
`onTouchMove` içinde `preventDefault` görmek bir güvence DEĞİLDİR: ölç.

## L17 — Zaman aşımı, jest hâlâ SÜRERKEN dolmamalı (iki fazlı basış kapısı)

**Olay (aynı tur):** Uzun basma sonrası parmağın kaldırılmasıyla gelen `click`, yeni açılan menüye
düşüp aksiyonu kendiliğinden çalıştırıyordu (ölçümde: menü kendini kapatıyor / "Seç" sessizce
seçim modunu açıyor / "Aynısından bir tane daha ekle" öğün ekliyordu). Kapıyı ilk yazdığımda tek bir
`deadline` vardı ve zaman aşımı basış sürerken doluyordu; ölçümde menü açıldıktan ~1 saniye sonra
bırakan kullanıcıda kapı çoktan kapanmış oluyor ve sızıntı geri geliyordu.

**Kural:** Bir jesti bekleyen zaman aşımı, jestin HANGİ FAZINDA olduğuna bağlanmalı. Basılı fazda
zaman aşımı olmaz (kullanıcı istediği kadar tutabilir); zaman aşımı yalnızca jest BİTTİKTEN sonra
(gelen olayı beklerken) kurulur. Ayrıca `pointerup`, beklenen `click` ondan SONRA geldiği için
"bitirici" değil "faz değiştirici" olmalı — kapıyı `pointerup`ta kapatmak sızıntıyı aynen geri getirir.

## L18 — `visibility: hidden` bir öğeye `focus()` SESSİZCE başarısız olur

**Olay (2026-09-13, paylaşılan diyalog odak hook'u):** `MealActionSheet` paneli yerleşimi
ölçülene kadar `visibility: hidden` duruyor (kullanıcı yerleşmemiş bir panel görmesin diye).
Ortak `useDialogFocus` hook'una geçtiğimde menü açılıyor ama odak gövdede kalıyordu. Tahmin
etmek yerine `HTMLElement.prototype.focus` sarmalandı ve ÖLÇÜLDÜ: çağrı YAPILIYOR ama
`getComputedStyle(el).visibility === "hidden"` olduğu için `document.activeElement` değişmiyor
(`took: false`). React'in pasif efekti, layout ölçümünün yaptığı yeniden render'ın görünür
hâlinden ÖNCE çalışabiliyor.

**Kural:** Görünürlüğü sonradan açılan bir kapsayıcıya odaklanacaksan `focus()` çağrısının
BAŞARISINI ölç (`container.contains(document.activeElement)`); başarısızsa hazır olduğunda
TEKRAR DENE (`ready` bayrağı). "focus() çağırdım" ≠ "odak oraya gitti". Özellikle
`Element.prototype.focus`'u sarmalayarak test etme — spec'te `focus` **HTMLElement** üzerinde
tanımlıdır, `Element.prototype`'a yazdığın sarmalayıcı gölgelenir ve log boş kalır (bu da bir
kez yanlış "hiç çağrılmıyor" sonucu üretti).

## L19 — Bir efektin ref'ini, odağı TAŞIYAN başka bir efekte bağlama

**Olay (aynı tur):** Odak yönetimini tek efektten iki efekte böldüğümde (önce "odaklan", sonra
"kayıt + dinleyiciler") kapanışta odak yanlış yere dönüyordu: `previouslyFocused` yakalaması
ARTIK ikinci efektte yapılıyordu ve o sırada `document.activeElement` zaten panelin kendisiydi,
dolayısıyla odak `<body>`'ye düşüyordu.

**Kural:** "Önceki durumu sakla → değiştir" ikilisi aynı efekte ait olmalı ya da saklama
ref'te ve değiştirmeden ÖNCE yapılmalı. Efekt sırası (aynı bileşendeki yazılış sırası) bir
sözleşmedir; bir ref'i başka bir efektin yan etkisine emanet etme. Tarayıcı ölçümü olmadan bu
hata görünmez (tipcheck ve birim testleri geçiyordu).

## L20 — Gösterim dönüşümü veri mutasyonuyla eşittir (aç-kaydet sözleşmesi)

**Olay:** NutritionSheet'in `scaleMealNutrition` fonksiyonu `multiplier===1` olsa bile her alana
`.toFixed(1)` uyguluyordu. Sheet'i kurarken draft bu tırnaklanmış değerden doğuyordu; kayıt
`fromDraft` ile **gösterilen değeri** DB'ye geri yazıyordu. Yani kullanıcı elini sürmeden
`carbs: 8.75 → 8.8` sessizce değişti. SEV3, rapor-only turunda kod okunarak değil gerçek DB
diff'iyle yakalandı.

**Kural:** Bir input ekranından "Kaydet" bastığında yazılan şey, input'un **gösterdiği değerdir**.
Dolayısıyla gösterim katmanındaki herhangi bir yuvarlama/biçim dönüşümü kalıcı veri mutasyonu olur.
Dönüşümü ölçekleme yoluna (m≠1) ayır; temel değer kayıpsız kalmalı. Bir form işlevini değiştirirken
"gösterilen değer kaydediliyor mu, gösterim veriyi tırnaklıyor mu" diye aç-kaydet testi yaz.

## L21 — Ekranın adı ile veri kaynağı aynı sözleşmedir

**Olay:** Ayarlar → "Kilo & Vücut Geçmişi" ekranı aylarca uydurma veri gösterdi ve kimse fark
etmedi, çünkü ekran **çalışıyor** görünüyordu: "Mevcut Kilo" `localStorage`→`profile.weightKg`→
literal `"78"` zincirinden, "Hedef Kilo" üç dilde sabit yazılmış `"75 kg"` çeviri metninden,
ilerleme çubuğu sabit `w-3/4` sınıfından geliyordu. Adında "Geçmişi" yazan ekran
`config.weight.entries`'i hiç okumuyordu. Kullanıcı bunu "çok önceden girilen bilgiler mevcut ya da
saçma sapan veriler var" diye bildirdi — yani hata, ekranın **adı ile verisinin uyuşmamasıydı**.

**Kural:** Bir ekranı yer tutucu (stub) olarak bırakmak serbest değildir; "sonra bağlarız" diye
bırakılan sabit sayı, kullanıcı için sessizce yanlış bir veridir. Üç kontrol:
(1) Ekranda gösterilen **her** değerin kaynağını tek tek yazabiliyor musun? Yazamıyorsan o değer
uydurmadır. (2) Alan, adını taşıdığı veriyi okuyor mu — "Geçmiş" ekranı geçmişi, "Mevcut" etiketi
en son kaydı? (3) Bir alan sadece YAZILIYOR ama hiç OKUNMUYORSA (burada `profile.targetWeightKg`)
ölü veridir; ya okunacağı yere bağla ya da toplamayı bırak. Ayrıca boş durumda uydurma varsayılan
(yaş 29 / 78 kg) ve sahibinin baş harfleri ("EB") gibi kişisel görünen literaller, kullanıcının
kendi verisi sanılır: boşsa "—" göster ve gerçek kaynağı işaret et.

## L22 — Dile bağlı kullanıcı metni üç ayrı kılıkta saklanır (kapı olmadan tekrar eder)

**Olay (2026-09-15, çeviri taraması):** Kullanıcı "İngilizce arayüzde Türkçe kelimeler görüyorum"
dedi. Elle baktığımızda ilk bulduğumuz `GoalsForm`'daki düz `<h4>Beslenme Hedefleri</h4>` idi — ama
tarama büyüdükçe AYNI hatanın farklı kılıkları çıktı: `lib/ring.ts` kalori halkasının alt yazısı
`"Hedefe ula\u015f\u0131ld\u0131"` diye **unicode kaçışıyla** yazılmıştı (harf taraması görmüyor),
`lib/healthScore.ts` cümleyi Türkçe eklerle kuruyordu (`"ve"`, `kaloride/proteinde`) ve İngilizce
arayüzde "Kalori ve protein You're on track." üretiyordu, CSV başlıkları ile `nutrient.label`
Türkçe sabitti, `WEEKDAY_SHORT` import anında hesaplandığı için dil değişince takvim adları eski
dilde kalıyordu, `onboarding.stepStatus` anahtarının İÇİNE sabit `"/ 5"` yazılmıştı, ve Gemini
istemleri tümüyle Türkçe olduğu için İngilizce kullanıcı Türkçe yemek adları alıyordu.

**Kural:** "BU ekranda sabit metin yok" iddiası, ancak ve ancak aşağıdaki ÜÇ imza birlikte
aranarak doğrulanabilir — biri tek başına yetmez:
1. Türkçe'ye özgü harfler (ç ğ ı ö ş ü),
2. `\u01xx` kaçışları (gözle ve harf taramasıyla görünmez),
3. ASCII'yle yazılabilen kelimeler (Hedef, Beslenme, Ekle, Kaydet…) — `>` … `<` ile sınırlı bir
   JSX taraması bunları kaçırır, çünkü `<Plus /> Profil Ekle` gibi metin düğümü elementten SONRA
   gelir.
Bu yüzden kural koda değil KAPIYA bağlandı: `pnpm check:i18n` artık (a) anahtar parity, (b) kodda
`t("…")` ile istenen anahtarın locale'de var olup olmadığı, (c) yukarıdaki üç imzayı arar. Muafiyet
satır bazlı ve GEREKÇELİ olmak zorunda (`// i18n-exempt: <sebep>`) — ör. cihaz etiketi regex'i,
geliştirici hatası, `goals.ts`'teki profil ADLARI (bunlar veridir, çevirisi gösterim katmanında
yapılır). Ders: bu hata sınıfı üç kez ürünüle çıktı; dördüncüsünü yakalayan şey dikkat değil,
otomatik kapıdır. Ayrıca bir metin kaynağını "sadece gösterim" diye ayırırken çeviriyi gösterim
katmanına koy (ör. `ring.ts` artık `{key, params}` döner) — aksi hâlde saf lib'ler i18n'e bağımlı
hale gelir ve testleri dile bağlanır.

## L23 — Gösterim katmanındaki çeviri, YAZMA yoluna sızarsa veriyi dondurur

**Olay (2026-09-15, kullanıcı bildirimi):** L22'nin kuralı uygulandıktan sonra bile İngilizce
arayüzde Ayarlar > Hedefler ekranındaki **"Profile Name" kutusu "Varsayılan" yazıyordu** — bir üst
satırdaki profil çipi ise doğru şekilde "Default" diyordu. Sebep: `profileDisplayName` yalnızca
METİN olarak çizilen yerlerde kullanılıyordu; düzenlenebilir girdi hâlâ ham veriyi
(`selected.name`) gösteriyordu. Yani gömülü profilin adı VERİ olarak Türkçe saklanırken
(backend seed ediyor / `singleProfileConfig` üretiyor) alan onu çevirmiyordu.

**Neden basit çözüm YANLIŞ olurdu:** `value={profileDisplayName(p, t)}` yazmak alanı düzeltirdi ama
"aç → kaydet" yolunu bozardı: kullanıcı yalnızca Kalori'yi değiştirip kaydettiğinde, dokunmadığı
ad veriye **çevrilmiş hâliyle** yazılırdı ("Default"). O andan sonra `profileDisplayName` sentinel'i
tanımaz ve ad bir daha dile göre değişmez — kullanıcı Türkçe'ye döndüğünde "Default" görür. Bu,
L20'nin (gösterim dönüşümü = veri mutasyonu) sinsi kardeşi: dönüşümü GÖSTERİMDE yapmak yetmiyor,
YAZARKEN de dönüşümü geri almamak gerekiyor.

**Kural:** Çeviri gösterim katmanında yaşıyorsa, o veriyi TAŞIYAN düzenlenebilir alan üç durumu
ayırmak zorundadır:
1. **Dokunulmadı** → aktif dildeki adı GÖSTER, ham (dil-nötr) değeri KAYDET.
2. **Dokunuldu** → kullanıcının yazdığını hem göster hem kaydet (gerçek yeniden adlandırma).
3. **Dokunuldu ve boşaltıldı** → doğrulama hatası, sentinel'e geri düşme YOK.
Bu yüzden `GoalsForm`'da ayrı bir `nameEdited` durumu tutulur ve tek doğruluk kaynağı
`lib/goals.ts` içindeki `profileNameFieldValue(profile, t, edited)` saf fonksiyonudur (testli).
Aynı kural doğrulama/uyarı satırları için de geçerlidir: `"<ad>: kcal 0'dan büyük olmalı"` mesajı da
`profileDisplayName` üzerinden yazılır, ham `name` üzerinden değil.
**Genel test:** Bir veri alanı ekranda çevrilmiş görünüyorsa, o ekranın kaydet düğmesine BASMADAN
önce ve sonra sunucudaki ham değerin AYNI kaldığını doğrula.

## L24 — Overlay sırası, sunucu onayı bekleyen bayrağa bağlanamaz (ve kapı KARŞILIKLI olmalı)

**Olay (2026-09-15, kullanıcı bildirimi):** Yeni kayıt olan kullanıcı kurulum sihirbazını geçtikten
sonra sürüm notları ekranı ("Ne Var Yeni?") ile tanıtım turu ("Hızlı Tur") AYNI ANDA ekranda
görünüyordu. İzole boş bir veritabanı + üretim derlemesiyle tarayıcıda zaman çizelgesi alındı
(MutationObserver, ms damgalı):

```
0ms   [Kurulum Sihirbazı]  →  15ms []  →  22ms [Ne Var Yeni?]  →  55ms [Ne Var Yeni? | Hızlı Tur]
```

**Kök neden iki ayrı kusurun birleşimi:**
1. **Sıralama bayrağı sunucu onayını bekliyordu.** `sihirbaziAtla` önce `setSihirbazKapatildi(true)`
   çağırıp SONRA `await updateConfig("profile", …)` yazıyordu. O ağ turu boyunca `sihirbazAcik`
   false, `guideAcik` de (profil BAYAT olduğu için) false kaldı → sürüm popup'ının efekti tetiklendi.
   Yazma dönünce `guideAcik` true oldu ve tur popup'ın ÜSTÜNE bindi.
2. **Kapı tek yönlüydü.** Popup "sihirbaz/rehber açıkken açılmam" diyordu, ama tur "popup açıkken
   başlamam" demiyordu. Tek yönlü bekçi, karşı yönden gelen ikinci overlay'i engelleyemez.

**Kural:**
1. İki overlay'in sırasını belirleyen bayrak SENKRON olmalı; ağ isteğinin dönüşüne bağlanmamalı.
   Yerel kapanış zaten "tamamlandı" demekse (`sihirbaziAtla` sözleşmesi) sıralamada o bayrağı
   kullan: `hasCompletedOnboarding: profil?.… === true || sihirbazKapatildi`. Tur böylece AYNI
   render'da sıraya girer, sunucuyu beklemez.
2. Üst üste binme kapıları KARŞILIKLI yazılır: "A, B açıkken açılmaz" yetmez, "B de A açıkken
   açılmaz" gerekir (`shouldShowGuide` artık `changelogOpen` alır; popup tarafı da sihirbaz+rehber
   bekler). Elle açılabilen yollar (Ayarlar > "Ne Var Yeni?", Ayarlar > "Rehberi tekrar göster")
   bu yüzden sayılır.
3. Böyle bir sıra iddiası ancak ZAMAN ÇİZELGESİYLE kanıtlanır: iki overlay aynı karede mi, hangisi
   önce? Tek ekran görüntüsü ya da "kodda sıra doğru görünüyor" bunu göstermez — 7 ms'lik bir
   pencere gözle görünmez.**Genel test:** "X kapanınca Y açılır" diyen bir kod, X'in kapanışı ile Y'nin açılışı arasında bir ağ isteği varsa sırayı kaybedebilir. Sıralama kararını yerel (senkron) duruma bağla; ve iki modal birbirini bekliyorsa iki yönlü bekçi yaz.

## L25 — Hata, bir sınıfın VARLIĞI değil YOKLUĞUYDU: kullanılan-ama-tanımsız CSS sınıfı

**Olay (2026-09-20, iPhone/standalone):** Kullanıcı "tam ekran ekranların geri tuşu çok yukarda
kalıyor ve tıklanmıyor" dedi. Kök neden bir CSS sınıfı değil, **olmayan** bir CSS sınıfıydı:
`Modal.tsx` `pad-safe-top` kullanıyordu; `index.css`'te yalnızca `.pad-safe` vardı, derlenmiş CSS'te
`pad-safe-top` **0 eşleşme**. Sınıf adı JSX'te durduğu için kod okunurken her şey doğru
görünüyordu; tip denetimi, 886 test ve build sessizdi. `viewport-fit=cover` +
`black-translucent` + `standalone` üçlüsünde iOS içeriği status bar'ın altına çizdiği için 14 px
başlık dolgusu, 40 px'lik geri düğmesini tamamen status bar bölgesine (Dynamic Island modellerinde
59 px) sokuyordu — dokunmayı sistem yiyor, yani düğme "çok yukarda" VE "çalışmıyor".
İki yüzey daha aynı kök nedenden etkileniyordu ve ilk şikâyette görünmüyordu: `App` kök başlığı ve
`ScanSheet`'in `bleed` modundaki **kapatma X'i** — yani çekim sonrası çıkış da kilitliydi.

**Kural:** CSS'te "kullanılıyor ama tanımlı değil" sessiz bir hatadır ve okumakla yakalanmaz.
Kapıya bağla: `src/lib/safeArea.test.ts` (a) JSX'te geçen her `pad-safe*` sınıfının `index.css`'te
tanımlı olduğunu, (b) bileşenlerin ham `env(safe-area-inset-*)` yazmadığını (tek kaynak:
değişkenler), (c) viewport'a sabitlenen (`fixed inset-0` + `h-[100dvh]`) her yüzeyin alt safe-area
sınıfı taşıdığını doğrular. `min-h-[100dvh]` SAYILMAZ — kök kabuğun içinde kalan ekranlar inset'i
kökten alır. Yorumlar taranmaz: bir hatanın NEDEN öldüğünü anlatan not yasaklanamaz.
**Genel test:** bir sınıf adını JSX'te görüyorsan, CSS'te `\.${'$'}{ad}` aramasının 1 döndüğünü
görmeden ona güvenme. Aynısı `data-*` seçicileri ve animasyon adları için de geçerli.

## L26 — Taklit edilebilen ile edilemeyeni ayır; kalanını cihazdan İSTE

**Olay (aynı tur):** "Preview'ı iPhone gibi taklit edemez miyiz?" sorusu haklıydı ama tam cevabı
yok: masaüstü Preview'da `env(safe-area-inset-top)` 0'dır, cihaz listesi/etiketleri farklıdır ve
panel composited değilken uygulamanın kamerası **kasten hiç açılmaz** (`document.hidden` koruması).
Yapılabilenler: (1) inset'leri CSS değişkenine çevirip dev-only attribute ile zorlamak
(`?emulate=island` → 59/34 px) — başlık dolgusu ve düğme konumu GERÇEKTEN ölçüldü (73→113 px;
emülasyon kapalıyken 14→54, masaüstünde regresyon yok), (2) `navigator.mediaDevices`'i senaryoyla
sarmak (`?camera=ios-first-front`: ilk çağrı ön kamerayı verir, `getSettings().deviceId` gelmez),
(3) saf karar katmanını birim testte iOS senaryosuyla koşmak. Yapılamayanlar: gerçek inset, gerçek
WebKit, klavye, kamera donanımı, gerçek FPS.

**Kural:** Bir arızayı yalnızca cihazda üretebiliyorsan, cihazdan KANIT İSTE: uygulamanın kendi
çıkardığı bir tanılama raporu (ekran ölçüsü + inset + kamera kayıtları + uzun görev sayacı) mevcut
bir kanaldan (geri bildirim formu) gönderilsin. Rapordaki ekran ölçüsü + üst inset ikilisi iPhone
model sınıfını neredeyse tek başına söyler (UA model vermez) — bu yüzden `guessDeviceClass` var.
Ayrıca "düzelttim" cümlesi hangi koşulda ölçüldüğünü söylemek zorunda: taklitte mi, gerçek cihazda mı?

**Not (aynı turda ölçüldü, L7'nin kardeşi):** Canlı düzenleme sırasında (HMR) kancası değişen bir
modül, MOUNT edilmiş bir bileşeni güncellerse React `Should have a queue` hatası verir — bu
uygulamanın hatası değil, sıcak güncelleme artefaktıdır; sayfa yenilendiğinde geçer. Böyle bir
hata görüldüğünde önce tam yeniden yükleme yapıp tekrar üret, sonra yorum yaz.

## L27 — Dış katmanın zaman aşımı, iç zincirinden KISA olamaz

**Olay (2026-09-21, canlı):** Kullanıcı kamerayla etiket okuturken "AI servisi zaman aşımına
uğradı. Biraz sonra tekrar dene." mesajı aldı ve üç kez tekrar denedi. Mesaj bizim
`ai_timeout` metnimizin BİREBİR aynısıydı, bu yüzden ilk hipotez "sağlayıcı yavaş" oldu.
Gerçek sebep katmanlıydı ve mesajı veren kişi biz DEĞİLDİK:

- Bizim görsel zincirimiz en kötü **15+15+15+40 = 85 sn** sürebiliyordu (3 Gemini kademesi + NIM).
- Prod nginx vhost'unda `location ^~ /api/ { proxy_read_timeout 30s; }` **sabit**. Node
  sunucumuz yanıtı tek seferde `res.end()` ile yazdığı için bu pencere toplam süre tavanıdır:
  30 sn boyunca hiçbir bayt akmaz, nginx kendi gövdesiz **504'ünü** döner, istemci JSON
  okuyamayınca `status === 504` dalına düşer ve AYNI cümleyi gösterir.
- Journal kanıtı: üç zincir de sunucu tarafında **67/68/71 sn** sürdü; kullanıcı 30. saniyede
  hata gördü. Sunucu 30 sn sonra 37 sn daha çalışıp kotayı yaktı, yanıtı çoktan kapanmış
  sokete yazdı.
- Üstüne `runChain` **son adımın** hatasını döndürüyordu: gerçek sebep Gemini'nin `503`'ü iken
  kullanıcı "zaman aşımı" okudu. Yedek zincirin tamamı da ölüydü (NIM metin 410 Gone, NIM
  nemotron 404 yetki, NIM 90B vision 90 sn'de yanıt yok, OpenCode `-free` model 400, fiyatlı
  modeller 401 "No payment method") — yani `available: !!API_KEY` kontrolü "çalışıyor" sanılan
  ama hiçbir şansı olmayan adımlar üretiyordu.

**Kurallar.**
1. **Zaman penceresi bir DEĞİŞMEZDİR:** `iç zincir bütçesi < dış katman (nginx) penceresi`.
   Uygulama kendi sınırını bilmeli ve ona uymalı; dış katmanı "yeterince büyük" varsaymak
   yasak. Değişmez yoruma değil **teste** yazılır (`server/ai.test.js` pencere değişmezi +
   asılı fetch'le bütçe aşımı testi).
2. **Bir katman kendi zaman aşımını uydurmadan önce altındaki katmanın penceresini ölç:**
   `nginx -T | grep -A2 'location ^~ /api/'` tek komutluk bir kontroldü ve 30 sn'yi oradan
   okuyabilirdim.
3. **Hata mesajı SON adımın değil, gerçek sebebin olmalı.** Zincir yalnızca son sonucu
   döndürürse ölü yedekler kullanıcıya yanlış teşhis gösterir; tüm denemeler toplanıp
   önceliklendirilir (sağlayıcı hatası > zaman aşımı) ve yanıt gövdesine `attempts` konur.
4. **`status` ile `upstream` ayrı alanlardır:** günlükte "503" görmek "biz 503 döndük" demek
   değildir. Ayrılmayınca teşhis el yordamına (elle curl) düşer.
5. `available: !!API_KEY` **sağlık kontrolü değildir**: sağlayıcı listesindeki ölü modeli ancak
   canlı yoklama ayırt eder; art arda düşen adım devre kesiciyle susturulur.

**Uygulama kapısı:** bu turda yalnızca okuma yapıldı (journalctl + md5 + sağlayıcı yoklamaları) ve
önce kök neden kanıtlandı, sonra kod değişti — varsayımla düzeltmeye gidilse "timeout süresini
uzatmak" gibi TERS yönde bir değişiklik yapılırdı (aslında pencere zaten dar).
