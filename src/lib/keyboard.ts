// ============================================================================
// Nutrimind — iOS klavye boşluğu (saf hesap).
//
// SORUN: iOS'ta klavye açıldığında `window.innerHeight` DEĞİŞMEZ (Safari
// sayfayı yeniden boyutlandırmaz, klavyeyi içeriğin ÜSTÜNE çizer). Yalnızca
// `visualViewport.height` küçülür. Aşağı kaydırılabilir gövdesi olan tam ekran
// formlarda bu, odaklanılan alanın klavyenin ARKASINDA kalması demek.
//
// ÇÖZÜM: klavyenin kapladığı yükseklik hesaplanır ve sayfa `--kb` değişkeniyle
// o kadar alt boşluk verir; kullanıcı odaklanılan alanı yukarı kaydırabilir.
// ============================================================================

/** Klavye sanılan şeyin en az bu kadar yüksek olması gerekir.
 *
 *  Gerekçe: `visualViewport.height` iOS Safari'de adres çubuğu daralırken/
 *  genişlerken de değişir (~50-60 px). Bu gürültüyü klavye sanıp formu yukarı
 *  zıplatmak, gerçek klavye durumundan daha sık ve daha sinir bozucu olurdu.
 *  Gerçek bir klavye (öneri şeridi dahil) portrait telefonda 200 px'in
 *  üzerindedir. */
export const MIN_KEYBOARD_PX = 100;

export interface ViewportMetrics {
  height: number;
  /** `visualViewport.offsetTop` — sayfa görsel olarak kaydırıldıysa dolu. */
  offsetTop?: number;
}

/**
 * Klavyenin örttüğü yükseklik (px). `innerHeight` ile görsel görünüm alanı
 * arasındaki fark; eşik altındaysa 0 (adres çubuğu gürültüsü). Görsel görünüm
 * alanı yoksa (masaüstü) her zaman 0 — taklit edilecek bir klavye yok.
 */
export function keyboardInset(
  innerHeight: number,
  visualViewport: ViewportMetrics | null | undefined,
): number {
  if (!visualViewport) return 0;
  const offset = visualViewport.offsetTop ?? 0;
  const covered = innerHeight - visualViewport.height - offset;
  if (!Number.isFinite(covered) || covered < MIN_KEYBOARD_PX) return 0;
  return Math.round(covered);
}
