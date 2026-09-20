// ============================================================================
// Nutrimind — tanılama raporu (iPhone'dan kanıt toplamanın yolu).
//
// NEDEN: Bu işin tek gerçek doğrulama ortamı arkadaşın iPhone'u; ama sahibin
// elinde ne Mac ne Safari Web Inspector var. Bu yüzden teknik gerçekler
// UYGULAMANIN KENDİSİNDEN çıkarılır: rapor metni kullanıcının gönderdiği geri
// bildirime eklenir (`FeedbackForm` → mevcut `POST /api/feedback` yolu).
//
// KURAL: Metin dil-nötr ASCII'dir (makine tarafından okunacak teknik veri,
// arayüz metni değil) ve PII İÇERMEZ: e-posta/ad/yemek verisi yok; UA, ekran
// ölçüsü, inset, kamera ayarları ve uzun görev sayıları var. Kullanıcı
// eklemeyi KENDİ elleriyle seçer, gönderilen metni gözle görür.
// ============================================================================
import { APP_VERSION } from "./version";
import { cameraDiag } from "./cameraDiag";
import type { CameraDiagEntry } from "./cameraDiag";
import { guessDeviceClass, measureSafeAreaInsets, readViewportFacts } from "./safeArea";
import type { SafeAreaInsets, ViewportFacts, DeviceClass } from "./safeArea";
import { longTaskSummary } from "./perfProbe";
import type { LongTaskSummary } from "./perfProbe";

/** Gönderilen metinde raporun başlangıcını işaretler — form bunu görüp
 *  ikinci kez eklemeyi engeller. ASCII, dile bağlı değil. */
export const DIAGNOSTICS_MARKER = "--- nutrimind technical report ---";

const UA_MAX = 200;

export interface DiagnosticsInput {
  version: string;
  locale: string;
  userAgent: string;
  facts: ViewportFacts;
  insets: SafeAreaInsets;
  deviceClass: DeviceClass;
  camera: CameraDiagEntry[];
  longTasks: LongTaskSummary | null;
  online: boolean;
}

function row(label: string, value: string): string {
  return `${label.padEnd(8, " ")} ${value}`;
}

/**
 * Saf biçimlendirme — DOM'a dokunmaz, bu yüzden test edilebilir. Satır düzeni
 * journalctl/terminal alışkanlığına uyar: sabit genişlikte etiket, sonra değer.
 */
export function buildDiagnosticsReport(input: DiagnosticsInput): string {
  const { facts, insets } = input;
  const lines: string[] = [
    DIAGNOSTICS_MARKER,
    row("app", input.version),
    row("locale", input.locale),
    row(
      "mode",
      facts.standalone ? "standalone" : "browser" + (facts.emulate ? ` emulated=${facts.emulate}` : ""),
    ),
    row("screen", `${facts.width}x${facts.height} dpr=${facts.dpr} visual=${facts.visualHeight ?? "n/a"}`),
    row(
      "insets",
      `top=${insets.top} right=${insets.right} bottom=${insets.bottom} left=${insets.left}`,
    ),
    row("device", `${input.deviceClass.size} top=${input.deviceClass.insetTop} → ${input.deviceClass.family}`),
    row("online", input.online ? "yes" : "no"),
    row(
      "longtask",
      input.longTasks
        ? `count=${input.longTasks.count} total=${input.longTasks.totalMs}ms max=${input.longTasks.maxMs}ms`
        : "n/a (unsupported)",
    ),
    row("ua", input.userAgent.slice(0, UA_MAX)),
  ];

  if (input.camera.length === 0) {
    lines.push(row("camera", "no attempts recorded"));
  } else {
    lines.push(row("camera", "newest first"));
    for (const line of formatCameraLines(input.camera)) lines.push(`  ${line}`);
  }

  return lines.join("\n");
}

/** Kamera satırlarını en yeni önce sıralar (rapor formatter'ı ile aynı kural). */
function formatCameraLines(entries: CameraDiagEntry[]): string[] {
  return [...entries]
    .reverse()
    .map((e, i) => {
      const idx = entries.length - i;
      const head = `#${idx} ${e.facing} attempt=${e.attempt} want=${e.requested} got=${e.got} → ${e.result}`;
      return e.note ? `${head} · ${e.note}` : head;
    });
}

/** DOM'dan gerçekleri toplar ve metne çevirir. Hata durumunda rapor yine
 *  üretilir (teşhis aracı, asıl akışı kesmemeli). */
export function collectAndFormatDiagnostics(locale: string): string {
  const insets = measureSafeAreaInsets();
  const facts = readViewportFacts();
  return buildDiagnosticsReport({
    version: APP_VERSION,
    locale,
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    facts,
    insets,
    deviceClass: guessDeviceClass(facts, insets),
    camera: cameraDiag.entries(),
    longTasks: longTaskSummary(),
    online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
  });
}
