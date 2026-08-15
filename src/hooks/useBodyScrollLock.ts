import { useEffect } from "react";
import { acquireOverlayLock, releaseOverlayLock } from "../lib/overlayLock";

// Bu değerler modül düzeyinde: kilidi TUTAN her yerin (Modal.tsx, BottomNav'ın
// FAB backdrop'u, ScanSheet gibi hook'u doğrudan çağıran bileşenler) ortak,
// referans-sayaçlı TEK bir kilide katılması gerekiyor — bkz. `../lib/overlayLock`
// başındaki not. `document.body.style`'ın "önceki" değeri yalnızca sayaç
// 0'dan 1'e geçtiğinde (ilk kilit) kaydedilir, yalnızca 1'den 0'a düştüğünde
// (son kilit de kalktığında) geri yüklenir — aradaki iç içe kilitlenmeler
// DOM'a hiç dokunmaz.
let savedOverflow = "";
let savedTouchAction = "";
let savedHtmlOverflow = "";

/**
 * Modal/overlay açıkken arka plan kaydırmasını kilitler. Referans sayaçlıdır:
 * aynı anda birden çok overlay (ör. bir bileşenin KENDİSİ + sardığı `<Modal>`,
 * ya da iç içe iki modal) kilitlenmiş olabilir; arka plan yalnızca HEPSİ
 * kapandığında kilitten çıkar.
 *
 * HEM `document.body` HEM `document.documentElement` (html) kilitlenir:
 * index.css `html { overflow-x: hidden }` koyduğu için html overflow'u
 * "non-visible"dır ve viewport scroll'u CSS spec gereği body'ye değil html'in
 * KENDİ overflow'una bağlanır — yalnızca body'yi kilitlemek hiçbir şey yapmaz
 * (arka plan kaymaya devam eder). Viewport'u kilitleyen eleman html'dir.
 */
export function useBodyScrollLock(isLocked: boolean = true) {
  useEffect(() => {
    if (!isLocked) return;

    const { didLock } = acquireOverlayLock();
    if (didLock) {
      savedOverflow = document.body.style.overflow;
      savedTouchAction = document.body.style.touchAction;
      savedHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
      document.documentElement.style.overflow = "hidden";
    }

    return () => {
      const { didUnlock } = releaseOverlayLock();
      if (didUnlock) {
        document.body.style.overflow = savedOverflow;
        document.body.style.touchAction = savedTouchAction;
        document.documentElement.style.overflow = savedHtmlOverflow;
      }
    };
  }, [isLocked]);
}
