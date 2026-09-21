// server/aiModels.js birim testleri: aday süzme, canlı yoklama, önbellek,
// olumsuz önbellek, AUTOMODEL kapatma ve savunmacı davranış.
//
// NEDEN VAR: 2026-09-21 olayında koda sabit yazılı model adları sağlayıcılar
// tarafından sessizce emekliye ayrılmıştı (410 Gone / 400 "Model is
// unavailable"). Bu modül "adı listeden bul + canlı yokla" sözleşmesini tutmazsa
// zincir yine ölü bir modele 40 sn harcar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "NVIDIA_NIM_API_KEY",
  "OPENCODE_API_KEY",
  "NUTRI_AI_AUTOMODEL",
  "NUTRI_AI_MODEL_TTL_MS",
  "NUTRI_AI_MODEL_NEGATIVE_TTL_MS",
  "NUTRI_AI_DISCOVER_BUDGET_MS",
  "NUTRI_AI_PROBE_TIMEOUT_MS",
  "NUTRI_AI_MAX_PROBES",
];

const envBackup = {};

beforeEach(() => {
  for (const k of ENV_KEYS) envBackup[k] = process.env[k];
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
});

async function loadModels(env = {}) {
  vi.resetModules();
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const mod = await import("./aiModels.js");
  return mod.default ?? mod;
}

const keys = { NVIDIA_NIM_API_KEY: "test_nim_key", OPENCODE_API_KEY: "test_opencode_key" };

/** Model listesi yanıtı (OpenAI uyumlu gövde). */
function listResponse(ids) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ data: ids.map((id) => ({ id })) }),
  };
}

function errorResponse(status) {
  return { ok: false, status, text: async () => JSON.stringify({ error: `HTTP ${status}` }) };
}

function okResponse() {
  return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [] }) };
}

