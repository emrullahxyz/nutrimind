// ============================================================================
// Nutrimind — İstemci Tarafı Auth Doğrulama Kuralları (Faz B Aynası).
//
// YETKİLİ KAYNAK `server/auth.js` DOSYASIDIR. Bu dosya, sunucudaki doğrulama
// kurallarının TypeScript kopyasıdır ve yalnızca istemci tarafında (giriş /
// kayıt formlarında) anında kullanıcı geri bildirimi (UX) sunmak için vardır.
// Sunucu yetkilidir; istemcideki tüm doğrulamalar sunucuda da tekrar edilir.
// Sürüklenme / kayma riskini önlemek için `src/lib/authRules.cases.json` vaka
// tablosu hem istemci hem sunucu testleri tarafından ortaklaşa çalıştırılır.
// ============================================================================

const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: string): string {
  return String(raw == null ? "" : raw)
    .trim()
    .toLowerCase();
}

export function emailProblem(raw: string): string | null {
  const email = normalizeEmail(raw);
  if (email === "") return "E-posta gerekli.";
  if (email.length > EMAIL_MAX) return "E-posta çok uzun.";
  if (!EMAIL_RE.test(email)) return "Geçerli bir e-posta adresi yaz.";
  return null;
}

export function passwordProblem(raw: string): string | null {
  const password = typeof raw === "string" ? raw : "";
  if (password === "") return "Parola gerekli.";
  if (password.trim() === "") return "Parola yalnızca boşluktan oluşamaz.";
  const length = [...password.normalize("NFKC")].length;
  if (length < PASSWORD_MIN) return `Parola en az ${PASSWORD_MIN} karakter olmalı.`;
  if (length > PASSWORD_MAX) return `Parola en fazla ${PASSWORD_MAX} karakter olabilir.`;
  return null;
}

export function registerProblem(input: {
  email: string;
  password: string;
  password2: string;
}): string | null {
  const emailErr = emailProblem(input.email);
  if (emailErr) return emailErr;
  const passErr = passwordProblem(input.password);
  if (passErr) return passErr;
  if (input.password !== input.password2) return "Parolalar eşleşmiyor.";
  return null;
}
