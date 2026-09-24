// ============================================================================
// Nutrimind — barkod tarama adımının SAF karar katmanı (v0.30.8).
//
// NEDEN AYRI MODÜL: bu proje hook'ları test etmiyor (DOM ortamı yok, bileşen
// testi altyapısı yok — bkz. vitest yapılandırması). Ama barkodun iki kritik
// kuralı tam da "her karede ne olacak" sorusunda yaşıyor:
//   • aynı kod arka arkaya okunursa OFF'a aynı istek ikinci kez gitmemeli
//     (kota koruması + kullanıcıya anlamsız tekrar),
//   • FARKLI kod ise ANINDA geçmeli.
// Bu yüzden karar burada, React'siz ve zaman enjekte edilebilir biçimde durur;
// `camera.ts`'teki hook yalnızca zamanlayıcı kablosudur.
//
// DÜZELTİLEN SINIF (bu modülün var olma sebebi): eski `useBarcodeDetection`
// ilk okumadan sonra interval'i KALICI olarak kapatıyordu ve çağıran taraf
// (`ScanSheet`) yeniden kurmuyordu → ilk okuma "Ürün bulunamadı" ile biterse
// tarayıcı o oturum boyunca ölü kalıyordu.
// ============================================================================
import type { BarcodeDetectorLike } from "./off";

/** Aynı barkodun yeniden okunması bu süre boyunca yutulur. 10 sn, kullanıcının
 *  ürünü çevirip tekrar denemesi için fazlasıyla uzun; arka arkaya gelen
 *  kopya okumaları engellemek içinse yeterli. */
export const REPEAT_SUPPRESS_MS = 10_000;

export interface LastDetection {
  code: string;
  at: number;
}

/** Bu okuma işleme alınmalı mı? Farklı kod her zaman; aynı kod yalnızca
 *  bastırma penceresi geçince. */
export function shouldAcceptDetection(
  last: LastDetection | null,
  code: string,
  now: number,
): boolean {
  if (!last) return true;
  if (last.code !== code) return true;
  return now - last.at >= REPEAT_SUPPRESS_MS;
}

/**
 * Yedek (wasm) çözücü için kare ölçüsü: oran korunur, EN UZUN kenar `max`a
 * indirilir. Küçültme yalnızca performans için değil — 2560×1440 bir kareyi
 * her 500 ms'de wasm'a vermek eski telefonlarda ısınma ve pil kaybı demekti.
 * Kare `max`tan küçükse BÜYÜTÜLMEZ (yapay piksel üretmek işi kolaylaştırmaz).
 */
export function scanFrameSize(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  const longest = Math.max(width, height);
  if (longest <= max) return { width: Math.round(width), height: Math.round(height) };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface ScanOnceArgs {
  detector: BarcodeDetectorLike;
  /** `<video>` (yerli yol) ya da küçültülmüş `<canvas>` (yedek yol). */
  source: CanvasImageSource;
  last: LastDetection | null;
  now: number;
  /** Teşhis: her kare denemesi (sayaç için) — bkz. `barcodeDiag.ts`. */
  onAttempt?: () => void;
  /** Teşhis: yutulmayan bir okuma. */
  onHit?: (code: string) => void;
  onDetected: (code: string) => void;
}

export interface ScanOnceResult {
  last: LastDetection | null;
  /** Bu karede geçerli bir okuma iletildi mi? */
  delivered: boolean;
  /** Okundu ama bastırma penceresi yüzünden yutuldu. */
  suppressed: boolean;
}

/**
 * TEK kare denemesi. Asla throw etmez: tek karenin çözülememesi normaldir,
 * bir sonraki kare denenir.
 */
export async function scanOnce({
  detector,
  source,
  last,
  now,
  onAttempt,
  onHit,
  onDetected,
}: ScanOnceArgs): Promise<ScanOnceResult> {
  onAttempt?.();
  let hits: { rawValue?: string }[] | null = null;
  try {
    hits = await detector.detect(source);
  } catch {
    return { last, delivered: false, suppressed: false };
  }
  const code = hits?.[0]?.rawValue?.trim();
  if (!code) return { last, delivered: false, suppressed: false };
  if (!shouldAcceptDetection(last, code, now)) {
    return { last, delivered: false, suppressed: true };
  }
  onHit?.(code);
  onDetected(code);
  return { last: { code, at: now }, delivered: true, suppressed: false };
}
