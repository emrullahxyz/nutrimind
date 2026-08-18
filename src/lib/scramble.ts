export const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

export function scrambleProgress(
  text: string,
  progress: number,
  randomFn = Math.random
): string {
  const clamped = Math.max(0, Math.min(progress, 1));
  const revealedChars = Math.floor(clamped * text.length);

  return text
    .split("")
    .map((char, i) => {
      if (char === " ") return " ";
      if (i < revealedChars) return char;
      return GLYPHS[Math.floor(randomFn() * GLYPHS.length)];
    })
    .join("");
}
