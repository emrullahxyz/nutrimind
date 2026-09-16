import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "NUTRIMIND_LLM_PROVIDER",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_TIER2_MODEL",
  "GEMINI_TIER3_MODEL",
  "NVIDIA_NIM_API_KEY",
  "NVIDIA_NIM_MODEL",
  "NVIDIA_NIM_VISION_MODEL",
  "OPENCODE_API_KEY",
  "OPENCODE_MODEL",
  "NUTRIMIND_CONFIDENCE_THRESHOLD",
  "NUTRI_AI_RATE_PARSE",
  "NUTRI_AI_RATE_GEMINI_TIER2",
  "NUTRI_AI_RATE_GEMINI_TIER3",
  "NUTRI_AI_RATE_VISION",
  "NUTRI_AI_RATE_NIM",
  "NUTRI_AI_RATE_NIM_VISION",
  "NUTRI_AI_RATE_OPENCODE",
  "NUTRI_AI_TIMEOUT_MS",
  "NUTRI_AI_NIM_TIMEOUT_MS",
];

const envBackup = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    envBackup[k] = process.env[k];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
});

async function loadAi(env = {}) {
  vi.resetModules();
  for (const k of ENV_KEYS) {
    delete process.env[k];
  }
  Object.assign(process.env, env);
  const mod = await import("./ai.js");
  return mod.default ?? mod;
}

function makeGeminiOkResponse(
  items = [
    { name: "Elma", kcal: 50, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, confidence: 0.95 },
  ],
) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ items }) }],
            },
          },
        ],
      }),
  };
}

function makeNimOkResponse(
  items = [
    { name: "Elma", kcal: 50, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, confidence: 0.95 },
  ],
) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [
          {
            message: { content: JSON.stringify({ items }) },
          },
        ],
      }),
  };
}

function makeErrorResponse(status = 429) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ error: `HTTP ${status}` }),
  };
}

describe("AI fallback zinciri (server/ai.js)", () => {
  it("NUTRIMIND_LLM_PROVIDER=auto iken, mock fetch ilk çağrıda (Gemini tier1) 429 dönerse, ikinci çağrının (tier2, farklı model adıyla) yapıldığını doğrula", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeGeminiOkResponse());

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      GEMINI_MODEL: "gemini-flash-latest",
      GEMINI_TIER2_MODEL: "gemini-3.5-flash",
      NVIDIA_NIM_API_KEY: "test_nim_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain("gemini-flash-latest");
    expect(mockFetch.mock.calls[1][0]).toContain("gemini-3.5-flash");
  });

  it("Tier1/tier2/tier3 hepsi 429/502 dönerse, dördüncü çağrının NIM'e gittiğini doğrula", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(makeNimOkResponse());

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      NVIDIA_NIM_API_KEY: "test_nim_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[3][0]).toBe("https://integrate.api.nvidia.com/v1/chat/completions");

    const nimBody = JSON.parse(mockFetch.mock.calls[3][1].body);
    expect(nimBody.model).toBe("meta/llama-3.1-8b-instruct");
  });

  it("Tüm Gemini + NIM adımları başarısız olursa, metin zincirinde beşinci (son) çağrının OpenCode Zen'e gittiğini doğrula", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(makeNimOkResponse());

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      NVIDIA_NIM_API_KEY: "test_nim_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(mockFetch.mock.calls[4][0]).toBe("https://opencode.ai/zen/v1/chat/completions");
  });

  it("GEMINI_API_KEY yokken (env'den sil) ve auto modda, zincirin doğrudan NIM'den başladığını doğrula (Gemini'ye hiç istek atılmadığını)", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(makeNimOkResponse());

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "",
      NVIDIA_NIM_API_KEY: "test_nim_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
  });

  it("Hiçbir API key yokken (auto modda), parseMealText'in ağa hiç çıkmadan {status:500} döndüğünü doğrula", async () => {
    const mockFetch = vi.fn();

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "",
      NVIDIA_NIM_API_KEY: "",
      OPENCODE_API_KEY: "",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(0);
  });

  it("İlk denemede başarılı olursa (200), zincirin durduğunu ve ikinci bir çağrı yapılmadığını doğrula", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(makeGeminiOkResponse());

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      NVIDIA_NIM_API_KEY: "test_nim_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("LLM_PROVIDER=gemini (tekil zorlama modu) iken hâlâ sadece tier1 modeliyle tek istek atıldığını, zincire hiç girmediğini doğrula", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(makeErrorResponse(429));

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
      NVIDIA_NIM_API_KEY: "test_nim_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(502);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain("gemini-flash-latest");
  });

  it("parseMealImage için: tüm Gemini kademeleri başarısız olursa NIM Vision'a düştüğünü, ve bu çağrıda imageBase64'ün OpenAI image_url (data URI) şeklinde gönderildiğini doğrula", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(makeNimOkResponse());

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealImage } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      NVIDIA_NIM_API_KEY: "test_nim_key",
    });

    const res = await parseMealImage({
      imageBase64: "test_base64_data",
      mimeType: "image/jpeg",
      mode: "food_photo",
      aliases: [],
    });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[3][0]).toBe("https://integrate.api.nvidia.com/v1/chat/completions");

    const nimBody = JSON.parse(mockFetch.mock.calls[3][1].body);
    expect(nimBody.model).toBe("meta/llama-3.2-90b-vision-instruct");
    const userMessage = nimBody.messages[0];
    expect(Array.isArray(userMessage.content)).toBe(true);

    const imagePart = userMessage.content.find((part) => part.type === "image_url");
    expect(imagePart).toBeDefined();
    expect(imagePart.image_url.url).toBe("data:image/jpeg;base64,test_base64_data");
  });
});

