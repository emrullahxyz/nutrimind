// ============================================================================
// Nutrimind — DEV-ONLY: masaüstü Preview'da iPhone koşullarını taklit et.
//
// NEDEN: iOS'a özgü iki arıza masaüstünde KENDİLİĞİNDEN ÇIKMAZ.
//   • status bar'ın altına giren başlık → masaüstünde `env(safe-area-inset-top)`
//     = 0, yani boşluk hiç gerekmiyor gibi görünür,
//   • ön kameranın açılması → masaüstünde cihaz listesi/etiketler tamamen farklı.
// Taklit olmadan "düzelttim" demek, kod okumasına dayanan bir iddia olurdu
// (bkz. tasks/lessons.md L1: kod okumak gerçek cihaz testinin yerini tutmaz).
//
// `?emulate=island|notch|se` şunları yapar:
//   1. `<html data-emulate-ios="…">` → index.css'teki `--sat/--sab` taklit edilir,
//   2. `<html data-emulate-standalone="1">` → rapor "standalone" der,
//   3. `installFakeMediaDevices()` → kamera senaryoları (bkz. iosFakeMedia.ts).
//
// ÜRETİMDE: `import.meta.env.DEV` false olduğu için `initIosEmulation` gövdesi
// ağaçtan düşer (yan etki yok); query parametresi elle yazılsa bile hiçbir şey
// olmaz. index.css'teki `[data-emulate-ios]` blokları da bu attribute
// yazılmadığı için ölü kural olarak kalır.
// ============================================================================
import { installFakeMediaDevices, setFakeBarcodePattern, uninstallFakeMediaDevices } from "./iosFakeMedia";

export type IosEmulateMode = "off" | "island" | "notch" | "se";

const MODES: IosEmulateMode[] = ["off", "island", "notch", "se"];

/**
 * Query string'den taklit modunu çıkarır. Saf — bu yüzden test edilebilir.
 * Tanınmayan değer `null` döner (sessizce varsayılana düşmek yanlış olurdu:
 * `?emulate=ipone` yazan biri taklidin açıldığını sanırdı).
 */
export function parseEmulateParam(search: string): IosEmulateMode | null {
  const raw = /[?&]emulate=([^&]+)/.exec(search ?? "")?.[1];
  if (!raw) return null;
  const value = decodeURIComponent(raw).trim().toLowerCase();
  return (MODES as string[]).includes(value) ? (value as IosEmulateMode) : null;
}

/** Attribute'ları uygular; `off`/`null` temizler. DOM'a dokunur, saf değil. */
export function applyEmulateAttributes(root: HTMLElement, mode: IosEmulateMode | null): void {
  if (!mode || mode === "off") {
    delete root.dataset.emulateIos;
    delete root.dataset.emulateStandalone;
    return;
  }
  root.dataset.emulateIos = mode;
  root.dataset.emulateStandalone = "1";
}

// --- Barkod yeteneği taklidi (v0.30.8) -------------------------------------
//
// NEDEN: barkod düzeltmesinin ASIL yolu — yerli `BarcodeDetector` yokken
// ZXing wasm yedeğinin devreye girmesi — masaüstü Chrome'da KENDİLİĞİNDEN
// çalışmaz (Chrome'un yerli dedektörü vardır, yedek hiç yüklenmez). iPhone'da
// olan şey tam olarak "yerli dedektör yok"tur; onu burada üretmezsek
// düzeltmeyi doğrulayamayız.
//
// `?barcodes=` `+` ile birleştirilebilen iki bayrak alır:
//   • `none`    → `globalThis.BarcodeDetector` SİLİNİR, tarayıcı iPhone gibi davranır,
//   • `pattern` → sahte kamera akışına GERÇEK, okunabilir bir EAN-13 çizilir
//                 (bkz. `ean13.ts` + `iosFakeMedia.ts`).
// Yani tam iPhone senaryosu `?barcodes=none+pattern`: yerli dedektör yok VE
// kameranın gördüğü şey gerçekten okunabilir bir barkod — wasm yolunun çözüp
// çözmediği böylece ÖLÇÜLÜR (kod okuyarak "çalışıyor" demek yerine).
// `pattern` istenmişse sahte kamera ŞART olduğu için kendiliğinden kurulur.
// Üretimde `import.meta.env.DEV` kapısı yüzünden hepsi ölüdür.
export type BarcodeEmulateMode = "none" | "pattern" | "none+pattern";

