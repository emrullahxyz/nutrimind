# Template & Meal Ingredient Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user edit a saved template or a logged meal's ingredients — add, remove, re-gram and swap items — in place, instead of only swapping one existing item for another.

**Architecture:** One shared pure module `lib/ingredientDraft.ts` owns the draft-line algebra (create, edit grams, add, remove, swap, commit). Two thin components render it: `TemplatePreview` (already exists, gains full editing) and the `IngredientLines` block inside `NutritionSheet` (already exists, gains the same controls). Commit is mutate → refetch; nothing about the write path changes.

**Tech Stack:** React 18, TypeScript, Tailwind, react-i18next, vitest.

**Spec:** No separate design doc — the approved chat design plus the user feedback that drove it:
1. "swap one ingredient for another in my recipe" (original feedback, already shipped in this branch)
2. "see the macros for each individual ingredient" (already shipped in this branch)
3. "şablonlara eklediğim bi yemeği editleyebilmek istiyorum. Bazen sebze vs ekleyebiliyorum, gramajlarını da değiştirebilmek istiyorum." (this plan)

## Global Constraints

- **Repo rules (AGENTS.md):** `server/index.js` is FROZEN — this plan touches zero `server/**` files. New user-visible text goes into all three locales (`en`, `tr`, `pl`) and must pass `pnpm check:i18n`. Overlay/dialog focus and back-button handling go through the existing `Modal` / `useDialogFocus()` / `useModalHistory()` recipes — never hand-rolled. Pure logic lives in `src/lib/*.ts` with tests; i18n never enters a pure lib module.
- **Write pattern:** mutate → refetch. No optimistic updates.
- **Verification gate before declaring done:** `pnpm typecheck` (0 errors) + `pnpm test` (all pass) + `pnpm check:i18n` + `pnpm build`.
- **Version rule:** bump `APP_VERSION` in `src/lib/version.ts` AND prepend a `changelog.ts` entry (version, date, summary tr/en, items, dev). `pnpm test` validates semver order.
- **Rounding (lesson L20):** anything shown in an input is exactly what gets saved. Never let a display transform mutate data silently.
- **Float artifacts (lesson L20 sibling):** totals must be rounded to 1 decimal (`sodium` to integer) before reaching an input — `addNutrition` leaves artifacts like `42.800000000000004`.
- **Grammar on commit:** per AGENTS.md rule 8, commit messages must NOT include any AI/agent co-author line.

## Already shipped on this branch (do not redo)

- `src/lib/ingredientLines.ts` — `resolveMealIngredients`, `swapIngredientLine`, `linesToMealParts`
- `src/lib/ingredientLines.test.ts` — 7 tests
- `NutritionSheet` `IngredientLines` block — per-ingredient macros + swap
- `src/components/TemplatePreview.tsx` — template preview + swap + "also update template"
- i18n keys `nutrition.ingredientsTitle`, `nutrition.swapIngredient`, `templatePreview.updateTemplate`

Measured in the production build: swap keeps grams, recalculates macros, updates the hero card, persists `sources`, survives reload. Source-less meals show no ingredient section (no regression).

---

### Task 1: Pure draft-line algebra (`lib/ingredientDraft.ts`)

**Files:**
- Create: `src/lib/ingredientDraft.ts`
- Create: `src/lib/ingredientDraft.test.ts`

**Interfaces:**
- Consumes: `IngredientLine` and `linesToMealParts` from `lib/ingredientLines.ts`; `scaleNutrition`, `toGrams`, `unitOptions`, `defaultUnitForAlias` from `lib/nutrition.ts`; types `Alias`, `Nutrition`, `MealSource` from `src/types.ts`.
- Produces:
  ```ts
  export interface DraftLine {
    key: string;          // stable React key + edit target
    aliasId: string | null; // null = manual line, no memory link
    name: string;
    qty: string;          // raw input text (tr-TR parseable)
    unit: string;         // "g" or a custom unit name
    grams: number;
    nutrition: Nutrition;
  }
  export function newDraftLine(alias: Alias | undefined): DraftLine;
  export function draftLineFromAlias(alias: Alias, qty: string, unit: string): DraftLine;
  export function setDraftGrams(line: DraftLine, gramsText: string, alias: Alias | null): DraftLine;
  export function swapDraftLine(line: DraftLine, next: Alias): DraftLine;
  export function addDraftLine(lines: DraftLine[], line: DraftLine): DraftLine[];
  export function removeDraftLine(lines: DraftLine[], key: string): DraftLine[];
  export function draftLinesToItems(lines: DraftLine[]): MealTemplateItem[]; // {name,nutrition,sources?}
  ```
  `MealTemplateItem` is the existing `TemplateItem` from `lib/templates.ts` (`{ name, nutrition, sources? }`).

