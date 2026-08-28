// ============================================================================
// Nutrimind — Gemini AI proxy istemcisi (Faz 2: doğal dil öğün ayrıştırma).
//
// `src/lib/off.ts` ile aynı desen: kendi hata sınıfı + kendi fetch sarmalayıcısı,
// `api.ts`'in `mutate()`'inden bağımsız (bu bir "mutate" değil, bir "hesapla").
// ============================================================================
import type { AIParseItem, AIParseResult, Nutrition, VisionMode } from "../types";
import { signalUnauthorizedFromApi } from "./api";
import { isBrowserOffline } from "./netStatus";

/** Proxy'den dönen hata. `status` HTTP kodudur (0 = ağa hiç çıkılamadı),
 *  `retryAfter` yalnızca 429'da doludur (saniye). */
export class AiError extends Error {
  readonly status: number;
  readonly retryAfter: number | null;
  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "AiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Durum koduna göre arayüz metni. */
export function aiErrorMessage(status: number, serverMessage?: string | null, retryAfter?: number | null): string {
  switch (status) {
    case 0:
      return "Sunucuya ulaşılamadı — bağlantını kontrol et.";
    case 429:
      return retryAfter
        ? `Çok hızlı istek yapıldı. ${retryAfter} sn sonra tekrar dene.`
        : "Çok hızlı istek yapıldı. Biraz sonra tekrar dene.";
    case 502:
      return "AI servisi şu an düzgün yanıt vermiyor. Biraz sonra tekrar dene.";
    case 503:
      return "AI özelliği bu ortamda kapalı.";
    case 504:
      return "AI servisi zaman aşımına uğradı. Biraz sonra tekrar dene.";
    default:
      return serverMessage?.trim() || `AI isteği başarısız (HTTP ${status}).`;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Sunucu tarafı zaten doğruluyor, ama kendi sunucumuzla aramızdaki ağ
 *  sıçramasına bile kör güvenilmez (`off.ts`/`api.ts`'in kurduğu ilke). */
function parseAIItem(raw: unknown): AIParseItem | null {
  if (!isRecord(raw)) return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;

  const n = isRecord(raw.nutrition) ? raw.nutrition : null;
  if (!n) return null;
  if (![n.kcal, n.protein, n.carbs, n.fat, n.fiber].every(isFiniteNum)) return null;

  const nutrition: Nutrition = {
    kcal: n.kcal as number,
    protein: n.protein as number,
    carbs: n.carbs as number,
    fat: n.fat as number,
    fiber: n.fiber as number,
  };

  const item: AIParseItem = { name, nutrition };
  if (isFiniteNum(raw.confidence)) item.confidence = Math.max(0, Math.min(1, raw.confidence));
  if (raw.needsReview === true) item.needsReview = true;
  return item;
}

async function aiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  // Savunma katmanı: UI zaten çevrimdışıda butonları kilitler (bkz. ScanSheet);
  // yine de doğrudan çağrıda boşuna istek açma — hemen anlaşılır hata ver.
  if (isBrowserOffline()) throw new AiError(0, aiErrorMessage(0));
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error | undefined)?.name === "AbortError") throw e;
    throw new AiError(0, aiErrorMessage(0));
  }

  // Oturum düştüyse bu bir "AI hatası" değil — `api.ts` ile AYNI sinyali
  // kullanıyoruz ki kullanıcı "AI servisi yanıt vermiyor" yerine giriş
  // ekranına düşsün.
  if (res.status === 401) throw new AiError(401, signalUnauthorizedFromApi());

  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const b = isRecord(json) ? json : {};
    const header = Number(res.headers.get("Retry-After"));
    const fromBody = typeof b.retryAfter === "number" ? b.retryAfter : NaN;
    const retryAfter = Number.isFinite(header) && header > 0 ? header : Number.isFinite(fromBody) ? fromBody : null;
    const serverMessage = typeof b.error === "string" ? b.error : null;
    throw new AiError(res.status, aiErrorMessage(res.status, serverMessage, retryAfter), retryAfter);
  }

  return json as T;
}

/** Serbest metni Gemini'ye gönderir, yapısal besin öğelerine çevirir. */
export async function parseWithAI(text: string, signal?: AbortSignal): Promise<AIParseResult> {
  const raw = await aiPost<{ items?: unknown[] }>("/api/ai/parse", { text }, signal);
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const items = rawItems.map(parseAIItem).filter((x): x is AIParseItem => x !== null);
  return { items };
}

/** Bir görseli (kameradan yakalanmış kare ya da galeriden seçilmiş dosya) besin
 *  öğelerine çevirir. `healthNote`, öğe çıkmadığında kullanıcıya gösterilecek
 *  anlamlı açıklamayı taşır — genel bir hata metninden çok daha iyi. */
export async function parseMealImage(
  base64: string,
  mimeType: string,
  mode: VisionMode,
  signal?: AbortSignal,
): Promise<AIParseResult> {
  if (!hasAiConsent()) throw new Error("AI_CONSENT_REQUIRED");
  const raw = await aiPost<{ items?: unknown[]; healthNote?: string }>("/api/ai/vision", { image: base64, mimeType, mode }, signal);
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const items = rawItems.map(parseAIItem).filter((x): x is AIParseItem => x !== null);
  const healthNote = typeof raw?.healthNote === "string" ? raw.healthNote : undefined;
  return { items, ...(healthNote ? { healthNote } : {}) };
}

// --- Onay (Play Store 'Data safety' + KVKK fotoğraf gönderimi uyarısı) ---------

const CONSENT_KEY = "nutrimind.ai.consent";

export function hasAiConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function grantAiConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, "1");
  } catch {
    // private mode / kapalı storage → sessizce yok say; sonraki denemede tekrar sor
  }
}

export function revokeAiConsent(): void {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {}
}