export interface BarcodeEmulation {
  /** Yerli `BarcodeDetector` silinsin mi (iPhone taklidi). */
  removeNative: boolean;
  /** Sahte kamera akışına EAN-13 çizilsin mi. */
  drawPattern: boolean;
}

/** `+` ile ayrılmış bayrakları çözer. Tanınmayan değer `null` — sessizce
 *  varsayılana düşmek `?barcodes=non` yazan birini yanıltırdı. */
export function parseBarcodeParam(search: string): BarcodeEmulateMode | null {
  const raw = /[?&]barcodes=([^&]+)/.exec(search ?? "")?.[1];
  if (!raw) return null;
  const parts = decodeURIComponent(raw)
    .trim()
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  const hasNone = parts.includes("none");
  const hasPattern = parts.includes("pattern");
  if (!hasNone && !hasPattern) return null;
  if (hasNone && hasPattern) return "none+pattern";
  return hasNone ? "none" : "pattern";
}

/** Modu iki bağımsız bayrağa açar — çağıranlar tekrar tekrar string
 *  karşılaştırmasın ve testte her kombinasyon tek yerde doğrulansın. */
export function barcodeEmulationFor(mode: BarcodeEmulateMode | null): BarcodeEmulation {
  return {
    removeNative: mode === "none" || mode === "none+pattern",
    drawPattern: mode === "pattern" || mode === "none+pattern",
  };
}

/** Bayrakları uygular. `undefined` yazmak yetmez: `barcodeDetectorCtor()`
 *  `typeof … === "function"` arıyor, ama temizlik için doğrudan `delete` edilir. */
export function applyBarcodeEmulation(mode: BarcodeEmulateMode | null): BarcodeEmulation {
  const flags = barcodeEmulationFor(mode);
  if (flags.removeNative) delete (globalThis as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  setFakeBarcodePattern(flags.drawPattern);
  return flags;
}

/**
 * Tüm taklidi (iOS modu + barkod bayrakları) tek yerden uygular. `initIosEmulation`
 * ve `popstate` aynı işi yapar; ikiye kopyalamak "yalnızca birinde düzeltilen
 * hata" sınıfını doğururdu.
 */
function applyEmulation(search: string): IosEmulateMode | null {
  const mode = parseEmulateParam(search);
  const flags = applyBarcodeEmulation(parseBarcodeParam(search));
  applyEmulateAttributes(document.documentElement, mode);

  if (mode && mode !== "off") {
    installFakeMediaDevices(mode, search);
  } else if (flags.drawPattern) {
    // Barkod deseni için sahte kamera şart; iOS tuhaflıkları DEĞİL, iyi davranan
    // cihaz istenir — ölçülen şey barkod yolu, kamera seçimi değil.
    installFakeMediaDevices(null, search, "android-good");
  } else {
    uninstallFakeMediaDevices();
  }
  return mode;
}

/**
 * Giriş noktası. Yalnızca `import.meta.env.DEV` iken iş yapar ve iOS taklidi
 * için TEK çağrı noktasıdır (main.tsx) — bileşenlerin içinde ayrıca kontrol
 * edilmesi gerekmez.
 */
export function initIosEmulation(): IosEmulateMode | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === "undefined" || typeof document === "undefined") return null;

  const mode = applyEmulation(window.location.search);

  // Mod değişimi için yeniden yükleme gerekmesin: `?emulate=…` adres çubuğuna
  // yazıldığında tarayıcı zaten yeniden yükler, ama Preview/DevTools'ta
  // history değiştirilerek de deniyor — o yolu da desteklemek ucuz.
  window.addEventListener("popstate", () => applyEmulation(window.location.search));

  return mode;
}
