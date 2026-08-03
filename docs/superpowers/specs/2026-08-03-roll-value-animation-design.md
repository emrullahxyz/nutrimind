# Kalori/Makro kart geçişi — "çark" (roll) animasyonu — Tasarım

## Bağlam

`HeroCalorieCard` ve `MacroCardGrid` kartlarına tıklandığında `showRatio` değişiyor ve
rakam/etiket metinleri anlık değişiyordu. Aynı görev bugün 11:45-11:58 arasında 5 kez
denendi (3D flip → dual-layer `SlideValue` odometer → keyed fade `anim-slide-up` ×2),
`SlideValue` denemesi commit'ten 97 saniye sonra geri alındı. Kullanıcı şimdi aynı
"gerçek çark/roll" hissini, önceki hataları tekrarlamadan istiyor.

## Önceki `SlideValue` denemesinin muhtemel kırılma noktaları

- Eski değer `position: absolute` + `inline-flex` içinde, yükseklik JS ile ölçülmeden
  `translateY(100%)`/`translateY(-100%)` (kendi kutusunun yüzdesi) ile kayıyordu — metin
  uzunluğu/breakpoint değiştikçe kırılgan.
- `prefersReducedMotion()` (projede `src/lib/animation.ts`'te zaten var olan standart)
  hiç kontrol edilmiyordu.
- Animasyon bitişi `setTimeout(300)` ile tahmin ediliyordu, gerçek `onAnimationEnd`
  olayı kullanılmıyordu.

## Çözüm: `RollValue` bileşeni (yeni: `src/components/RollValue.tsx`)

- `value: string` prop'u alır (JSX/ReactNode DEĞİL — nedeni aşağıda).
- İç state: `{ prev: string | null; curr: string }`. `value` değiştiğinde `prev`=eski
  `curr`, `curr`=yeni değer; `idRef.current` sayacı bir artar.
- Render: `roll-viewport` (`overflow:hidden`) içinde `roll-track` (`display:flex;
  flex-direction:column`), `key={idRef.current}` ile HER geçişte gerçekten yeni bir DOM
  düğümü. İçinde sırasıyla `prev` (varsa) ve `curr` satırı — normal flex akışında, JS ile
  yükseklik ölçümü YOK. İkisi de aynı miras alınan font-size/line-height'a sahip olduğu
  için `translateY(0) → translateY(-50%)` her zaman tam olarak "bir satır yüksekliği"
  kadar kayar, metin uzunluğundan bağımsız.
- Saf `transform`, opacity yok — gerçek bir sayaç/taksimetre gibi fiziksel kayma hissi
  (kullanıcının "dikey numara çarkı" tarifiyle birebir), ~380ms
  `cubic-bezier(0.16, 1, 0.3, 1)` (projenin mevcut hareket dilinde zaten kullanılan eğri).
- `onAnimationEnd` ile `prev=null`'a döner (tahmini `setTimeout` yerine gerçek olay).
- `prefersReducedMotion()` true ise geçiş hiç başlamaz, `curr` doğrudan yeni değere atanır.
- `value: string` (ReactNode değil) bilinçli tercih: JSX literal'ler her render'da yeni
  referans alır, bu da render-bazlı `!==` karşılaştırmasında yanlış-pozitif tetiklemeye
  (ilgisiz bir re-render'da bile roll oynaması) yol açardı. String karşılaştırması güvenilir.

## Kapsam

**İçeride:** `HeroCalorieCard` — `subtitleLabel` ve `displayBigVal`. `MacroCardGrid` —
her makronun `displayVal` ve `subText`'i.

**Dışında (bilinçli):** Hero kartının alt satırı (`"2.480/2.600 kcal"` ↔ "Tıklayarak
Kalan Kaloriyi Göster") iki farklı renkte `<span>` karıştırdığı için `RollValue`'ya
zorlanmayacak — mevcut `anim-slide-up` (fade) ile kalacak. `anim-ring-pulse` (halka/donut
nabız animasyonu) zaten çalışıyor ve 5 önceki denemeden değişmeden çıktı — dokunulmayacak.

## Doğrulama

`pnpm typecheck` + `pnpm test` + `pnpm build`, ardından tarayıcıda gerçek tıklama ile
görsel doğrulama (localhost:5173, zaten çalışıyor).
