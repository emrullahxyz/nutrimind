import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "NUTRIMIND_LLM_PROVIDER",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_TIER2_MODEL",
  "GEMINI_TIER3_MODEL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "OPENCODE_API_KEY",
  "OPENCODE_MODEL",
  "OLLAMA_CLOUD_API_KEY",
  "OLLAMA_CLOUD_MODEL",
  "CLAUDEFLARE_API_KEY",
  "CLAUDEFLARE_ACCOUNT_ID",
  "CLAUDEFLARE_MODEL",
  "NUTRIMIND_CONFIDENCE_THRESHOLD",
  "NUTRI_AI_RATE_PARSE",
  "NUTRI_AI_RATE_GEMINI_TIER2",
  "NUTRI_AI_RATE_GEMINI_TIER3",
  "NUTRI_AI_RATE_VISION",
  "NUTRI_AI_RATE_OPENCODE",
  "NUTRI_AI_RATE_OPENROUTER",
  "NUTRI_AI_RATE_OLLAMA",
  "NUTRI_AI_RATE_CLAUDEFLARE",
  "NUTRI_AI_TIMEOUT_MS",
  "NUTRI_AI_FALLBACK_TIMEOUT_MS",
  // 2026-09-21: bütçe/devre kesici/model keşfi anahtarları da testler arasında
  // SIFIRLANIR (yoksa bir testin bıraktığı durum diğerini sessizce etkiler).
  "NUTRI_AI_API_WINDOW_MS",
  "NUTRI_AI_BUDGET_MS",
  "NUTRI_AI_MIN_STEP_MS",
  "NUTRI_AI_VENDOR_5XX_STREAK",
  "NUTRI_AI_BREAKER_MS",
  "NUTRI_AI_BREAKER_TIMEOUTS",
  "NUTRI_AI_BREAKER_PROVIDER_ERRORS",
  "NUTRI_AI_AUTOMODEL",
  "NUTRI_AI_MODEL_TTL_MS",
  "NUTRI_AI_MODEL_NEGATIVE_TTL_MS",
  "NUTRI_AI_DISCOVER_BUDGET_MS",
  "NUTRI_AI_PROBE_TIMEOUT_MS",
  "NUTRI_AI_MAX_PROBES",
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
  const ai = mod.default ?? mod;
  // DURUM SIFIRLAMA (2026-09-21): ai.js'e `require` ile bağlanan aiLog/aiHealth/
  // aiModels modülleri vi.resetModules() ile GARANTİ yeniden çalışmaz — devre
  // kesici "açık" ya da model önbelleği dolu kalırsa sonraki test sessizce
  // farklı sonuç verir (bu tam olarak bir kez yaşandı: bir test 502 alırken
  // tek başına 504 veriyordu). Bu yüzden her yüklemede durum açıkça temizlenir.
  ai.aiLog?.reset?.();
  ai.aiHealth?.reset?.();
  ai.aiModels?.reset?.();
  return ai;
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

