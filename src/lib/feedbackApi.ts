// ============================================================================
// Nutrimind — uygulama-içi geri bildirim (Task 5: istemci).
//
// `ai.ts`'in `aiPost` deseniyle aynı aile: kendi hata sınıfı + kendi fetch
// sarmalayıcısı; `api.ts`'in `mutate()`'inden ayrı (feedback tek seferlik bir
// "yazma", senkron motorunun parçası değil). 401 burada da `api.ts` ile AYNI
// sinyali kullanıyor ki oturum düşen kullanıcı giriş ekranına düşsün.
//
// İleri kullanım (Task 6 — admin gelen kutusu): `GET /api/feedback` +
// `PATCH /api/feedback/:id` — `fetchFeedback` + `setFeedbackRead` burada.
// ============================================================================
import { signalUnauthorizedFromApi } from "./api";
import { isBrowserOffline } from "./netStatus";

export type FeedbackCategory = "feature" | "bug" | "other";

export class FeedbackError extends Error {
  readonly status: number;
  readonly retryAfter: number | null;
  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "FeedbackError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Durum koduna göre arayüz metni; sunucu kendi mesajını verirse o öncelikli. */
export function feedbackErrorMessage(
  status: number,
  serverMessage?: string | null,
  retryAfter?: number | null,
): string {
  if (serverMessage && serverMessage.trim()) return serverMessage.trim();
  switch (status) {
    case 0:
      return "Sunucuya ulaşılamadı — bağlantını kontrol et.";
    case 400:
      return "Geçersiz gönderim. Mesajın 10-4000 karakter arasında olduğundan emin ol.";
    case 401:
      return "Oturumun sona erdi — tekrar giriş yap.";
    case 429:
      return retryAfter
        ? `Çok fazla istek. ${retryAfter} sn sonra tekrar dene.`
        : "Çok fazla istek. Biraz sonra tekrar dene.";
    case 503:
      return "Geri bildirim özelliği bu ortamda kapalı.";
    default:
      return `İstek başarısız (HTTP ${status}).`;
  }
}

export interface SubmitFeedbackPayload {
  category: FeedbackCategory;
  message: string;
  name?: string | null;
  app_version?: string | null;
}

/** Geri bildirim/özellik isteği gönderir. 0 = ağ hatası; 401 oturum düşmesi sinyali. */
export async function submitFeedback(
  payload: SubmitFeedbackPayload,
): Promise<{ ok: true; id: string }> {
  if (isBrowserOffline()) throw new FeedbackError(0, feedbackErrorMessage(0));
  let res: Response;
  try {
    res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
  } catch {
    throw new FeedbackError(0, feedbackErrorMessage(0));
  }
  if (res.status === 401) throw new FeedbackError(401, signalUnauthorizedFromApi());
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const body = (typeof json === "object" && json !== null ? json : {}) as {
      error?: string;
      retryAfter?: number;
    };
    const serverMessage = typeof body.error === "string" ? body.error : null;
    const retryAfter = typeof body.retryAfter === "number" ? body.retryAfter : null;
    throw new FeedbackError(
      res.status,
      feedbackErrorMessage(res.status, serverMessage, retryAfter),
      retryAfter,
    );
  }
  return json as { ok: true; id: string };
}

export interface FeedbackItem {
  id: string;
  category: FeedbackCategory;
  message: string;
  user_name: string | null;
  user_email: string | null;
  app_version: string | null;
  created_at: string;
  read: boolean;
}

/** Sahibe özel: geri bildirim listesi (yeni önce). */
export async function fetchFeedback(): Promise<FeedbackItem[]> {
  if (isBrowserOffline()) throw new FeedbackError(0, feedbackErrorMessage(0));
  let res: Response;
  try {
    res = await fetch("/api/feedback", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
  } catch {
    throw new FeedbackError(0, feedbackErrorMessage(0));
  }
  if (res.status === 401) throw new FeedbackError(401, signalUnauthorizedFromApi());
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const body = (typeof json === "object" && json !== null ? json : {}) as {
      error?: string;
      retryAfter?: number;
    };
    const serverMessage = typeof body.error === "string" ? body.error : null;
    const retryAfter = typeof body.retryAfter === "number" ? body.retryAfter : null;
    throw new FeedbackError(
      res.status,
      feedbackErrorMessage(res.status, serverMessage, retryAfter),
      retryAfter,
    );
  }
  const items = (json as { items?: unknown }).items;
  return Array.isArray(items) ? (items as FeedbackItem[]) : [];
}

/** Sahibe özel: okundu durumunu değiştirir. */
export async function setFeedbackRead(id: string, read: boolean): Promise<void> {
  if (isBrowserOffline()) throw new FeedbackError(0, feedbackErrorMessage(0));
  let res: Response;
  try {
    res = await fetch(`/api/feedback/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ read }),
    });
  } catch {
    throw new FeedbackError(0, feedbackErrorMessage(0));
  }
  if (res.status === 401) throw new FeedbackError(401, signalUnauthorizedFromApi());
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const body = (typeof json === "object" && json !== null ? json : {}) as {
      error?: string;
      retryAfter?: number;
    };
    const serverMessage = typeof body.error === "string" ? body.error : null;
    const retryAfter = typeof body.retryAfter === "number" ? body.retryAfter : null;
    throw new FeedbackError(
      res.status,
      feedbackErrorMessage(res.status, serverMessage, retryAfter),
      retryAfter,
    );
  }
}
