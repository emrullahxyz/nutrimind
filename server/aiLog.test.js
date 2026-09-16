// server/aiLog.js birim testleri: ring buffer sınırı, snapshot şekli, hata
// satırı, PII güvencesi. Modül süreç-içi durumu tuttuğu için her test
// reset() ile temiz başlar (bkz. modül dokümantasyonu — bellek-içi, dosya yok).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { record, setBuckets, snapshot, reset } from "./aiLog.js";

beforeEach(() => {
  reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("aiLog ring buffer", () => {
  it("kayıtları en yenisi önce döndürür (snapshot.entries reverse)", () => {
    record({ endpoint: "parse", provider: "gemini-tier1", status: 200, latencyMs: 100 });
    record({ endpoint: "parse", provider: "gemini-tier2", status: 200, latencyMs: 120 });

    const snap = snapshot();
    expect(snap.ok).toBe(true);
    expect(snap.entries).toHaveLength(2);
    expect(snap.entries[0].provider).toBe("gemini-tier2");
    expect(snap.entries[1].provider).toBe("gemini-tier1");
  });

  it("MAX_ENTRIES sınırında eskiyi atar, uzunluk sabit kalır", () => {
    for (let i = 0; i < 205; i++) {
      record({ endpoint: "parse", provider: "p", status: 200 });
    }
    const snap = snapshot();
    expect(snap.entries).toHaveLength(200);
    // En eski kayıt (ilk yazılan) düştü: kalanların en eskisi i=5.
    expect(snap.entries[snap.entries.length - 1].provider).toBe("p");
  });

  it("asla throw etmez: bozuk girişler sessizce normalize olur", () => {
    expect(() => record(null)).not.toThrow();
    expect(() => record(undefined)).not.toThrow();
    expect(() => record("string")).not.toThrow();
    record({}); // alanlar eksik → varsayılanlar
    const e = snapshot().entries[0];
    expect(e.status).toBe(0);
    expect(e.endpoint).toBe("unknown");
    expect(e.provider).toBe("unknown");
    expect(e.code).toBeNull();
    expect(e.latencyMs).toBeNull();
  });

  it("PII güvencesi: kayıt yalnızca teknik alanlar taşır", () => {
    record({
      endpoint: "vision",
      provider: "nim-vision",
      status: 504,
      code: "ai_timeout",
      latencyMs: 40001,
    });
    const e = snapshot().entries[0];
    expect(Object.keys(e).sort()).toEqual(
      ["code", "endpoint", "latencyMs", "model", "provider", "retryAfter", "status", "ts"].sort(),
    );
    // ts ISO formatında: prompt/görsel yok, yalnızca zaman damgası.
    expect(() => new Date(e.ts).toISOString()).not.toThrow();
  });
});

describe("aiLog sağlayıcı sayaçları", () => {
  it("calls/ok/errors sağlayıcı başına birikir", () => {
    record({ endpoint: "parse", provider: "gemini-tier1", status: 200 });
    record({ endpoint: "parse", provider: "gemini-tier1", status: 429, code: "ai_rate_limit" });
    record({ endpoint: "parse", provider: "gemini-tier2", status: 200 });

    const by = Object.fromEntries(snapshot().providers.map((p) => [p.provider, p]));
    expect(by["gemini-tier1"]).toEqual({ provider: "gemini-tier1", calls: 2, ok: 1, errors: 1 });
    expect(by["gemini-tier2"]).toEqual({ provider: "gemini-tier2", calls: 1, ok: 1, errors: 0 });
  });

  it("başarısızlıkta (status !== 200) tek satırlık '[ai]' log'u yazılır, başarıda yazılmaz", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    record({ endpoint: "parse", provider: "gemini-tier1", status: 200 });
    expect(logSpy).not.toHaveBeenCalled();

    record({
      endpoint: "parse",
      provider: "gemini-tier1",
      status: 429,
      code: "ai_rate_limit",
      retryAfter: 42,
    });
    expect(logSpy).toHaveBeenCalledTimes(1);

    const line = logSpy.mock.calls[0][0];
    expect(line.startsWith("[ai] ")).toBe(true);
    const parsed = JSON.parse(line.slice("[ai] ".length));
    expect(parsed).toMatchObject({
      provider: "gemini-tier1",
      status: 429,
      code: "ai_rate_limit",
      retryAfter: 42,
    });

    record({ endpoint: "parse", provider: "gemini-tier2", status: 502, code: "ai_provider_error" });
    expect(logSpy).toHaveBeenCalledTimes(2);
  });
});

describe("aiLog kova anlık görüntüsü", () => {
  it("setBuckets ile bildirilen kovaların doluluğunu floor+fill olarak verir", () => {
    setBuckets([
      { name: "test", cap: 10, peek: () => 7.9 },
      { name: "bos", cap: 5, peek: () => 0 },
    ]);
    const snap = snapshot();
    expect(snap.buckets).toEqual([
      { name: "test", tokens: 7, cap: 10, fill: 0.79 },
      { name: "bos", tokens: 0, cap: 5, fill: 0 },
    ]);
  });

  it("peek throw eden kova tüm snapshot'ı bozmaz (savunmacı)", () => {
    setBuckets([
      { name: "kirik", cap: 10, peek: () => { throw new Error("boom"); } },
    ]);
    const snap = snapshot();
    expect(snap.ok).toBe(true);
    expect(snap.buckets[0].name).toBe("kirik");
    expect(snap.buckets[0].tokens).toBe(0);
  });

  it("dizi olmayan setBuckets çağrısı sessizce yok sayılır", () => {
    expect(() => setBuckets(null)).not.toThrow();
    expect(() => setBuckets("x")).not.toThrow();
    expect(snapshot().buckets).toEqual([]);
  });
});
