# Nutrimind — Elle Ekleme & Düzenleme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nutrimind frontend'ine site üzerinden öğün ekleme/düzenleme/silme, alias (besin hafızası) yönetimi ve hedef düzenleme arayüzünü eklemek.

**Architecture:** Backend (`server/index.js`) tüm CRUD uçlarına zaten sahip; bu iş yalnızca frontend. Yazma işlemleri "mutate → refetch" desenini izler: API çağrısı başarılıysa `fetchData()` tekrar çalışır ve `DataProvider` context'i tazelenir. Formlar ortak bir `Modal` kabuğu ve paylaşılan alan primitifleri (`FormBits`) üzerine kurulur.

**Tech Stack:** React 18 + TypeScript (strict) + Vite 6 + Tailwind 3. Test: Vitest (bu planda ekleniyor). Paket yöneticisi: pnpm.

## Global Constraints

- **Git yok.** Bu proje bir git deposu değil (`git rev-parse` başarısız). **Hiçbir adımda `git add`/`git commit` çalıştırma.** Her görevin kapanış adımı commit yerine doğrulama komutudur.
- **Backend mantığı değişmez.** `server/index.js` bu planda **düzenlenmez**; yalnızca mevcut uçlar tüketilir. (Görev 1'de eklenen `server/package.json` yalnızca modül biçimi bildirir, sunucu mantığına dokunmaz.)
- **Yerel doğrulama iki terminal ister:** biri `node server/index.js` (:8790), diğeri `pnpm dev` (:5173, `/api` proxy'si ile).
- **Salt-okunur referanslara dokunma:** `README.md`, `Besin Hafızası.dc.html`, `Wireframes.dc.html`, `support.js`, `eski veriler ('Emrullah' kullanıcısı).json`.
- **Tipler `src/types.ts`'ten gelir** — domain tipleri için tek doğruluk kaynağı.
- **Ham hex kullanma.** Yalnızca semantik Tailwind sınıfları: `bg-app`, `bg-surface`, `bg-elevated-2`, `border-line`, `text-ink-primary`, `text-ink-secondary`, `text-ink-tertiary`, `text-ink-faint`, `text-protein`, `text-carb`, `text-fat`, `text-memory`, `bg-accent`, `text-accent-ink`, `text-danger`, `rounded-chip`, `rounded-card`, `rounded-pill`, `shadow-card`, `shadow-float`, `font-mono`, `tracking-mono`.
- **Arayüz metinleri Türkçe.**
- **Doğrulama kapısı:** her görev `pnpm typecheck` ile sıfır hata vermeli (Görev 1'de ayrıca `pnpm test`).
- **Node 22+** gerekir (backend `node:sqlite` kullanır); frontend için Node 18+ yeterli.

---

## File Structure

| Dosya | Sorumluluk | Durum |
|---|---|---|
| `vite.config.ts` | Dev sunucusu + `/api` proxy'si | Değişir (Görev 1) |
| `server/package.json` | `server/`'ı CommonJS'e sabitler (yerel çalıştırma) | Yeni (Görev 1) |
| `src/types.ts` | Domain tipleri + `MealPayload` | Değişir (Görev 2) |
| `src/lib/nutrition.ts` | Saf hesap: `parseNum`, `scaleNutrition` | Yeni (Görev 1) |
| `src/lib/nutrition.test.ts` | Yukarıdakinin testleri | Yeni (Görev 1) |
| `src/lib/api.ts` | Tipli fetch istemcisi (okuma + yazma) | Değişir (Görev 2) |
| `src/lib/days.ts` | Gün yardımcıları + `toPayload` | Değişir (Görev 2) |
| `src/lib/data.tsx` | Context: veri + aksiyonlar + `refresh` | Değişir (Görev 3) |
| `src/components/Modal.tsx` | Modal/bottom-sheet kabuğu | Yeni (Görev 4) |
| `src/components/FormBits.tsx` | Alan primitifleri, taslak dönüşümleri, onay butonu | Yeni (Görev 4) |
| `src/components/MealForm.tsx` | Öğün ekle/düzenle (çift mod) | Yeni (Görev 5) |
| `src/components/DayView.tsx` | Ekle/düzenle/sil kontrolleri | Değişir (Görev 6) |
| `src/components/AliasForm.tsx` | Alias ekle/düzenle | Yeni (Görev 7) |
| `src/pages/AliasPage.tsx` | Yeni besin + kart aksiyonları | Değişir (Görev 7) |
| `src/components/GoalsForm.tsx` | Hedef düzenle | Yeni (Görev 8) |
| `src/pages/DailyPage.tsx` | "Hedef" butonu | Değişir (Görev 8) |
| `package.json` | `test` script + `vitest` devDependency | Değişir (Görev 1) |

---

### Task 1: Yerel geliştirme ortamı + saf besin hesapları

İki iş bir arada: (a) yerelde API'ye ulaşabilmek — şu an `vite.config.ts`'te proxy yok ve `package.json`'daki `"type": "module"` yüzünden CommonJS olan `server/index.js` doğrudan çalışmıyor, yani hiçbir tarayıcı doğrulaması mümkün değil; (b) alias ölçekleme matematiği (`makro × gram / serving_g`) — sessizce yanlış sonuç verebilecek tek matematik parçası, testle sabitlenir. tr-TR kullanıcısı "12,5" yazabildiği için virgüllü sayı ayrıştırma da gerekir.

**Files:**
- Create: `server/package.json`
- Create: `src/lib/nutrition.ts`
- Test: `src/lib/nutrition.test.ts`
- Modify: `vite.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `Nutrition`, `ZERO_NUTRITION` from `src/types.ts` (mevcut)
- Produces: `parseNum(input: string): number`, `scaleNutrition(n: Nutrition, servingG: number, grams: number): Nutrition`

- [ ] **Step 1: Vitest'i kur**

```bash
pnpm add -D vitest
```

- [ ] **Step 2: `package.json`'a test script'i ekle**

`"scripts"` bloğundaki `"typecheck"` satırının hemen ardına ekle:

```json
    "test": "vitest run",
```

Sonuç `"scripts"` şöyle olmalı:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "format": "prettier --write .",
    "deploy": "bash deploy.sh"
  },
```

- [ ] **Step 3: Başarısız testi yaz**

Create `src/lib/nutrition.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseNum, scaleNutrition } from "./nutrition";
import type { Nutrition } from "../types";

const BASE: Nutrition = { kcal: 100, protein: 10, carbs: 20, fat: 5, fiber: 2 };

describe("parseNum", () => {
  it("virgüllü tr-TR girdisini sayıya çevirir", () => {
    expect(parseNum("12,5")).toBe(12.5);
  });
  it("noktalı girdiyi de kabul eder", () => {
    expect(parseNum("12.5")).toBe(12.5);
  });
  it("baştaki/sondaki boşlukları yok sayar", () => {
    expect(parseNum("  7 ")).toBe(7);
  });
  it("boş ya da geçersiz girdide 0 döner", () => {
    expect(parseNum("")).toBe(0);
    expect(parseNum("abc")).toBe(0);
  });
});

describe("scaleNutrition", () => {
  it("iki katı gramda makroyu ikiye katlar", () => {
    expect(scaleNutrition(BASE, 100, 200)).toEqual({
      kcal: 200,
      protein: 20,
      carbs: 40,
      fat: 10,
      fiber: 4,
    });
  });
  it("yarım porsiyonu yarıya böler", () => {
    expect(scaleNutrition(BASE, 100, 50)).toEqual({
      kcal: 50,
      protein: 5,
      carbs: 10,
      fat: 2.5,
      fiber: 1,
    });
  });
  it("sonucu 1 ondalığa yuvarlar", () => {
    expect(scaleNutrition(BASE, 150, 100).kcal).toBe(66.7);
  });
  it("serving_g 0 ise sıfır makro döner (bölme hatası yok)", () => {
    expect(scaleNutrition(BASE, 0, 100)).toEqual({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
    });
  });
});
```

- [ ] **Step 4: Testin başarısız olduğunu doğrula**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "./nutrition"` (dosya henüz yok).

- [ ] **Step 5: Minimal implementasyonu yaz**

Create `src/lib/nutrition.ts`:

```ts
// ============================================================================
// Nutrimind — saf besin hesapları (alias ölçekleme + tr-TR sayı ayrıştırma).
// ============================================================================
import { ZERO_NUTRITION } from "../types";
import type { Nutrition } from "../types";

/** "12,5" | "12.5" | " 7 " -> sayı. Geçersiz/boş girdide 0. */
export function parseNum(input: string): number {
  const n = Number(String(input).trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** 0,1 hassasiyet yeterli — kayan nokta artıklarını da temizler. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** serving_g gram için verilen makroyu istenen grama lineer ölçekler. */
export function scaleNutrition(n: Nutrition, servingG: number, grams: number): Nutrition {
  if (!(servingG > 0)) return { ...ZERO_NUTRITION };
  const f = grams / servingG;
  return {
    kcal: round1(n.kcal * f),
    protein: round1(n.protein * f),
    carbs: round1(n.carbs * f),
    fat: round1(n.fat * f),
    fiber: round1(n.fiber * f),
  };
}
```

- [ ] **Step 6: Testlerin geçtiğini doğrula**

Run: `pnpm test`
Expected: PASS — `Test Files 1 passed`, `Tests 8 passed`.

- [ ] **Step 7: Tip denetimi**

Run: `pnpm typecheck`
Expected: çıktı yok, exit 0.

- [ ] **Step 8: Node sürümünü kontrol et**

Run: `node -v`
Expected: `v22.5.0` veya üstü (backend `node:sqlite` kullanır).

Sürüm daha eskiyse yerel backend çalışmaz — bu durumda Step 9–11'i atla ve doğrulamayı canlı ortamda (`pnpm deploy` sonrası https://nutri.emrullah.xyz) yap. Sürüm uygunsa devam et.

- [ ] **Step 9: `server/package.json` oluştur**

Kök `package.json` `"type": "module"` olduğundan, CommonJS yazılmış `server/index.js` yerelde çalışmaz. Bu bir satırlık dosya yalnızca `server/` klasörünü CommonJS'e sabitler; dağıtımı etkilemez (`deploy.sh` sadece `dist/` gönderir).

Create `server/package.json`:

```json
{
  "type": "commonjs"
}
```

- [ ] **Step 10: `vite.config.ts`'e API proxy'si ekle**

Dosyanın tamamını değiştir:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Yerel geliştirmede /api istekleri aynı makinedeki Node backend'ine gider.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8790",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 11: Backend'i yerelde başlat ve doğrula**

Ayrı bir terminalde çalıştır (bu terminal açık kalmalı):

```bash
node server/index.js
```

Expected: `nutri-api dinliyor :8790  db=...\server\data.db`

Başka bir terminalde:

```bash
curl -s http://127.0.0.1:8790/api/health
```

Expected: `{"ok":true}`

Not: Bu ilk çalıştırmada `server/data.db` tohum verilerle (4 gün + 6 alias + hedefler) oluşur. Bu dosya yerel test verisidir, canlı veritabanından ayrıdır.

---

### Task 2: Yazma uçları için API istemcisi

`api.ts` şu an yalnızca `fetchData()` içeriyor. Backend'in dört yazma ucu için tipli fonksiyonlar eklenir. Ayrıca `MealItem[] → MealPayload[]` dönüşümü üç yerde gerektiği için `days.ts`'e tek bir yardımcı konur (DRY).

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/lib/days.ts`

**Interfaces:**
- Consumes: `Nutrition`, `MealItem` from `src/types.ts`
- Produces:
  - `MealPayload { name: string; nutrition: Nutrition }` (types.ts)
  - `AliasPayload { id?: string; triggers: string[]; name: string; brand: string | null; serving_g: number; nutrition: Nutrition }` (api.ts)
  - `saveDay(date: string, meals: MealPayload[]): Promise<{ ok: true }>`
  - `deleteDay(date: string): Promise<{ ok: true }>`
  - `saveGoals(goals: Nutrition): Promise<{ ok: true }>`
  - `saveAlias(alias: AliasPayload): Promise<{ ok: true; id: string }>`
  - `deleteAlias(id: string): Promise<{ ok: true }>`
  - `toPayload(meals: MealItem[]): MealPayload[]` (days.ts)

- [ ] **Step 1: `src/types.ts`'e `MealPayload` ekle**

`MealItem` arayüzünün hemen ardına ekle:

```ts
/** Backend'e gönderilen öğün biçimi (days[date] dizisindeki kayıt). */
export interface MealPayload {
  name: string;
  nutrition: Nutrition;
}
```

- [ ] **Step 2: `src/lib/api.ts` importunu genişlet**

Dosyanın 4. satırındaki import'u değiştir:

```ts
import type { Alias, MealItem, MealPayload, Nutrition } from "../types";
```

- [ ] **Step 3: Yazma fonksiyonlarını `api.ts` sonuna ekle**

`fetchData` fonksiyonunun altına ekle:

```ts
// --- Yazma uçları -----------------------------------------------------------

export interface AliasPayload {
  id?: string;
  triggers: string[];
  name: string;
  brand: string | null;
  serving_g: number;
  nutrition: Nutrition;
}

/** Ortak yazma isteği: JSON gönderir, backend'in {error} mesajını yükseltir. */
async function mutate<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(json?.error ?? `API ${res.status}`);
  return json as T;
}

/** Günün TÜM öğünlerini değiştirir (upsert). */
export function saveDay(date: string, meals: MealPayload[]): Promise<{ ok: true }> {
  return mutate("/api/day", "POST", { date, meals });
}

export function deleteDay(date: string): Promise<{ ok: true }> {
  return mutate(`/api/day/${encodeURIComponent(date)}`, "DELETE");
}

export function saveGoals(goals: Nutrition): Promise<{ ok: true }> {
  return mutate("/api/goals", "PUT", goals);
}

/** id verilirse günceller, verilmezse backend yeni id üretir. */
export function saveAlias(alias: AliasPayload): Promise<{ ok: true; id: string }> {
  return mutate("/api/alias", "POST", alias);
}

export function deleteAlias(id: string): Promise<{ ok: true }> {
  return mutate(`/api/alias/${encodeURIComponent(id)}`, "DELETE");
}
```

- [ ] **Step 4: `src/lib/days.ts`'e `toPayload` ekle**

Import satırını değiştir:

```ts
import type { MealItem, MealPayload, Nutrition } from "../types";
```

Ve dosyanın sonuna ekle:

```ts
/** Görüntüleme öğünlerini backend biçimine çevirir. */
export function toPayload(meals: MealItem[]): MealPayload[] {
  return meals.map((m) => ({ name: m.label, nutrition: m.computed }));
}
```

- [ ] **Step 5: Tip denetimi**

Run: `pnpm typecheck`
Expected: çıktı yok, exit 0.

Not: `MealItem` artık `api.ts`'te doğrudan kullanılmıyorsa TypeScript kullanılmayan import uyarısı vermez (`noUnusedLocals` kapalı), ama import'ta bırakıldı çünkü `fetchData` dönüşümünde kullanılıyor.

---

### Task 3: DataProvider'a yazma aksiyonları

Context şu an yalnızca `AppData` taşıyor. Aksiyonlar eklenir; her aksiyon API'yi çağırıp ardından `refresh()` ile veriyi yeniden çeker. Öğün dizisi boşalırsa gün tamamen silinir (backend'de boş dizi bırakmak yerine).

**Files:**
- Modify: `src/lib/data.tsx` (tam yeniden yazım)

**Interfaces:**
- Consumes: `fetchData`, `saveDay`, `deleteDay`, `saveGoals`, `saveAlias`, `deleteAlias`, `AliasPayload`, `AppData` (Görev 2); `MealPayload`, `Nutrition` (Görev 2)
- Produces: `useData(): AppData & Actions` — `Actions` = `{ refresh(): Promise<void>; setDayMeals(date: string, meals: MealPayload[]): Promise<void>; updateGoals(goals: Nutrition): Promise<void>; upsertAlias(alias: AliasPayload): Promise<void>; removeAlias(id: string): Promise<void> }`

- [ ] **Step 1: `src/lib/data.tsx` dosyasını tamamen değiştir**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { deleteAlias, deleteDay, fetchData, saveAlias, saveDay, saveGoals } from "./api";
import type { AliasPayload, AppData } from "./api";
import type { MealPayload, Nutrition } from "../types";

/** Yazma aksiyonları — hepsi "API çağır → veriyi yeniden çek" desenini izler. */
export interface Actions {
  refresh: () => Promise<void>;
  /** Günün tüm öğünlerini değiştirir; dizi boşsa günü siler. */
  setDayMeals: (date: string, meals: MealPayload[]) => Promise<void>;
  updateGoals: (goals: Nutrition) => Promise<void>;
  upsertAlias: (alias: AliasPayload) => Promise<void>;
  removeAlias: (id: string) => Promise<void>;
}

type Ctx = AppData & Actions;

const DataCtx = createContext<Ctx | null>(null);

export function useData(): Ctx {
  const d = useContext(DataCtx);
  if (!d) throw new Error("DataProvider bulunamadı");
  return d;
}

function Center({ children }: { children: ReactNode }) {
  return <div className="grid min-h-[45vh] place-items-center text-center text-sm text-ink-tertiary">{children}</div>;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setData(await fetchData());
  }, []);

  useEffect(() => {
    let alive = true;
    fetchData()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, []);

  const actions = useMemo<Actions>(
    () => ({
      refresh,
      setDayMeals: async (date, meals) => {
        if (meals.length === 0) await deleteDay(date);
        else await saveDay(date, meals);
        await refresh();
      },
      updateGoals: async (goals) => {
        await saveGoals(goals);
        await refresh();
      },
      upsertAlias: async (alias) => {
        await saveAlias(alias);
        await refresh();
      },
      removeAlias: async (id) => {
        await deleteAlias(id);
        await refresh();
      },
    }),
    [refresh],
  );

  const value = useMemo<Ctx | null>(() => (data ? { ...data, ...actions } : null), [data, actions]);

  if (err) return <Center>Veri alınamadı ({err}). Sunucu çalışıyor mu?</Center>;
  if (!value) return <Center>Yükleniyor…</Center>;
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
```

- [ ] **Step 2: Tip denetimi — mevcut tüketiciler bozulmamalı**

Run: `pnpm typecheck`
Expected: çıktı yok, exit 0. (`DayView`, `HistoryPage`, `AliasPage` yalnızca `goals`/`days`/`aliases` alanlarını okuyor; genişleyen tip geriye dönük uyumlu.)

---

### Task 4: Modal kabuğu + form primitifleri

Üç form da aynı kabuğu ve aynı alan bileşenlerini kullanacak. Tekrarı önlemek için önce bunlar yazılır.

**Files:**
- Create: `src/components/Modal.tsx`
- Create: `src/components/FormBits.tsx`

**Interfaces:**
- Consumes: `parseNum` (Görev 1), `Nutrition` from types
- Produces:
  - `Modal({ title, onClose, children })`
  - `fieldCls: string` — input/select ortak sınıfı
  - `Label({ children })`, `TextField({ label, value, onChange, placeholder? })`, `NumField({ label, value, onChange, suffix? })`
  - `NutritionDraft = { kcal: string; protein: string; carbs: string; fat: string; fiber: string }`
  - `EMPTY_DRAFT: NutritionDraft`, `toDraft(n: Nutrition): NutritionDraft`, `fromDraft(d: NutritionDraft): Nutrition`
  - `NutritionFields({ draft, onChange })`
  - `FormActions({ onCancel, onSave, saving, disabled, saveLabel? })`
  - `ErrorText({ children })`
  - `ConfirmButton({ onConfirm, label?, className? })`

- [ ] **Step 1: `src/components/Modal.tsx` oluştur**

```tsx
import { useEffect } from "react";
import type { ReactNode } from "react";

/** Koyu tema modal kabuğu: masaüstünde ortalı, mobilde alttan sheet.
 *  Esc ya da zemine tıklama kapatır; açıkken arka plan kaydırması kilitlenir. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="anim-fadeup max-h-[92vh] w-full overflow-y-auto rounded-t-card border border-line bg-elevated-2 p-5 shadow-float sm:max-w-lg sm:rounded-card"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-extrabold text-ink-primary">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-pill border border-line px-3 py-1 text-sm text-ink-secondary transition hover:text-ink-primary"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `src/components/FormBits.tsx` oluştur**

```tsx
import { useState } from "react";
import type { ReactNode } from "react";
import { parseNum } from "../lib/nutrition";
import type { Nutrition } from "../types";

/** Input ve select için ortak görsel dil. */
export const fieldCls =
  "w-full rounded-chip border border-line bg-white/[0.04] px-3 py-2 text-sm text-ink-primary outline-none transition placeholder:text-ink-faint focus:border-memory/60";

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">{children}</span>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input className={fieldCls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function NumField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <label className="block">
      <Label>{suffix ? `${label} (${suffix})` : label}</Label>
      <input
        className={`${fieldCls} font-mono`}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Makro alanları form içinde metin olarak tutulur (yarım yazılmış "12," bozulmasın). */
export interface NutritionDraft {
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
}

export const EMPTY_DRAFT: NutritionDraft = { kcal: "", protein: "", carbs: "", fat: "", fiber: "" };

export function toDraft(n: Nutrition): NutritionDraft {
  return {
    kcal: String(n.kcal),
    protein: String(n.protein),
    carbs: String(n.carbs),
    fat: String(n.fat),
    fiber: String(n.fiber),
  };
}

export function fromDraft(d: NutritionDraft): Nutrition {
  return {
    kcal: parseNum(d.kcal),
    protein: parseNum(d.protein),
    carbs: parseNum(d.carbs),
    fat: parseNum(d.fat),
    fiber: parseNum(d.fiber),
  };
}

export function NutritionFields({
  draft,
  onChange,
}: {
  draft: NutritionDraft;
  onChange: (d: NutritionDraft) => void;
}) {
  const set = (k: keyof NutritionDraft) => (v: string) => onChange({ ...draft, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <NumField label="Kalori" suffix="kcal" value={draft.kcal} onChange={set("kcal")} />
      <NumField label="Protein" suffix="g" value={draft.protein} onChange={set("protein")} />
      <NumField label="Karbonhidrat" suffix="g" value={draft.carbs} onChange={set("carbs")} />
      <NumField label="Yağ" suffix="g" value={draft.fat} onChange={set("fat")} />
      <NumField label="Lif" suffix="g" value={draft.fiber} onChange={set("fiber")} />
    </div>
  );
}

export function FormActions({
  onCancel,
  onSave,
  saving,
  disabled,
  saveLabel = "Kaydet",
}: {
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  disabled: boolean;
  saveLabel?: string;
}) {
  return (
    <div className="mt-5 flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink-secondary transition hover:text-ink-primary"
      >
        Vazgeç
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled || saving}
        className="rounded-pill bg-accent px-4 py-2 text-sm font-extrabold text-accent-ink transition disabled:opacity-40"
      >
        {saving ? "…" : saveLabel}
      </button>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-chip bg-danger/10 px-3 py-2 text-xs text-danger">{children}</p>;
}

/** İki adımlı sil onayı: ilk tık "Emin misin?"e döner, ikinci tık siler. */
export function ConfirmButton({
  onConfirm,
  label = "Sil",
  className = "",
}: {
  onConfirm: () => void;
  label?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
      className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold transition ${
        armed ? "bg-danger/20 text-danger" : "bg-white/[0.06] text-ink-tertiary hover:text-danger"
      } ${className}`}
    >
      {armed ? "Emin misin?" : label}
    </button>
  );
}
```

- [ ] **Step 3: Tip denetimi**

Run: `pnpm typecheck`
Expected: çıktı yok, exit 0.

---

### Task 5: MealForm — çift modlu öğün formu

Ekleme iki modda: **Hafızadan** (alias seç → gram gir → makro otomatik ölçeklenir, canlı önizleme) ve **Elle** (isim + 5 makro). Düzenleme her zaman "Elle" moduyla açılır çünkü kayıtlı öğünün hangi alias'tan geldiği saklanmıyor.

**Files:**
- Create: `src/components/MealForm.tsx`

**Interfaces:**
- Consumes: `Modal` (Görev 4); `fieldCls`, `Label`, `TextField`, `NumField`, `NutritionFields`, `FormActions`, `ErrorText`, `NutritionDraft`, `EMPTY_DRAFT`, `toDraft`, `fromDraft` (Görev 4); `useData` (Görev 3); `mealsOf`, `toPayload` (Görev 2); `parseNum`, `scaleNutrition` (Görev 1); `formatKcal`, `formatNumber` (mevcut)
- Produces: `MealForm({ date: string; editIndex: number | null; onClose: () => void })`

- [ ] **Step 1: `src/components/MealForm.tsx` oluştur**

```tsx
import { useState } from "react";
import { Modal } from "./Modal";
import {
  EMPTY_DRAFT,
  ErrorText,
  FormActions,
  Label,
  NumField,
  NutritionFields,
  TextField,
  fieldCls,
  fromDraft,
  toDraft,
} from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { useData } from "../lib/data";
import { mealsOf, toPayload } from "../lib/days";
import { parseNum, scaleNutrition } from "../lib/nutrition";
import { formatKcal, formatNumber } from "../lib/format";
import type { MealPayload, Nutrition } from "../types";

type Mode = "alias" | "manual";

function ModeTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-pill px-3 py-1.5 text-xs font-bold transition ${
        active ? "bg-memory text-[#1e1b4b]" : "border border-line bg-white/[0.06] text-ink-secondary"
      }`}
    >
      {label}
    </button>
  );
}

/** Öğün ekleme/düzenleme. editIndex null ise ekleme, değilse o günün o indeksli öğünü. */
export function MealForm({
  date,
  editIndex,
  onClose,
}: {
  date: string;
  editIndex: number | null;
  onClose: () => void;
}) {
  const { aliases, days, setDayMeals } = useData();
  const existing = editIndex === null ? undefined : mealsOf(days, date)[editIndex];

  const [mode, setMode] = useState<Mode>(existing ? "manual" : "alias");
  const [name, setName] = useState(existing?.label ?? "");
  const [draft, setDraft] = useState<NutritionDraft>(existing ? toDraft(existing.computed) : EMPTY_DRAFT);
  const [aliasId, setAliasId] = useState(aliases[0]?.id ?? "");
  const [grams, setGrams] = useState(String(aliases[0]?.serving_g ?? 100));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const alias = aliases.find((a) => a.id === aliasId);
  const scaled: Nutrition | null = alias ? scaleNutrition(alias.nutrition, alias.serving_g, parseNum(grams)) : null;

  const finalName = mode === "alias" ? name.trim() || alias?.name || "" : name.trim();
  const finalNutrition = mode === "alias" ? scaled : fromDraft(draft);
  const canSave = finalName.length > 0 && finalNutrition !== null;

  /** Alias değişince miktarı o besinin porsiyonuna sıfırla. */
  function pickAlias(id: string) {
    setAliasId(id);
    const a = aliases.find((x) => x.id === id);
    if (a) setGrams(String(a.serving_g));
  }

  async function save() {
    if (!canSave || !finalNutrition) return;
    setSaving(true);
    setErr(null);
    try {
      const next: MealPayload[] = toPayload(mealsOf(days, date));
      const entry: MealPayload = { name: finalName, nutrition: finalNutrition };
      if (editIndex === null) next.push(entry);
      else next[editIndex] = entry;
      await setDayMeals(date, next);
      onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
      setSaving(false);
    }
  }

  return (
    <Modal title={editIndex === null ? "Öğün ekle" : "Öğünü düzenle"} onClose={onClose}>
      {editIndex === null && (
        <div className="mb-4 flex gap-2">
          <ModeTab active={mode === "alias"} onClick={() => setMode("alias")} label="Hafızadan" />
          <ModeTab active={mode === "manual"} onClick={() => setMode("manual")} label="Elle" />
        </div>
      )}

      {mode === "alias" ? (
        aliases.length === 0 ? (
          <p className="text-sm text-ink-tertiary">Hafızada besin yok. "Elle" sekmesinden ekleyebilirsin.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="block">
              <Label>Besin</Label>
              <select className={fieldCls} value={aliasId} onChange={(e) => pickAlias(e.target.value)}>
                {aliases.map((a) => (
                  <option key={a.id} value={a.id} className="bg-elevated-2">
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            <NumField label="Miktar" suffix="g" value={grams} onChange={setGrams} />
            <TextField
              label="Görünecek ad (opsiyonel)"
              value={name}
              onChange={setName}
              placeholder={alias?.name ?? ""}
            />

            {scaled && (
              <div className="rounded-chip border border-line bg-white/[0.03] px-3 py-2 font-mono text-[11px] text-ink-secondary">
                {formatKcal(scaled.kcal)}
                <span className="ml-2 text-ink-tertiary">
                  P{formatNumber(scaled.protein, 1)} · K{formatNumber(scaled.carbs, 1)} · Y
                  {formatNumber(scaled.fat, 1)} · L{formatNumber(scaled.fiber, 1)}
                </span>
              </div>
            )}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <TextField label="Öğün adı" value={name} onChange={setName} placeholder="örn. Yulaf + protein + süt" />
          <NutritionFields draft={draft} onChange={setDraft} />
        </div>
      )}

      {err && <ErrorText>{err}</ErrorText>}
      <FormActions onCancel={onClose} onSave={save} saving={saving} disabled={!canSave} />
    </Modal>
  );
}
```

- [ ] **Step 2: Tip denetimi**

Run: `pnpm typecheck`
Expected: çıktı yok, exit 0.

---

### Task 6: DayView'e ekle / düzenle / sil kontrolleri

Bu, kullanıcının gördüğü ilk çalışan özellik. `DayView` hem **Günlük** hem **Geçmiş → gün detayı**nda kullanıldığı için tek değişiklik iki ekranı da kapsar.

**Files:**
- Modify: `src/components/DayView.tsx` (tam yeniden yazım)

**Interfaces:**
- Consumes: `MealForm` (Görev 5); `ConfirmButton`, `ErrorText` (Görev 4); `useData` (Görev 3); `toPayload` (Görev 2)
- Produces: değişiklik yok — `DayView({ date, emptyLabel? })` imzası korunur.

- [ ] **Step 1: `src/components/DayView.tsx` dosyasını tamamen değiştir**

```tsx
import { useState } from "react";
import { CalorieRing } from "./CalorieRing";
import { MacroBar } from "./MacroBar";
import { MacroDonut } from "./MacroDonut";
import { Card } from "./Card";
import { MealForm } from "./MealForm";
import { ConfirmButton, ErrorText } from "./FormBits";
import { formatKcal } from "../lib/format";
import { useData } from "../lib/data";
import { dayTotal, mealsOf, toPayload } from "../lib/days";

/** Bir günün besin görselleri (halka + makro donut + barlar + öğün katkısı)
 *  ve öğün ekleme/düzenleme/silme kontrolleri.
 *  Hem "Günlük" sekmesi hem Geçmiş'teki gün-detayı bunu kullanır → görünüm eşleşir. */
export function DayView({ date, emptyLabel = "Bu gün için kayıt yok." }: { date: string; emptyLabel?: string }) {
  const { goals, days, setDayMeals } = useData();
  const meals = mealsOf(days, date);
  const total = dayTotal(days, date);
  const hasData = meals.length > 0;

  // editIndex: null = yeni öğün, sayı = o indeksli öğünü düzenle. form kapalıysa undefined.
  const [editIndex, setEditIndex] = useState<number | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  async function removeMeal(index: number) {
    setErr(null);
    try {
      await setDayMeals(
        date,
        toPayload(meals.filter((_, i) => i !== index)),
      );
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex items-center justify-center p-6">
          <CalorieRing consumed={total.kcal} target={goals.kcal} />
        </Card>
        {hasData ? (
          <Card className="flex items-center justify-center p-6">
            <MacroDonut nutrition={total} />
          </Card>
        ) : (
          <Card className="flex items-center justify-center p-6 text-center text-sm text-ink-tertiary">
            {emptyLabel}
          </Card>
        )}
      </div>

      {hasData && (
        <Card className="flex flex-col gap-4 p-6">
          <MacroBar kind="protein" value={total.protein} target={goals.protein} />
          <MacroBar kind="carb" value={total.carbs} target={goals.carbs} />
          <MacroBar kind="fat" value={total.fat} target={goals.fat} />
          <MacroBar kind="memory" value={total.fiber} target={goals.fiber} />
        </Card>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-ink-secondary">Öğün katkısı</h3>
          <button
            type="button"
            onClick={() => setEditIndex(null)}
            className="rounded-pill bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-ink transition hover:opacity-90"
          >
            + Öğün ekle
          </button>
        </div>

        {err && <ErrorText>{err}</ErrorText>}

        {hasData ? (
          <ul className="flex flex-col gap-2.5">
            {meals.map((m, i) => {
              const pct = total.kcal ? (m.computed.kcal / total.kcal) * 100 : 0;
              return (
                <li key={m.id} className="anim-fadeup flex flex-col gap-1" style={{ animationDelay: `${i * 70}ms` }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold text-ink-primary">{m.label}</span>
                    <span className="flex flex-none items-center gap-2">
                      <span className="font-mono text-xs text-ink-secondary">
                        {formatKcal(m.computed.kcal)}
                        <span className="ml-1 text-ink-tertiary">%{Math.round(pct)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditIndex(i)}
                        className="rounded-pill bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-ink-tertiary transition hover:text-ink-primary"
                      >
                        Düzenle
                      </button>
                      <ConfirmButton onConfirm={() => removeMeal(i)} />
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: "linear-gradient(90deg,#8b6df2,#a78bfa)",
                        boxShadow: "0 2px 8px rgba(124,92,240,0.4)",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-ink-tertiary">Henüz öğün yok. "+ Öğün ekle" ile başla.</p>
        )}
      </section>

      {editIndex !== undefined && (
        <MealForm date={date} editIndex={editIndex} onClose={() => setEditIndex(undefined)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Tip denetimi**

Run: `pnpm typecheck`
Expected: çıktı yok, exit 0.

- [ ] **Step 3: Tarayıcıda doğrula**

Görev 1 Step 11'deki backend terminali açık olmalı (`node server/index.js` → `:8790`). Sonra ayrı terminalde:

Run: `pnpm dev` → http://localhost:5173 → **Günlük** sekmesi.

Doğrula:
1. "+ Öğün ekle" görünüyor (gün boş olsa bile).
2. **Hafızadan** modunda bir besin seç, miktarı değiştir → önizleme kcal'i anında değişiyor.
3. Kaydet → öğün listede çıkıyor, kalori halkası ve makro barları güncelleniyor.
4. "Düzenle" → makrolar dolu geliyor, değiştirip kaydet → satır güncelleniyor.
5. "Sil" → "Emin misin?"e dönüyor, ikinci tık siliyor; son öğün silinince gün boşalıyor.

---

### Task 7: AliasForm + AliasPage yönetimi

**Files:**
- Create: `src/components/AliasForm.tsx`
- Modify: `src/pages/AliasPage.tsx` (tam yeniden yazım)

**Interfaces:**
- Consumes: `Modal`, `FormBits` (Görev 4); `useData` → `upsertAlias`, `removeAlias` (Görev 3); `parseNum` (Görev 1); `Alias` from types
- Produces: `AliasForm({ initial: Alias | null; onClose: () => void })`

- [ ] **Step 1: `src/components/AliasForm.tsx` oluştur**

```tsx
import { useState } from "react";
import { Modal } from "./Modal";
import {
  EMPTY_DRAFT,
  ErrorText,
  FormActions,
  Label,
  NumField,
  NutritionFields,
  TextField,
  fieldCls,
  fromDraft,
  toDraft,
} from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { useData } from "../lib/data";
import { parseNum } from "../lib/nutrition";
import type { Alias } from "../types";

/** Alias (besin hafızası) ekleme/düzenleme. initial null ise yeni kayıt. */
export function AliasForm({ initial, onClose }: { initial: Alias | null; onClose: () => void }) {
  const { upsertAlias } = useData();

  const [triggers, setTriggers] = useState(initial ? initial.triggers.join(", ") : "");
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [servingG, setServingG] = useState(String(initial?.serving_g ?? 100));
  const [draft, setDraft] = useState<NutritionDraft>(initial ? toDraft(initial.nutrition) : EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const triggerList = triggers
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const canSave = triggerList.length > 0 && name.trim().length > 0 && parseNum(servingG) > 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setErr(null);
    try {
      await upsertAlias({
        ...(initial ? { id: initial.id } : {}),
        triggers: triggerList,
        name: name.trim(),
        brand: brand.trim() || null,
        serving_g: parseNum(servingG),
        nutrition: fromDraft(draft),
      });
      onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? "Besini düzenle" : "Yeni besin"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="block">
          <Label>İfadeler (virgülle ayır)</Label>
          <input
            className={fieldCls}
            value={triggers}
            placeholder="yoğurt, aynı yoğurt, süzme yoğurt"
            onChange={(e) => setTriggers(e.target.value)}
          />
        </label>

        {triggerList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {triggerList.map((t) => (
              <span key={t} className="rounded-pill bg-memory/15 px-2.5 py-1 text-[11px] font-semibold text-memory">
                {t}
              </span>
            ))}
          </div>
        )}

        <TextField label="Besin adı" value={name} onChange={setName} placeholder="örn. Süzme yoğurt %0" />
        <TextField label="Marka (opsiyonel)" value={brand} onChange={setBrand} placeholder="örn. Auchan" />
        <NumField label="Porsiyon" suffix="g" value={servingG} onChange={setServingG} />

        <div>
          <p className="mb-2 text-[11px] text-ink-tertiary">
            Aşağıdaki makrolar <strong className="text-ink-secondary">{parseNum(servingG) || 0} g</strong> için
            geçerlidir; öğün eklerken miktara göre otomatik ölçeklenir.
          </p>
          <NutritionFields draft={draft} onChange={setDraft} />
        </div>
      </div>

      {err && <ErrorText>{err}</ErrorText>}
      <FormActions onCancel={onClose} onSave={save} saving={saving} disabled={!canSave} />
    </Modal>
  );
}
```

- [ ] **Step 2: `src/pages/AliasPage.tsx` dosyasını tamamen değiştir**

```tsx
import { useState } from "react";
import { Card } from "../components/Card";
import { AliasForm } from "../components/AliasForm";
import { ConfirmButton, ErrorText } from "../components/FormBits";
import { formatKcal, formatNumber } from "../lib/format";
import { useData } from "../lib/data";
import type { Alias } from "../types";

export function AliasPage() {
  const { aliases, removeAlias } = useData();
  // form kapalıyken undefined; yeni kayıt için null; düzenleme için Alias.
  const [editing, setEditing] = useState<Alias | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  async function remove(id: string) {
    setErr(null);
    try {
      await removeAlias(id);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-primary">Besin hafızası</h2>
          <p className="text-sm text-ink-tertiary">
            Öğrenilmiş ifadeler → belirli besin. "yoğurt" dediğinde bu besin ve makrosu kullanılır.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="flex-none rounded-pill bg-memory px-3 py-1.5 text-xs font-extrabold text-[#1e1b4b] transition hover:opacity-90"
        >
          + Yeni besin
        </button>
      </div>

      {err && <ErrorText>{err}</ErrorText>}

      {aliases.length === 0 ? (
        <p className="text-sm text-ink-tertiary">Henüz alias yok. "+ Yeni besin" ile ekle.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {aliases.map((a, i) => (
            <Card key={a.id} className="anim-fadeup flex flex-col gap-3 p-4" style={{ animationDelay: `${i * 50}ms` }}>
              <div>
                <div className="text-sm font-bold text-ink-primary">{a.name}</div>
                {a.brand && <div className="text-[11px] text-ink-tertiary">{a.brand}</div>}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {a.triggers.map((t) => (
                  <span
                    key={t}
                    className="rounded-pill bg-memory/15 px-2.5 py-1 text-[11px] font-semibold text-memory"
                  >
                    {t}
                  </span>
                ))}
              </div>

              <div className="border-t border-line pt-2 font-mono text-[11px] text-ink-secondary">
                {formatNumber(a.serving_g)} g · {formatKcal(a.nutrition.kcal)}
                <span className="ml-2 text-ink-tertiary">
                  P{formatNumber(a.nutrition.protein)} · K{formatNumber(a.nutrition.carbs)} · Y
                  {formatNumber(a.nutrition.fat)}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(a)}
                  className="rounded-pill bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-ink-tertiary transition hover:text-ink-primary"
                >
                  Düzenle
                </button>
                <ConfirmButton onConfirm={() => remove(a.id)} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing !== undefined && <AliasForm initial={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
```

- [ ] **Step 3: Tip denetimi**

Run: `pnpm typecheck`
Expected: çıktı yok, exit 0.

- [ ] **Step 4: Tarayıcıda doğrula**

`pnpm dev` → **Hafıza** sekmesi. Doğrula:
1. "+ Yeni besin" → ifadeleri virgülle yaz → çipler anında görünüyor.
2. Kaydet → yeni kart listede.
3. "Düzenle" → alanlar dolu geliyor, değiştir → kart güncelleniyor.
4. "Sil" → iki adımlı onay → kart kayboluyor.
5. **Günlük** sekmesinde "+ Öğün ekle" → "Hafızadan" listesinde yeni besin görünüyor.

---

### Task 8: GoalsForm + DailyPage'e hedef girişi

**Files:**
- Create: `src/components/GoalsForm.tsx`
- Modify: `src/pages/DailyPage.tsx` (tam yeniden yazım)

**Interfaces:**
- Consumes: `Modal`, `FormBits` (Görev 4); `useData` → `goals`, `updateGoals` (Görev 3)
- Produces: `GoalsForm({ onClose: () => void })`

- [ ] **Step 1: `src/components/GoalsForm.tsx` oluştur**

```tsx
import { useState } from "react";
import { Modal } from "./Modal";
import { ErrorText, FormActions, NutritionFields, fromDraft, toDraft } from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { useData } from "../lib/data";

/** Günlük kalori/makro hedeflerini düzenler. */
export function GoalsForm({ onClose }: { onClose: () => void }) {
  const { goals, updateGoals } = useData();
  const [draft, setDraft] = useState<NutritionDraft>(toDraft(goals));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await updateGoals(fromDraft(draft));
      onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
      setSaving(false);
    }
  }

  return (
    <Modal title="Günlük hedefler" onClose={onClose}>
      <p className="mb-3 text-[11px] text-ink-tertiary">
        Kalori halkası ve makro barları bu hedeflere göre doldurulur.
      </p>
      <NutritionFields draft={draft} onChange={setDraft} />
      {err && <ErrorText>{err}</ErrorText>}
      <FormActions onCancel={onClose} onSave={save} saving={saving} disabled={false} />
    </Modal>
  );
}
```

- [ ] **Step 2: `src/pages/DailyPage.tsx` dosyasını tamamen değiştir**

```tsx
import { useState } from "react";
import { DayView } from "../components/DayView";
import { GoalsForm } from "../components/GoalsForm";
import { formatLongDate, todayISO } from "../lib/format";

export function DailyPage() {
  const date = todayISO();
  const [goalsOpen, setGoalsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-primary">Bugün</h2>
          <p className="text-sm text-ink-tertiary">{formatLongDate(date)}</p>
        </div>
        <button
          type="button"
          onClick={() => setGoalsOpen(true)}
          className="flex-none rounded-pill border border-line bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-ink-secondary transition hover:text-ink-primary"
        >
          Hedef
        </button>
      </div>

      <DayView date={date} emptyLabel="Bugün henüz bir şey yok." />

      {goalsOpen && <GoalsForm onClose={() => setGoalsOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 3: Tip denetimi**

Run: `pnpm typecheck`
Expected: çıktı yok, exit 0.

---

### Task 9: Uçtan uca doğrulama ve dağıtım

**Files:** yok (yalnızca doğrulama + deploy)

- [ ] **Step 1: Tam denetim**

```bash
pnpm typecheck && pnpm test && pnpm build
```

Expected: typecheck sessiz, testler `8 passed`, build `✓ built in ...` ile biter.

- [ ] **Step 2: Yerelde uçtan uca senaryo**

Backend terminali açıkken (`node server/index.js`), `pnpm dev` → sırayla:
1. **Hafıza** → yeni besin ekle → **Günlük** → "Hafızadan" o besinle öğün ekle.
2. Miktarı 2 katına çıkar → önizlemedeki kcal 2 katına çıkıyor mu.
3. **Elle** modunda ikinci bir öğün ekle.
4. **Hedef** → kcal hedefini değiştir → halka doluluğu değişiyor mu.
5. **Geçmiş** → hafta → gün detayı → orada da öğün ekle/düzenle/sil çalışıyor mu.
6. Sayfayı yenile → tüm değişiklikler duruyor mu (backend'e yazıldı mı).

- [ ] **Step 3: Canlıya al**

```bash
pnpm deploy
```

Expected: `✓ canlı: https://nutri.emrullah.xyz`

- [ ] **Step 4: Canlıda duman testi**

https://nutri.emrullah.xyz aç → bir öğün ekle, düzenle, sil; bir alias ekle ve sil. Sayfa yenilendiğinde durum korunuyor mu.

---

## Self-Review

**Spec kapsamı:**
- Spec §10 local-first'ün ön koşulu (dev proxy + yerel backend) → Görev 1 Step 8–11 ✓ *(spec'te örtük; plan yazılırken eksik olduğu tespit edildi)*
- Spec §5 `saveDay/deleteDay/saveGoals/saveAlias/deleteAlias` → Görev 2 ✓
- Spec §4 mutate→refetch → Görev 3 ✓
- Spec §6.1 MealForm çift mod + canlı ölçekleme → Görev 1 (matematik) + Görev 5 ✓
- Spec §6.2 öğün silme, boşalınca `deleteDay` → Görev 3 (`setDayMeals`) + Görev 6 ✓
- Spec §6.3 AliasForm + sil → Görev 7 ✓
- Spec §6.4 GoalsForm + DailyPage girişi → Görev 8 ✓
- Spec §7 hem bugün hem geçmiş → Görev 6 (ortak `DayView`) ✓
- Spec §8 Modal + hifi dili → Görev 4 ✓
- Spec §9 doğrulama + satır-içi hata → Görev 4 (`ErrorText`), her formda `canSave` ✓
- Spec §10 local-first doğrulama + deploy → Görev 9 ✓

**Tip tutarlılığı:** `MealPayload` (types.ts) Görev 2'de tanımlanıp 3/5/6'da aynı adla kullanılıyor. `AliasPayload` (api.ts) Görev 2'de tanımlanıp 3 ve 7'de aynı. `NutritionDraft`/`toDraft`/`fromDraft`/`EMPTY_DRAFT` Görev 4'te tanımlanıp 5/7/8'de aynı. `setDayMeals`, `updateGoals`, `upsertAlias`, `removeAlias` Görev 3'te tanımlanıp aynı adlarla tüketiliyor. `toPayload` Görev 2'de tanımlanıp 5/6'da kullanılıyor. `fieldCls` Görev 4'te export edilip 5/7'de kullanılıyor.

**Placeholder taraması:** TBD/TODO yok; her kod adımı tam dosya ya da tam blok içeriyor; "Görev N'e benzer" yönlendirmesi yok.