**Notes on the algebra:**
- `newDraftLine(undefined)` returns a manual line: `aliasId: null`, `name: ""`, `qty: ""`, `unit: "g"`, `grams: 0`, `nutrition: { ...ZERO_NUTRITION }`. A zero-gram line is EXCLUDED from the commit (see `draftLinesToItems`).
- `draftLineFromAlias` computes `grams = toGrams(parseNum(qty), unitObj)` and `nutrition = scaleNutrition(alias.nutrition, alias.serving_g, grams)`. If the alias is missing or grams <= 0, the line keeps the previous `nutrition` rather than zeroing it (so the user typing "1" then "50" never sees the macros flash to 0).
- `setDraftGrams` returns a new line with `qty` set to the raw text and `grams`/`nutrition` recomputed **only when** grams > 0; otherwise keeps existing nutrition.
- `swapDraftLine` preserves `grams`, converts qty into the new alias's `defaultUnitForAlias`, recomputes nutrition from the new alias.
- `draftLinesToItems` filters `grams > 0 || aliasId !== null`, and emits `sources: [{ aliasId, qty: parseNum(qty), unit }]` **only when `aliasId !== null`**. Manual lines carry no `sources` (matches how `RecipeBuilder` writes manual ingredients).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ingredientDraft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addDraftLine,
  draftLineFromAlias,
  draftLinesToItems,
  newDraftLine,
  removeDraftLine,
  setDraftGrams,
  swapDraftLine,
} from "./ingredientDraft";
import type { Alias } from "../types";

const tavuk: Alias = {
  id: "a1",
  triggers: ["tavuk"],
  name: "Tavuk",
  brand: null,
  serving_g: 100,
  nutrition: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 },
};

const tofu: Alias = {
  id: "a2",
  triggers: ["tofu"],
  name: "Tofu",
  brand: null,
  serving_g: 100,
  nutrition: { kcal: 76, protein: 8, carbs: 1.9, fat: 4.8, fiber: 0.3 },
};

describe("newDraftLine", () => {
  it("alias verilirse ondan satır üretir", () => {
    const line = newDraftLine(tavuk);
    expect(line.aliasId).toBe("a1");
    expect(line.name).toBe("Tavuk");
    expect(line.unit).toBe("g");
  });

  it("alias yoksa elle satır üretir (aliasId null, makro sıfır)", () => {
    const line = newDraftLine(undefined);
    expect(line.aliasId).toBeNull();
    expect(line.name).toBe("");
    expect(line.qty).toBe("");
    expect(line.grams).toBe(0);
    expect(line.nutrition.kcal).toBe(0);
  });
});

describe("draftLineFromAlias", () => {
  it("miktarı grama çevirir ve makroyu ölçekler", () => {
    const line = draftLineFromAlias(tavuk, "150", "g");
    expect(line.grams).toBe(150);
    expect(line.nutrition.kcal).toBe(247.5);
  });

  it("tr-TR virgülü de kabul eder", () => {
    const line = draftLineFromAlias(tavuk, "12,5", "g");
    expect(line.grams).toBe(12.5);
  });

  it("geçersiz gramaj mevcut makroyu SIFIRLAMAZ (yazma sırasında titreme)", () => {
    const base = draftLineFromAlias(tavuk, "150", "g");
    const typed = setDraftGrams(base, "", tavuk);
    expect(typed.grams).toBe(0);
    expect(typed.nutrition.kcal).toBe(247.5);
  });
});

describe("setDraftGrams", () => {
  it("yeni gramaja göre makroyu yeniden hesaplar", () => {
    const line = setDraftGrams(draftLineFromAlias(tavuk, "150", "g"), "300", tavuk);
    expect(line.grams).toBe(300);
    expect(line.nutrition.kcal).toBe(495);
  });

  it("elle yazılan metni qty olarak korur (virgüllü girilim kaybolmaz)", () => {
    const line = setDraftGrams(draftLineFromAlias(tavuk, "100", "g"), "12,5", tavuk);
    expect(line.qty).toBe("12,5");
    expect(line.grams).toBe(12.5);
  });
});

describe("swapDraftLine", () => {
  it("gramı korur, makroyu yeni besinden hesaplar", () => {
    const line = swapDraftLine(draftLineFromAlias(tavuk, "150", "g"), tofu);
    expect(line.grams).toBe(150);
    expect(line.aliasId).toBe("a2");
    expect(line.name).toBe("Tofu");
    expect(line.nutrition.kcal).toBe(114);
  });

  it("miktarı yeni alias'ın varsayılan birimine çevirir", () => {
    const line = swapDraftLine(draftLineFromAlias(tavuk, "150", "g"), tofu);
    expect(line.unit).toBe("g");
    expect(line.qty).toBe(150);
  });
});

describe("addDraftLine / removeDraftLine", () => {
  it("add sona ekler", () => {
    const a = newDraftLine(tavuk);
    const b = newDraftLine(tofu);
    expect(addDraftLine([a], b)).toHaveLength(2);
  });

  it("remove key ile siler", () => {
    const a = newDraftLine(tavuk);
    const b = newDraftLine(tofu);
    expect(removeDraftLine([a, b], b.key)).toEqual([a]);
  });
});

