import { describe, expect, it } from "vitest";
import {
  newSupplementId,
  parseSupplementsConfig,
  supplementProgress,
} from "./supplements";
import type { AppConfig } from "../types";

describe("supplements", () => {
  describe("parseSupplementsConfig", () => {
    it("returns empty items and log for empty config", () => {
      const result = parseSupplementsConfig({});
      expect(result).toEqual({ items: [], log: {} });
    });

    it("parses valid supplements config correctly", () => {
      const config: AppConfig = {
        supplements: {
          items: [
            { id: "s_1", name: "D3-K2", dose: "1000 IU" },
            { id: "s_2", name: "Omega 3" },
          ],
          log: {
            "2026-08-02": ["s_1", "s_2"],
          },
        },
      };
      const result = parseSupplementsConfig(config);
      expect(result).toEqual({
        items: [
          { id: "s_1", name: "D3-K2", dose: "1000 IU" },
          { id: "s_2", name: "Omega 3" },
        ],
        log: {
          "2026-08-02": ["s_1", "s_2"],
        },
      });
    });

    it("skips invalid items (missing id or name, non-object)", () => {
      const config: AppConfig = {
        supplements: {
          items: [
            null,
            "invalid",
            { id: "", name: "Magnesium" },
            { id: "s_1", name: "  " },
            { id: "s_2", name: "Creatine", dose: "  " },
            { id: " s_3 ", name: " Zinc ", dose: " 15mg " },
          ],
        },
      };
      const result = parseSupplementsConfig(config);
      expect(result.items).toEqual([
        { id: "s_2", name: "Creatine" },
        { id: "s_3", name: "Zinc", dose: "15mg" },
      ]);
    });

    it("filters out invalid log entries (non-array, empty array, non-string items)", () => {
      const config: AppConfig = {
        supplements: {
          log: {
            "2026-08-02": ["s_1", "  ", 123 as unknown as string],
            "2026-08-01": [],
            "2026-07-31": "not-an-array" as unknown as string[],
          },
        },
      };
      const result = parseSupplementsConfig(config);
      expect(result.log).toEqual({
        "2026-08-02": ["s_1"],
      });
    });
  });

  describe("newSupplementId", () => {
    it("generates an id starting with s_ prefix", () => {
      const id = newSupplementId();
      expect(id).toMatch(/^s_\d+_[a-z0-9]+$/);
    });

    it("generates unique ids", () => {
      const id1 = newSupplementId();
      const id2 = newSupplementId();
      expect(id1).not.toEqual(id2);
    });
  });

  describe("supplementProgress", () => {
    it("done/total formatında döner", () => {
      expect(supplementProgress(5, 2)).toBe("2/5");
      expect(supplementProgress(3, 0)).toBe("0/3");
      expect(supplementProgress(1, 1)).toBe("1/1");
    });
  });
});
