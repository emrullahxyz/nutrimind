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
import { installFakeMediaDevices, uninstallFakeMediaDevices } from "./iosFakeMedia";

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

/**
 * Giriş noktası. Yalnızca `import.meta.env.DEV` iken iş yapar ve iOS taklidi
 * için TEK çağrı noktasıdır (main.tsx) — bileşenlerin içinde ayrıca kontrol
 * edilmesi gerekmez.
 */
export function initIosEmulation(): IosEmulateMode | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === "undefined" || typeof document === "undefined") return null;

  const mode = parseEmulateParam(window.location.search);
  applyEmulateAttributes(document.documentElement, mode);

  if (mode && mode !== "off") {
    installFakeMediaDevices(mode);
  } else {
    uninstallFakeMediaDevices();
  }

  // Mod değişimi için yeniden yükleme gerekmesin: `?emulate=…` adres çubuğuna
  // yazıldığında tarayıcı zaten yeniden yükler, ama Preview/DevTools'ta
  // history değiştirilerek de deniyor — o yolu da desteklemek ucuz.
  window.addEventListener("popstate", () => {
    const next = parseEmulateParam(window.location.search);
    applyEmulateAttributes(document.documentElement, next);
    if (next && next !== "off") installFakeMediaDevices(next);
    else uninstallFakeMediaDevices();
  });

  return mode;
}
