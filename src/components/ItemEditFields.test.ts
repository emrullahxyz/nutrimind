import { describe, expect, it } from "vitest";
import { resolveQuantityMode } from "./ItemEditFields";
import type { MealSource } from "../types";

describe("resolveQuantityMode", () => {
  it("sources yoksa stepper döner", () => {
    expect(resolveQuantityMode(undefined, [])).toBe("stepper");
  });

  it("sources boş dizi ise stepper döner", () => {
    expect(resolveQuantityMode([], [])).toBe("stepper");
  });

  it("birden fazla kaynakta (sepetten birleşmiş kalem) stepper döner", () => {
    const sources: MealSource[] = [
      { aliasId: "a", qty: 1, unit: "g" },
      { aliasId: "b", qty: 1, unit: "g" },
    ];
    expect(resolveQuantityMode(sources, [{ id: "a" }, { id: "b" }])).toBe("stepper");
  });

  it("tek kaynak ve alias hâlâ hafızada varsa exact döner", () => {
    const sources: MealSource[] = [{ aliasId: "a", qty: 100, unit: "g" }];
    expect(resolveQuantityMode(sources, [{ id: "a" }])).toBe("exact");
  });

  it("tek kaynak ama alias artık hafızada yoksa (silinmiş) stepper döner", () => {
    const sources: MealSource[] = [{ aliasId: "deleted", qty: 100, unit: "g" }];
    expect(resolveQuantityMode(sources, [{ id: "a" }])).toBe("stepper");
  });
});