describe("AI istem dili (server/ai.js `lang`)", () => {
  /** Gemini isteğinin gövdesinden prompt metnini çıkarır. */
  function promptOf(call) {
    const body = JSON.parse(call[1].body);
    return body.contents[0].parts[0].text;
  }

  it("lang=tr iken istem Türkçe ve 'Yanıtı Türkçe ver' talimatı içerir", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeGeminiOkResponse());
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
    });

    const res = await parseMealText({ text: "2 yumurta", aliases: [], lang: "tr" });
    expect(res.status).toBe(200);

    const prompt = promptOf(mockFetch.mock.calls[0]);
    expect(prompt).toContain("Sen bir beslenme uzmanısın");
    expect(prompt).toContain("Yanıtı Türkçe ver");
    expect(prompt).toContain("KULLANICININ GİRDİSİ");
    expect(prompt).toContain("2 yumurta");
  });

  it("lang=pl iken istem Lehçe üretilir", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeGeminiOkResponse());
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
    });

    const res = await parseMealText({ text: "2 jajka", aliases: [], lang: "pl" });
    expect(res.status).toBe(200);

    const prompt = promptOf(mockFetch.mock.calls[0]);
    expect(prompt).toContain("ekspertem ds. żywienia");
    expect(prompt).toContain("Odpowiedz w języku polskim");
  });

  it("lang verilmezse (ya da tanınmıyorsa) İngilizce'ye düşer — varsayılan uygulama dili", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeGeminiOkResponse());
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
    });

    const noLang = await parseMealText({ text: "2 eggs", aliases: [] });
    expect(noLang.status).toBe(200);
    expect(promptOf(mockFetch.mock.calls[0])).toContain("Answer in English");

    const bogus = await parseMealText({ text: "2 eggs", aliases: [], lang: "de-DE" });
    expect(bogus.status).toBe(200);
    expect(promptOf(mockFetch.mock.calls[1])).toContain("Answer in English");
  });

  it("besin hafızası satırları da istem diliyle yazılır (karışık dil yok)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeGeminiOkResponse());
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
    });

    await parseMealText({
      text: "1 scoop",
      aliases: [
        {
          name: "Whey",
          serving_g: 30,
          nutrition: { kcal: 120, protein: 24, carbs: 3, fat: 1.5, fiber: 0 },
          triggers: ["protein tozu"],
        },
      ],
      lang: "en",
    });

    const prompt = promptOf(mockFetch.mock.calls[0]);
    expect(prompt).toContain("USER'S FOOD MEMORY");
    expect(prompt).toContain("g protein");
    expect(prompt).not.toContain("KULLANICININ BESİN HAFIZASI");
    expect(prompt).not.toContain("karbonhidrat");
  });

  it("görsel istemi de `lang` alır (etiket modu)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeGeminiOkResponse());
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealImage } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
    });

    const res = await parseMealImage({
      imageBase64: "x",
      mimeType: "image/jpeg",
      mode: "food_label",
      aliases: [],
      lang: "pl",
    });
    expect(res.status).toBe(200);
    expect(promptOf(mockFetch.mock.calls[0])).toContain("Odpowiedz w języku polskim");
  });
});

