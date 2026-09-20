import { useEffect } from "react";
import { keyboardInset } from "../lib/keyboard";

/**
 * iOS klavyesinin kapladığı yüksekliği `--kb` CSS değişkenine yazar ve
 * odaklanılan form alanını klavyenin üstüne kaydırır.
 *
 * NEDEN CSS DEĞİŞKENİ: yüksekliği bilen tek yer burası; onu tüketen ise
 * kaydırılabilir gövdeler (`pb-[calc(1rem+var(--kb))]`). Klavye her açılışta
 * farklı yükseklikte olabilir (öneri şeridi, dil, yatay/dikey) — sabit bir
 * değer yazmak yerine ölçüm yayınlanır.
 *
 * `--kb` :root'ta 0px olarak tanımlıdır (index.css): değişken tanımsızken
 * `calc()` ifadesi geçersiz olur ve padding tümden düşerdi.
 *
 * `active` false iken hiçbir şey yapmaz (ör. çalışmayan bir ekranda gereksiz
 * dinleyici kurmamak için).
 */
export function useKeyboardInset(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const root = document.documentElement;
    const vv = window.visualViewport;

    const clear = () => root.style.removeProperty("--kb");

    const apply = () => {
      const inset = keyboardInset(window.innerHeight, vv ?? null);
      if (inset <= 0) {
        clear();
        return;
      }
      root.style.setProperty("--kb", `${inset}px`);

      // Odaklanılan alanı görünür alana çek. iOS klavye animasyonu `focus`
      // olayından SONRA bittiği için hemen ölçmek eski yüksekliği verir —
      // bu yüzden hem bir kare sonra hem de animasyon bittikten sonra denenir.
      const el = document.activeElement as HTMLElement | null;
      const isField =
        !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable === true);
      if (isField) {
        try {
          el.scrollIntoView({ block: "center" });
        } catch {
          // Eski WebView seçenek nesnesini desteklemeyebilir.
        }
      }
    };

    const onFocusIn = () => {
      window.requestAnimationFrame(apply);
      window.setTimeout(apply, 250);
    };
    const onFocusOut = () => window.setTimeout(apply, 50);

    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("orientationchange", apply);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    apply();

    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("orientationchange", apply);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      clear();
    };
  }, [active]);
}