/** OpenAI-uyumlu `/chat/completions` yanıtı — OpenRouter + Cloudflare'ı kapsar. */
function makeOaiOkResponse(
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

/** Ollama Cloud native `/api/chat` yanıtı — `message.content` alanı taşır. */
function makeOllamaOkResponse(
  items = [
    { name: "Elma", kcal: 50, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, confidence: 0.95 },
  ],
) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        message: { content: JSON.stringify({ items }) },
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
  it("NUTRIMIND_LLM_PROVIDER=auto iken, mock fetch ilk çağrıda (gemini-tier1) 429 dönerse, ikinci çağrının (gemini-tier2, farklı modelle) yapıldığını doğrula", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeGeminiOkResponse());

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      OPENROUTER_API_KEY: "test_openrouter_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain("generativelanguage.googleapis.com");
    expect(mockFetch.mock.calls[1][0]).toContain("generativelanguage.googleapis.com");
  });

  it("gemini kademeleri 429 verirse (kova değil, sağlayıcının HTTP yanıtı) hepsi denenir ve opencode'a düşülür", async () => {
    // isVendorFailure 429'u SAYMAZ (upstream>=500 değil) → gemini vendor streak'i
    // her 429'da sıfırlanır, tier3 de denenir. opencode 4. çağrıdır.
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(429)) // gemini-tier1
      .mockResolvedValueOnce(makeErrorResponse(429)) // gemini-tier2
      .mockResolvedValueOnce(makeErrorResponse(429)) // gemini-tier3
      .mockResolvedValueOnce(makeOaiOkResponse()); // opencode

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      OPENROUTER_API_KEY: "test_openrouter_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[3][0]).toContain("opencode.ai");
  });

  it("tüm adımlar başarısız olursa, metin zincirinde son adım Cloudflare'e gider", async () => {
    // Gemini tier3, t1+t2'nin art arda 5xx'i (VENDOR_5XX_STREAK) yüzünden
    // atlanır → cloudflare 6. çağrıdır. Yeni sıra: gemini t1/t2 → opencode →
    // ollama → openrouter → cloudflare.
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(502)) // gemini-tier1
      .mockResolvedValueOnce(makeErrorResponse(502)) // gemini-tier2
      .mockResolvedValueOnce(makeErrorResponse(429)) // opencode (farklı vendor — denenir)
      .mockResolvedValueOnce(makeErrorResponse(429)) // ollama
      .mockResolvedValueOnce(makeErrorResponse(429)) // openrouter
      .mockResolvedValueOnce(makeOaiOkResponse()); // cloudflare

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      OPENROUTER_API_KEY: "test_openrouter_key",
      OPENCODE_API_KEY: "test_opencode_key",
      OLLAMA_CLOUD_API_KEY: "test_ollama_key",
      CLAUDEFLARE_API_KEY: "test_cf_key",
      CLAUDEFLARE_ACCOUNT_ID: "acct-1",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(6);
    expect(mockFetch.mock.calls[5][0]).toContain("api.cloudflare.com");
  });

  it("GEMINI_API_KEY yokken (env'den sil) ve auto modda, zincirin doğrudan opencode'den başladığını doğrula (Gemini'ye hiç istek atılmadığını)", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(makeOaiOkResponse());

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "",
      OPENROUTER_API_KEY: "test_openrouter_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("https://opencode.ai/zen/v1/chat/completions");
  });

  it("Hiçbir API key yokken (auto modda), parseMealText'in ağa hiç çıkmadan {status:500} döndüğünü doğrula", async () => {
    const mockFetch = vi.fn();

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "",
      OPENROUTER_API_KEY: "",
      OPENCODE_API_KEY: "",
      OLLAMA_CLOUD_API_KEY: "",
      CLAUDEFLARE_API_KEY: "",
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
      OPENROUTER_API_KEY: "test_openrouter_key",
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
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(502);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain("gemini-flash-latest");
  });

  it("parseMealImage için: vision zinciri YALNIZCA Gemini tier'larını dener — OpenRouter/OpenCode/Ollama (metin-only) çağrılmaz", async () => {
    // Vision zinciri yalnız vision-destekli modellerdir (bkz. ai.js
    // visionChainSteps). Bu test aynı zamanda "görsel modelin limiti metin
    // işine harcanmaz" kuralını da doğrular: metin sağlayıcıları hiç denenmez.
    const mockFetch = vi.fn().mockResolvedValue(makeGeminiOkResponse());

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealImage } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      OPENROUTER_API_KEY: "test_openrouter_key",
      OPENCODE_API_KEY: "test_opencode_key",
      OLLAMA_CLOUD_API_KEY: "test_ollama_key",
    });

    const res = await parseMealImage({
      imageBase64: "test_base64_data",
      mimeType: "image/jpeg",
      mode: "food_photo",
      aliases: [],
    });

    expect(res.status).toBe(200);
    // Yalnızca tek Gemini tier'ı başarılı oldu → 1 çağrı.
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const called = mockFetch.mock.calls.map((c) => String(c[0]));
    // Hiçbir metin sağlayıcısı görsel isteğinde çağrılmadı:
    for (const url of called) expect(url).toContain("generativelanguage.googleapis.com");

    const geminiBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const parts = geminiBody.contents[0].parts;
    const imagePart = parts.find((part) => part.inline_data?.mime_type === "image/jpeg");
    expect(imagePart).toBeDefined();
    expect(imagePart.inline_data.data).toBe("test_base64_data");
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

  it("OpenRouter/Ollama JSON talimatı da istem dilini izler (Türkçe talimat sızmaz)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeOaiOkResponse());
    vi.stubGlobal("fetch", mockFetch);

    // GEMINI key'i YOK: zincir doğrudan openrouter'e düşer ve JSON talimatı
    // oraya gider. `""` şart — `.env`'deki gerçek anahtar aksi hâlde devreye
    // girip testi Gemini yoluna kaydırır (bkz. yukarıdaki "GEMINI_API_KEY yokken" testi).
    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "",
      OPENROUTER_API_KEY: "test_openrouter_key",
    });

    const res = await parseMealText({ text: "2 eggs", aliases: [], lang: "en" });
    expect(res.status).toBe(200);
    expect(mockFetch.mock.calls[0][0]).toContain("openrouter.ai");

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

    // İKİ satır: adım kaydı + zincir özeti (2026-09-21: istek başına tek satır
    // "chain" özeti üretimde toplam süreyi görebilmenin tek yolu).
    expect(logSpy).toHaveBeenCalledTimes(2);
    const line = logSpy.mock.calls[0][0];
    expect(line.startsWith("[ai] ")).toBe(true);
    expect(JSON.parse(line.slice("[ai] ".length))).toMatchObject({
      provider: "gemini-tier1",
      status: 429,
      code: "ai_rate_limit",
    });
    expect(JSON.parse(logSpy.mock.calls[1][0].slice("[ai] ".length))).toMatchObject({
      kind: "chain",
      endpoint: "parse",
      status: 429,
      code: "ai_rate_limit",
    });
  });

  it("zincir tükendiğinde denenen adımlar kronolojik kaydedilir; sağlayıcı geneli 5xx'te kalan Gemini kademesi atlanır", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(makeErrorResponse(502));
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText, aiLog } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      OPENROUTER_API_KEY: "test_openrouter_key",
      OPENCODE_API_KEY: "test_opencode_key",
      OLLAMA_CLOUD_API_KEY: "test_ollama_key",
      CLAUDEFLARE_API_KEY: "test_cf_key",
      CLAUDEFLARE_ACCOUNT_ID: "acct-1",
    });
    aiLog.reset();

    const res = await parseMealText({ text: "1 elma", aliases: [] });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("ai_provider_error");
    // Yeni sıra: gemini-tier1 → tier2 → opencode → ollama → openrouter → cloudflare.
    // gemini-tier3 DENENMEZ: aynı sağlayıcının iki kademesi art arda 5xx verdi
    // (VENDOR_5XX_STREAK). opencode/ollama/openrouter/cloudflare farklı vendor
    // olduğu için herbiri tek tek denenir.
    expect(mockFetch).toHaveBeenCalledTimes(6);
    expect(res.body.attempts.map((a) => a.provider)).toEqual([
      "gemini-tier1",
      "gemini-tier2",
      "gemini-tier3",
      "opencode",
      "ollama",
      "openrouter",
      "cloudflare",
    ]);
    expect(res.body.attempts[2].skipped).toBe("vendor-5xx");

    const snap = aiLog.snapshot();
    const providers = snap.entries.map((e) => e.provider).reverse();
    expect(providers).toEqual([
      "gemini-tier1",
      "gemini-tier2",
      "opencode",
      "ollama",
      "openrouter",
      "cloudflare",
    ]);
    for (const e of snap.entries) {
      expect(e.status).toBe(502); // BİZİM döndüğümüz kod
      expect(e.upstream).toBe(502); // sağlayıcının ham kodu
      expect(e.code).toBe("ai_provider_error");
    }
    const by = Object.fromEntries(snap.providers.map((p) => [p.provider, p]));
    expect(by["cloudflare"]).toMatchObject({ calls: 1, ok: 0, errors: 1 });
  });

  it("vision akışı kayıtları 'vision' endpoint'i taşır; Gemini 503'leri vendor kısa devresiyle tier3'ü atlar", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeErrorResponse(503));
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealImage, aiLog } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      OPENROUTER_API_KEY: "test_openrouter_key",
    });
    aiLog.reset();

    const res = await parseMealImage({
      imageBase64: "test_base64_data",
      mimeType: "image/jpeg",
      mode: "food_photo",
      aliases: [],
    });
    expect(res.status).toBe(502);

    const snap = aiLog.snapshot();
    // Vision zinciri YALNIZ Gemini: openrouter metin sağlayıcı çağrılmadı.
    expect(snap.entries).toHaveLength(2);
    expect(snap.entries.every((e) => e.endpoint === "vision")).toBe(true);
    expect(snap.entries.every((e) => e.provider.startsWith("gemini-tier"))).toBe(true);
    // `upstream`: sağlayıcının HAM kodu (Gemini 503) bizim 502'mizle karışmasın.
    expect(snap.entries[0]).toMatchObject({ provider: "gemini-tier2", status: 502, upstream: 503 });
    expect(mockFetch).toHaveBeenCalledTimes(2); // tier3 vendor-5xx ile atlanır
  });

  it("snapshot kova doluluklarını verir; tier2/tier3'ün metin+vision paylaşımlı olduğu adlarından okunur", async () => {
    const { aiLog } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
    });

    const snap = aiLog.snapshot();
    const names = snap.buckets.map((b) => b.name);
    expect(names).toContain("openrouter");
    expect(names).toContain("opencode");
    expect(names).toContain("ollama");
    expect(names).toContain("gemini-tier1-text");
    expect(names).toContain("gemini-tier2");
    expect(names).toContain("gemini-tier3");
    expect(names).toContain("vision");
    expect(names).toContain("cloudflare");
    expect(names).not.toContain("nim");
    expect(names).not.toContain("nim-vision");
    for (const b of snap.buckets) {
      expect(b.tokens).toBeGreaterThanOrEqual(0);
      expect(b.tokens).toBeLessThanOrEqual(b.cap);
      expect(b.fill).toBeLessThanOrEqual(1);
    }
  });
});