describe("etiket tabanı (baseAmount) — canlıdan depoya taşındı", () => {
  /** Gemini isteğinin gövdesinden prompt metnini çıkarır (kendi kopyamız:
   *  üstteki bloktaki yardımcı o describe'un içindedir). */
  function geminiPromptOf(call) {
    return JSON.parse(call[1].body).contents[0].parts[0].text;
  }

  it("etiket istemi baseAmount alanını ve kuralını içerir (üç dilde)", async () => {
    const { parseMealImage } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
    });

    for (const [lang, needle] of [
      ["tr", "baseAmount"],
      ["en", "baseAmount"],
      ["pl", "baseAmount"],
    ]) {
      const mockFetch = vi.fn().mockResolvedValue(makeGeminiOkResponse());
      vi.stubGlobal("fetch", mockFetch);
      const res = await parseMealImage({
        imageBase64: "x",
        mimeType: "image/jpeg",
        mode: "food_label",
        aliases: [],
        lang,
      });
      expect(res.status).toBe(200);
      const prompt = geminiPromptOf(mockFetch.mock.calls[0]);
      expect(prompt).toContain(needle);
      expect(prompt).toMatch(/100\s?g/);
      vi.unstubAllGlobals();
    }
  });

  it("NIM/OpenCode JSON talimatı da istem dilini izler (Türkçe talimat sızmaz)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeNimOkResponse());
    vi.stubGlobal("fetch", mockFetch);

    // GEMINI key'i YOK: zincir doğrudan NIM'e düşer ve JSON talimatı oraya gider.
    // `""` şart — `.env`'deki gerçek anahtar aksi hâlde devreye girip testi
    // Gemini yoluna kaydırır (bkz. yukarıdaki "GEMINI_API_KEY yokken" testi).
    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "",
      NVIDIA_NIM_API_KEY: "test_nim_key",
    });

    const res = await parseMealText({ text: "2 eggs", aliases: [], lang: "en" });
    expect(res.status).toBe(200);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const prompt = body.messages[0].content;
    expect(prompt).toContain("Reply ONLY with JSON");
    expect(prompt).toContain('"baseAmount":number');
    expect(prompt).not.toContain("SADECE aşağıdaki JSON");
  });

  it("yanıttaki baseAmount yalnızca POZİTİF ve sonlu geldiğinde taşınır", async () => {
    const cases = [
      { raw: 100, expected: 100 },
      { raw: 30, expected: 30 },
      { raw: 0, expected: undefined },
      { raw: -5, expected: undefined },
      { raw: "100", expected: undefined },
      { raw: undefined, expected: undefined },
    ];

    for (const c of cases) {
      const item = {
        name: "Ürün (100g)",
        kcal: 250,
        protein: 10,
        carbs: 30,
        fat: 8,
        fiber: 3,
        confidence: 0.9,
      };
      if (c.raw !== undefined) item.baseAmount = c.raw;
      const mockFetch = vi.fn().mockResolvedValue(makeGeminiOkResponse([item]));
      vi.stubGlobal("fetch", mockFetch);

      const { parseMealText } = await loadAi({
        NUTRIMIND_LLM_PROVIDER: "gemini",
        GEMINI_API_KEY: "test_gemini_key",
      });
      const res = await parseMealText({ text: "ürün", aliases: [], lang: "tr" });
      expect(res.status).toBe(200);
      expect(res.body.items[0].baseAmount).toBe(c.expected);
      vi.unstubAllGlobals();
    }
  });
});

