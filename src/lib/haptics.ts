export type HapticKind = "light" | "medium" | "success";

const PATTERNS: Record<HapticKind, number | number[]> = {
  light: 8,
  medium: 12,
  success: [10, 40, 12],
};

/** Anlamlı anlarda kısa dokunsal geri bildirim (Apple multimodal). Ses yok;
 *  cihazın Vibration API'si yoksa sessizce geçer. */
export function haptic(kind: HapticKind = "light"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(PATTERNS[kind]);
}
