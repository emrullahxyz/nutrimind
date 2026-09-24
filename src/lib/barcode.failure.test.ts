// ============================================================================
// Barkod yetenek modeli — BAŞARISIZ yedek yolu.
//
// Gerçek dünya senaryosu: kullanıcı çevrimdışı ya da wasm indirmesi yarıda
// kaldı. Beklenen davranış: İSTİSNA SIZMAZ, `null` döner ve teşhise tek satır
// düşer. Çağıran taraf bunu "unsupported" durumuna çevirip elle girişi öne
// çıkarır (bkz. `ScanSheet`).
//
// Ayrı dosya olmasının sebebi: `vi.mock` bir specifier için dosya başına tek
// kez kurulur, bu yüzden başarısız modül BAŞKA bir dosyada taklit edilir.
// ============================================================================
import { beforeEach, describe, expect, it, vi } from "vitest";
import { barcodeDiag, barcodeCapability, capabilityFamily } from "./barcodeDiag";
import { loadBarcodeDetector, resetBarcodeLoader } from "./barcode";

const h = vi.hoisted(() => ({
  prepare: vi.fn(async () => {
    throw new Error("wasm indirilemedi");
  }),
}));

vi.mock("barcode-detector/ponyfill", () => ({
  BarcodeDetector: class {
    async detect() {
      return [];
    }
  },
  ZXING_WASM_VERSION: "3.1.3",
  prepareZXingModule: h.prepare,
}));

beforeEach(() => {
  resetBarcodeLoader();
  barcodeDiag.clear();
  h.prepare.mockClear();
});

describe("yedek yüklemesi başarısız", () => {
  it("istisna sızmaz: null döner ve yetenek 'none' olur", async () => {
    const ctor = await loadBarcodeDetector();
    expect(ctor).toBeNull();
    expect(capabilityFamily(barcodeCapability())).toBe("none");
  });

  it("başarısızlık teşhise yazılır (sessizce yutulmaz)", async () => {
    await loadBarcodeDetector();
    const entry = barcodeDiag.entries().find((e) => e.kind === "capability");
    expect(entry?.detail).toContain("fallback-failed");
  });

  it("başarısız sonuç önbelleğe alınır — her karede yeniden denenmez", async () => {
    await loadBarcodeDetector();
    await loadBarcodeDetector();
    expect(h.prepare).toHaveBeenCalledTimes(1);
  });
});
