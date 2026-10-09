// ============================================================================
// Nutrimind — iOS safe-area ölçümü + ekran model sınıfı tahmini.
//
// NEDEN: `env(safe-area-inset-*)` CSS'te okunur ama JS'te doğrudan YOKTUR.
// İki iş için gerekiyor:
//   1. DEV-ONLY taklit (`?emulate=island`) ile gerçek cihazı ayırt etmek —
//      "düzelttim" iddiası hangi koşulda ölçüldüğünü söylemek zorunda (L1/L8).
//   2. Arkadaşın telefonunun model sınıfını KANITA çevirmek: ekran ölçüsü
//      (CSS px) + üst inset ikilisi iPhone ailesini neredeyse tek başına
//      belirler; UA model vermez. Böylece "hangi iPhone bilmiyorum" sorusu
//      tanılama raporunun kendisiyle cevaplanır.
//
// Ölçüm yöntemi: gizli bir prob elemanına `padding: var(--sat) …` verilir ve
// `getComputedStyle().paddingTop` okunur. Değişkeni doğrudan okumak
// (`getPropertyValue("--sat")`) güvenilmez — custom property'nin computed
// değeri tarayıcıya göre `env()` çözülmemiş hâlde dönebilir. Kullanılmış
// (used value) her zaman px'tir.
// ============================================================================

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewportFacts {
  width: number;
  height: number;
  dpr: number;
  screenWidth: number;
  screenHeight: number;
  /** `visualViewport.height` — iOS klavyesi bunu küçültür, `innerHeight`'ı DEĞİL. */
  visualHeight: number | null;
  standalone: boolean;
  /** Dev taklidi aktifse modu ("island"/"notch"/"se"), yoksa null. */
  emulate: string | null;
}

/** `"59px"` → `59`; ayrıştırılamazsa 0 (CSS'ten gelen her şey px'tir). */
export function parsePx(value: string): number {
  const m = /(-?\d+(?:\.\d+)?)/.exec(value ?? "");
  return m ? Number(m[1]) : 0;
}

/** Prob elemanının CSS'i. `env()` YALNIZCA burada (ve index.css'te) geçer. */
export const SAFE_AREA_PROBE_PADDING =
  "var(--sat) var(--sar) var(--sab) var(--sal)";

/**
 * Gerçek (ya da taklit edilen) inset'leri ölçer. Gizli ambalaj elemanı
 * body'ye eklenir ve HER durumda (hata olsa bile) kaldırılır — ölçüm aracı
 * üründe iz bırakmaz.
 */
export function measureSafeAreaInsets(doc?: Document): SafeAreaInsets {
  const d = doc ?? (typeof document === "undefined" ? null : document);
  const zero: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!d?.body) return zero;

  const probe = d.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
    `padding:${SAFE_AREA_PROBE_PADDING};`;
  try {
    d.body.appendChild(probe);
    const cs = d.defaultView?.getComputedStyle(probe);
    if (!cs) return zero;
    return {
      top: parsePx(cs.paddingTop),
      right: parsePx(cs.paddingRight),
      bottom: parsePx(cs.paddingBottom),
      left: parsePx(cs.paddingLeft),
    };
  } catch {
    return zero;
  } finally {
    probe.remove();
  }
}

