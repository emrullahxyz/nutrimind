// Changelog "görüldü" durumu için saf yardımcılar — DOM/localStorage YOK
// (test edilebilirlik). Okuma/yazma UI bileşenlerinde readStringPref/
// writeStringPref ile yapılır; buraya ait iş sadece dönüşüm + karşılaştırma.
export const CHANGELOG_SEEN_KEY = "nutrimind.ui.changelogSeen"; // PREF nesnesine eklenmez (bkz. Task 2)

function numPart(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Semver sözlük karşılaştırma: `split(".")` ile parçala, numerik karşılaştır.
 *  Geçersiz parça (NaN) → 0. a<b ise negatif, a>b ise pozitif, eşitse 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = numPart(pa[i] ?? "0") - numPart(pb[i] ?? "0");
    if (d !== 0) return d;
  }
  return 0;
}

/** Görülmemiş sürümler. `versions` sırası korunur; `seen` değiştirilmez. */
export function unseenVersions(versions: string[], seen: string[]): string[] {
  const seenSet = new Set(seen);
  return versions.filter((v) => !seenSet.has(v));
}

/** Ham localStorage string'ini sürüm dizisine çevirir.
 *  JSON.parse başarısız olursa, null ise ya da dizi değilse → []. */
export function parseSeen(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function serializeSeen(seen: string[]): string {
  return JSON.stringify(seen);
}
