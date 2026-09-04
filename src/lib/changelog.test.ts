import { describe, expect, it } from "vitest";
import { CHANGELOG, CHANGELOG_LATEST } from "./changelog";
import { compareVersions, unseenVersions, parseSeen, serializeSeen } from "./changelogUi";

describe("compareVersions", () => {
  it("0.28.7 < 0.29.0", () => {
    expect(compareVersions("0.28.7", "0.29.0")).toBeLessThan(0);
  });

  it("0.29.0 < 0.29.1", () => {
    expect(compareVersions("0.29.0", "0.29.1")).toBeLessThan(0);
  });

  it("eşit sürümler 0 döner", () => {
    expect(compareVersions("0.29.0", "0.29.0")).toBe(0);
  });

  it("simetrik: büyük olan pozitif döner", () => {
    expect(compareVersions("0.29.1", "0.29.0")).toBeGreaterThan(0);
  });

  it("eksik parçayı 0 sayar", () => {
    expect(compareVersions("0.29", "0.29.0")).toBe(0);
    expect(compareVersions("0.29.1", "0.29")).toBeGreaterThan(0);
  });
});

describe("unseenVersions", () => {
  it("seen'de olmayanları verir, sırayı korur", () => {
    expect(unseenVersions(["0.29.0", "0.28.0", "0.27.0"], ["0.28.0"])).toEqual(["0.29.0", "0.27.0"]);
  });

  it("seen dizisine dokunmaz (mutasyon yok)", () => {
    const seen = ["0.28.0"];
    unseenVersions(["0.29.0", "0.28.0"], seen);
    expect(seen).toEqual(["0.28.0"]);
  });

  it("boş seen → tümü görülmemiş", () => {
    expect(unseenVersions(["0.29.0", "0.28.0"], [])).toEqual(["0.29.0", "0.28.0"]);
  });

  it("boş versions → boş", () => {
    expect(unseenVersions([], ["0.29.0"])).toEqual([]);
  });

  it("hepsi seen → boş", () => {
    expect(unseenVersions(["0.29.0", "0.28.0"], ["0.28.0", "0.29.0"])).toEqual([]);
  });
});

describe("parseSeen", () => {
  it("geçerli JSON dizisini parse eder", () => {
    expect(parseSeen('["0.29.0","0.28.0"]')).toEqual(["0.29.0", "0.28.0"]);
  });

  it("geçersiz JSON → []", () => {
    expect(parseSeen("not-json{{{")).toEqual([]);
  });

  it("null → []", () => {
    expect(parseSeen(null)).toEqual([]);
  });

  it("dizi değilse → []", () => {
    expect(parseSeen('"0.29.0"')).toEqual([]);
    expect(parseSeen("42")).toEqual([]);
    expect(parseSeen("{}")).toEqual([]);
  });

  it("dizi içindeki string olmayanları eler", () => {
    expect(parseSeen('[1,true,"0.29.0",null]')).toEqual(["0.29.0"]);
  });
});

describe("serializeSeen", () => {
  it("diziyi JSON'a çevirir", () => {
    expect(serializeSeen(["0.29.0", "0.28.0"])).toBe('["0.29.0","0.28.0"]');
  });

  it("roundtrip: serialize → parse aynı diziyi verir", () => {
    const seen = ["0.29.0", "0.28.0"];
    expect(parseSeen(serializeSeen(seen))).toEqual(seen);
    expect(parseSeen(serializeSeen([]))).toEqual([]);
  });
});

describe("CHANGELOG veri bütünlüğü", () => {
  it("boş değil ve CHANGELOG_LATEST ilk girişin sürümü", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    expect(CHANGELOG_LATEST).toBe(CHANGELOG[0].version);
  });

  it("her girişin version/date/summary.tr/summary.en dolu", () => {
    for (const entry of CHANGELOG) {
      expect(entry.version).toBeTruthy();
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.summary.tr.trim().length).toBeGreaterThan(0);
      expect(entry.summary.en.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(entry.dev)).toBe(true);
    }
  });

  it("items boş değil ve her item geçerli type + dolu tr/en", () => {
    const validTypes = ["new", "improved", "fixed"];
    for (const entry of CHANGELOG) {
      expect(entry.items.length).toBeGreaterThan(0);
      for (const item of entry.items) {
        expect(validTypes).toContain(item.type);
        expect(item.tr.trim().length).toBeGreaterThan(0);
        expect(item.en.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("sıra semver desc (yeni → eski)", () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
    }
  });
});
