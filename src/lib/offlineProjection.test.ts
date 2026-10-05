import { describe, expect, it } from "vitest";
import type { AppData } from "./api";
import type { OfflineOperation } from "./offlineCache";
import { applyOperation, deepEqual, projectOperations } from "./offlineProjection";

const base: AppData = {
  goals: { version: 2, profiles: [], defaultProfileId: "", weekday: {}, overrides: {} },
  days: {},
  aliases: [],
  config: {},
};

describe("offline projection", () => {
  it("projects a saved day", () => {
    const operation: OfflineOperation = {
      id: "1",
      kind: "save-day",
      date: "2026-08-28",
      meals: [
        { name: "Yogurt", nutrition: { kcal: 100, protein: 5, carbs: 10, fat: 2, fiber: 1 } },
      ],
      base,
      createdAt: "2026-08-28T10:00:00Z",
      retryCount: 0,
      status: "pending",
    };
    expect(applyOperation(base, operation).days["2026-08-28"][0].label).toBe("Yogurt");
  });

  it("şablondan uygulanan öğün templateId'sini korur (sayaç sessizce 0 olmasın)", () => {
    const operation: OfflineOperation = {
      id: "1",
      kind: "save-day",
      date: "2026-08-28",
      meals: [
        {
          name: "Sabah Kahvaltısı",
          nutrition: { kcal: 100, protein: 5, carbs: 10, fat: 2, fiber: 1 },
          templateId: "t_kahvalti",
        },
      ],
      base,
      createdAt: "2026-08-28T10:00:00Z",
      retryCount: 0,
      status: "pending",
    };
    expect(applyOperation(base, operation).days["2026-08-28"][0].templateId).toBe("t_kahvalti");
  });

  it("kaynaksız kalemin gramajını korur (offline'da kaybolmasın)", () => {
    const operation: OfflineOperation = {
      id: "1",
      kind: "save-day",
      date: "2026-08-28",
      meals: [
        {
          name: "Ev yapimi sos",
          nutrition: { kcal: 100, protein: 5, carbs: 10, fat: 2, fiber: 1 },
          grams: 150,
        },
      ],
      base,
      createdAt: "2026-08-28T10:00:00Z",
      retryCount: 0,
      status: "pending",
    };
    expect(applyOperation(base, operation).days["2026-08-28"][0].grams).toBe(150);
  });

  it("projects alias create and update", () => {
    const operation: OfflineOperation = {
      id: "1",
      kind: "save-alias",
      localId: "local:a",
      alias: {
        triggers: ["yoğurt"],
        name: "Yoğurt",
        brand: null,
        serving_g: 100,
        nutrition: { kcal: 100, protein: 5, carbs: 10, fat: 2, fiber: 1 },
        units: [{ name: "adet", grams: 50 }],
        defaultUnit: "adet",
      },
      base,
      createdAt: "2026-08-28T10:00:00Z",
      retryCount: 0,
      status: "pending",
    };
    const projected = applyOperation(base, operation);
    expect(projected.aliases).toHaveLength(1);
    expect(projected.aliases[0].id).toBe("local:a");
    expect(projected.aliases[0].defaultUnit).toBe("adet");
  });

  it("projects pending operations in creation order", () => {
    const operation: OfflineOperation = {
      id: "1",
      kind: "save-day",
      date: "2026-08-28",
      meals: [],
      base,
      createdAt: "2026-08-28T10:00:00Z",
      retryCount: 0,
      status: "pending",
    };
    expect(
      projectOperations(
        {
          ...base,
          days: {
            "2026-08-28": [
              {
                id: "old",
                label: "Old",
                computed: { kcal: 1, protein: 0, carbs: 0, fat: 0, fiber: 0 },
              },
            ],
          },
        },
        [operation],
      ).days["2026-08-28"],
    ).toEqual([]);
  });

  it("conflict operations stay in the projection (user keeps seeing their version)", () => {
    const operation: OfflineOperation = {
      id: "1",
      kind: "save-day",
      date: "2026-08-28",
      meals: [
        { name: "Yogurt", nutrition: { kcal: 100, protein: 5, carbs: 10, fat: 2, fiber: 1 } },
      ],
      base,
      createdAt: "2026-08-28T10:00:00Z",
      retryCount: 0,
      status: "conflict",
    };
    expect(projectOperations(base, [operation]).days["2026-08-28"][0].label).toBe("Yogurt");
  });

  it("same-session create-then-delete local alias stays net-zero in projection", () => {
    // Kullanıcı çevrimdışıyken yerel alias oluşturup aynı oturumda sildi.
    // Kuyruk sırayla: save-alias (local:a) sonra delete-alias (local:a).
    // Projeksiyon önce alias'ı ekler, sonra kaldırır → net-sıfır.
    const alias = { triggers: ["yoğurt"], name: "Yoğurt", brand: null, serving_g: 100, nutrition: { kcal: 100, protein: 5, carbs: 10, fat: 2, fiber: 1 } };
    const created = applyOperation(base, {
      id: "1",
      kind: "save-alias",
      localId: "local:a",
      alias,
      base,
      createdAt: "2026-08-28T10:00:00Z",
      retryCount: 0,
      status: "pending",
    });
    expect(created.aliases).toHaveLength(1);

    // delete-op, oluşturma sonrası snapshot'ı temel alır (gerçekçi base).
    const projected = projectOperations(base, [
      {
        id: "1",
        kind: "save-alias",
        localId: "local:a",
        alias,
        base,
        createdAt: "2026-08-28T10:00:00Z",
        retryCount: 0,
        status: "pending",
      },
      {
        id: "2",
        kind: "delete-alias",
        aliasId: "local:a",
        base: created,
        createdAt: "2026-08-28T10:05:00Z",
        retryCount: 0,
        status: "pending",
      },
    ]);
    expect(projected.aliases).toEqual([]);
  });

  it("deepEqual ignores key order and handles undefined", () => {
    expect(deepEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual([1, 2], [1, 3])).toBe(false);
  });
});