describe("aiModels model keşfi", () => {
  it("sağlıklı akışta ağa çıkmaz: önbellek boşsa yapılandırılmış model kullanılır", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const m = await loadModels(keys);

    expect(m.getModel("nim", "text", "meta/llama-3.1-8b-instruct")).toEqual({
      model: "meta/llama-3.1-8b-instruct",
      source: "env",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("model hatasında listeyi çeker, adayları SIRAYLA yoklar ve çalışanı önbelleğe alır", async () => {
    // URL/gövde farkındalıklı sahte fetch: sıraya bağımlı mock zinciri yerine
    // "liste → aday yoklaması" ayrımını doğrudan modeller (daha az kırılgan).
    const mockFetch = vi.fn(async (url, init) => {
      if (String(url).endsWith("/models")) {
        return listResponse([
          "meta/llama-3.2-11b-vision-instruct",
          "meta/llama-3.1-8b-instruct",
          "meta/llama3-chatqa-1.5-70b",
          "nvidia/llama-3.1-nemotron-51b-instruct",
        ]);
      }
      const body = JSON.parse(init.body);
      // ilk aday (chatqa) ölü, ikincisi çalışıyor
      return body.model === "meta/llama3-chatqa-1.5-70b" ? errorResponse(500) : okResponse();
    });
    vi.stubGlobal("fetch", mockFetch);
    const m = await loadModels(keys);

    const found = await m.refreshOnFailure("nim", "text", {
      currentModel: "meta/llama-3.1-8b-instruct",
      budgetMs: 8000,
      status: 410,
    });

    expect(found.reason).toBe("probe-ok");
    expect(found.model).toBe("nvidia/llama-3.1-nemotron-51b-instruct");
    expect(found.probed).toEqual([
      "meta/llama3-chatqa-1.5-70b",
      "nvidia/llama-3.1-nemotron-51b-instruct",
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0][0]).toBe("https://integrate.api.nvidia.com/v1/models");
    // Yoklama gövdesi: tek jetonluk, gerçek yük göndermeyen istek.
    const probeBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(probeBody).toMatchObject({ model: "meta/llama3-chatqa-1.5-70b", max_tokens: 1 });

    // Seçim önbellekte: bir sonraki çağrı ağa çıkmadan bulunan modeli verir.
    expect(m.getModel("nim", "text", "meta/llama-3.1-8b-instruct")).toEqual({
      model: "nvidia/llama-3.1-nemotron-51b-instruct",
      source: "cached",
    });
  });

  it("liste çekilemezse: olumsuz önbellek, ağ TEKRAR açılmaz, yedek modele düşülür", async () => {
    const mockFetch = vi.fn().mockResolvedValue(errorResponse(500));
    vi.stubGlobal("fetch", mockFetch);
    const m = await loadModels(keys);

    const first = await m.refreshOnFailure("nim", "text", { budgetMs: 8000 });
    expect(first.model).toBeNull();
    expect(first.reason).toBe("list-unavailable");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const second = await m.refreshOnFailure("nim", "text", { budgetMs: 8000 });
    expect(second.reason).toBe("negative-cache");
    // Olumsuz önbellek: 15 dk boyunca aynı listeyi tekrar tekrar çekmiyoruz.
    expect(mockFetch).toHaveBeenCalledTimes(1);

    expect(m.getModel("nim", "text", "meta/llama-3.1-8b-instruct")).toEqual({
      model: "meta/llama-3.1-8b-instruct",
      source: "fallback",
    });
  });

  it("NUTRI_AI_AUTOMODEL=0 iken hiçbir keşif isteği yapılmaz", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const m = await loadModels({ ...keys, NUTRI_AI_AUTOMODEL: "0" });

    const res = await m.refreshOnFailure("opencode", "text", { budgetMs: 8000 });
    expect(res.reason).toBe("automodel-off");
    expect(res.model).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("kalan bütçe tek yoklamaya yetmiyorsa ağ açılmaz (bütçe değişmezinin parçası)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const m = await loadModels(keys);

    const res = await m.refreshOnFailure("opencode", "text", { budgetMs: 100 });
    expect(res.reason).toBe("no-budget");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("OpenCode'da ücretsiz modeller öncelikli; vision modunda ücretsiz vision yoksa aday bulunamaz", async () => {
    const mockFetch = vi.fn(async (url, init) => {
      if (String(url).endsWith("/models")) {
        return listResponse(["gpt-6-astra", "jev-1.13-free", "deepseek-v4-flash-free"]);
      }
      const body = JSON.parse(init.body);
      // Olay günü kanıt: `deepseek-v4-flash-free` listede duruyor ama 400 veriyor.
      return body.model === "deepseek-v4-flash-free" ? errorResponse(400) : okResponse();
    });
    vi.stubGlobal("fetch", mockFetch);
    const m = await loadModels(keys);

    const found = await m.refreshOnFailure("opencode", "text", { budgetMs: 8000 });
    expect(found.probed[0]).toBe("deepseek-v4-flash-free");
    expect(found.model).toBe("jev-1.13-free");

    // `-free` havuzunda vision modeli yok → görsel için keşif sonuç üretmez
    // (bu yüzden görsel zincirde OpenCode adımı yok; bkz. server/ai.js).
    const vision = await m.refreshOnFailure("opencode", "vision", { budgetMs: 8000 });
    expect(vision.reason).toBe("no-candidates");
    expect(vision.model).toBeNull();
  });

  it("invalidate: zaman aşımından sonra seçim tazelenir (aynı model tekrar tekrar denenmez)", async () => {
    const mockFetch = vi.fn(async (url) => {
      if (String(url).endsWith("/models")) return listResponse(["meta/llama3-chatqa-1.5-70b"]);
      return okResponse();
    });
    vi.stubGlobal("fetch", mockFetch);
    const m = await loadModels(keys);

    await m.refreshOnFailure("nim", "text", { budgetMs: 8000 });
    expect(m.getModel("nim", "text", "yedek").source).toBe("cached");

    // invalidate kaydı SİLER: olumsuz önbellek yazsaydı keşif 15 dk kilitlenirdi.
    m.invalidate("nim", "text");
    expect(m.getModel("nim", "text", "yedek").source).toBe("env");

    const again = await m.refreshOnFailure("nim", "text", { budgetMs: 8000 });
    expect(again.model).toBe("meta/llama3-chatqa-1.5-70b");
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("asla throw etmez: ağ çökse bile 'model bulunamadı' döner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ağ yok")),
    );
    const m = await loadModels(keys);

    const res = await m.refreshOnFailure("nim", "text", { budgetMs: 8000 });
    expect(res.model).toBeNull();
    expect(res.reason).toBe("list-unavailable");
    await expect(m.refreshOnFailure("bilinmeyen", "text", {})).resolves.toMatchObject({
      model: null,
      reason: "unknown-provider",
    });
    expect(() => m.invalidate("yok", "text")).not.toThrow();
  });

  it("snapshot teşhis için seçimi ve yaşını verir; reset temizler", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(listResponse(["meta/llama3-chatqa-1.5-70b"]))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", mockFetch);
    const m = await loadModels(keys);

    await m.refreshOnFailure("nim", "text", { budgetMs: 8000 });
    const snap = m.snapshot();
    expect(snap.automodel).toBe(true);
    expect(snap.entries).toEqual([
      expect.objectContaining({ key: "nim:text", model: "meta/llama3-chatqa-1.5-70b" }),
    ]);

    m.reset();
    expect(m.snapshot().entries).toEqual([]);
  });
});
