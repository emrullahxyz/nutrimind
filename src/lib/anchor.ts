// ============================================================================
// Nutrimind — satıra demirli yüzen panelin YERLEŞİM matematiği (saf).
//
// Öğün uzun-bas menüsü artık paylaşılan `Modal`'ın alt-sheet'i değil, kendi
// satırından doğan yüzen yuvarlak bir panel. Hangi tarafa (alt/üst) açılacağı,
// yatay hizası, ekran kenarlarına ne kadar yaklaşabileceği ve giriş
// animasyonunun hangi noktadan büyüyeceği (`transform-origin`) burada karara
// bağlanır — DOM'a dokunmadan, jsdom'suz test edilebilsin diye.
// ============================================================================

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface AnchorViewport {
  width: number;
  height: number;
}

/** Bir satıra demirlenecek panelin girdisi: satırın dikdörtgeni + menüyü
 *  doğuran basış (çapa noktası ve basış kapısının işaretçisi). */
export interface PanelAnchor {
  rect: AnchorRect;
  pressX: number;
  pointerId: number | null;
}

/** Panelin ulaşabileceği en büyük genişlik (masaüstünde okunabilirlik için). */
export const PANEL_MAX_WIDTH = 340;
/** Satır ile panel arasındaki nefes. */
export const PANEL_GAP = 10;
/** Panelin ekran kenarına bırakacağı en az boşluk. */
export const VIEWPORT_PAD = 10;
/** Panel gövdesi bu yüksekliği aşarsa İÇİ kaydırılır (panel taşmaz). */
export const PANEL_MAX_HEIGHT = 420;
/** Ölçüm öncesi ilk tahmin — yalnızca `placeAnchoredPanel` çağrısında kullanılır. */
export const PANEL_FALLBACK_HEIGHT = 300;
/** İç kaydırmaya izin verilen en küçük gövde yüksekliği. */
export const PANEL_MIN_BODY = 132;

export type PanelSide = "below" | "above";

export interface PanelPlacement {
  side: PanelSide;
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  /** Giriş animasyonunun büyüyeceği nokta — basış noktasının panele izdüşümü. */
  originX: number;
  originY: number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Satır dikdörtgenine demirlenecek panelin yerleşimini hesaplar.
 *
 * Tercih sırası: satırın ALTINA aç (menü parmağın gittiği yönün tersine
 * taşmasın), sığmıyorsa ÜSTÜNE. Hiçbir durumda görünüm alanından taşmaz;
 * sığmayan içerik panelin KENDİ içinde kaydırılır.
 *
 * @param panelHeight ölçülen panel yüksekliği (`0` → henüz ölçülmedi, tahmin).
 * @param pressX      menüyü doğuran basışın yatay konumu (`transform-origin`).
 */
export function placeAnchoredPanel(
  rect: AnchorRect,
  viewport: AnchorViewport,
  panelHeight: number,
  pressX: number,
): PanelPlacement {
  const viewportWidth = Math.max(1, viewport.width);
  // 10 px kenar boşluğu ancak iki tarafta da gerçekten yer varsa uygulanır;
  // çok dar WebView'larda bu, panelin sağ kenardan taşmasını engeller.
  const horizontalPad = viewportWidth >= VIEWPORT_PAD * 2 ? VIEWPORT_PAD : 0;
  const available = Math.max(1, viewportWidth - horizontalPad * 2);
  const width = Math.min(PANEL_MAX_WIDTH, available);

  const left = clamp(
    rect.left,
    horizontalPad,
    Math.max(horizontalPad, viewportWidth - width - horizontalPad),
  );

  const viewportHeight = Math.max(1, viewport.height);
  const verticalPad = viewportHeight >= VIEWPORT_PAD * 2 ? VIEWPORT_PAD : 0;
  const spaceBelow = viewportHeight - rect.bottom - PANEL_GAP - verticalPad;
  const spaceAbove = rect.top - PANEL_GAP - verticalPad;

  const measured = panelHeight > 0 ? panelHeight : PANEL_FALLBACK_HEIGHT;
  const side: PanelSide =
    spaceBelow >= measured || spaceBelow >= spaceAbove ? "below" : "above";

  const room = Math.max(spaceBelow, spaceAbove);
  const availableHeight = Math.max(1, viewportHeight - verticalPad * 2);
  const maxHeight = Math.min(
    PANEL_MAX_HEIGHT,
    availableHeight,
    Math.max(PANEL_MIN_BODY, room),
  );
  const height = Math.min(measured, maxHeight);

  // Tercih edilen konum, sonra HER durumda görünüm alanına kıstırılır: satır
  // kısmen ekranın dışındaysa (listenin son satırı) panel de taşmamalı.
  const preferred = side === "below" ? rect.bottom + PANEL_GAP : rect.top - PANEL_GAP - height;
  const top = clamp(
    preferred,
    verticalPad,
    Math.max(verticalPad, viewportHeight - height - verticalPad),
  );

  return {
    side,
    top,
    left: Math.max(horizontalPad, left),
    width,
    maxHeight,
    // Kaynak noktası panelin içinde kalmalı: tam kenarda 0/100% olsaydı
    // malzeme "köşeden fışkırıyor" gibi görünürdü (Apple §7: çapa görünür olsun).
    originX: clamp(pressX - left, 18, Math.max(18, width - 18)),
    originY: side === "below" ? 0 : height,
  };
}
