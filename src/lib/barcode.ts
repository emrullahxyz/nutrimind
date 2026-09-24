// ============================================================================
// Nutrimind — barkod YETENEK modeli (v0.30.8): yerli API önce, wasm yedeği sonra.
//
// SORUN: `BarcodeDetector` yalnızca Chromium tabanlı tarayıcılarda var; iOS
// Safari'de YOK. Önceki sürüm bu durumda sessizce hiçbir şey yapmıyordu, ama
// arayüz "otomatik okunuyor" diyordu — yani iPhone'da özellik KULLANILAMAZ
// olduğu hâlde kullanılabilir gibi görünüyordu.
//
// ÇÖZÜM: yerli dedektör yoksa ZXing-C++ (wasm) tabanlı `barcode-detector`
// ponyfill'i TEMBEL olarak yüklenir. Anahtar cümle "tembel": paket yalnızca
// barkod moduna girildiğinde indirilir, yani paket boyutu ve Android'deki hızlı
// yerli yol hiç etkilenmez.
//
// wasm YOLU CDN'E BIRAKILMAZ: paketin varsayılanı jsDelivr'dir. Kendi
// origin'imizden servis etmek (a) gizlilik (üçüncü tarafa hangi sayfaların
// açıldığını söylememek), (b) çevrimdışı/dayanıklılık, (c) sürüm bütünlüğü
// demektir — bu yüzden `prepareZXingModule` locateFile'ı yerel varlığa çevrilir.
//
// SÖZLEŞME: bu modül ASLA throw etmez. Başarısızlık `null` + teşhis kaydıdır
// (bkz. `barcodeDiag.ts`) — tarayıcının çökmesi değil.
// ============================================================================
// Vite bu import'u varlık URL'sine çevirir (`/assets/zxing_reader-<hash>.wasm`),
// yani dosya build'e kopyalanır ve aynı origin'den servis edilir.
import zxingReaderWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { barcodeDetectorCtor } from "./off";
import type { BarcodeDetectorCtor } from "./off";
import { barcodeDiag, setBarcodeCapability } from "./barcodeDiag";

/** Yerli yol: 400 ms — bkz. `camera.ts` eski notu (göze anında görünür, CPU'yu yormaz). */
export const BARCODE_SCAN_INTERVAL_MS = 400;
/** Yedek yol: wasm çözümü daha pahalı; 500 ms dengeli (cihazda ölçülecek). */
export const FALLBACK_SCAN_INTERVAL_MS = 500;
/** Yedek yolda kare bu uzun kenara kadar küçültülür — 2560×1440'ı her yarım
 *  saniyede wasm'a vermek eski telefonlarda ısınma/pil kaybı demekti. */
export const FALLBACK_MAX_DIM = 960;

export type BarcodeSupport = "native" | "unknown" | "unsupported";

/** Yerli `BarcodeDetector` kurucusu — yoksa null (senkron, indirme yapmaz). */
export function nativeDetector(): BarcodeDetectorCtor | null {
  return barcodeDetectorCtor();
}

/** Senkron cevap: yerli varsa "native"; yoksa yedek DENENMEDEN "unknown"
 *  (indirme yalnızca `loadBarcodeDetector` ile başlar). */
export function barcodeSupportSync(): BarcodeSupport {
  return nativeDetector() ? "native" : "unknown";
}

/** Yeteneği teşhise yazar. Yerli varsa zaten indirme yapılmaz. */
export function markBarcodeCapability(): BarcodeSupport {
  if (nativeDetector()) {
    setBarcodeCapability({ native: true });
    return "native";
  }
  return "unknown";
}

let fallbackPromise: Promise<BarcodeDetectorCtor | null> | null = null;

/**
 * Kullanılabilir bir dedektör döndürür: yerli varsa O (indirme yok), yoksa
 * wasm yedeği (bir kez indirilir, sonucu önbelleğe alınır). Başarısızlıkta
 * `null` — çağıran "unsupported" durumunu gösterir.
 */
export function loadBarcodeDetector(): Promise<BarcodeDetectorCtor | null> {
  const native = nativeDetector();
  if (native) return Promise.resolve(native);
  fallbackPromise ??= loadFallback();
  return fallbackPromise;
}

async function loadFallback(): Promise<BarcodeDetectorCtor | null> {
  try {
    const mod = await import("barcode-detector/ponyfill");
    // `fireImmediately: true` → wasm GERÇEKTEN indirilip kurulana kadar bekleriz.
    // Böylece "hazırlanıyor" göstergesi doğru anda biter; ilk karede sürpriz
    // bir gecikme yaşanmaz.
    await mod.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? zxingReaderWasmUrl : prefix + path,
      },
      fireImmediately: true,
    });
    setBarcodeCapability({ native: false, fallback: `zxing-wasm@${mod.ZXING_WASM_VERSION}`, loaded: true });
    barcodeDiag.record("capability", `fallback-ready:zxing-wasm@${mod.ZXING_WASM_VERSION}`);
    return mod.BarcodeDetector as unknown as BarcodeDetectorCtor;
  } catch (e) {
    setBarcodeCapability({ native: false, fallback: null, loaded: false });
    barcodeDiag.record("capability", `fallback-failed:${(e as Error)?.name ?? "Error"}`);
    return null;
  }
}

/** Test/ölçüm için: önbelleği sıfırlar (üretimde çağrılmaz). */
export function resetBarcodeLoader(): void {
  fallbackPromise = null;
}
