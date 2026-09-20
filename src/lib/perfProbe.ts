// ============================================================================
// Nutrimind — uzun görev (long task) probu.
//
// NEDEN: "iPhone'da optimizasyon" iddiası ÖLÇÜM ister; masaüstü Preview'ın
// kare hızı iPhone'un göstergesi değildir. Long Tasks API (>50 ms ana iş
// parçacıkları) destekleyen her cihazda ölçülür ve tanılama raporuna girer —
// böylece "hissedilir takılma" şikâyeti sayıya döner.
//
// Desteklenmeyen tarayıcıda HİÇBİR ŞEY yapmaz (iOS Safari'de longtask girdisi
// yoktur; orada rapor "n/a" der ve bu da bilgidir).
// ============================================================================

export interface LongTaskSummary {
  count: number;
  totalMs: number;
  maxMs: number;
}

const CAP = 200;
const durations: number[] = [];
let installed = false;

export function summarizeLongTasks(values: number[]): LongTaskSummary {
  if (values.length === 0) return { count: 0, totalMs: 0, maxMs: 0 };
  let total = 0;
  let max = 0;
  for (const v of values) {
    total += v;
    if (v > max) max = v;
  }
  return { count: values.length, totalMs: Math.round(total), maxMs: Math.round(max) };
}

export function longTaskSupported(): boolean {
  if (typeof PerformanceObserver === "undefined") return false;
  const types = (PerformanceObserver as unknown as { supportedEntryTypes?: string[] })
    .supportedEntryTypes;
  return Array.isArray(types) && types.includes("longtask");
}

/** Bir kez kurulur; kurulamazsa sessizce vazgeçer (ölçüm aracı ürünü bozmaz). */
export function startLongTaskProbe(): void {
  if (installed || !longTaskSupported()) return;
  installed = true;
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        durations.push(entry.duration);
        if (durations.length > CAP) durations.shift();
      }
    });
    obs.observe({ type: "longtask", buffered: true });
  } catch {
    installed = false;
  }
}

export function longTaskSummary(): LongTaskSummary | null {
  if (!longTaskSupported()) return null;
  return summarizeLongTasks(durations);
}

/** Test/teşhis kolaylığı — gerçek akışta çağrılmaz. */
export function resetLongTaskProbe(): void {
  durations.length = 0;
}
