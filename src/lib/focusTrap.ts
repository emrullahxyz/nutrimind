// ============================================================================
// Nutrimind — diyalog odak yönetiminin SAF çekirdeği.
//
// Neden: "Tab ile diyalog içinde kal, kapanınca odağı geri ver" mantığı üç ayrı
// yerde elle kopyalanmıştı (`Modal.tsx`, `ScanSheet.tsx`, `MealActionSheet.tsx`)
// ve dördüncü bir bileşen (`OnboardingModal.tsx`) `aria-modal="true"` İLAN EDİP
// hiç tuzak kurmuyordu — yani ekran okuyucuya "arka plan erişilemez" diyen bir
// iddia karşılıksızdı. Beşinci kopya yerine tek kaynak burası.
//
// Ayrıca iç içe diyaloglarda (kamera sheet'i → barkod sonuç kartı) Escape İKİ
// katmanı birden kapatıyordu: her bileşen kendi `document` dinleyicisini kurup
// olayı paylaşıyordu. `openDialogs` yığını sayesinde Escape ve Tab yalnızca
// EN ÜSTTEKİ diyaloğa aittir (bkz. `dialogFocusTop`).
//
// DOM'a dokunulmaz: kararlar burada saf fonksiyonlarda, gerçek DOM yan etkisi
// yalnızca `useDialogFocus` hook'unda uygulanır (bkz. `overlayLock.ts` deseni).
// ============================================================================

/** Diyalog içinde "odaklanabilir" sayılan öğeler. `Modal.tsx`'in mevcut
 *  seçicisiyle birebir aynıdır — davranış değişmesin diye korundu. */
export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface TabTrapArgs {
  /** Diyalog içindeki odaklanabilir öğeler arasında şu an odaklı olanın indeksi
   *  (-1: odak diyalogda değil ya da hiç odak yok). */
  activeIndex: number;
  count: number;
  /** Shift+Tab (geriye). */
  backwards: boolean;
}

/** Tab/Shift+Tab'da hangi öğeye gidileceği.
 *
 *  `null` → tarayıcının kendi davranışı doğru, MÜDAHALE ETME (odak diyaloğun
 *  ortasında ve kayacak yer var). Sayı → o indekse taşı ve varsayılanı iptal et:
 *    - `activeIndex === -1`: odak diyaloğun DIŞINDA (ya da hiç yok) — içeri çek,
 *    - ileri yönde son öğe: başa sar, geri yönde ilk öğe: sona sar. */
export function nextTrapIndex({ activeIndex, count, backwards }: TabTrapArgs): number | null {
  if (count <= 0) return null;
  if (activeIndex < 0) return backwards ? count - 1 : 0;
  if (backwards) return activeIndex === 0 ? count - 1 : null;
  return activeIndex === count - 1 ? 0 : null;
}

/** Açık diyalog kimliklerinin SIRASI (en üstteki son eleman). */
export type FocusStack = readonly string[];

export const EMPTY_FOCUS_STACK: FocusStack = [];

/** Yığının tepesini it (zaten varsa dokunma — StrictMode çift mount'u kimliği
 *  iki kez itmemeli, yoksa tek unmount tepede sahte bir kayıt bırakır). */
export function pushFocusDialog(stack: FocusStack, id: string): FocusStack {
  return stack.includes(id) ? stack : [...stack, id];
}

/** Kimliği yığından çıkar — tepede olması ŞART DEĞİL: dıştaki diyalog içtekinden
 *  önce unmount olursa (ör. yönlendirme) ortadaki kayıt da düşmelidir. */
export function popFocusDialog(stack: FocusStack, id: string): FocusStack {
  const at = stack.lastIndexOf(id);
  if (at < 0) return stack;
  return [...stack.slice(0, at), ...stack.slice(at + 1)];
}

/** Escape ve Tab tuzağını sahiplenen diyalog (yoksa `null`). */
export function topFocusDialog(stack: FocusStack): string | null {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

export function isTopFocusDialog(stack: FocusStack, id: string): boolean {
  return topFocusDialog(stack) === id;
}

// ---------------------------------------------------------------------------
// Modül düzeyi kayıt — `overlayLock.ts` ile aynı desen (hook ince adaptör).
// ---------------------------------------------------------------------------
let openDialogs: FocusStack = EMPTY_FOCUS_STACK;

export function registerDialogFocus(id: string): void {
  openDialogs = pushFocusDialog(openDialogs, id);
}

export function unregisterDialogFocus(id: string): void {
  openDialogs = popFocusDialog(openDialogs, id);
}

/** Şu an Escape/Tab tuzağını sahiplenen diyalog kimliği. */
export function dialogFocusTop(): string | null {
  return topFocusDialog(openDialogs);
}

/** Yalnızca testler için: modül düzeyi yığını sıfırlar. */
export function __resetDialogFocusForTests(): void {
  openDialogs = EMPTY_FOCUS_STACK;
}
