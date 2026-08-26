// ============================================================================
// Nutrimind — kimlik uçlarının fetch istemcisi (Faz F).
//
// `api.ts`'ten AYRI ve bu ayrım BİLEREK:
//
//   1. Bu modül ASLA `api.ts`'in `mutate()`'inden geçmez.
//   2. Bu modül ASLA `setUnauthorizedHandler`'ı TETİKLEMEZ.
//
// Sebep: burada 401 NORMAL bir yanıt — "parolan yanlış" ya da "henüz giriş
// yapmadın" demek. `api.ts`'te ise 401 "oturumun düştü, kullanıcıyı giriş
// ekranına at" demek. İkisi karışırsa yanlış parola girmek oturum düşmesi gibi
// ele alınır ve kullanıcı formunu kaybederdi.
//
// Desen `ai.ts`/`off.ts` ile aynı: kendi hata sınıfı + kendi fetch sarmalayıcısı.
// ============================================================================
import type { AuthCapabilities, AuthUser } from "../types";

export class AuthError extends Error {
  readonly status: number;
  /** Yalnızca 429'da dolu (saniye). */
  readonly retryAfter: number | null;
  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Durum koduna göre arayüz metni. Sunucunun kendi mesajı varsa o önceliklidir —
 *  sunucu zaten Türkçe ve daha spesifik konuşuyor. */
export function authErrorMessage(status: number, serverMessage?: string | null, retryAfter?: number | null): string {
  if (serverMessage && serverMessage.trim()) return serverMessage.trim();
  switch (status) {
    case 0:
      return "Sunucuya ulaşılamadı — bağlantını kontrol et.";
    case 401:
      return "E-posta veya parola hatalı.";
    case 403:
      return "Bu işlem şu an kapalı.";
    case 409:
      return "Bu e-posta zaten kayıtlı.";
    case 429:
      return retryAfter
        ? `Çok fazla deneme. ${retryAfter} sn sonra tekrar dene.`
        : "Çok fazla deneme. Biraz sonra tekrar dene.";
    case 503:
      return "Giriş özelliği bu ortamda kapalı.";
    default:
      return `İstek başarısız (HTTP ${status}).`;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

interface RawResponse {
  status: number;
  body: Record<string, unknown>;
}

/** Ham istek. 401'i HATA SAYMAZ — çağıran karar verir (bkz. dosya başı). */
async function call(path: string, init?: RequestInit): Promise<RawResponse> {
  let res: Response;
  try {
    res = await fetch(path, {
      // Varsayılan zaten same-origin; açıkça yazmak bağımlılığı görünür kılıyor
      // ve varsayılan değişirse sessizce bozulmasını engelliyor.
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
      ...init,
    });
  } catch {
    throw new AuthError(0, authErrorMessage(0));
  }
  const json: unknown = await res.json().catch(() => null);
  return { status: res.status, body: isRecord(json) ? json : {} };
}

function throwFrom(r: RawResponse): never {
  const header = typeof r.body.retryAfter === "number" ? r.body.retryAfter : null;
  const serverMessage = typeof r.body.error === "string" ? r.body.error : null;
  throw new AuthError(r.status, authErrorMessage(r.status, serverMessage, header), header);
}

function parseUser(raw: unknown): AuthUser | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  const email = typeof raw.email === "string" ? raw.email : "";
  if (!id || !email) return null;
  return { id, email, name: typeof raw.name === "string" && raw.name ? raw.name : null };
}

const parseCaps = (b: Record<string, unknown>): AuthCapabilities => ({
  signupAllowed: b.signupAllowed === true,
  googleEnabled: b.googleEnabled === true,
  isAdmin: b.isAdmin === true,
});

export interface MeResult {
  /** Sunucuda kimlik doğrulama KAPALI — kapı geçirgen davranmalı. */
  authDisabled: boolean;
  user: AuthUser | null;
  capabilities: AuthCapabilities;
}

/**
 * Oturum durumunu sorar. 401 bir HATA DEĞİL, "giriş yapılmamış" cevabıdır —
 * bu yüzden fırlatmaz. Yalnızca ağ/sunucu hatası fırlatır ki `AuthProvider`
 * "giriş ekranı göster" ile "sunucuya ulaşılamıyor"u ayırt edebilsin.
 */
export async function fetchMe(): Promise<MeResult> {
  const r = await call("/api/auth/me");
  if (r.status === 200 && r.body.authDisabled === true) {
    return { authDisabled: true, user: null, capabilities: { signupAllowed: false, googleEnabled: false, isAdmin: false } };
  }
  if (r.status === 200) {
    return { authDisabled: false, user: parseUser(r.body.user), capabilities: parseCaps(r.body) };
  }
  if (r.status === 401) {
    return { authDisabled: false, user: null, capabilities: parseCaps(r.body) };
  }
  return throwFrom(r);
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const r = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  if (r.status !== 200) throwFrom(r);
  const user = parseUser(r.body.user);
  if (!user) throw new AuthError(502, "Sunucu beklenmeyen bir yanıt döndürdü.");
  return user;
}

export async function register(email: string, password: string, name?: string): Promise<AuthUser> {
  const r = await call("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, ...(name ? { name } : {}) }),
  });
  if (r.status !== 201 && r.status !== 200) throwFrom(r);
  const user = parseUser(r.body.user);
  if (!user) throw new AuthError(502, "Sunucu beklenmeyen bir yanıt döndürdü.");
  return user;
}

export async function logout(): Promise<void> {
  // Başarısız olsa bile istemci tarafı çıkışı yapılır: kullanıcı "çıkış yap"
  // dediyse ekranda kalması daha kötü. Sunucudaki satır zaten silinmiş olur ya
  // da oturum süresi dolunca düşer.
  await call("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}

/** Google girişi bir `fetch` DEĞİL, ÜST SEVİYE NAVİGASYON olmak zorunda:
 *  tarayıcı Google'a gidip geri dönecek. */
export const GOOGLE_START_URL = "/api/auth/google/start";

/**
 * Google akışı başarısız olduğunda sunucu `/?auth_error=<kod>` ile geri
 * yönlendiriyor (ham JSON göstermemek için). Kodları kullanıcı diline çevirir.
 */
export function googleErrorMessage(code: string): string {
  switch (code) {
    case "access_denied":
      return "Google girişi iptal edildi.";
    case "oturum_suresi_doldu":
      return "Giriş çok uzun sürdü, tekrar dene.";
    case "state_uyusmadi":
    case "kod_yok":
      return "Google girişi doğrulanamadı, tekrar dene.";
    case "token_degisimi_basarisiz":
    case "jwks_alinamadi":
    case "token_dogrulanamadi":
      return "Google ile doğrulama başarısız oldu. Biraz sonra tekrar dene.";
    case "yeni_kayit_kapali":
      return "Bu Google hesabına bağlı bir kullanıcı yok ve yeni kayıtlar kapalı.";
    case "kayit_izinsiz":
      return "Bu e-posta kayıt için izinli değil.";
    case "hesap_baglanamadi":
      // En sık sebebi: Google e-postası doğrulanmamış ya da e-posta başka bir
      // Google hesabına bağlı. İkisini de ayırmıyoruz — ayırmak bilgi sızdırır.
      return "Bu Google hesabı mevcut bir hesaba bağlanamadı.";
    default:
      return "Google girişi tamamlanamadı.";
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const r = await call("/api/auth/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (r.status !== 200) throwFrom(r);
}

// --- "İzinli E-postalar" (yalnızca sahibin çağırabildiği uçlar) -----------------

export async function fetchAllowlist(): Promise<string[]> {
  const r = await call("/api/auth/admin/allowlist");
  if (r.status !== 200) throwFrom(r);
  return Array.isArray(r.body.emails) ? r.body.emails.filter((e): e is string => typeof e === "string") : [];
}

/** E-postayı listeye ekler; sunucunun NORMALİZE ettiği hâlini döner. */
export async function addAllowlistEmail(email: string): Promise<string> {
  const r = await call("/api/auth/admin/allowlist", { method: "POST", body: JSON.stringify({ email }) });
  if (r.status !== 201 && r.status !== 200) throwFrom(r);
  if (typeof r.body.email !== "string") throw new AuthError(502, "Sunucu beklenmeyen bir yanıt döndürdü.");
  return r.body.email;
}

export async function removeAllowlistEmail(email: string): Promise<void> {
  const r = await call("/api/auth/admin/allowlist", { method: "DELETE", body: JSON.stringify({ email }) });
  if (r.status !== 200) throwFrom(r);
}

// --- Hesap silme + veri dışa aktarma (KVKK m.7 / GDPR Art.17, Art.20) ---------

/**
 * Kullanıcının tüm verisini tarayıcı üzerinden JSON dosyası olarak indirir.
 * Sunucu JSON döner; istemci blob oluşturup click ile indirir. Bu modülün
 * 401'i HATA SAYMAMA kuralı burada da geçerli — arayan isterse kontrol eder.
 */
export async function exportAccount(): Promise<void> {
  const r = await call("/api/auth/account/export");
  if (r.status !== 200) throwFrom(r);
  const blob = new Blob([JSON.stringify(r.body, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nutrimind-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Hesap silme. OAuth-only kullanıcılar için `password` boş bırakılabilir;
 * e-posta+parola hesabı için ZORUNLU. `confirm` her zaman "DELETE" olmalı.
 * Başarıda sunucu çerezi temizler; arayan sayfayı navigate etmeli.
 */
export async function deleteAccount(opts: { password?: string; confirm: string }): Promise<void> {
  const r = await call("/api/auth/account", {
    method: "POST",
    body: JSON.stringify({ confirm: opts.confirm, ...(opts.password ? { password: opts.password } : {}) }),
  });
  if (r.status !== 200) throwFrom(r);
}

