// ============================================================================
// Nutrimind — AI istekleri için istemci tarafı zaman sınırı (saf modül).
//
// MOTİVASYON (2026-09-21 canlı olay): istemcide HİÇBİR zaman aşımı yoktu.
// `parseMealImage` bir AbortSignal taşıyordu ama o sinyal yalnızca kullanıcı
// "İptal"e bastığında tetikleniyordu. Sunucu zinciri 67 sn sürdüğünde
// kullanıcı o süre boyunca dönen bir çember ve "Analiz ediliyor…" yazısından
// başka bir şey görmedi; ağ askıda kalsaydı ekran SONSUZA DEK öyle kalırdı.
//
// Bu modül iki sinyali (kullanıcı iptali + süre sınırı) TEK bir sinyalde
// birleştirir ve ikisini AYIRT EDEBİLME imkânı verir: iptal sessizce geçilmeli,
// süre aşımı ise kullanıcıya söylenmeli. `AbortSignal.any()` bilerek
// KULLANILMADI — iOS Safari'de sürüm desteği değişken ve bu akış tam olarak
// iPhone'da test ediliyor.
// ============================================================================

/** İstemcinin AI yanıtı için bekleyeceği en uzun süre. Sunucu tarafı toplam
 *  bütçesi (NUTRI_AI_BUDGET_MS, varsayılan 25 sn) bunun ALTINDA olmalı; bu
 *  değer yalnızca ağ/sunucu tamamen askıda kalırsa devreye giren emniyet ağıdır. */
export const CLIENT_AI_TIMEOUT_MS = 35000;

export interface Deadline {
  /** fetch'e verilecek sinyal (iptal VEYA süre aşımı ile aborte olur). */
  signal: AbortSignal;
  /** Sınırı biz mi aştık? (true → kullanıcı iptali değil, zaman aşımı) */
  timedOut: () => boolean;
  /** Zamanlayıcıyı ve dış dinleyiciyi temizler (istek bitince ŞART). */
  release: () => void;
}

/**
 * `outer` sinyalini kendi süre sınırıyla birleştirir.
 *
 * @param outer kullanıcı iptali sinyali (opsiyonel)
 * @param ms süre sınırı (varsayılan CLIENT_AI_TIMEOUT_MS)
 */
export function withDeadline(
  outer: AbortSignal | undefined,
  ms: number = CLIENT_AI_TIMEOUT_MS,
): Deadline {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);

  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", onOuterAbort);
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    release: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuterAbort);
    },
  };
}
