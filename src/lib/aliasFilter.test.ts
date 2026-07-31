import { describe, expect, it } from "vitest";
import { filterAliases, normalizeTr } from "./aliasFilter";
import type { Alias } from "../types";

const mockAliases: Alias[] = [
  {
    id: "yulaf",
    name: "Yulaf Ezmesi",
    brand: "Eti Lifalif",
    triggers: ["yulaf", "100g yulaf", "oats"],
    serving_g: 100,
    nutrition: { kcal: 350, protein: 12, carbs: 60, fat: 7, fiber: 10 },
  },
  {
    id: "ispanak",
    name: "İspanak",
    brand: null,
    triggers: ["ispanak", "ıspanak", "spinach"],
    serving_g: 100,
    nutrition: { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 },
  },
  {
    id: "sut",
    name: "Yarım Yağlı Süt",
    brand: "Pınar",
    triggers: ["sut", "süt", "1 bardak süt"],
    serving_g: 200,
    nutrition: { kcal: 90, protein: 6, carbs: 9, fat: 3, fiber: 0 },
  },
  {
    id: "protein-shake",
    name: "Protein Shake",
    brand: "Hardline",
    triggers: ["protein powder", "whey", "shake"],
    serving_g: 30,
    nutrition: { kcal: 120, protein: 24, carbs: 2, fat: 1, fiber: 0 },
  },
];

describe("normalizeTr", () => {
  it("Türkçe büyük harfleri doğru küçültür (İ/I tuzağı)", () => {
    expect(normalizeTr("İSPANAK")).toBe("ispanak");
    expect(normalizeTr("ISPANAK")).toBe("ıspanak");
    expect(normalizeTr("SÜT")).toBe("süt");
    expect(normalizeTr("ŞEKER")).toBe("şeker");
    expect(normalizeTr("Ğ")).toBe("ğ");
  });
});

describe("filterAliases", () => {
  it("boş ya da yalnızca boşluk olan sorguda tüm listeyi döndürür", () => {
    expect(filterAliases(mockAliases, "")).toEqual(mockAliases);
    expect(filterAliases(mockAliases, "   ")).toEqual(mockAliases);
  });

  it("besin adına göre, büyük/küçük harf duyarsız filtreler", () => {
    const result = filterAliases(mockAliases, "yulaf");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("yulaf");
  });

  it("Türkçe İ/ı büyük-küçük harf tuzaklarını doğru ele alır", () => {
    // Büyük İ ile arama
    const resultCapitalI = filterAliases(mockAliases, "İSP");
    expect(resultCapitalI.map((a) => a.id)).toContain("ispanak");

    // Küçük i ile arama
    const resultLowerI = filterAliases(mockAliases, "isp");
    expect(resultLowerI.map((a) => a.id)).toContain("ispanak");

    // Noktasız ı ile arama (tetikleyici "ıspanak")
    const resultDotlessI = filterAliases(mockAliases, "ısp");
    expect(resultDotlessI.map((a) => a.id)).toContain("ispanak");

    // Tümü büyük harf SÜT ile arama
    const resultSut = filterAliases(mockAliases, "SÜT");
    expect(resultSut.map((a) => a.id)).toContain("sut");
  });

  it("markaya göre filtreler", () => {
    const result = filterAliases(mockAliases, "Pınar");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sut");
  });

  it("tetikleyiciye göre filtreler", () => {
    const result = filterAliases(mockAliases, "whey");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("protein-shake");
  });

  it("eşleşme yoksa boş dizi döndürür", () => {
    const result = filterAliases(mockAliases, "pizza");
    expect(result).toEqual([]);
  });
});
