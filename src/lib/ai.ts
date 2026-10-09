// ============================================================================
// Nutrimind — Gemini AI proxy istemcisi (Faz 2: doğal dil öğün ayrıştırma).
//
// `src/lib/off.ts` ile aynı desen: kendi hata sınıfı + kendi fetch sarmalayıcısı,
// `api.ts`'in `mutate()`'inden bağımsız (bu bir "mutate" değil, bir "hesapla").
// ============================================================================
import type { AIParseItem, AIParseResult, Nutrition, VisionMode } from "../types";
import { signalUnauthorizedFromApi } from "./api";
import { isBrowserOffline } from "./netStatus";
import { CLIENT_AI_TIMEOUT_MS, withDeadline } from "./aiDeadline";
import i18n from "../i18n/i18n";

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

/** Durum koduna göre arayüz metni — aktif dilde (i18n, toast/inline hata olarak
 *  gösterilir; sabit metin olamaz). Sunucunun kendi mesajı yalnızca tanınmayan
 *  durumlarda son çare olarak kullanılır. */
export function aiErrorMessage(
  status: number,
  serverMessage?: string | null,
  retryAfter?: number | null,
  code?: string | null,
): string {
  // Sunucu kararlı bir `code` gönderiyorsa metin ona göre seçilir: sunucu
  // gövdesi İngilizce/teknik, kullanıcıya giden metin aktif dilde olmalı.
  switch (code) {
    case "ai_disabled":
    case "ai_not_configured":
      return i18n.t("ai.err.disabled");
    case "ai_rate_limit":
      return retryAfter
        ? i18n.t("ai.err.rateLimitSeconds", { seconds: retryAfter })
        : i18n.t("ai.err.rateLimit");
    case "ai_timeout":
      return i18n.t("ai.err.timeout");
    case "ai_unreachable":
      return i18n.t("ai.err.network");
    case "ai_bad_response":
    case "ai_provider_error":
      return i18n.t("ai.err.badResponse");
    case "ai_bad_request":
      return i18n.t("ai.err.badRequest");
    default:
      break;
  }

  switch (status) {
    case 0:
      return i18n.t("ai.err.network");
    case 429:
      return retryAfter
        ? i18n.t("ai.err.rateLimitSeconds", { seconds: retryAfter })
        : i18n.t("ai.err.rateLimit");
    case 502:
      return i18n.t("ai.err.badResponse");
    case 503:
      return i18n.t("ai.err.disabled");
    case 504:
      return i18n.t("ai.err.timeout");
    default:
      return serverMessage?.trim() || i18n.t("ai.err.http", { status });
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Sunucu prompt'u ve yanıt dili uygulamanın aktif dilini izler (`server/ai.js`).
 *  Desteklenmeyen bir değer sunucuda "en"e düşer. */
function activeLang(): string {
  return i18n.resolvedLanguage || i18n.language || "en";
}

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
  // `baseAmount`: besin değerlerinin dayandığı miktar (etikette "100g başına"
  // yazıyorsa 100, "30g'lik 1 porsiyon" yazıyorsa 30). Sunucu YALNIZCA pozitif
  // ve sonlu geldiğinde gönderiyor (`server/ai.js`), ama aynı kör güvenmeme
  // ilkesiyle burada da doğrulanır: sıfır/NaN taşımak "miktarım 0" anlamına
  // gelirdi, oysa model etiket okumadığında alan boş gelir.
  if (isFiniteNum(raw.baseAmount) && (raw.baseAmount as number) > 0) {
    item.baseAmount = raw.baseAmount as number;
  }
  return item;
}

async function aiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  // Savunma katmanı: UI zaten çevrimdışıda butonları kilitler (bkz. ScanSheet);
  // yine de doğrudan çağrıda boşuna istek açma — hemen anlaşılır hata ver.
  if (isBrowserOffline()) throw new AiError(0, aiErrorMessage(0));

  // Zaman sınırı + kullanıcı iptali TEK sinyalde birleşir ama AYIRT EDİLİR:
  // iptal sessizce yutulur (ScanSheet AbortError'ı "kullanıcı vazgeçti" sayar),
  // süre aşımı ise kullanıcıya söylenir. Eskiden istemcide HİÇ sınır yoktu:
  // ağ askıda kalırsa ekran sonsuza dek "Analiz ediliyor…" gösteriyordu.
  const deadline = withDeadline(signal, CLIENT_AI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: deadline.signal,
    });
  } catch (e) {
    if ((e as Error | undefined)?.name === "AbortError") {
      if (deadline.timedOut()) {
        throw new AiError(504, aiErrorMessage(504, null, null, "ai_timeout"));
      }
      throw e; // kullanıcı iptal etti
    }
    throw new AiError(0, aiErrorMessage(0));
  } finally {
    deadline.release();
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
    const retryAfter =
      Number.isFinite(header) && header > 0 ? header : Number.isFinite(fromBody) ? fromBody : null;
    const serverMessage = typeof b.error === "string" ? b.error : null;
    const code = typeof b.code === "string" ? b.code : null;
    throw new AiError(
      res.status,
      aiErrorMessage(res.status, serverMessage, retryAfter, code),
      retryAfter,
    );
  }

  return json as T;
}

/** Serbest metni Gemini'ye gönderir, yapısal besin öğelerine çevirir. */
export async function parseWithAI(text: string, signal?: AbortSignal): Promise<AIParseResult> {
  const raw = await aiPost<{ items?: unknown[] }>(
    "/api/ai/parse",
    { text, lang: activeLang() },
    signal,
  );
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
  const raw = await aiPost<{ items?: unknown[]; healthNote?: string }>(
    "/api/ai/vision",
    { image: base64, mimeType, mode, lang: activeLang() },
    signal,
  );
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
