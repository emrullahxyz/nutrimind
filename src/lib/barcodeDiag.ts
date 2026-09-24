// ============================================================================
// Nutrimind — barkod tanılama kaydı (v0.30.8).
//
// NEDEN: "Barkod tarayıcı çalışmıyor" geri bildirimi, hangi cihazda neyin
// koptuğunu BİLMEDEN düzeltilemez — ve bu işin tek gerçek doğrulama ortamı
// kullanıcının telefonu. `cameraDiag.ts` ile aynı fikir: hata anında ne
// olduğunu TAHMİN yerine KAYITLA bilebilmek. Kayıt, mevcut geri bildirim
// formundan (Tanılama bilgilerini ekle) sahibe gönderilebilir.
//
// PII YOK: e-posta/ad/yemek verisi/görsel kaydedilmez. Barkod numarası bir
// ÜRÜN kimliğidir (ambalajın üstünde yazar), kişisel veri değildir; zaten
// raporu kullanıcı kendi gözüyle görüp kendi eliyle ekler.
//
// Metin dil-nötr ASCII'dir (arayüz metni değil, makine tarafından okunacak
// teknik veri).
// ============================================================================

export type BarcodeDiagKind = "capability" | "detect" | "hit" | "lookup";

export interface BarcodeDiagEntry {
  /** ISO damga. */
  at: string;
  kind: BarcodeDiagKind;
  /** Kısa, tek satır teknik ayrıntı (ör. "not-found:8690637025010"). */
  detail: string;
}

export interface BarcodeDiagCounts {
  attempts: number;
  hits: number;
}

export interface BarcodeDiagLog {
  record(kind: BarcodeDiagKind, detail: string): void;
  entries(): BarcodeDiagEntry[];
  counts(): BarcodeDiagCounts;
  clear(): void;
}

/** Halka tampon: yalnızca son N satır tutulur (rapor kısa kalsın). */
export function createBarcodeDiagLog(limit = 20): BarcodeDiagLog {
  const items: BarcodeDiagEntry[] = [];
  let attempts = 0;
  let hits = 0;
  return {
    record(kind, detail) {
      if (kind === "detect") attempts += 1;
      if (kind === "hit") hits += 1;
      items.push({ at: new Date().toISOString(), kind, detail });
      while (items.length > limit) items.shift();
    },
    entries: () => [...items],
    counts: () => ({ attempts, hits }),
    clear: () => {
      items.length = 0;
      attempts = 0;
      hits = 0;
    },
  };
}

// --- Yetenek özeti ------------------------------------------------------------
// Tarayıcı yeteneği SÜREÇ başına bir kez belirlenir; özet bu yüzden ayrı
// tutulur (halka tamponun dışında kalır ki eski satırlar düşerken kaybolmasın).

export interface BarcodeCapability {
  /** Yerli `BarcodeDetector` var mı? */
  native: boolean;
  /** wasm yedeğinin sürüm etiketi (ör. "zxing-wasm@3.2.1"); yoksa null. */
  fallback: string | null;
  /** Yedek GERÇEKTEN yüklendi mi (yalnızca gerektiğinde indirilir). */
  loaded: boolean;
}

const capability: BarcodeCapability = { native: false, fallback: null, loaded: false };

export function setBarcodeCapability(next: Partial<BarcodeCapability>): void {
  Object.assign(capability, next);
}

export function barcodeCapability(): BarcodeCapability {
  return { ...capability };
}

// --- Rapor satırı -------------------------------------------------------------

export interface BarcodeDiagSummary {
  family: string;
  attempts: number;
  hits: number;
  /** Son kaydın "kind:detail" hâli; hiç kayıt yoksa null. */
  last: string | null;
}

/** Uygulama geneli tekil kayıt — `barcode.ts`/`camera.ts` yazar, rapor okur. */
export const barcodeDiag = createBarcodeDiagLog();

export function barcodeDiagSummary(): BarcodeDiagSummary {
  const { attempts, hits } = barcodeDiag.counts();
  const entries = barcodeDiag.entries();
  const last = entries.length > 0 ? entries[entries.length - 1] : null;
  return {
    family: capabilityFamily(barcodeCapability()),
    attempts,
    hits,
    last: last ? `${last.kind}:${last.detail}` : null,
  };
}

/** "native" | "zxing-wasm(loaded)" | "zxing-wasm(idle)" | "none" */
export function capabilityFamily(cap: BarcodeCapability): string {
  if (cap.native) return "native";
  if (!cap.fallback) return "none";
  return cap.loaded ? `${cap.fallback}(loaded)` : `${cap.fallback}(idle)`;
}

/**
 * `deviceReport`'un tek satırı: sabit genişlikli etiket + değer.
 * Örnek: `family=native attempts=12 hits=3 last=lookup:not-found:8690637025010`
 */
export function formatBarcodeDiagLine(summary: BarcodeDiagSummary): string {
  const parts = [
    `family=${summary.family}`,
    `attempts=${summary.attempts}`,
    `hits=${summary.hits}`,
    `last=${summary.last ?? "n/a"}`,
  ];
  return parts.join(" ");
}
