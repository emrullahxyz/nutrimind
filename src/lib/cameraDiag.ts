// ============================================================================
// Nutrimind — kamera teşhis kaydı (istemci tarafı halka tampon).
//
// NEDEN: "ön kamera açıldı" arızasının kök nedeni iki adaydan biri ve İKİSİ DE
// yalnızca gerçek cihazda ayırt edilebilir (ideal `facingMode` yok sayıldı mı,
// yoksa `getSettings().deviceId` hiç gelmedi mi?). Sunucu tarafındaki
// `aiLog.js` ile aynı fikir: hata anında ne olduğunu TAHMİN yerine KAYITLA
// bilebilmek. Kayıt, mevcut geri bildirim formundan sahibe gönderilebilir.
//
// PII YOK: yemek/kullanıcı verisi, görsel, e-posta, konum kaydedilmez —
// yalnızca cihaz kısıtları ve geri gelen track ayarları (teknik).
// ============================================================================

export type CameraFacing = "environment" | "user";

export interface CameraDiagEntry {
  /** ISO damga. */
  at: string;
  /** İstenen yön. */
  facing: CameraFacing;
  /** Kaçıncı deneme (1 = ilk istek). */
  attempt: number;
  /** Kullanılan kısıt, kısa: "facingMode.ideal=environment" | "deviceId=ios-back". */
  requested: string;
  /** Sonuç: yön doğrulandı mı? */
  result: "ok" | "retry" | "unverified" | "failed";
  /** Geri gelen track: "id=… facing=… 1280x720". */
  got: string;
  /** Cihaz listesi özeti. */
  devices: string;
  /** Hata adı/mesajı (kısaltılmış). */
  note?: string;
}

export interface CameraDiagLog {
  record(entry: Omit<CameraDiagEntry, "at"> & { at?: string }): void;
  entries(): CameraDiagEntry[];
  clear(): void;
}

/** Halka tampon: yalnızca son N deneme tutulur (rapor kısa kalsın). */
export function createCameraDiagLog(limit = 12): CameraDiagLog {
  const items: CameraDiagEntry[] = [];
  return {
    record(entry) {
      items.push({ ...entry, at: entry.at ?? new Date().toISOString() });
      while (items.length > limit) items.shift();
    },
    entries: () => [...items],
    clear: () => {
      items.length = 0;
    },
  };
}

/** Uygulama geneli tekil kayıt — `camera.ts` yazar, rapor okur. */
export const cameraDiag = createCameraDiagLog();

export interface DeviceLike {
  kind: string;
  label: string;
  deviceId: string;
}

/** `"videoinput=3 [Front Camera | Back Dual Wide Camera | (no label)]"` */
export function summarizeDevices(devices: DeviceLike[] | null | undefined): string {
  if (!devices || devices.length === 0) return "none";
  const video = devices.filter((d) => d.kind === "videoinput");
  const labels = video.map((d) => (d.label.trim() ? d.label.trim() : "(no label)"));
  return `videoinput=${video.length} [${labels.join(" | ")}]`;
}

export interface SettingsLike {
  deviceId?: string;
  facingMode?: string;
  width?: number;
  height?: number;
}

/** `"id=ios-back facing=environment 1280x720"`; eksikler `?` olur — eksikliğin
 *  kendisi kanıttır, bu yüzden boş bırakılmaz. */
export function summarizeSettings(settings: SettingsLike | null | undefined): string {
  if (!settings) return "settings=null";
  const id = settings.deviceId ? settings.deviceId : "?";
  const facing = settings.facingMode ? settings.facingMode : "?";
  const size = `${settings.width ?? 0}x${settings.height ?? 0}`;
  return `id=${id} facing=${facing} ${size}`;
}

/** Hata nesnesini tek satıra indirir (rapora mesaj taşmasın). */
export function truncateNote(e: unknown, max = 120): string {
  const name = (e as Error | undefined)?.name ?? "Error";
  const message = String((e as Error | undefined)?.message ?? e ?? "");
  const text = `${name}: ${message}`.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Rapor satırları — en yeni kayıt en üstte. */
export function formatCameraDiag(entries: CameraDiagEntry[]): string[] {
  return [...entries]
    .reverse()
    .map((e, i) => {
      const idx = entries.length - i;
      const head = `#${idx} ${e.facing} attempt=${e.attempt} want=${e.requested} got=${e.got} → ${e.result}`;
      return e.note ? `${head} · ${e.note}` : head;
    });
}
