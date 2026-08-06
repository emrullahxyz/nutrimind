# tasks/lessons.md

CLAUDE.md §3 "Kendini Geliştirme Döngüsü" gereği: kullanıcıdan gelen her düzeltmeden sonra kalıp
buraya yazılır. Amaç aynı hatayı iki kez yapmamak.

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

## L6 — Kullanıcıya seçenek sunarken premisi doğrula

**Olay:** "Kullanıcı başına ayrı DB" seçeneğini "şema hiç değişmez, göç riski sıfır" diye sundum.
Tasarım incelemesi bunun kısmen yanlış olduğunu gösterdi: oturumun hangi dosyayı açacağını bilmesi
için `users`+`sessions` tablosu her hâlükârda gerekiyor, yani ayrı-dosya yolu da şema ekliyor.
Kullanıcı kararını yanlış premisle vermişti; düzeltilmiş bilgiyle tekrar soruldu.

**Kural:** AskUserQuestion'daki her seçeneğin gerekçesi, sorulmadan önce kodda doğrulanmış olmalı.
Sonradan yanlış çıkarsa **sessizce devam etme** — düzeltip yeniden sor.