describe("AI gözlem katmanı (server/aiLog.js kayıtları)", () => {
  it("başarılı zincir çağrısı tek kayıt bırakır: provider, model, endpoint ve latency dolu", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeGeminiOkResponse());
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText, aiLog } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      NVIDIA_NIM_API_KEY: "test_nim_key",
    });
    aiLog.reset();

    const res = await parseMealText({ text: "1 elma", aliases: [] });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const snap = aiLog.snapshot();
    expect(snap.ok).toBe(true);
    expect(snap.entries).toHaveLength(1);
    const e = snap.entries[0];
    expect(e.status).toBe(200);
    expect(e.provider).toBe("gemini-tier1");
    expect(e.endpoint).toBe("parse");
    expect(e.model).toBe("gemini-flash-latest");
    expect(e.latencyMs).toBeGreaterThanOrEqual(0);
    expect(e.code).toBeNull();

    const by = Object.fromEntries(snap.providers.map((p) => [p.provider, p]));
    expect(by["gemini-tier1"]).toMatchObject({ calls: 1, ok: 1, errors: 0 });
  });

  it("kova reddi (429): ai_rate_limit kaydı retryAfter taşır, ağa çıkılmaz, console'a '[ai]' satırı düşer", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText, aiLog } = await loadAi({
      // Zorlanmış "gemini" modu: zincir yok, tek adım. "auto" olsaydı kova
      // reddinden SONRA tier2'ye devam eder ve SON adımın sonucu dönardı.
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
      NUTRI_AI_RATE_PARSE: "0.5", // kova yarım jetonla doğar → ilk istek reddedilir
    });
    aiLog.reset();

    const res = await parseMealText({ text: "1 elma", aliases: [] });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("ai_rate_limit");
    expect(mockFetch).toHaveBeenCalledTimes(0);

    const e = aiLog.snapshot().entries[0];
    expect(e.status).toBe(429);
    expect(e.code).toBe("ai_rate_limit");
    expect(e.retryAfter).toBeGreaterThanOrEqual(1);
    expect(e.provider).toBe("gemini-tier1");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0];
    expect(line.startsWith("[ai] ")).toBe(true);
    expect(JSON.parse(line.slice("[ai] ".length))).toMatchObject({
      provider: "gemini-tier1",
      status: 429,
      code: "ai_rate_limit",
    });
  });

  it("zincir tükendiğinde (hepsi 502) beş adım da kronolojik kaydedilir; son adım opencode olur", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(makeErrorResponse(502));
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText, aiLog } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      NVIDIA_NIM_API_KEY: "test_nim_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });
    aiLog.reset();

    const res = await parseMealText({ text: "1 elma", aliases: [] });
    expect(res.status).toBe(502);
    expect(mockFetch).toHaveBeenCalledTimes(5);

    const snap = aiLog.snapshot();
    // snapshot en yenisi önce verir → kronolojik sıra için reverse.
    const providers = snap.entries.map((e) => e.provider).reverse();
    expect(providers).toEqual([
      "gemini-tier1",
      "gemini-tier2",
      "gemini-tier3",
      "nim",
      "opencode",
    ]);
    for (const e of snap.entries) {
      expect(e.status).toBe(502); // upstream kodu kayıtta aynen saklanır
      expect(e.code).toBe("ai_provider_error");
    }
    const by = Object.fromEntries(snap.providers.map((p) => [p.provider, p]));
    expect(by["opencode"]).toMatchObject({ calls: 1, ok: 0, errors: 1 });
  });

  it("vision akışı kayıtları 'vision' endpoint'i taşır; düşüş nim-vision'a başarıyla gider", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(makeNimOkResponse());
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealImage, aiLog } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      NVIDIA_NIM_API_KEY: "test_nim_key",
    });
    aiLog.reset();

    const res = await parseMealImage({
      imageBase64: "test_base64_data",
      mimeType: "image/jpeg",
      mode: "food_photo",
      aliases: [],
    });
    expect(res.status).toBe(200);

    const snap = aiLog.snapshot();
    expect(snap.entries).toHaveLength(4);
    expect(snap.entries.every((e) => e.endpoint === "vision")).toBe(true);
    // en yeni (nim-vision) başarılı:
    expect(snap.entries[0]).toMatchObject({ provider: "nim-vision", status: 200 });
    const providers = snap.entries.map((e) => e.provider).reverse();
    expect(providers).toEqual(["gemini-tier1", "gemini-tier2", "gemini-tier3", "nim-vision"]);
  });

  it("snapshot kova doluluklarını verir; tier2/tier3'ün metin+vision paylaşımlı olduğu adlarından okunur", async () => {
    const { aiLog } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
    });

    const snap = aiLog.snapshot();
    const names = snap.buckets.map((b) => b.name);
    expect(names).toContain("gemini-tier1-text");
    expect(names).toContain("gemini-tier2");
    expect(names).toContain("gemini-tier3");
    expect(names).toContain("vision");
    expect(names).toContain("nim");
    expect(names).toContain("nim-vision");
    expect(names).toContain("opencode");
    for (const b of snap.buckets) {
      expect(b.tokens).toBeGreaterThanOrEqual(0);
      expect(b.tokens).toBeLessThanOrEqual(b.cap);
      expect(b.fill).toBeLessThanOrEqual(1);
    }
  });
});
