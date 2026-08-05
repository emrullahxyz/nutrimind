// ============================================================================
// Nutrimind — paylaşılan overlay / body-scroll kilit sayacı.
//
// Önceden ÜÇ bağımsız yer body scroll'unu kilitliyordu: `useBodyScrollLock`
// (sayaçsız, basit save/restore), `Modal.tsx`'in kendi
// `document.body.style.overflow` kilidi, ve `BottomNav.tsx`'in FAB backdrop'u
// için doğrudan aynı stili manipüle etmesi. `ScanSheet` gibi bileşenler
// `useBodyScrollLock`'u DOĞRUDAN çağırırken AYNI ANDA `<Modal>` de kendi
// kilidini uyguluyordu — iç içe iki bağımsız "save/restore" birbirinin
// kaydettiği ara değeri geri yükleyip arka planı kilitli bırakabiliyordu.
//
// Bu modül TEK bir referans sayaçlı kayıt tutar. Sayaç kararını (DOM'a ne
// zaman dokunulmalı) `applyLockAction` saf fonksiyonu verir — gerçek DOM yan
// etkisi yalnızca `useBodyScrollLock` hook'unda, bu kararın söylediği anlarda
// uygulanır (bkz. `src/hooks/useBodyScrollLock.ts`).
//
// AYRICA: App.tsx'in "geri tuşu basılırken ekranda bir overlay açık mı"
// kontrolü artık kırılgan bir DOM sorgusuna (`document.querySelector('.fixed
// .inset-0')`) dayanmıyor — bu sorgu BottomNav'ın FAB backdrop'unu da "modal
// açık" sanıp App'in geri-tuşu mantığını yanlışlıkla devre dışı bırakıyordu.
// Onun yerine bu SAYAÇ > 0 mı sorusuna bakılıyor (`hasOpenOverlay`) — her
// gerçek overlay zaten scroll'u kilitlediği için bu sayaç "açık overlay var
// mı" sorusunun doğal ve güvenilir tek kaynağıdır.
// ============================================================================

export type LockAction = "acquire" | "release";

export interface LockTransition {
  /** Aksiyondan SONRAKİ sayaç değeri. */
  count: number;
  /** true ise: bu aksiyon sayacı 0'dan 1'e taşıdı — DOM kilidi ŞİMDİ uygulanmalı. */
  didLock: boolean;
  /** true ise: bu aksiyon sayacı 1'den 0'a taşıdı — DOM kilidi ŞİMDİ kaldırılmalı. */
  didUnlock: boolean;
}

/** Saf karar fonksiyonu: DOM'a HİÇ dokunmaz, yalnızca sayaç geçişini ve bu
 *  geçişte DOM yan etkisinin gerekip gerekmediğini hesaplar. Sayaç asla
 *  negatife düşmez (fazladan `release` çağrısı sessizce yutulur). */
export function applyLockAction(current: number, action: LockAction): LockTransition {
  if (action === "acquire") {
    const count = current + 1;
    return { count, didLock: current === 0, didUnlock: false };
  }
  const count = Math.max(0, current - 1);
  return { count, didLock: false, didUnlock: current === 1 && count === 0 };
}

let lockCount = 0;

export function acquireOverlayLock(): LockTransition {
  const transition = applyLockAction(lockCount, "acquire");
  lockCount = transition.count;
  return transition;
}

export function releaseOverlayLock(): LockTransition {
  const transition = applyLockAction(lockCount, "release");
  lockCount = transition.count;
  return transition;
}

/** Şu an ekranda scroll kilitleyen (dolayısıyla App'in geri-tuşu çıkış
 *  mantığının görmezden gelmesi gereken) en az bir overlay var mı? */
export function hasOpenOverlay(): boolean {
  return lockCount > 0;
}

/** Yalnızca testler için: modül-düzeyi sayaç durumunu sıfırlar. */
export function __resetOverlayLockForTests(): void {
  lockCount = 0;
}