describe("zaman penceresi ve bütçe (2026-09-21 canlı olay)", () => {
  it("DEĞİŞMEZ: varsayılan toplam bütçe nginx'in /api/ penceresinden kısa olmalı", async () => {
    // nginx: `location ^~ /api/ { proxy_read_timeout 30s; }` (prod app.conf).
    // Bu değişmez yazılı olsaydı olay günü kullanıcı "zaman aşımı" mesajı alırken
    // sunucu hâlâ 37 sn çalışmaya devam etmezdi.
    const { AI_LIMITS } = await loadAi({});
    expect(AI_LIMITS.apiWindowMs).toBe(30000);
    expect(AI_LIMITS.budgetMs).toBeLessThan(AI_LIMITS.apiWindowMs);
    expect(AI_LIMITS.minStepMs).toBeGreaterThan(0);
    expect(AI_LIMITS.minStepMs).toBeLessThan(AI_LIMITS.budgetMs);
  });

  it("asılı kalan sağlayıcıda zincir bütçeyi AŞMAZ; kalan adımlar hiç başlatılmaz", async () => {
    // fetch, gerçek akıştaki gibi AbortSignal'e uyar (zaman aşımı → reddeder).
    const hangingFetch = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })),
          );
        }),
    );
    vi.stubGlobal("fetch", hangingFetch);

    const { parseMealImage } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      NUTRI_AI_BUDGET_MS: "400",
      NUTRI_AI_MIN_STEP_MS: "50",
    });

    const started = Date.now();
    const res = await parseMealImage({
      imageBase64: "x",
      mimeType: "image/jpeg",
      mode: "food_label",
      aliases: [],
    });
    const elapsed = Date.now() - started;

    expect(res.status).toBe(504);
    expect(res.body.code).toBe("ai_timeout");
    expect(elapsed).toBeLessThan(2000); // 85 sn'lik eski davranışın yerine bütçe
    expect(hangingFetch).toHaveBeenCalledTimes(1);
    expect(res.body.attempts[0]).toMatchObject({ provider: "gemini-tier1", code: "ai_timeout" });
    for (const a of res.body.attempts.slice(1)) expect(a.skipped).toBe("budget");
  });

  it("bütçe ilk adıma bile yetmiyorsa hiç ağ açılmaz, dürüst bir zaman aşımı döner", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      NUTRI_AI_BUDGET_MS: "100", // MIN_STEP_MS (2500) altında
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });
    expect(res.status).toBe(504);
    expect(res.body.code).toBe("ai_timeout");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.body.attempts.every((a) => a.skipped === "budget")).toBe(true);
  });

  it("CANLI OLAY REGRESYONU: Gemini 503'leri → 'zaman aşımı' DEĞİL 'sağlayıcı hatası'; tier3 vendor kısa devresiyle atlanır", async () => {
    // Olay günü zincir [503, 503, tier3 timeout, nim timeout] şeklindeydi ve
    // son adımın 504'ü kullanıcıya gösterildi. Artık sebep tüm denemelerden
    // seçilir; ayrıca tier3 5xx kısa devresiyle hiç denenmez.
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makeErrorResponse(503));
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealImage } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
    });

    const res = await parseMealImage({
      imageBase64: "x",
      mimeType: "image/jpeg",
      mode: "food_label",
      aliases: [],
    });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("ai_provider_error");
    expect(mockFetch).toHaveBeenCalledTimes(2); // tier3 atlanır
    expect(res.body.attempts[2]).toMatchObject({
      provider: "gemini-tier3",
      skipped: "vendor-5xx",
    });
  });

  it("DEVRE KESİCİ KALDIRILDI: art arda zaman aşımlarından sonra adım YİNE denenir (skipped:breaker yok)", async () => {
    // 2026-… kullanıcı isteği: devre kesici runChain'den çıkarıldı. Artık bir
    // sağlayıcı art arda timeout verse bile sonraki istek onu YİNE dener —
    // bütçe (AI_BUDGET_MS) hâlâ süreyi sınırlar, ama adım asla `breaker` ile
    // atlanmaz.
    const timeoutFetch = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    vi.stubGlobal("fetch", timeoutFetch);

    const { parseMealText, aiHealth } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
    });
    aiHealth.reset();

    for (let i = 0; i < 3; i += 1) await parseMealText({ text: "1 elma", aliases: [] });

    timeoutFetch.mockClear();
    const res = await parseMealText({ text: "1 elma", aliases: [] });
    expect(res.status).toBe(504);
    // 4. istek yine gemini-tier1'i DENEDI (atlanmadı):
    expect(res.body.attempts[0]).toMatchObject({ provider: "gemini-tier1", code: "ai_timeout" });
    expect(res.body.attempts[0].skipped).toBeUndefined();
    // Zaman aşımı adımı yine çağrıldı:
    expect(timeoutFetch.mock.calls.some(([url]) => String(url).includes("gemini-flash-latest"))).toBe(
      true,
    );
    // aiHealth snapshot hâlâ kayıt tutar (teşhis) ama runChain kararını etkilemez.
    expect(aiHealth.snapshot()).toBeDefined();
  });
});

