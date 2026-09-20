// ============================================================================
// Nutrimind — aşağı çekip yenileme: SAF KARAR KATMANI.
//
// NEDEN AYRILDI: bu mantık `usePullToRefresh` içinde gömülüydü ve o hook
// `document`'e **non-passive** bir `touchmove` dinleyicisi bağlıyordu. iOS'ta bu
// şu demek: kullanıcı sayfayı kaydırırken TARAYICI her dokunuşta JS'i bekler —
// günlük kullanımda hissedilen takılmanın en somut kaynağı. Düzeltmenin doğru
// yolu dinleyiciyi tümden kaldırmak değil (o zaman geçerli jesti iptal etmenin
// yolu kalmaz), onu YALNIZCA gerçekten gerekliyken bağlamak: karar burada saf
// olarak verilebildiği için `touchstart` anında "sayaç kurulmalı mı?" sorusu
// tek satırla cevaplanıyor.
//
// Karar DOM'dan bağımsız tutulduğu için testler jsdom'suz koşar (proje kültürü).
// ============================================================================

/** Yenilemenin tetiklenmesi için gereken çekme mesafesi. */
export const PULL_THRESHOLD = 64;
/** Göstergenin gidebileceği en uzağa kadar çekme (direnç tavanı). */
export const PULL_MAX = PULL_THRESHOLD * 1.5;
/** "Sayfa en üstte" sayılan kaydırma payı (px). */
export const TOP_EPSILON = 2;

export interface PullStart {
  armed: boolean;
  startY: number | null;
}

/** Dokunma başlangıcı: sayaç yalnızca sayfa EN ÜSTTE ve yenileme sürerken kurulmaz. */
export function startPull(scrollTop: number, y: number, refreshing: boolean): PullStart {
  const armed = !refreshing && scrollTop <= TOP_EPSILON;
  return { armed, startY: armed ? y : null };
}

export interface PullStep {
  armed: boolean;
  startY: number | null;
  scrollTop: number;
  currentY: number;
}

export interface PullOutcome {
  armed: boolean;
  distance: number;
  pulling: boolean;
  /** Yalnızca gerçek bir çekme sürerken true — `preventDefault` bu durumda çağrılır. */
  preventDefault: boolean;
}

/** Parmak hareketi: mesafe eğrisi (delta/2, tavanlı) ve iptal koşulları. */
export function nextPull(state: PullStep): PullOutcome {
  if (!state.armed || state.startY === null) {
    return { armed: false, distance: 0, pulling: false, preventDefault: false };
  }
  // Sayfa kaydırıldıysa ya da parmak yukarı gittiyse jest bitmiştir.
  if (state.scrollTop > TOP_EPSILON) {
    return { armed: false, distance: 0, pulling: false, preventDefault: false };
  }
  const delta = state.currentY - state.startY;
  if (delta <= 0) {
    return { armed: false, distance: 0, pulling: false, preventDefault: false };
  }
  if (delta <= 8) {
    // Küçük titreşimler: normal kaydırmayı bozmadan bekle.
    return { armed: true, distance: 0, pulling: false, preventDefault: false };
  }
  return {
    armed: true,
    distance: Math.min(delta * 0.5, PULL_MAX),
    pulling: true,
    preventDefault: true,
  };
}

export function shouldRefresh(distance: number): boolean {
  return distance >= PULL_THRESHOLD;
}
