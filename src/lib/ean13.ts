// ============================================================================
// Nutrimind — EAN-13 kodlayıcı (SAF, yalnızca geliştirme ölçümü için).
//
// NEDEN VAR: barkod düzeltmesinin en kritik iddiası "yerli dedektör yokken wasm
// yedeği GERÇEK bir barkodu okur" cümlesidir. Bu iddia ancak kameranın gerçekten
// okunabilir bir barkod gördüğü bir ölçümle kanıtlanır (bkz. tasks/lessons.md L1:
// kod okumak ölçümün yerini tutmaz). Gerçek bir ürün fotoğrafı yerine barkodu
// MODÜLLERDEN çizmek kanıtı yeniden üretilebilir kılar — her koşuda aynı kod, aynı
// geometri.
//
// Kodlamanın kendisi bu yüzden saf ve BİRİM TESTLİ: yanlış çizilmiş bir barkod
// sessiz bir hata sınıfıdır (ölçüm "wasm okumuyor" der, oysa barkod bozuktur).
//
// YAPI (95 modül): 3 başlangıç + 6×7 sol yarı + 5 orta + 6×7 sağ yarı + 3 bitiş.
// İlk hane sol yarıda ÇİZİLMEZ; onun yerine sol yarının hangi hanelerinin G (çift
// parite) kodlanacağını seçer — yani ilk hane parite deseninde yaşar.
// ============================================================================

/** Sol yarı, tek parite (L). */
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
/** Sağ yarı (R) — her hane burada çizilir. */
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];

// G (çift parite) = R'nin TERSİ. Ayrı bir tablo yazmak yerine türetilir: iki
// tablonun bir gün ayrışması (biri düzeltilip diğeri unutulması) imkânsız olur.
const G = R.map((r) => [...r].reverse().join(""));

/** İlk haneye göre sol yarının parite deseni. "G" = çift parite, "L" = tek parite. */
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** Yalnızca rakamlardan oluşan dizge döner; başka karakter varsa null. */
function digitsOf(raw: string): string | null {
  const value = (raw ?? "").trim();
  return /^\d+$/.test(value) ? value : null;
}

/** İlk 12 haneden EAN-13 kontrol hanesi: tek konumlar ×1, çift konumlar ×3. */
export function ean13CheckDigit(first12: string): number | null {
  const digits = digitsOf(first12);
  if (!digits || digits.length !== 12) return null;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** 13 hane + doğru kontrol hanesi mi? Barkodu çizmeden önceki kapı budur. */
export function isValidEan13(code: string): boolean {
  const digits = digitsOf(code);
  if (!digits || digits.length !== 13) return false;
  return ean13CheckDigit(digits.slice(0, 12)) === Number(digits[12]);
}

/**
 * Barkodun 95 modülü: `true` = siyah çizgi, `false` = boşluk.
 * Geçersiz kod (yanlış hane sayısı / bozuk kontrol hanesi) için `null` — sessizce
 * bozuk bir barkod çizmektense hiç çizmemek doğru.
 */
export function ean13Modules(code: string): boolean[] | null {
  const digits = digitsOf(code);
  if (!digits || !isValidEan13(digits)) return null;

  const parity = PARITY[Number(digits[0])];
  let bits = "101"; // başlangıç koruması
  for (let i = 0; i < 6; i++) {
    const digit = Number(digits[i + 1]);
    bits += parity[i] === "G" ? G[digit] : L[digit];
  }
  bits += "01010"; // orta koruma
  for (let i = 0; i < 6; i++) bits += R[Number(digits[7 + i])];
  bits += "101"; // bitiş koruması

  return [...bits].map((b) => b === "1");
}