describe("ölü model adı kendiliğinden onarılır (server/aiModels.js entegrasyonu)", () => {
  /** Sahte fetch: liste çağrısını ve sohbet çağrılarını sırasıyla ayırt eder. */
  function modelAwareFetch(chatHandler) {
    const calls = [];
    const mockFetch = vi.fn(async (url, init) => {
      const u = String(url);
      const body = init?.body ? JSON.parse(init.body) : null;
      calls.push({ url: u, body });
      if (u.endsWith("/models")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: [{ id: "deepseek-v4-flash-free" }] }),
        };
      }
      return chatHandler(body, calls.filter((c) => !c.url.endsWith("/models")).length);
    });
    vi.stubGlobal("fetch", mockFetch);
    return { mockFetch, calls };
  }

  it("OpenCode 410 dönerse listeden yeni model bulunur, yoklanır ve AYNI istekte denenir", async () => {
    const { calls } = modelAwareFetch((body, chatIndex) =>
      // 1) ölü model → 410  2) yoklama → 200  3) yeni modelle gerçek istek → 200
      chatIndex === 1 ? makeErrorResponse(410) : makeOaiOkResponse(),
    );

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "",
      OPENROUTER_API_KEY: "",
      OPENCODE_API_KEY: "test_opencode_key",
      OLLAMA_CLOUD_API_KEY: "",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });
    expect(res.status).toBe(200);
    expect(res.body.items[0].name).toBe("Elma");

    const chatCalls = calls.filter((c) => !c.url.endsWith("/models"));
    expect(chatCalls[0].body.model).toBe("space-bunny-free"); // yapılandırılmış (ölü)
    expect(chatCalls[1].body.model).toBe("deepseek-v4-flash-free"); // liste yoklaması
    expect(chatCalls[1].body.max_tokens).toBe(1);
    expect(chatCalls[2].body.model).toBe("deepseek-v4-flash-free"); // gerçek istek
    expect(calls.some((c) => c.url.endsWith("/models"))).toBe(true);
  });

  it("NUTRI_AI_AUTOMODEL=0 iken keşif yapılmaz: ölü modelle ısrar edilir, hata dürüst raporlanır", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeErrorResponse(410));
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "",
      OPENROUTER_API_KEY: "",
      OPENCODE_API_KEY: "test_opencode_key",
      OLLAMA_CLOUD_API_KEY: "",
      NUTRI_AI_AUTOMODEL: "0",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("ai_provider_error");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
