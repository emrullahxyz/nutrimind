// ============================================================================
// Nutrimind — "basış kapısı" (press gate): SAF kararlar.
//
// Sorun (lokal üretim derlemesinde ÖLÇÜLDÜ): satıra uzun basınca menü,
// parmağın HÂLÂ ekranda olduğu anda açılıyor ve yüzen perde ekranı kapladığı
// için parmak kalkınca tarayıcının ürettiği `click` perdeye (ya da panelin
// altındaki satıra) düşüyordu. Sonuç ölçümde birebir görüldü: menü kendiliğinden
// kapanıyor, başka bir geometride "Seç" sessizce çalışıp seçim modunu açıyor,
// bir başkasında "Aynısından bir tane daha ekle" öğün ekliyordu — veri yazan bir
// sızıntı.
//
// Çözüm: menüyü doğuran basış sonlanana kadar gelen `click` YUTULUR.
//
// Kapı iki fazlıdır ve bu AYRIŞTIRMA ölçümden doğdu:
//
//   1. BASILI faz — parmak hâlâ ekranda. ZAMAN AŞIMI YOK: kullanıcı istediği
//      kadar uzun tutabilir (yavaş bırakma meşru). Erken bir zaman aşımı,
//      uzun tutan kullanıcıda kapıyı kapatıp sızıntıyı geri getiriyordu.
//   2. BIRAKILDI faz — `pointerup` geldi, `click` bekleniyor (tarayıcı sırası:
//      pointerup → click). Bu fazda KISA bir zaman aşımı vardır; bazı
//      tarayıcılar uzun basıştan sonra `click`i hiç göndermez ve kapı sonsuza
//      kadar açık kalamaz.
//
// Kapının kapandığı yollar: yutulan `click`, yeni `pointerdown` (kullanıcı
// bilinçli olarak panele dokunuyor — o basış engellenmeli DEĞİL), bırakma
// sonrası zaman aşımı.
//
// Kablolama `src/hooks/usePressGate.ts`'te; burada yalnızca karar var.
// ============================================================================

/** Bırakma sonrası `click` için beklenecek süre (tarayıcı sırası çok hızlıdır;
 *  bu yalnızca "click hiç gelmedi" durumunun güvenlik ağıdır). */
export const PRESS_GATE_RELEASE_MS = 400;

export interface PressGate {
  /** Kapıyı doğuran işaretçi (dokunuş/fare). Bilinmiyorsa `null`. */
  pointerId: number | null;
  /** Basış bitti mi (`pointerup` görüldü) — artık `click` bekleniyor. */
  released: boolean;
  /** `released` olduktan sonra kapının kendiliğinden kapanacağı an (ms). */
  deadline: number;
  /** Bırakma sonrası tanınan `click` penceresi (ms) — kapı kendi penceresini taşır. */
  releaseMs: number;
}

export type GateEventKind = "click" | "pointerdown" | "pointerup" | "pointercancel";

export interface GateEvent {
  kind: GateEventKind;
  pointerId?: number | null;
  /** `click` için `MouseEvent.detail` (0 = klavye/yardımcı teknoloji üretimi). */
  detail?: number;
}

export interface GateResult {
  gate: PressGate | null;
  /** Olay bu basıştan geliyor mu — yutulmalı mı? */
  swallow: boolean;
}

/** Kapıyı açar. Basılı fazda zaman aşımı YOKTUR (`deadline` sonsuz) —
 *  kullanıcı basışı istediği kadar uzun tutabilir. */
export function armGate(
  pointerId: number | null,
  releaseMs: number = PRESS_GATE_RELEASE_MS,
): PressGate {
  return { pointerId, released: false, deadline: Number.POSITIVE_INFINITY, releaseMs };
}

/**
 * Gelen olayı kapıya işler ve olayın yutulup yutulmayacağını söyler.
 *
 * Not: `pointerup` kapıyı KAPATMAZ — `click` bu olaydan SONRA gelir, kapı
 * kapansa sızıntı geri gelirdi. Bırakma yalnızca ikinci faza geçirir.
 */
export function gateReact(gate: PressGate | null, event: GateEvent, now: number): GateResult {
  if (!gate) return { gate: null, swallow: false };
  if (gate.released && now > gate.deadline) return { gate: null, swallow: false };

  switch (event.kind) {
    case "pointerdown":
      // Yeni bir basış: kullanıcı artık menüyle etkileşiyor, kapı görevini bitirdi.
      return { gate: null, swallow: false };

    case "pointerup":
    case "pointercancel": {
      if (gate.pointerId !== null && event.pointerId !== gate.pointerId) {
        // Başka bir parmağın kalkması bu basışı temsil etmez.
        return { gate, swallow: false };
      }
      // İkinci faza geçiş: artık beklenen tek şey `click`.
      return { gate: { ...gate, released: true, deadline: now + gate.releaseMs }, swallow: false };
    }

    case "click": {
      // Klavye/yardımcı teknoloji üretimi tıklama (detail === 0) dokunmadan
      // gelmez — yutulmamalı, ama kapıyı da kapatmamalı.
      if (event.detail === 0) return { gate, swallow: false };
      return { gate: null, swallow: true };
    }
  }
}
