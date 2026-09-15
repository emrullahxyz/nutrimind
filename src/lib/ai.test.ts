import { afterEach, describe, expect, it, vi } from "vitest";
import { AiError, aiErrorMessage, parseWithAI } from "./ai";
import i18n from "../i18n/i18n";

/** Mesajlar artık sabit değil, AKTİF DİLDE üretilir; testler de dili i18n'e
 *  sorar (bkz. tasks/lessons.md L22). */
const t = i18n.t.bind(i18n);

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchOnce(status: number, body: unknown, headers: Record<string, string> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => headers[k] ?? null },
      json: async () => body,
    }),
  );
}

describe("aiErrorMessage", () => {
  it("429'da retryAfter'ı mesaja gömer (aktif dilde)", () => {
    expect(aiErrorMessage(429, null, 12)).toBe(t("ai.err.rateLimitSeconds", { seconds: 12 }));
  });
  it("503'te devre dışı mesajı döner (aktif dilde)", () => {
    expect(aiErrorMessage(503)).toBe(t("ai.err.disabled"));
  });
  it("sunucunun `code` alanı varsa metin ona göre seçilir", () => {
    expect(aiErrorMessage(400, "text gerekli", null, "ai_bad_request")).toBe(t("ai.err.badRequest"));
    expect(aiErrorMessage(502, null, null, "ai_bad_response")).toBe(t("ai.err.badResponse"));
    expect(aiErrorMessage(500, null, null, "ai_not_configured")).toBe(t("ai.err.disabled"));
  });
  it("tanınmayan kodda sunucu mesajını kullanır", () => {
    expect(aiErrorMessage(400, "text gerekli")).toBe("text gerekli");
  });
});

describe("parseWithAI", () => {
  it("geçerli item'ları döner, confidence/needsReview korunur", async () => {
    mockFetchOnce(200, {
      items: [
        {
          name: "Tavuk Göğsü (200g)",
          nutrition: { kcal: 330, protein: 62, carbs: 0, fat: 7, fiber: 0 },
          confidence: 0.9,
        },
        {
          name: "Belirsiz Yemek",
          nutrition: { kcal: 100, protein: 5, carbs: 10, fat: 2, fiber: 1 },
          confidence: 0.4,
          needsReview: true,
        },
      ],
    });
    const result = await parseWithAI("200g tavuk göğsü");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe("Tavuk Göğsü (200g)");
    expect(result.items[0].confidence).toBe(0.9);
    expect(result.items[1].needsReview).toBe(true);
  });

  it("eksik makrolu item'ı sessizce eler", async () => {
    mockFetchOnce(200, { items: [{ name: "Bilinmeyen", nutrition: { kcal: 100 } }] });
    const result = await parseWithAI("bir şey");
    expect(result.items).toHaveLength(0);
  });

  it("adsız item'ı eler", async () => {
    mockFetchOnce(200, { items: [{ nutrition: { kcal: 100, protein: 1, carbs: 1, fat: 1, fiber: 1 } }] });
    const result = await parseWithAI("bir şey");
    expect(result.items).toHaveLength(0);
  });

  it("429'da AiError fırlatır, retryAfter taşır", async () => {
    mockFetchOnce(429, { error: "hız sınırı", retryAfter: 5 });
    await expect(parseWithAI("x")).rejects.toBeInstanceOf(AiError);
    try {
      await parseWithAI("x");
      throw new Error("beklenmedik: hata fırlatmadı");
    } catch (e) {
      expect(e).toBeInstanceOf(AiError);
      expect((e as AiError).status).toBe(429);
      expect((e as AiError).retryAfter).toBe(5);
    }
  });

  it("502'de AiError fırlatır", async () => {
    mockFetchOnce(502, { error: "AI servisi hatası" });
    await expect(parseWithAI("x")).rejects.toBeInstanceOf(AiError);
  });

  it("çevrimdışıysa isteği hiç açmaz, AiError(0) fırlatır", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const err = await parseWithAI("2 yumurta").catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).status).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
