// ============================================================================
// Nutrimind — çift dokunuş kapısı (saf).
//
// KULLANIM: kamerada ön/arka geçişi çift dokunuşla yapılıyor. Bu bir JEST
// olduğu için kararı ölçülebilir olmalı: hangi iki dokunuşun "çift" sayıldığı,
// hangilerinin (sürükleme, basılı tutma, farklı yüzeye dokunma) SAYILMADIĞI
// burada, DOM'suz ve testli biçimde durur (projenin test kültürü: DOM'a
// bağlanmayan karar katmanı).
//
// Neden önemli: kamera ekranındaki deklanşör de bir dokunma hedefi. Jest
// yanlış kurgulanırsa kullanıcı fotoğraf çekmek isterken kamerayı değiştirir.
// Bu yüzden iki dokunuş hem AYNI `key` (yüzey) üzerinde hem kısa sürede hem de
// neredeyse aynı noktada olmak zorunda.
// ============================================================================

export interface DoubleTapOptions {
  /** İki dokunuş arasındaki en büyük süre. */
  maxGapMs?: number;
  /** Bir dokunuşun parmak kaldırılana kadar sürebileceği en uzun süre —
   *  basılı tutma "dokunuş" değildir. */
  maxHoldMs?: number;
  /** Dokunuşun kaymış sayılması için gereken mesafe (px). */
  maxMovePx?: number;
}

export interface DoubleTapGate {
  /** Parmak indi. */
  down(x: number, y: number, t: number, key?: string): void;
  /** Parmak kalktı → `true` ise ÇİFT dokunuş tamamlandı (ikinci dokunuşun sonu). */
  up(x: number, y: number, t: number, key?: string): boolean;
  /** Jest iptal (pointercancel, sayfa gizlendi…). */
  cancel(): void;
}

const DEFAULTS = { maxGapMs: 320, maxHoldMs: 300, maxMovePx: 14 };

interface PendingTap {
  x: number;
  y: number;
  t: number;
  key: string;
}

export function createDoubleTapGate(options: DoubleTapOptions = {}): DoubleTapGate {
  const maxGapMs = options.maxGapMs ?? DEFAULTS.maxGapMs;
  const maxHoldMs = options.maxHoldMs ?? DEFAULTS.maxHoldMs;
  const maxMovePx = options.maxMovePx ?? DEFAULTS.maxMovePx;

  let pending: PendingTap | null = null;
  let downAt: { x: number; y: number; t: number; key: string } | null = null;

  return {
    down(x, y, t, key = "default") {
      downAt = { x, y, t, key };
    },

    up(x, y, t, key = "default") {
      const start = downAt;
      downAt = null;
      if (!start || start.key !== key) return false;
      // Basılı tutma ya da sürükleme dokunuş DEĞİL.
      if (t - start.t > maxHoldMs) return false;
      const moved = Math.abs(x - start.x) + Math.abs(y - start.y);
      if (moved > maxMovePx) return false;

      if (pending && pending.key === key) {
        const gap = t - pending.t;
        const near = Math.abs(x - pending.x) + Math.abs(y - pending.y);
        // Uzak bir yere ikinci kez dokunmak (ör. deklanşör) çift dokunuş değil.
        if (gap <= maxGapMs && near <= maxMovePx * 2) {
          pending = null;
          return true;
        }
      }
      pending = { x, y, t, key };
      return false;
    },

    cancel() {
      pending = null;
      downAt = null;
    },
  };
}