describe("draftLinesToItems", () => {
  it("alias satırlarını sources ile yazar", () => {
    const items = draftLinesToItems([draftLineFromAlias(tavuk, "150", "g")]);
    expect(items).toHaveLength(1);
    expect(items[0].sources).toEqual([{ aliasId: "a1", qty: 150, unit: "g" }]);
  });

  it("0 gramajlı alias satırını ATAR (anlamsız kayıt)", () => {
    const items = draftLinesToItems([draftLineFromAlias(tavuk, "", "g")]);
    expect(items).toHaveLength(0);
  });

  it("elle satır sources ÜRETMEZ", () => {
    const manual = newDraftLine(undefined);
    manual.name = "Zeytinyağı";
    manual.qty = "10";
    manual.grams = 10;
    manual.nutrition = { kcal: 90, protein: 0, carbs: 0, fat: 10, fiber: 0 };
    const items = draftLinesToItems([manual]);
    expect(items[0].sources).toBeUndefined();
    expect(items[0].name).toBe("Zeytinyağı");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/ingredientDraft.test.ts`
Expected: FAIL — `Cannot find module './ingredientDraft'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/ingredientDraft.ts`:

```ts
// Nutrimind — düzenlenebilir kalem satırlarının saf cebir kaynağı.
// Hem `TemplatePreview` (şablon) hem `NutritionSheet` (günlük kayıt) bu
// modülü kullanır; iki yüzey de aynı kuralları gösterir, bu yüzden kurallar
// BURADA yaşar ve jsdom olmadan test edilir.
//
// İki sözleşme:
//   1. Gösterilen = kaydedilen (bkz. lessons.md L20). Gramaj alanında yazan
//      metin `qty`'ye aynen girer; ölçüm `grams` üzerinden yapılır.
//   2. Yarım yazılan bir gramaj makroyu SIFIRLAMAZ — kullanıcı "1" yazıp
//      "50" yaparken değerler titrer.
import type { Alias, Nutrition } from "../types";
import { ZERO_NUTRITION } from "../types";
import type { NutrientKey } from "./nutrients";
import { NUTRIENT_KEYS } from "./nutrients";
import { defaultUnitForAlias, parseNum, scaleNutrition, toGrams, unitOptions } from "./nutrition";
import type { TemplateItem } from "./templates";

export interface DraftLine {
  /** React anahtarı + düzenleme hedefi. Zaman damgalı benzersiz. */
  key: string;
  /** null = elle girilmiş kalem, hafıza bağlantısı yok. */
  aliasId: string | null;
  name: string;
  /** Kullanıcının gördüğü ham metin — tr-TR ayrıştırılabilir. */
  qty: string;
  unit: string;
  grams: number;
  nutrition: Nutrition;
}

let seq = 0;
function nextKey(): string {
  seq += 1;
  return `draft-${Date.now()}-${seq}`;
}

/** 0,1 hassasiyet + sodyum tam sayı — `addNutrition` kayan nokta artığı
 *  bırakır ve bu artık girdi alanında olduğu gibi görünür (L20 kardeşi). */
export function roundNutrition(n: Nutrition): Nutrition {
  const out = { ...n };
  for (const key of NUTRIENT_KEYS) {
    const v = out[key];
    // undefined ("bilinmiyor") kalır — 0 yazmak uydurma veri üretir.
    if (typeof v !== "number") continue;
    out[key] = key === "sodium" ? Math.round(v) : Math.round(v * 10) / 10;
  }
  return out;
}

function unitFor(alias: Alias | null, unit: string) {
  if (!alias) return { name: unit.trim() || "g", grams: 1 };
  return unitOptions(alias.units).find((u) => u.name === unit) ?? defaultUnitForAlias(alias);
}

/** Verilen alias + miktar/birimden satır. Geçersiz gramajda `nutrition`
 *  dokunulmadan `ZERO_NUTRITION` DEĞİL, verilen `fallback` korunur. */
export function draftLineFromAlias(
  alias: Alias,
  qty: string,
  unit: string,
  fallback?: Nutrition,
): DraftLine {
  const u = unitFor(alias, unit);
  const grams = toGrams(parseNum(qty), u);
  const valid = grams > 0;
  return {
    key: nextKey(),
    aliasId: alias.id,
    name: alias.name,
    qty,
    unit: u.name,
    grams: valid ? grams : 0,
    nutrition: valid ? scaleNutrition(alias.nutrition, alias.serving_g, grams) : (fallback ?? { ...ZERO_NUTRITION }),
  };
}

/** Hafızadan seçilmiş bir besinle yeni satır (boş miktar). */
export function newDraftLine(alias: Alias | undefined): DraftLine {
  if (!alias) {
    return { key: nextKey(), aliasId: null, name: "", qty: "", unit: "g", grams: 0, nutrition: { ...ZERO_NUTRITION } };
  }
  return draftLineFromAlias(alias, "", defaultUnitForAlias(alias).name);
}

/** Gramaj alanı değişti. Makro yalnızca GEÇERLİ gramajda yeniden hesaplanır. */
export function setDraftGrams(line: DraftLine, gramsText: string, alias: Alias | null): DraftLine {
  const parsed = parseNum(gramsText);
  const valid = parsed > 0;
  const u = unitFor(alias, line.unit);
  const grams = valid ? toGrams(parsed, u) : 0;
  if (!valid || !alias) {
    // Makro korunur: kullanıcı yarım yazarken değerler titremesin.
    return { ...line, qty: gramsText, grams };
  }
  return {
    ...line,
    qty: gramsText,
    grams,
    nutrition: scaleNutrition(alias.nutrition, alias.serving_g, grams),
  };
}

/** Swap: gram korunur, miktar hedef alias'ın varsayılan birimine çevrilir. */
export function swapDraftLine(line: DraftLine, next: Alias): DraftLine {
  const u = defaultUnitForAlias(next);
  const qty = u.grams > 0 ? Math.round((line.grams / u.grams) * 10) / 10 : line.grams;
  return {
    key: line.key,
    aliasId: next.id,
    name: next.name,
    qty: String(qty),
    unit: u.name,
    grams: line.grams,
    nutrition: scaleNutrition(next.nutrition, next.serving_g, line.grams),
  };
}

export function addDraftLine(lines: DraftLine[], line: DraftLine): DraftLine[] {
  return [...lines, line];
}

export function removeDraftLine(lines: DraftLine[], key: string): DraftLine[] {
  return lines.filter((l) => l.key !== key);
}

/** Kayıt/şablon kalemlerine çevirir. 0 gramajlı satırlar ATILIR; elle
 *  satırlar `sources` üretmez. */
export function draftLinesToItems(lines: DraftLine[]): TemplateItem[] {
  const items: TemplateItem[] = [];
  for (const l of lines) {
    if (l.grams <= 0) continue;
    items.push({
      name: l.name,
      nutrition: roundNutrition(l.nutrition),
      ...(l.aliasId ? { sources: [{ aliasId: l.aliasId, qty: parseNum(l.qty), unit: l.unit }] } : {}),
    });
  }
  return items;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/ingredientDraft.test.ts`
Expected: PASS — 14 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingredientDraft.ts src/lib/ingredientDraft.test.ts
git commit -m "feat(recipes): saf kalem satiri cebiri (ekle/sil/gramaj/swap)"
```

---

### Task 2: Full editing in `TemplatePreview`

**Files:**
- Modify: `src/components/TemplatePreview.tsx` (replace swap-only lines with the draft editor)
- Modify: `src/i18n/locales/en.json`, `tr.json`, `pl.json`
- Test: `src/lib/ingredientDraft.test.ts` (already covers the algebra; no new test file)

**Interfaces:**
- Consumes: everything from `lib/ingredientDraft.ts` (Task 1); `Alias` list from props.
- Produces: `onApply(lines: DraftLine[], updateTemplate: boolean)` — signature change from the current `onApply(lines: PreviewLine[], updateTemplate: boolean)`. `DayView` is updated in Task 3.

- [ ] **Step 1: Add the i18n keys to all three locales**

Add to the `nutrition` object in `en.json`:
```json
"ingredientAdd": "Add ingredient",
"ingredientRemove": "Remove ingredient",
"ingredientManualName": "Ingredient name",
"ingredientGrams": "Amount (g)",
"emptyIngredients": "All ingredients removed — add one to apply."
```
Add to `tr.json`:
```json
"ingredientAdd": "Malzeme ekle",
"ingredientRemove": "Malzemeyi kaldır",
"ingredientManualName": "Malzeme adı",
"ingredientGrams": "Miktar (g)",
"emptyIngredients": "Tüm malzemeler kaldırıldı — eklemek için bir tane ekle."
```
Add to `pl.json`:
```json
"ingredientAdd": "Dodaj składnik",
"ingredientRemove": "Usuń składnik",
"ingredientManualName": "Nazwa składnika",
"ingredientGrams": "Ilość (g)",
"emptyIngredients": "Wszystkie składniki usunięte — dodaj jeden, aby zastosować."
```

- [ ] **Step 2: Rewrite the component body**

Replace the whole of `src/components/TemplatePreview.tsx` with:

```tsx
// Şablon önizlemesi + DÜZENLEYİCİ: çipe dokununca kör uygulamadan önce
// içindekiler açılır; kalem eklenir/silinir/gramajı değişir/swap edilir.
// "Şablonu da güncelle" işaretliyse değişiklik tanıma da yazılır, işaretli
// değilse yalnızca bu güne eklenir.
//
// Saf kurallar `lib/ingredientDraft.ts`'te; burada yalnızca çizim var.
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { FormActions, NutrientSummaryLine, NumField, TextField } from "./FormBits";
import type { MealTemplate } from "../lib/templates";
import type { Alias, Nutrition } from "../types";
import { addNutrition } from "../lib/nutrition";
import {
  addDraftLine,
  draftLineFromAlias,
  draftLinesToItems,
  newDraftLine,
  removeDraftLine,
  roundNutrition,
  setDraftGrams,
  swapDraftLine,
} from "../lib/ingredientDraft";
import type { DraftLine } from "../lib/ingredientDraft";

/** Şablon kalemlerini düzenlenebilir satırlara çevirir. Hafızada çözülebilen
 *  kalemler alias'a bağlanır (gramaj/swap açılır); çözülemeyen elle satır
 *  kalır. */
function initialDraftLines(template: MealTemplate, aliases: Alias[]): DraftLine[] {
  const byId = new Map(aliases.map((a) => [a.id, a]));
  return template.items.map((item) => {
    const src = item.sources?.[0];
    const alias = src ? byId.get(src.aliasId) : undefined;
    if (src && alias) {
      return draftLineFromAlias(alias, String(src.qty), src.unit, item.nutrition);
    }
    return {
      key: `draft-manual-${item.name}-${Math.random().toString(36).slice(2, 8)}`,
      aliasId: null,
      name: item.name,
      qty: "",
      unit: "g",
      grams: 0,
      nutrition: item.nutrition,
    };
  });
}

export function TemplatePreview({
  template,
  aliases,
  busy,
  onClose,
  onApply,
}: {
  template: MealTemplate;
  aliases: Alias[];
  busy: boolean;
  onClose: () => void;
  /** lines: güncel kalem satırları, updateTemplate: tanıma da yazılsın mı. */
  onApply: (lines: DraftLine[], updateTemplate: boolean) => void;
}) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<DraftLine[]>(() => initialDraftLines(template, aliases));
  const [swapKey, setSwapKey] = useState<string | null>(null);
  const [updateTemplate, setUpdateTemplate] = useState(false);

  // Farklı şablon açılırsa sıfırla (bileşen yeniden mount olmayabilir).
  useEffect(() => {
    setLines(initialDraftLines(template, aliases));
    setSwapKey(null);
    setUpdateTemplate(false);
  }, [template]);

  const total = useMemo(
    () => roundNutrition(lines.reduce<Nutrition>((a, l) => addNutrition(a, l.nutrition), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })),
    [lines],
  );

  function aliasOf(line: DraftLine): Alias | undefined {
    return line.aliasId ? aliases.find((a) => a.id === line.aliasId) : undefined;
  }

  function patch(key: string, next: DraftLine) {
    setLines((prev) => prev.map((l) => (l.key === key ? next : l)));
  }

  return (
    <Modal
      title={template.name}
      onClose={onClose}
      footer={
        <FormActions
          onCancel={onClose}
          onSave={() => onApply(lines, updateTemplate)}
          saving={busy}
          disabled={busy || lines.length === 0}
          saveLabel={t("day.addMeal")}
        />
      }
    >
      <div className="flex flex-col gap-3">
        {lines.length === 0 ? (
          <p className="rounded-chip border border-line bg-white/[0.03] p-3 text-[11px] text-ink-tertiary">
            {t("nutrition.emptyIngredients")}
          </p>
        ) : (
          <ul className="space-y-2">
            {lines.map((line) => {
              const alias = aliasOf(line);
              return (
                <li
                  key={line.key}
                  className="rounded-chip border border-line bg-white/[0.03] px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    {swapKey === line.key ? (
                      <select
                        autoFocus
                        aria-label={t("nutrition.swapIngredient")}
                        className="w-full rounded-xl bg-field px-3 py-2 text-xs font-bold text-white focus:outline-none"
                        value={line.aliasId ?? ""}
                        onChange={(e) => {
                          const next = aliases.find((a) => a.id === e.target.value);
                          if (next) patch(line.key, swapDraftLine(line, next));
                          setSwapKey(null);
                        }}
                      >
                        {aliases.map((a) => (
                          <option key={a.id} value={a.id} className="bg-field text-white">
                            {a.name} · {a.nutrition.kcal} kcal/{a.serving_g}g
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink-primary">
                        {line.name}
                      </span>
                    )}
                    {swapKey !== line.key && lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines((prev) => removeDraftLine(prev, line.key))}
                        aria-label={t("nutrition.ingredientRemove")}
                        title={t("nutrition.ingredientRemove")}
                        className="p-1 text-ink-tertiary transition hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <NumField
                      label={t("nutrition.ingredientGrams")}
                      suffix="g"
                      value={line.qty}
                      onChange={(v) => patch(line.key, setDraftGrams(line, v, alias ?? null))}
                    />
                    <div className="flex items-end justify-end">
                      {alias ? (
                        <button
                          type="button"
                          onClick={() => setSwapKey(line.key)}
                          className="rounded-pill border border-line px-3 py-2 text-[11px] font-bold text-ink-secondary transition hover:text-ink-primary"
                        >
                          {t("nutrition.swapIngredient")}
                        </button>
                      ) : (
                        <TextField
                          label={t("nutrition.ingredientManualName")}
                          value={line.name}
                          onChange={(v) => patch(line.key, { ...line, name: v })}
                        />
                      )}
                    </div>
                  </div>

                  <NutrientSummaryLine
                    as="span"
                    nutrition={line.nutrition}
                    className="mt-2 block font-mono text-[11px] text-ink-tertiary"
                  />
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setLines((prev) => addDraftLine(prev, newDraftLine(aliases[0])))}
          className="flex w-full items-center justify-center gap-1.5 rounded-pill border border-line bg-white/[0.04] px-3 py-2.5 text-xs font-bold text-ink-secondary transition hover:text-ink-primary"
        >
          <Plus className="h-3.5 w-3.5" /> {t("nutrition.ingredientAdd")}
        </button>

        <NutrientSummaryLine
          nutrition={total}
          kcal="total"
          className="rounded-chip border border-line bg-white/[0.03] p-3 font-mono text-xs text-accent"
        />

        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={updateTemplate}
            onChange={(e) => setUpdateTemplate(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/10"
          />
          {t("templatePreview.updateTemplate")}
        </label>
      </div>
    </Modal>
  );
}
```

Note: this component does NOT export a `previewLinesToItems` helper — `DayView` imports `draftLinesToItems` directly from `lib/ingredientDraft.ts`.

- [ ] **Step 3: Update `DayView` for the new `onApply` signature**

In `src/components/DayView.tsx`, change `applyTemplate`'s parameter type and body:

```tsx
  async function applyTemplate(lines: DraftLine[], updateTemplate: boolean) {
    const t = previewTemplate;
    if (busy || !t) return;
    setErr(null);
    setBusy(true);
    try {
      const items = draftLinesToItems(lines);
      const newPayloads: MealPayload[] = items.map((it) => ({
        name: it.name,
        nutrition: it.nutrition,
        ...(it.sources ? { sources: it.sources } : {}),
      }));
      await setDayMeals(date, [...toPayload(meals), ...newPayloads]);
      if (updateTemplate) {
        await updateConfig("templates", {
          list: templates.list.map((x) => (x.id === t.id ? { ...x, items } : x)),
        });
      }
      setPreviewTemplate(null);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }
```

Add these imports at the top of `DayView.tsx`:
```tsx
import { draftLinesToItems } from "../lib/ingredientDraft";
import type { DraftLine } from "../lib/ingredientDraft";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: all pass (was 1088; now ≥1102)

- [ ] **Step 6: Commit**

```bash
git add src/components/TemplatePreview.tsx src/components/DayView.tsx src/i18n/locales/en.json src/i18n/locales/tr.json src/i18n/locales/pl.json
git commit -m "feat(templates): sablon onizlemesinde malzeme ekle/sil/gramaj duzenleme"
```

---

### Task 3: Same editing in `NutritionSheet` (logged meals)

**Files:**
- Modify: `src/components/NutritionSheet.tsx` — the `IngredientLines` block only
- Test: `src/lib/ingredientDraft.test.ts` (algebra already covered)

**Interfaces:**
- Consumes: `lib/ingredientDraft.ts` (Task 1).
- Produces: `onSwap` becomes `onCommit(next: DraftLine[])` — same shape as before but carrying `DraftLine[]` instead of `IngredientLine[]`.

**Important — do not break the existing behaviour:**
- Source-less meals still show NO ingredient section (`resolveMealIngredients` returns `null` → early return). This is a measured no-regression case; keep it.
- The hero calorie card must keep tracking the swap total (lesson L20) — `onCommit` must still call `setBasis("quantity")` + `setDraft(toDraft(...))`.
- The stepper must still clear swaps (`setSwappedLines(null)` in `handleStep`), and manual macro edits must too (`updateField`).

- [ ] **Step 1: Replace the `IngredientLines` component**

In `src/components/NutritionSheet.tsx`, replace the whole `IngredientLines` function (from `/** sources çözülebilen...` down to its closing `}`) with:

```tsx
/** Kaydın çözülebilen kalem satırları + tam düzenleme (ekle/sil/gramaj/swap).
 *  Saf kurallar `lib/ingredientDraft.ts`'te. */
function IngredientLines({
  meal,
  aliases,
  resetKey,
  onCommit,
}: {
  meal: MealItem;
  aliases: Alias[];
  resetKey: unknown;
  onCommit: (lines: DraftLine[]) => void;
}) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<DraftLine[] | null>(() =>
    meal.sources && meal.sources.length > 0
      ? meal.sources
          .map((s) => {
            const alias = aliases.find((a) => a.id === s.aliasId);
            return alias ? draftLineFromAlias(alias, String(s.qty), s.unit) : null;
          })
          .filter((l): l is DraftLine => l !== null)
      : null,
  );
  const [swapKey, setSwapKey] = useState<string | null>(null);

  // meal doğrudan deps'e konmaz: resolve her render yeni dizi üretir ve effect
  // döngüye girer. `resetKey` (meal.id) parent'tan gelir.
  useEffect(() => {
    if (resetKey === undefined) return;
    setLines(
      meal.sources && meal.sources.length > 0
        ? meal.sources
            .map((s) => {
              const alias = aliases.find((a) => a.id === s.aliasId);
              return alias ? draftLineFromAlias(alias, String(s.qty), s.unit) : null;
            })
            .filter((l): l is DraftLine => l !== null)
        : null,
    );
    setSwapKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Kaynaksız öğün: kırılım yok, bölüm hiç çizilmez (ölçülmüş regresyon).
  if (!lines || lines.length === 0) return null;

  function aliasOf(line: DraftLine): Alias | undefined {
    return line.aliasId ? aliases.find((a) => a.id === line.aliasId) : undefined;
  }

  function patch(key: string, next: DraftLine) {
    setLines((prev) => {
      if (!prev) return prev;
      const updated = prev.map((l) => (l.key === key ? next : l));
      onCommit(updated);
      return updated;
    });
  }

  const total = roundNutrition(
    lines.reduce<Nutrition>((acc, l) => addNutrition(acc, l.nutrition), {
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
    }),
  );

  return (
    <div className="space-y-2.5 pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-white/90">{t("nutrition.ingredientsTitle")}</span>
        <span className="font-mono text-[11px] text-white/50">
          {total.kcal} kcal
        </span>
      </div>
      <ul className="space-y-2">
        {lines.map((line) => {
          const alias = aliasOf(line);
          return (
            <li
              key={line.key}
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs sm:text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                {swapKey === line.key ? (
                  <select
                    autoFocus
                    aria-label={t("nutrition.swapIngredient")}
                    className="w-full rounded-xl bg-field px-3 py-2 text-xs font-bold text-white focus:outline-none"
                    value={line.aliasId ?? ""}
                    onChange={(e) => {
                      const next = aliases.find((a) => a.id === e.target.value);
                      if (next) patch(line.key, swapDraftLine(line, next));
                      setSwapKey(null);
                    }}
                  >
                    {aliases.map((a) => (
                      <option key={a.id} value={a.id} className="bg-field text-white">
                        {a.name} · {a.nutrition.kcal} kcal/{a.serving_g}g
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-semibold text-white/90">
                      {line.name}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setLines((prev) => {
                            if (!prev) return prev;
                            const updated = removeDraftLine(prev, line.key);
                            onCommit(updated);
                            return updated;
                          })
                        }
                        aria-label={t("nutrition.ingredientRemove")}
                        title={t("nutrition.ingredientRemove")}
                        className="p-1 text-ink-tertiary transition hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <NumField
                  label={t("nutrition.ingredientGrams")}
                  suffix="g"
                  value={line.qty}
                  onChange={(v) => patch(line.key, setDraftGrams(line, v, alias ?? null))}
                />
                {alias && (
                  <button
                    type="button"
                    onClick={() => setSwapKey(line.key)}
                    className="mt-5 rounded-pill border border-white/15 px-3 py-2 text-[11px] font-bold text-amber-300 transition hover:text-amber-200"
                  >
                    {t("nutrition.swapIngredient")}
                  </button>
                )}
              </div>

              <NutrientSummaryLine
                as="span"
                nutrition={line.nutrition}
                className="mt-2 block font-mono text-[11px] text-white/50"
              />
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() =>
          setLines((prev) => (prev ? addDraftLine(prev, newDraftLine(aliases[0])) : prev))
        }
        className="flex w-full items-center justify-center gap-1.5 rounded-pill border border-white/15 bg-white/[0.04] px-3 py-2.5 text-[11px] font-bold text-ink-secondary transition hover:text-ink-primary"
      >
        <Plus className="h-3.5 w-3.5" /> {t("nutrition.ingredientAdd")}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Fix the imports and the commit handler**

In `src/components/NutritionSheet.tsx`:
- Add `Trash2` and `Plus` to the existing `lucide-react` import.
- Add `addNutrition` to the existing `../lib/nutrition` import.
- Replace the `ingredientLines` import block with:
  ```tsx
  import {
    addDraftLine,
    draftLineFromAlias,
    draftLinesToItems,
    newDraftLine,
    removeDraftLine,
    roundNutrition,
    setDraftGrams,
    swapDraftLine,
  } from "../lib/ingredientDraft";
  import type { DraftLine } from "../lib/ingredientDraft";
  ```
- Add `NumField` to the `FormBits` import.
- Change `swappedLines` state type to `DraftLine[] | null`.
- Use `[resetKey]` as the effect dependency — it is already written that way in the Step 1 body.
- Replace `handleApplySave`'s swap branch:
  ```tsx
    if (swappedLines && basis === "quantity") {
      const items = draftLinesToItems(swappedLines);
      let nutrition = { ...ZERO_NUTRITION };
      for (const item of items) nutrition = addNutrition(nutrition, item.nutrition);
      const collected = items.flatMap((i) => i.sources ?? []);
      const updated: MealItem = {
        ...meal,
        label,
        category,
        computed: roundNutrition(nutrition),
        ...(collected.length > 0 ? { sources: collected } : {}),
      };
      onSave(updated);
      beginClose();
      return;
    }
  ```
- Replace the `onSwap` prop at the call site with `onCommit`, which must both store the lines AND keep the hero card in sync:
  ```tsx
          <IngredientLines
            meal={meal}
            aliases={aliases}
            resetKey={meal.id}
            onCommit={(next) => {
              setSwappedLines(next);
              const items = draftLinesToItems(next);
              let nutrition = { ...ZERO_NUTRITION };
              for (const item of items) nutrition = addNutrition(nutrition, item.nutrition);
              // Gösterim kaydedilenle AYNI olmalı (L20).
              setBasis("quantity");
              setDraft(toDraft(roundNutrition(nutrition)));
            }}
          />
  ```
- Import `draftLinesToItems` from `../lib/ingredientDraft` as well.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 4: Run the full suite**

Run: `pnpm test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/components/NutritionSheet.tsx
git commit -m "feat(meals): kayit ekraninda malzeme ekleme/silme/gramaj duzenleme"
```

---

### Task 4: Release bookkeeping

**Files:**
- Modify: `src/lib/version.ts`
- Modify: `src/lib/changelog.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `APP_VERSION` bumped and a matching leading `CHANGELOG` entry.

- [ ] **Step 1: Bump the version**

In `src/lib/version.ts`, change the export to `export const APP_VERSION = "0.31.0";`

- [ ] **Step 2: Prepend the changelog entry**

In `src/lib/changelog.ts`, insert this as the FIRST element of `CHANGELOG` (above the existing `0.30.9` entry):

```ts
  {
    version: "0.31.0",
    date: "2026-10-03",
    summary: {
      tr: "Şablonlar artık düzenlenebilir: içindeki malzemeleri ekleyip çıkarabilir, gramajlarını değiştirebilir, bir malzemenin yerine başkasını koyabilirsin. Kayıtlı öğünlerde de aynı şey geçerli — toplamın altında malzeme malzeme görebilirsin.",
      en: "Templates are now editable: add or remove ingredients, change their amounts, or swap one for another. The same works for logged meals — every ingredient's macros are listed under the total.",
    },
    items: [
      {
        type: "new",
        tr: "Bir öğüne dokununca içindeki her malzeme kendi satırında, gramajı ve makrosuyla listelenir. Gramajı değiştirebilir, malzeme silebilir, yeni malzeme ekleyebilir ya da bir malzemenin yerine başkasını koyabilirsin.",
        en: "Tap a meal and every ingredient is listed on its own row with its amount and macros. Change the amount, remove an ingredient, add a new one, or swap one for another.",
      },
      {
        type: "new",
        tr: "Şablona dokununca doğrudan eklemek yerine önizleme açılır: kalemleri orada düzenleyip ekleyebilirsin. \"Şablonu da güncelle\" kutusu işaretliyse değişiklik kalıcı olur, sonraki kullanımlarda yeni haliyle gelir.",
        en: "Tapping a template opens a preview instead of adding it straight away: edit the items there, then add. Tick \"Also update the template\" to make the change stick for next time.",
      },
      {
        type: "improved",
        tr: "Miktar değiştirince makrolar anında yeniden hesaplanır ve kaydettikçe ekranda gördüğün değer veriye aynen yazılır.",
        en: "Macros recalculate the moment an amount changes, and what you see on screen is exactly what gets saved.",
      },
    ],
    dev: [
      "Yeni lib/ingredientDraft.ts (saf, testli): DraftLine cebiri — newDraftLine/draftLineFromAlias/setDraftGrams/swapDraftLine/addDraftLine/removeDraftLine/draftLinesToItems + roundNutrition. Iki yüzey (TemplatePreview, NutritionSheet) ayni modulu paylasir.",
      "roundNutrition 1 ondaliga yuvarlar (sodyum tam sayi): addNutrition kayan nokta artigi birakip girdi alaninda gorunuyordu (42.800000000000004) — lessons.md L20'nin kardes kapatildi.",
      "Bu turda server/** dokunulmadi; templates config anahtari zaten serbest JSON (PUT /api/config/:key) oldugu icin backend degisikligi gerekmedi.",
      "Kapı: typecheck 0 + test + check:i18n + build. Tarayici olcumu (uretim derlemesi :4173, izole DB): swap gram koruyor, hero kart toplamla esit, kayit round-trip sonrasi kalici, kaynaksiz ogunde bolum cikmiyor.",
    ],
  },
```

- [ ] **Step 3: Run the verification gate**

```bash
pnpm typecheck
pnpm test
pnpm check:i18n
pnpm build
```
Expected: 0 type errors · all tests pass · `PARITY OK` · `✓ built`

- [ ] **Step 4: Commit**

```bash
git add src/lib/version.ts src/lib/changelog.ts
git commit -m "release(app): v0.31.0 sablon ve ogren malzeme duzenleme"
```

---

### Task 5: Production-build measurement (no code changes)

**Files:** none — verification only.

**Interfaces:**
- Consumes: the whole branch.
- Produces: measured evidence in the final report.

Do NOT touch `server/data.db` (AGENTS.md rule 5). Work on a copy:

```bash
cp server/data.db server/data.tplcheck.db
```

Then temporarily point `.claude/launch.json`'s `nutrimind-api` entry at the copy:

```json
{
  "name": "nutrimind-api",
  "runtimeExecutable": "bash",
  "runtimeArgs": ["-lc", "NUTRI_DB=$PWD/server/data.tplcheck.db node server/index.js"],
  "port": 8790,
  "env": { "NUTRI_DB": "server/data.tplcheck.db" }
}
```

**Restore before finishing:**

```bash
git checkout .claude/launch.json
rm -f server/data.tplcheck.db
```

- [ ] **Step 1: Seed a two-item template into the scratch DB**

```bash
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('server/data.tplcheck.db');
const a = (id) => JSON.parse(db.prepare('SELECT data FROM aliases WHERE id=?').get(id).data);
const scale = (n, s, g) => { const f=g/s; const o={}; for (const k of ['kcal','protein','carbs','fat','fiber','sugar','satFat','sodium']) if (n[k]!==undefined) o[k]=Math.round(n[k]*f*10)/10; return o; };
const y = a('yulaf'), g = a('yogurt');
const items = [
  { name: y.name, nutrition: scale(y.nutrition, y.serving_g, 80), sources: [{aliasId:'yulaf',qty:80,unit:'g'}] },
  { name: g.name, nutrition: scale(g.nutrition, g.serving_g, 150), sources: [{aliasId:'yogurt',qty:150,unit:'g'}] },
];
db.prepare(\"UPDATE config SET value=? WHERE user_id='u_owner' AND key='templates'\").run(JSON.stringify({list:[{id:'t_check',name:'Sabah',items}]}));
console.log('seeded');
"
```

- [ ] **Step 2: Start both servers and measure**

```bash
# via preview_start: nutrimind-api then nutrimind-preview (ports 8790 / 4173)
```

In the browser at `http://localhost:4173`:
1. Tap the `Sabah` chip → preview opens with 2 rows, each showing grams + macros.
2. Change row 1's amount `80` → `120`. Assert row 1's kcal goes 300 → 450 and the total line changes.
3. Click `Malzemeyi değiştir` on row 1 → pick `Lavaş`. Assert grams stay 120 and kcal become `175/60 × 120 = 350`.
4. Click `+ Malzeme ekle` → a third empty row appears. Pick `KFD WPC 82 protein tozu`, set `30 g`. Assert the total includes it.
5. Delete row 3 with its trash button. Assert the total drops back.
6. Tick `Şablonu da güncelle`, click `Öğün ekle`. Assert BOTH: the day now has 3 rows and `config.templates` contains `Lavaş`.
7. Reopen the chip → the swapped state persisted.
8. Open a SOURCE-LESS meal → assert NO ingredient section renders and the hero card still works.
9. Check `preview_console_logs` — expect zero errors.

- [ ] **Step 3: Verify the DB round-trip**

```bash
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('server/data.tplcheck.db');
const t = JSON.parse(db.prepare(\"SELECT value FROM config WHERE user_id='u_owner' AND key='templates'\").get().value);
console.log('sablon:', JSON.stringify(t.list[0].items.map(i => i.name)));
const days = db.prepare('SELECT date, meals FROM days ORDER BY date DESC LIMIT 1').get();
console.log('gun:', JSON.stringify(JSON.parse(days.meals).map(m => m.name)));
"
```
Expected: the template holds the swapped names, and the day holds the same set.

- [ ] **Step 4: Clean up and stop the servers**

```bash
git checkout .claude/launch.json
rm -f server/data.tplcheck.db
```
Then stop both preview servers.

- [ ] **Step 5: Confirm the tree is clean of scratch artefacts**

```bash
git status --short
```
Expected: only the intended source/locale/doc changes, no `data.*.db`, no modified `.claude/launch.json`.