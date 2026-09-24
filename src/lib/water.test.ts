import { describe, expect, it } from "vitest";
import {
  DEFAULT_WATER_TARGET_ML,
  EMPTY_WATER,
  WATER_MAX_DAY_ML,
  WATER_MAX_ENTRY_ML,
  WATER_MIN_ENTRY_ML,
  addWaterEntry,
  normalizeAmount,
  normalizeTargetMl,
  parseWaterConfig,
  removeLastWaterEntry,
  shouldShowWaterCard,
  suggestTargetMl,
  waterAverageMl,
  waterRatio,
  waterTotalMl,
  waterEntries,
} from "./water";
import type { AppConfig } from "../types";

describe("water", () => {
  describe("parseWaterConfig", () => {
    it("boş config → varsayılan hedef, kart AÇIK, boş günlük", () => {
      expect(parseWaterConfig({})).toEqual(EMPTY_WATER);
      expect(parseWaterConfig({}).targetMl).toBe(DEFAULT_WATER_TARGET_ML);
      // Kart varsayılanı AÇIK olmalı: kullanıcının şikâyeti "göremiyorum"du.
      expect(parseWaterConfig({}).enabled).toBe(true);
    });

    it("bozuk kabuk (dizi, null, metin) → varsayılana düşer", () => {
      expect(parseWaterConfig({ water: [] } as unknown as AppConfig)).toEqual(EMPTY_WATER);
      expect(parseWaterConfig({ water: null } as unknown as AppConfig)).toEqual(EMPTY_WATER);
      expect(parseWaterConfig({ water: "x" } as unknown as AppConfig)).toEqual(EMPTY_WATER);
    });

    it("geçerli kaydı okur", () => {
      const config: AppConfig = {
        water: { targetMl: 2500, enabled: false, log: { "2026-09-24": [200, 330, 500] } },
      };
      expect(parseWaterConfig(config)).toEqual({
        targetMl: 2500,
        enabled: false,
        log: { "2026-09-24": [200, 330, 500] },
      });
    });

    it("geçersiz ölçüleri ve tarihleri TEK TEK atlar (tüm günlük düşmez)", () => {
      const config: AppConfig = {
        water: {
          log: {
            "2026-09-24": [200, "330", null, 0, 5, 99999, 250.4],
            "24-09-2026": [300],
            "2026-09-23": "dizi-değil",
            "2026-09-22": [],
          },
        },
      };
      const parsed = parseWaterConfig(config);
      // 200 ok · "330" metin sayılmaz (şema sayı bekler) · 0/5 alt sınır altı ·
      // 99999 üst sınır üstü · 250.4 → 250 yuvarlanır.
      expect(parsed.log).toEqual({ "2026-09-24": [200, 250] });
      expect(parsed.targetMl).toBe(DEFAULT_WATER_TARGET_ML);
    });

    it("hedef aralık dışıysa varsayılana döner", () => {
      expect(parseWaterConfig({ water: { targetMl: 10 } }).targetMl).toBe(DEFAULT_WATER_TARGET_ML);
      expect(parseWaterConfig({ water: { targetMl: 99999 } }).targetMl).toBe(4000);
      expect(parseWaterConfig({ water: { targetMl: Number.NaN } }).targetMl).toBe(
        DEFAULT_WATER_TARGET_ML,
      );
    });
  });

  describe("addWaterEntry / removeLastWaterEntry", () => {
    it("ölçüleri sırayla ekler ve toplar", () => {
      let cfg = EMPTY_WATER;
      const first = addWaterEntry(cfg, "2026-09-24", 200);
      expect(first).not.toBeNull();
      cfg = first!;
      const second = addWaterEntry(cfg, "2026-09-24", 330);
      cfg = second!;
      expect(waterEntries(cfg, "2026-09-24")).toEqual([200, 330]);
      expect(waterTotalMl(cfg, "2026-09-24")).toBe(530);
    });

    it("günler birbirine karışmaz", () => {
      const a = addWaterEntry(EMPTY_WATER, "2026-09-24", 200)!;
      const b = addWaterEntry(a, "2026-09-25", 500)!;
      expect(waterTotalMl(b, "2026-09-24")).toBe(200);
      expect(waterTotalMl(b, "2026-09-25")).toBe(500);
      expect(waterTotalMl(b, "2026-09-26")).toBe(0);
    });

    it("sınır dışı ölçü eklenmez (null)", () => {
      expect(addWaterEntry(EMPTY_WATER, "2026-09-24", WATER_MIN_ENTRY_ML - 1)).toBeNull();
      expect(addWaterEntry(EMPTY_WATER, "2026-09-24", WATER_MAX_ENTRY_ML + 1)).toBeNull();
      expect(addWaterEntry(EMPTY_WATER, "2026-09-24", Number.NaN)).toBeNull();
      expect(addWaterEntry(EMPTY_WATER, "24-09-2026", 200)).toBeNull();
    });

    it("gün toplamı üst sınırı aşılırsa eklenmez", () => {
      let cfg = EMPTY_WATER;
      for (let i = 0; i < 4; i++) cfg = addWaterEntry(cfg, "2026-09-24", WATER_MAX_ENTRY_ML)!;
      expect(waterTotalMl(cfg, "2026-09-24")).toBe(WATER_MAX_DAY_ML);
      expect(addWaterEntry(cfg, "2026-09-24", 200)).toBeNull();
    });

    it("son eklenen geri alınır; dizi boşalınca gün silinir", () => {
      let cfg = addWaterEntry(EMPTY_WATER, "2026-09-24", 200)!;
      cfg = addWaterEntry(cfg, "2026-09-24", 500)!;
      cfg = removeLastWaterEntry(cfg, "2026-09-24");
      expect(waterEntries(cfg, "2026-09-24")).toEqual([200]);
      cfg = removeLastWaterEntry(cfg, "2026-09-24");
      expect(cfg.log["2026-09-24"]).toBeUndefined();
      // Boş günde geri alma güvenli: aynı nesne geri döner.
      expect(removeLastWaterEntry(cfg, "2026-09-24")).toBe(cfg);
    });

    it("mutasyon yok — girdi config değişmez", () => {
      const cfg = addWaterEntry(EMPTY_WATER, "2026-09-24", 200)!;
      addWaterEntry(cfg, "2026-09-24", 500);
      removeLastWaterEntry(cfg, "2026-09-24");
      expect(cfg.log["2026-09-24"]).toEqual([200]);
    });
  });

  describe("waterRatio", () => {
    it("0..1 arasına kelepçeler", () => {
      expect(waterRatio(1000, 2000)).toBe(0.5);
      expect(waterRatio(3000, 2000)).toBe(1);
      expect(waterRatio(-5, 2000)).toBe(0);
      expect(waterRatio(500, 0)).toBe(0);
      expect(waterRatio(500, -1)).toBe(0);
    });
  });

  describe("normalizeAmount / normalizeTargetMl", () => {
    it("metin girdisini (virgüllü dâhil) sayıya çevirir", () => {
      expect(normalizeAmount("250")).toBe(250);
      expect(normalizeAmount("250,4")).toBe(250);
      expect(normalizeAmount("1.000")).toBe(1000);
      expect(normalizeAmount("")).toBeNull();
      expect(normalizeAmount("abc")).toBeNull();
    });

    it("hedef aralığı 1200–4000 ml", () => {
      expect(normalizeTargetMl("2500")).toBe(2500);
      expect(normalizeTargetMl(1199)).toBeNull();
      expect(normalizeTargetMl(4001)).toBeNull();
    });
  });

  describe("suggestTargetMl", () => {
    it("35 ml/kg önerir, 50'ye yuvarlar", () => {
      expect(suggestTargetMl(70)).toBe(2450);
      expect(suggestTargetMl(60)).toBe(2100);
      expect(suggestTargetMl(82.5)).toBe(2900); // 2887,5 → 2900
    });

    it("kilo yoksa öneri yok (uydurma sayı verilmez)", () => {
      expect(suggestTargetMl(null)).toBeNull();
      expect(suggestTargetMl(undefined)).toBeNull();
      expect(suggestTargetMl(0)).toBeNull();
      expect(suggestTargetMl(-5)).toBeNull();
      expect(suggestTargetMl(Number.NaN)).toBeNull();
    });

    it("aralığa kelepçeler", () => {
      expect(suggestTargetMl(10)).toBe(1200);
      expect(suggestTargetMl(400)).toBe(4000);
    });
  });

  describe("shouldShowWaterCard", () => {
    it("kapalıysa hiç gösterilmez", () => {
      expect(shouldShowWaterCard(false, 1000, true)).toBe(false);
      expect(shouldShowWaterCard(false, 0, false)).toBe(false);
    });

    it("bugün her zaman görünür (keşfedilebilirlik)", () => {
      expect(shouldShowWaterCard(true, 0, true)).toBe(true);
    });

    it("geçmişte yalnızca kaydı varsa görünür", () => {
      expect(shouldShowWaterCard(true, 0, false)).toBe(false);
      expect(shouldShowWaterCard(true, 250, false)).toBe(true);
    });
  });

  describe("waterAverageMl", () => {
    it("kayıtlı günlerin ortalamasını verir; kayıtsız günleri sıfır saymaz", () => {
      let cfg = addWaterEntry(EMPTY_WATER, "2026-09-24", 2000)!;
      cfg = addWaterEntry(cfg, "2026-09-23", 1000)!;
      expect(waterAverageMl(cfg, ["2026-09-24", "2026-09-23", "2026-09-22"])).toBe(1500);
    });

    it("hiç kayıt yoksa null", () => {
      expect(waterAverageMl(EMPTY_WATER, ["2026-09-24", "2026-09-23"])).toBeNull();
    });
  });
});