/** `display-mode: standalone` ya da iOS'un `navigator.standalone` bayrağı. */
export function isStandalone(win?: Window): boolean {
  const w = win ?? (typeof window === "undefined" ? null : window);
  if (!w) return false;
  try {
    if (w.matchMedia?.("(display-mode: standalone)")?.matches) return true;
  } catch {
    /* matchMedia yok — aşağıdaki iOS bayrağına düş */
  }
  return (w.navigator as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true;
}

export function readViewportFacts(win?: Window, doc?: Document): ViewportFacts {
  const w = win ?? (typeof window === "undefined" ? null : window);
  const d = doc ?? (typeof document === "undefined" ? null : document);
  return {
    width: w?.innerWidth ?? 0,
    height: w?.innerHeight ?? 0,
    dpr: w?.devicePixelRatio ?? 1,
    screenWidth: w?.screen?.width ?? 0,
    screenHeight: w?.screen?.height ?? 0,
    visualHeight: w?.visualViewport?.height ?? null,
    standalone: isStandalone(w ?? undefined),
    emulate: d?.documentElement?.dataset?.emulateIos ?? null,
  };
}

/**
 * Görünüm alanı değişimlerini tek yerden bildirir.
 *
 * NEDEN `resize` YETMİYOR: iOS'ta adres çubuğunun daralması ve klavyenin
 * açılması YALNIZCA `visualViewport`'u oynatır; `window.resize` çoğu zaman hiç
 * tetiklenmez. Yalnızca `resize` dinleyen bir ölçüm (bkz. MealActionSheet /
 * ProductGuide yerleşimi) iPhone'da BAYAT kalır — panel bir önceki görünüm
 * alanına göre yerleşir. Bu, L8'in ("gizli panelde ölçüm güvenilmez") mobil
 * kardeşi: ölçümü tazeleyen olayı da doğru seçmek gerekiyor.
 */
export function subscribeViewport(onChange: () => void, win?: Window): () => void {
  const w = win ?? (typeof window === "undefined" ? null : window);
  if (!w) return () => {};
  w.addEventListener("resize", onChange);
  const vv = w.visualViewport;
  vv?.addEventListener("resize", onChange);
  vv?.addEventListener("scroll", onChange);
  return () => {
    w.removeEventListener("resize", onChange);
    vv?.removeEventListener("resize", onChange);
    vv?.removeEventListener("scroll", onChange);
  };
}

export interface DeviceClass {
  /** "393x852" — düzenin konuştuğu ölçü. */
  size: string;
  insetTop: number;
  /** Model ailesi (tek aday yoksa "ve benzeri"). ASCII: rapora giriyor. */
  family: string;
}

/**
 * Ekran ölçüsü + üst inset ikilisinden model ailesi tahmini. Amaç teşhis
 * değil, raporu okunur kılmak: aynı ölçüyü paylaşan modeller TEK aday olarak
 * yazılmaz, "class" denir (yanlış kesinlik üretmemek için).
 */
export function guessDeviceClass(facts: ViewportFacts, insets: SafeAreaInsets): DeviceClass {
  const w = Math.round(facts.width);
  const h = Math.round(facts.height);
  const size = `${w}x${h}`;
  // Ölçüler CSS px'tir ve portrait varsayılır; yatayda ölçü ters gelirse
  // normalize edilir (aksi hâlde tablo hiç tutmazdı).
  const portraitW = Math.min(w, h);
  const portraitH = Math.max(w, h);
  const key = `${portraitW}x${portraitH}`;
  const MAP: Record<string, string> = {
    "320x568": "iPhone SE (1st gen)",
    "375x667": "iPhone SE (2nd/3rd gen) / 8 / 7 / 6s class",
    "375x812": "iPhone X / XS / 11 Pro / 12 mini / 13 mini class",
    "390x844": "iPhone 12 / 13 / 14 class",
    "393x852": "iPhone 14 Pro / 15 / 15 Pro / 16 class",
    "402x874": "iPhone 16 Pro",
    "414x736": "iPhone Plus (8/7/6s) class",
    "414x896": "iPhone XR / 11 / XS Max / 11 Pro Max class",
    "428x926": "iPhone 12/13 Pro Max / 14 Plus class",
    "430x932": "iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus class",
    "440x956": "iPhone 16 Pro Max",
    "768x1024": "iPad (9.7 in) class",
    "820x1180": "iPad Air (10.9 in) class",
  };
  return {
    size,
    insetTop: insets.top,
    family: MAP[key] ?? (portraitW >= 768 ? "tablet / desktop class" : "unknown phone class"),
  };
}
