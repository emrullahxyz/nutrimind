# Offline Sync Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offline senkronizasyon işinin kalanını tamamlamak: ağ gerektiren özelliklerin (AI, kamera analizi, Open Food Facts, veri geri yükleme) çevrimdışıda kilitlenmesi, çift sekme senkron koruması ve uç senaryo testleri.

**Architecture:** Üç katman: (1) `src/lib/netStatus.ts` — tek satırlık çevrimdışı sorgulama yardımcısı, `ai.ts`/`off.ts` savunma katmanı guard'ı olarak kullanır; (2) `DataProvider` bağlamına `offline` bayrağı açılır, `ScanSheet`/`OffSearch`/`ExportModal` UI kilitlerini bunun üzerinden çeker; (3) `offlineSync.ts`'in `runSync` çağrısı Web Locks API ile tarayıcı çapında serileştirilir. UI test altyapısı yok (repo saf fonksiyon testi deseninde) — bu yüzden kilit kararı saf fonksiyonlarda, görsel doğrulama manuel smoke checklist'inde.

**Tech Stack:** TypeScript 5, React 18 (context), react-i18next (en/tr/pl), vitest 4 (fake timers, `vi.stubGlobal`), Web Locks API (opsiyonel, düşüşü güvenli).

**Spec:** `public/plan-graph.html` bölüm 3 ("Offline Sync — Kalan Yapılacaklar") + onaylı tasarım kararları: çakışma politikası sunucu-sürümü+uyarı, kapsam öğünler+alias'lar, hedefler/config offline yazılamaz, AI/OFF/kamera ağ gerektirir.

---

## Durum: TAMAMLANDI (2026-09-13 arşiv taraması)

Bu planın kod işi **bitti ve master'da**. Aşağıdaki adım kutuları dosya bazında doğrulanarak
işaretlendi. Tek istisna **Task 7 / Step 2**: `public/plan-graph.html` bu planın "Spec"
artefaktıydı; prod bundle'dan çıkarılıp `docs/archive/superpowers/plan-graph.html`'e taşındı —
içeriği güncellenmedi, tarihsel hâliyle korunuyor.

| Task | Durum | Kanıt |
|---|---|---|
| 1 — `netStatus` + ai/off guard | ✅ | `src/lib/netStatus.ts` (+`netStatus.test.ts`) · `src/lib/ai.ts:9,79` · `src/lib/off.ts:26,151,167` |
| 2 — `offline` bayrağı + ScanSheet + i18n | ✅ | `src/lib/data.tsx:55` (`Ctx`) · `src/components/ScanSheet.tsx` · `offline.featureUnavailable` üç dilde |
| 3 — OffSearch kilidi | ✅ | `src/components/OffSearch.tsx` |
| 4 — ExportModal + config yazma denetimi | ✅ | `src/components/ExportModal.tsx` |
| 5 — Çift sekme kilidi (Web Locks) | ✅ | `src/lib/offlineSync.ts:23-29,382` (`withCrossTabLock`, `SYNC_LOCK_NAME`) + `offlineSync.test.ts` |
| 6 — Uç senaryo testleri | ✅ | `src/lib/offlineSync.test.ts:234,243` (StrictMode/çift çağrı · kuyruk ortasında ağ kesilmesi) |
| 7 — Smoke checklist + doküman | ⚠️ kısmi | `docs/operations/offline.md` ✅ · AGENTS.md çevrimdışı satırı ✅ · plan-graph güncellemesi ❌ (arşive taşındı) |

**Kalan tek insan işi:** `docs/operations/offline.md` içindeki 10 adımlık manuel smoke testi
(özellikle Android/Capacitor uçuş modu turu) — gerçek cihazda koşulması gerekiyor.

---

## Global Constraints

- **`server/index.js` DONMUŞTUR** — bu planda backend'e dokunulmaz. Server-side revision/409 bilinçli olarak kapsam DIŞI (bkz. son bölüm).
- **Sıfır backend bağımlılık** — yeni npm paketi EKLEME. Web Locks API tarayıcı yerleşik.
- **i18n kuralı** — YENİ kullanıcıya görünen her metin `useTranslation()` + `t('key')` ile; anahtarlar `src/i18n/locales/{en,tr,pl}.json` üçüne paralel eklenir. `ai.ts`/`off.ts`'in MEVCUT Türkçe mesaj deseni korunur (yeni metin eklenmez, yalnızca mevcut `offErrorMessage(0)`/`aiErrorMessage(0)` yeniden kullanılır).
- **Yazma deseni:** mutate → refetch; iyimser güncelleme yok. Bu plan hiçbir yazma yolunun semantiğini değiştirmez — yalnızca çevrimdışıyken ERİŞİMİ kapatır.
- **Test zorunluluğu** — her commit öncesi `pnpm typecheck` (0 hata) + `pnpm test` (tümü geçmeli; baseline ≈645 test) + `pnpm build` (✓ built).
- **Test ortamı:** jsdom YOK — saf fonksiyon testleri. `navigator` Node 22'de var ama `onLine`/`locks` tanımsız; testler `vi.stubGlobal("navigator", …)` ile taklit eder ve `afterEach`'te `vi.unstubAllGlobals()` çağırır.
- **Branch:** `feature/play-store-readiness`.

## Başlangıç durumu (ÖNEMLİ)

Çalışma ağacında commit'lenmemiş offline sync işi var: `src/lib/{api,data.tsx,offlineCache.ts}` (modified), `src/lib/{offlineSync,offlineProjection}.ts` + testleri ve `src/components/SyncStatus.tsx` (untracked), üç i18n dosyası (modified). Bu planın Görev 2-4'ü bu dosyaları GÜNCELLEYECEK; bu yüzden **Görev 2'nin commit'i mevcut commit'siz değişiklikleri de kapsar**. İki seçenek:

- **(Önerilen) Plan öncesi tek commit:** kullanıcı onayıyla mevcut işi tek commit'e al: `git add src/lib/api.ts src/lib/data.tsx src/lib/offlineCache.ts src/lib/offlineSync.ts src/lib/offlineProjection.ts src/lib/offlineSync.test.ts src/lib/offlineProjection.test.ts src/components/SyncStatus.tsx src/i18n/locales/en.json src/i18n/locales/tr.json src/i18n/locales/pl.json docs/superpowers/ public/plan-graph.html && git commit -m "feat(offline): yazma kuyrugu + projection + conflict korumali sync + SyncStatus UI"`.
- Ya da her görev kendi dosyalarını commit'ler; Görev 2'nin commit'i birikmiş data.tsx/api.ts/i18n değişikliklerini de taşır (mesajda belirtilmeli).

Aşağıdaki commit adımları HER ZAMAN yalnızca o görevin dosyalarını `git add` eder — asla `git add -A`.

---

### Task 1: `netStatus.ts` — çevrimdışı sorgulama + ai/off savunma guard'ı

**Files:**
- Create: `src/lib/netStatus.ts`
- Create: `src/lib/netStatus.test.ts`
- Modify: `src/lib/ai.ts` ( `aiPost` fonksiyonu, ~satır 79)
- Modify: `src/lib/off.ts` ( `searchOff` ~satır 149, `fetchOffProduct` ~satır 164)
- Test: `src/lib/ai.test.ts` (mevcut; `mockFetchOnce` yardımcısı var), `src/lib/off.test.ts` (mevcut)

**Interfaces:**
- Consumes: mevcut `AiError(status, message, retryAfter?)` ve `OffError(status, message, retryAfter?)` sınıfları; `aiErrorMessage(0)` / `offErrorMessage(0)` = "Sunucuya ulaşılamadı — bağlantını kontrol et."
- Produces: `export function isBrowserOffline(): boolean` — Node'da (navigator.onLine tanımsız) `false`, tarayıcı çevrimdışıysa `true`. Görev 2-4 bileşenleri bunu KULLANMAZ (context'ten `offline` çeker); yalnızca `ai.ts`/`off.ts` savunma katmanı kullanır.

- [x] **Step 1: netStatus testini yaz (FAIL)**

`src/lib/netStatus.test.ts` (YENİ):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { isBrowserOffline } from "./netStatus";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isBrowserOffline", () => {
  it("navigator.onLine false ise çevrimdışı der", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isBrowserOffline()).toBe(true);
  });
  it("navigator.onLine true ise çevrimiçi der", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(isBrowserOffline()).toBe(false);
  });
  it("onLine tanımsızsa (Node ortamı) çevrimdışı SAYMAZ", () => {
    vi.stubGlobal("navigator", {});
    expect(isBrowserOffline()).toBe(false);
  });
  it("navigator hiç yoksa çevrimdışı saymaz", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isBrowserOffline()).toBe(false);
  });
});
```

- [x] **Step 2: Testin FAIL ettiğini doğrula**

Run: `pnpm exec vitest run src/lib/netStatus.test.ts`
Expected: FAIL — "Failed to resolve import ./netStatus" (modül yok).

- [x] **Step 3: netStatus.ts'i yaz (PASS)**

`src/lib/netStatus.ts` (YENİ):

```ts
// ============================================================================
// Nutrimind — tarayıcı çevrimdışı mı? (tek soruluk yardımcı)
//
// `navigator.onLine` yalnızca tarayıcıda anlamlıdır; Node 22'de tanımsızdır.
// Yalnızca KESİN `false` çevrimdışı sayılır — `undefined ≠ offline` — aksi
// halde Node test ortamındaki her istek çevrimdışı sanılırdı.
// ============================================================================

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
```

Run: `pnpm exec vitest run src/lib/netStatus.test.ts`
Expected: PASS (4 test).

- [x] **Step 4: ai.test.ts'e çevrimdışı testini ekle (FAIL)**

`src/lib/ai.test.ts` — `describe("parseWithAI", …)` bloğunun İÇİNE ekle:

```ts
it("çevrimdışıysa isteği hiç açmaz, AiError(0) fırlatır", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const err = await parseWithAI("2 yumurta").catch((e) => e);
  expect(err).toBeInstanceOf(AiError);
  expect((err as AiError).status).toBe(0);
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

(`parseWithAI` kullanılır çünkü `parseMealImage` öncesinde rıza kontrolü vardır; bu test ağ guard'ını hedefler.) `afterEach`'teki `vi.unstubAllGlobals()` mevcut.

Run: `pnpm exec vitest run src/lib/ai.test.ts`
Expected: Yeni test FAIL — fetch çağrılıyor/ağ hatası farklı türde (guard henüz yok).

- [x] **Step 5: ai.ts'e guard'ı ekle**

`src/lib/ai.ts` — en üste import:

```ts
import { isBrowserOffline } from "./netStatus";
```

`aiPost` fonksiyonunun GÖVDESİNİN en başına (`let res: Response;`'dan ÖNCE):

```ts
  // Savunma katmanı: UI zaten çevrimdışıda butonları kilitler (bkz. ScanSheet);
  // yine de doğrudan çağrıda boşuna istek açma — hemen anlaşılır hata ver.
  if (isBrowserOffline()) throw new AiError(0, aiErrorMessage(0));
```

Run: `pnpm exec vitest run src/lib/ai.test.ts`
Expected: PASS.

- [x] **Step 6: off.test.ts'e çevrimdışı testini ekle (FAIL)**

`src/lib/off.test.ts` — `OffError`'ı import satırına ekle; dosyanın uygun `describe` bloğuna (proxy zarfı testlerinin yanına) ekle:
```ts
it("searchOff: çevrimdışıysa isteği hiç açmaz, OffError(0) fırlatır", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const err = await searchOff("skyr").catch((e) => e);
  expect(err).toBeInstanceOf(OffError);
  expect((err as OffError).status).toBe(0);
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
```

Run: `pnpm exec vitest run src/lib/off.test.ts`
Expected: Yeni test FAIL.

- [x] **Step 7: off.ts'e guard'ları ekle**

`src/lib/off.ts` — en üste import: `import { isBrowserOffline } from "./netStatus";`

`searchOff` gövdesinin en başına:

```ts
  if (isBrowserOffline()) throw new OffError(0, offErrorMessage(0));
```

`fetchOffProduct` gövdesinin en başına AYNI satırı kopyala (mühendis görevleri sırayla okumayabilir).

Run: `pnpm exec vitest run src/lib/off.test.ts`
Expected: PASS.

- [x] **Step 8: Kapı + commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 hata; tüm testler geçer; ✓ built.

```bash
git add src/lib/netStatus.ts src/lib/netStatus.test.ts src/lib/ai.ts src/lib/ai.test.ts src/lib/off.ts src/lib/off.test.ts
git commit -m "feat(offline): ai/off istemcilerinde cevrimdisi savunma guardi (netStatus)"
```

---

### Task 2: DataProvider `offline` bayrağı + ScanSheet kilidi + i18n anahtarı

**Files:**
- Modify: `src/lib/data.tsx` (Ctx tipi ~satır 61, value memo ~satır 366)
- Modify: `src/components/ScanSheet.tsx` (satır 105, ~150, ~156, 269, ~240 runVision, ~202 lookupBarcode, 689, 701)
- Modify: `src/i18n/locales/{en,tr,pl}.json` (`offline` bölümü, `opDeleteAlias` satırının arkası)

**Interfaces:**
- Consumes: Task 1'in `isBrowserOffline()` KULLANILMAZ — bileşenler context'i kullanır.
- Produces: `useData().offline: boolean` — tüm bileşenler çevrimdışı durumunu buradan okur. i18n anahtarı `offline.featureUnavailable` (Task 3 de kullanır).

- [x] **Step 1: i18n anahtarını üç dile ekle**

`src/i18n/locales/tr.json` — `"opDeleteAlias": "Hafıza sil: {{name}}"` satırından sonra (virgül ekleyerek):

```json
    "featureUnavailable": "Bu özellik internet gerektirir. Bağlantı gelince tekrar deneyin."
```

`src/i18n/locales/en.json` aynı yere:

```json
    "featureUnavailable": "This feature needs an internet connection. Try again once you're back online."
```

`src/i18n/locales/pl.json` aynı yere:

```json
    "featureUnavailable": "Ta funkcja wymaga połączenia z internetem. Spróbuj ponownie po połączeniu."
```

- [x] **Step 2: data.tsx — Ctx'e `offline` ekle**

`type Ctx = AppData & Actions & { usageIndex: UsageIndex };` satırını değiştir:

```ts
type Ctx = AppData & Actions & { usageIndex: UsageIndex; offline: boolean };
```

`const value = useMemo<Ctx | null>(...)` satırını değiştir:

```ts
  const value = useMemo<Ctx | null>(
    () => (visible ? { ...visible, ...actions, usageIndex, offline } : null),
    [visible, actions, usageIndex, offline],
  );
```

- [x] **Step 3: ScanSheet — offline'ı al, kamera akışını ve barkod algılamayı durdur**

`src/components/ScanSheet.tsx:105`:

```ts
  const { aliases, upsertAlias, setDayMeals, offline } = useData();
```

`useCameraStream(scanning && canUseCamera)` çağrısını değiştir (kamera çevrimdışıda hiç açılmasın — pil + net sinyal):

```ts
  const { videoRef, ready, error: cameraError, retry: retryCamera } = useCameraStream(
    scanning && canUseCamera && !offline,
  );
```

`useBarcodeDetection`'ın `active` satırını değiştir:

```ts
    active: scanning && scanMode === "barcode" && ready && !blocked && !offline,
```

- [x] **Step 4: ScanSheet — runVision / captureAndAnalyze / lookupBarcode guard'ları**

`runVision` gövdesinin en başına:

```ts
    if (offline) {
      setStatus({ kind: "error", message: t("offline.featureUnavailable") });
      return;
    }
```

`captureAndAnalyze` gövdesinin en başındaki `if (!video || !ready || analyzing) return;` satırını değiştir:

```ts
    if (!video || !ready || analyzing || offline) return;
```

`lookupBarcode` gövdesinin en başına (`const code = raw.trim();`'dan ÖNCE):

```ts
    if (offline) {
      setStatus({ kind: "error", message: t("offline.featureUnavailable") });
      return;
    }
```

- [x] **Step 5: ScanSheet — deklanşör ve galeri butonlarını kilitle**

Deklanşör butonu (satır ~689) `disabled` koşulunu değiştir:

```ts
                    disabled={!ready || analyzing || offline}
```

Galeri butonuna (satır ~701) `disabled` ve sınıf ekle:

```ts
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={offline}
                className="justify-self-end rounded-pill border border-white/15 bg-black/40 px-3 py-2 text-[11px] font-semibold text-white/80 opacity-100 backdrop-blur-sm transition hover:text-white disabled:opacity-40"
              >
```

- [x] **Step 6: Kapı + commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 hata; tüm testler geçer; ✓ built. (Context değişikliği mevcut testleri bozmaz — bileşen testi yok.)

```bash
git add src/lib/data.tsx src/components/ScanSheet.tsx src/i18n/locales/en.json src/i18n/locales/tr.json src/i18n/locales/pl.json
git commit -m "feat(offline): ScanSheet ag ozellikleri cevrimdisida kilitli (AI/kamera/OFF)"
```

---

### Task 3: OffSearch kilidi (OFF arama + barkod tarama)

**Files:**
- Modify: `src/components/OffSearch.tsx` (importlar, satır 47-77 arama efekti, 83 lookupBarcode, 112 useOffScanner, ~141 kamera butonu, ~188 form, ~205 durum satırı)

**Interfaces:**
- Consumes: `useData().offline` (Task 2), `t("offline.featureUnavailable")` (Task 2 i18n), mevcut `useOffCooldown`/`useOffScanner`.

- [x] **Step 1: Importlar**

`src/components/OffSearch.tsx` — import bölümüne ekle (mevcut react importundan sonra):

```ts
import { useTranslation } from "react-i18next";
import { useData } from "../lib/data";
```

- [x] **Step 2: offline + t'yi bileşene al**

`export function OffSearch({ onPick }: { onPick: (food: OffFood) => void }) {` gövdesinin en başına:

```ts
  const { t } = useTranslation();
  const { offline } = useData();
```

- [x] **Step 3: Arama efekti ve lookupBarcode guard'ları**

Arama efektindeki `if (blocked) return; // kota korumasında yeni istek yok` satırını değiştir:

```ts
    if (blocked || offline) return; // kota koruması ya da çevrimdışı: yeni istek yok
```

Aynı efektin dependency dizisine `offline` ekle: `[query, blocked, offline, applyError, setStatus]`.

`lookupBarcode` gövdesinin en başına:

```ts
      if (offline) {
        setStatus({ kind: "error", message: t("offline.featureUnavailable") });
        return;
      }
```

- [x] **Step 4: Kamera ve form butonlarını kilitle**

`useOffScanner` çağrısını değiştir (kamera yaşam döngüsü `blocked` ile durur):

```ts
  const { scanning, setScanning, videoRef, canScan, cameraError } = useOffScanner({
    blocked: blocked || offline,
```

Kamera butonu `disabled` koşulunu değiştir:

```ts
            disabled={(blocked || offline) && !scanning}
```

Elle barkod formunun `onSubmit` satırını ve buton `disabled` koşulunu değiştir:

```ts
          if (!blocked && !offline) void lookupBarcode(barcode);
```

```ts
          disabled={blocked || offline || barcode.trim() === ""}
```

- [x] **Step 5: Çevrimdışı bildirim çipi**

Kota çipinin (`{blocked && (…)}` bloğu, ~satır 205) ARKASINA ekle:

```ts
      {offline && (
        <p className="rounded-chip bg-warn/10 px-3 py-2 text-[11px] text-warn">
          {t("offline.featureUnavailable")}
        </p>
      )}
```

- [x] **Step 6: Kapı + commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 hata; tüm testler geçer; ✓ built.

```bash
git add src/components/OffSearch.tsx
git commit -m "feat(offline): OffSearch arama/barkod/kamera cevrimdisida kilitli"
```

---

### Task 4: ExportModal geri yükleme kilidi + config yazma yolları denetimi

**Files:**
- Modify: `src/components/ExportModal.tsx` (importlar, `handleStartRestore` ~satır 55, geri yükleme onay butonu)

**Interfaces:**
- Consumes: `useData().offline` (Task 2), mevcut i18n anahtarı `offline.writeUnavailable` (yENİ anahtar GEREKMEZ).

- [x] **Step 1: Config yazma yolları denetimi (kodsuz doğrulama adımı)**

Run: `grep -rn "saveGoals\|saveConfig" src --include="*.ts" --include="*.tsx" | grep -v "lib/api.ts\|lib/data.tsx\|lib/exporters"`

Beklenen: TÜM bulgular `updateGoals`/`updateConfig` üzerinden giden bileşenlerdir (App.tsx onboarding, GoalsForm, DayTypeBadge, ExerciseModal, DayView, SettingsSheet, SupplementCard/Settings, WeightCard, AliasPage) — bunlar `data.tsx`'teki `if (offline) throw …writeUnavailable` korumasından geçer. TEK doğrudan yol `lib/exporters.ts:executeRestore` → bu görev onu kilitler. Bu grep çıktısında BEKLENMEDİK bir doğrudan `saveGoals`/`saveConfig` çağrısı görürsen, onu da aynı guard ile kapat (raporla).

- [x] **Step 2: ExportModal importları ve offline**

`src/components/ExportModal.tsx` — import bölümüne ekle:

```ts
import { useData } from "../lib/data";
import { useTranslation } from "react-i18next";
```

Bileşen gövdesinin en başına (state'lerden önce):

```ts
  const { offline } = useData();
  const { t } = useTranslation();
```

- [x] **Step 3: handleStartRestore guard'ı**

`handleStartRestore` gövdesinin en başındaki `if (!validation || restoring) return;` satırını değiştir:

```ts
    if (!validation || restoring) return;
    if (offline) {
      setFileError(t("offline.writeUnavailable"));
      return;
    }
```

- [x] **Step 4: Onay butonunu kilitle**

Geri yükleme sekmesindeki onay butonunu bul: `onClick={handleStartRestore}` geçen `<button>`. `disabled` koşuluna `offline` ekle ve sınıfa `disabled:opacity-40` ekle. Örnek (mevcut koşul ne ise sonuna `|| offline` eklenir):

```ts
                disabled={restoring || !confirmed || offline}
```

- [x] **Step 5: Kapı + commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 hata; tüm testler geçer; ✓ built. (exporters.test.ts'deki `executeRestore` testleri mock'lu ağ kullanır, etkilenmez.)

```bash
git add src/components/ExportModal.tsx
git commit -m "feat(offline): yedek geri yukleme cevrimdisida engellenir + config yazi yollari denetimi"
```

---

### Task 5: Çift sekme senkron kilidi (Web Locks)

**Files:**
- Modify: `src/lib/offlineSync.ts` (`syncPending` ~satır 325, üstüne yeni yardımcı)
- Test: `src/lib/offlineSync.test.ts` (mevcut desen: `vi.hoisted` api/cache mock'ları, stateful `queue`)

**Interfaces:**
- Consumes: mevcut modül-içi `activeSync` promise kilidi (aynı sekmede paralel koşu zaten imkânsız).
- Produces: iç yardımcı `withCrossTabLock<T>(fn: () => Promise<T>): Promise<T>` — export EDİLMEZ. `SyncResult`/`SyncState` API değişmez.

- [x] **Step 1: Testleri yaz (FAIL)**

`src/lib/offlineSync.test.ts` — `describe("syncPending — conflict koruması", …)` bloğundan SONRA yeni blok:

```ts
describe("syncPending — çift sekme kilidi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Web Locks varsa sync kilit içinde koşar ve ikinci çağrı aynı koşuya katılır", async () => {
    let held = false;
    let acquisitions = 0;
    vi.stubGlobal("navigator", {
      locks: {
        request: async (_name: string, cb: () => Promise<unknown>) => {
          acquisitions++;
          expect(held).toBe(false);
          held = true;
          try {
            return await cb();
          } finally {
            held = false;
          }
        },
      },
    });
    apiMocks.fetchData.mockResolvedValue(makeData());

    const [a, b] = await Promise.all([syncPending(), syncPending()]);

    expect(acquisitions).toBe(1); // ikinci çağrı aktif sync promise'ine katıldı
    expect(a).toEqual(b);
  });

  it("Web Locks yoksa (eski tarayıcı) sync doğrudan koşar", async () => {
    vi.stubGlobal("navigator", {}); // locks yok
    apiMocks.fetchData.mockResolvedValue(makeData());

    const result = await syncPending();

    expect(apiMocks.fetchData).toHaveBeenCalledTimes(1);
    expect(result.synced).toBe(0);
  });
});
```

Run: `pnpm exec vitest run src/lib/offlineSync.test.ts`
Expected: İlk test FAIL (kilit yardımcısı yok; `acquisitions` 0 kalır), ikinci PASS.

- [x] **Step 2: withCrossTabLock yardımcısını ekle**

`src/lib/offlineSync.ts` — `const activeSync …` satırının üstüne:

```ts
/** Çift sekme koruması: aynı cihazda ikinci sekmede de uygulama açıksa iki
 *  sekmenin sync'i aynı operasyonu çift göndermesin. Web Locks API tarayıcı
 *  çapında tekil kilit verir; desteklemeyen tarayıcıda mevcut modül-içi lock
 *  yeterli (davranış bugünkü gibi). Node test ortamında `locks` tanımsızdır. */
const SYNC_LOCK_NAME = "nutrimind-sync";

type LockManagerLike = {
  request: <T>(name: string, cb: () => Promise<T>) => Promise<T>;
};

async function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { locks?: LockManagerLike }).locks
      : undefined;
  if (!locks) return fn();
  return locks.request(SYNC_LOCK_NAME, fn);
}
```

- [x] **Step 3: syncPending'i kilit içine al**

`syncPending` içindeki `result = await runSync();` satırını değiştir:

```ts
      result = await withCrossTabLock(() => runSync());
```

Run: `pnpm exec vitest run src/lib/offlineSync.test.ts`
Expected: PASS (tümü — mevcut testler `locks`'suz Node'da koştuğu için doğrudan yolu kullanır).

- [x] **Step 4: Kapı + commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 hata; tüm testler geçer; ✓ built.

```bash
git add src/lib/offlineSync.ts src/lib/offlineSync.test.ts
git commit -m "feat(offline): sync cift sekme korumasi (Web Locks, guvenli dusus)"
```

---

### Task 6: Uç senaryo testleri (StrictMode çift çağrı, kuyruk ortasında ağ kesilmesi)

**Files:**
- Test: `src/lib/offlineSync.test.ts` (mevcut desen)

**Interfaces:**
- Consumes: Task 1-5 sonrası `syncPending`. Yeni export ÜRETİLMEZ — davranış güvenceye alınır.

- [x] **Step 1: Testleri yaz (FAIL BEKLENTİSİ YOK — davranış zaten doğru, regresyon güvenliği)**

Not: Bu testler mevcut davranışı SABİTLER. İlk yazımda da geçmeli; geçmezse gerçek bir hata buldun — düzeltme önceliği bu görevin kendisidir.

`src/lib/offlineSync.test.ts` — `describe("syncPending — çift sekme kilidi", …)` bloğunun arkasına:

```ts
describe("syncPending — uç senaryolar", () => {
  it("StrictMode/çift event: aynı anda iki syncPending tek çalıştırmayı paylaşır", async () => {
    apiMocks.fetchData.mockResolvedValue(makeData());

    const [a, b] = await Promise.all([syncPending(), syncPending()]);

    expect(apiMocks.fetchData).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("kuyruk ortasında ağ kesilirse tamamlananlar düşer, kalanlar korunur", async () => {
    apiMocks.fetchData.mockResolvedValue(
      makeData({
        "2026-08-28": [mealItem("2026-08-28", "a")],
        "2026-08-29": [mealItem("2026-08-29", "a")],
        "2026-08-30": [mealItem("2026-08-30", "a")],
      }),
    );
    apiMocks.saveDay
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    queue = [
      op({ id: "op1", kind: "save-day", date: "2026-08-28", meals: [MEAL_PAYLOAD], base: makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }) }),
      op({ id: "op2", kind: "save-day", date: "2026-08-29", meals: [MEAL_PAYLOAD], base: makeData({ "2026-08-29": [mealItem("2026-08-29", "a")] }) }),
      op({ id: "op3", kind: "save-day", date: "2026-08-30", meals: [MEAL_PAYLOAD], base: makeData({ "2026-08-30": [mealItem("2026-08-30", "a")] }) }),
    ];

    const result = await syncPending();

    expect(cacheMocks.removeOperation).toHaveBeenCalledWith("op1");
    expect(queue.map((o) => o.id)).toEqual(["op2", "op3"]);
    expect(result.synced).toBe(1);
    expect(result.interrupted).toBe(true);
  });
});
```

Run: `pnpm exec vitest run src/lib/offlineSync.test.ts`
Expected: PASS (ikisi de). FAIL ederse: 401 testindeki gibi sync'in erken dönüş yollarını kontrol et — `removeOperation` çağrı sırası veya `interrupted` bayrağı bozulmuş demektir; `runSync`'teki `break`/`return` akışını düzelt.

- [x] **Step 2: Kapı + commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 hata; tüm testler geçer; ✓ built.

```bash
git add src/lib/offlineSync.test.ts
git commit -m "test(offline): cift cagri tek calistirma + kuyruk ortasi ag kesintisi guvencesi"
```

---

### Task 7: Manuel smoke testi + dokümantasyon + plan-graph güncellemesi

**Files:**
- Create: `docs/operations/offline.md` (manuel smoke checklist'i)
- Modify: `public/plan-graph.html` (bölüm 3 kartlarının durumları)
- Modify: `AGENTS.md` (mimari notuna tek satır)

**Interfaces:**
- Consumes: Task 1-6 tamamlanmış kod. Otomatik test ÜRETİLMEZ (manuel doğrulama + dokümantasyon görevi).

- [x] **Step 1: docs/operations/offline.md'i yaz**

```markdown
# Çevrimdışı mod — operasyon dokümanı

## Ne yapar
- Öğün/gün ve besin hafızası (alias) yazmaları çevrimdışıda IndexedDB kuyruğuna alınır
  (`src/lib/offlineCache.ts`), arayüz projeksiyonla anında güncellenir
  (`src/lib/offlineProjection.ts`).
- Bağlantı gelince `src/lib/offlineSync.ts` kuyruğu sırayla gönderir: sunucu verisi
  değişmişse işlem `conflict` olur (sessiz ezme yok), kullanıcı cihaz/sunucu seçer.
- Ağ/5xx'te üstel geri çekilme (1s→2s→5s→15s→30s→60s); 401'de sync durur; 4xx'te
  işlem `failed` olur, SyncStatus'tan Tekrar Dene/İptal edilir.
- AI analizi, kamera, Open Food Facts ve yedek geri yükleme çevrimdışıda KİLİTLİDİR
  (`offline.featureUnavailable` / `offline.writeUnavailable` mesajları).

## Manuel smoke testi (her büyük dağıtımdan önce, ~10 dk)
1. `node server/index.js` + `pnpm preview` (4173) çalıştır; uygulamaya giriş yap.
2. Geliştirici araçları → Network → **Offline** işaretle.
3. Bir gün öğün ekle → kart anında görünmeli, üstte "1 değişiklik bekliyor" amber banner.
4. Hafızaya yeni besin öğret → alias listesinde görünmeli (`local:` id).
5. AI tarama butonuna bas → kilitli/uyarı mesajı; OFF arama aynı.
6. Ayarlar → yedek geri yükleme → engellenmeli.
7. Sayfayı yenile (kuyruk IndexedDB'de kalmalı) → banner sayısı korunmalı.
8. Network → **Online** → otomatik senkron: banner kaybolmalı, `/api/day` 200 olmalı.
9. Çakışma tatbikatı: iki sekme aç; sekme A offline öğün ekle; sekme B'de AYNI günü
   online değiştir; A'yı online yap → conflict rozeti + Cihaz/Sunucu seçimi gelmeli.
10. Android'de tekrar: uçuş modu + adım 3-8 (Capacitor build).

## Bilinen sınırlar
- Hedefler/config/profil yazmaları çevrimdışıda kapalı (bilinçli kapsam sınırı).
- Çift sekme koruması Web Locks destekli tarayıcılarda tam; eski tarayıcıda modül-içi lock.
```

- [ ] **Step 2: plan-graph.html bölüm 3 durumlarını güncelle** — YAPILMADI: spec artefaktı
      güncellenmek yerine `docs/archive/superpowers/plan-graph.html`'e taşındı (prod bundle'dan çıktı)

`public/plan-graph.html` — bölüm 3 kartlarında: "AI / kamera / OFF offline kilidi" ve "Hedefler/config kilidinin gözden geçirilmesi" ve "Uç senaryo testleri" kartlarının `<span class="badge todo">Bekliyor</span>` / `<span class="badge todo">Ayrı onay</span>` etiketlerini sırasıyla `<span class="badge done">Tamam</span>` yap; "Server-side revision + 409" kartı `<span class="badge todo">Ayrı onay</span>` olarak KALIR; "Gerçek cihaz offline smoke testi" kartı `<span class="badge partial">Checklist hazır</span>` olur. Bölüm başlığındaki `<span class="tag todo">Sırada</span>` etiketi `<span class="tag wip">Kod tamam · smoke kullanıcıda</span>` olur. "💡 Önerilen sıra" kartındaki metni şununla değiştir:

```html
          <p>Offline sync kodu tamamlandı (bölüm 2-3); kalan tek adım bölüm 1'deki senin Play Store adımların ve gerçek cihaz smoke testi (docs/operations/offline.md).</p>
```

- [x] **Step 3: AGENTS.md mimari notuna tek satır**

`AGENTS.md` — "Mimari Notlar" bölümüne ekle:

```markdown
- Çevrimdışı yazma: `src/lib/offlineCache.ts` (IndexedDB v2 kuyruk) + `offlineProjection.ts`
  (saf projeksiyon) + `offlineSync.ts` (conflict korumalı sync) + `components/SyncStatus.tsx`;
  ağ gerektiren özellikler `offline` context bayrağıyla kilitlenir (bkz. docs/operations/offline.md).
```

- [x] **Step 4: Kapı + commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 hata; tüm testler geçer; ✓ built.

```bash
git add docs/operations/offline.md public/plan-graph.html AGENTS.md
git commit -m "docs(offline): manuel smoke checklist + plan-graph durum guncellemesi"
```

---

## Kapsam dışı (bilinçli karar)

**Server-side revision + 409 (compare-and-swap):** `server/index.js` donmuş — AGENTS.md gereği açık kullanıcı onayı olmadan değişmez, ayrı spec ister. Client zaten hazırdır: `offlineSync.ts` HTTP 409'u `conflict` olarak sınıflandırır; backend CAS eklediğinde istemci değişikliği GEREKMEZ. Bugünkü client-side base-karşılaştırması tek kullanıcılı gerçek kullanımda yeterli koruma sağlar.

## Spec coverage kontrol

| Kalan yapılacak (plan-graph bölüm 3) | Görev |
|---|---|
| AI / kamera / OFF offline kilidi | Task 1 (savunma) + Task 2 (ScanSheet) + Task 3 (OffSearch) |
| Hedefler/config kilidi gözden geçirme | Task 4 (denetim + executeRestore kilidi) |
| Uç senaryo testleri (StrictMode, ortada kesinti, reload) | Task 6 (+ Task 5 çift sekme; reload Task 7 smoke adım 7) |
| Gerçek cihaz offline smoke testi | Task 7 (checklist + plan-graph güncellemesi) |
| Server-side revision/409 | Kapsam dışı (yukarıda) |

## Type consistency kontrol

- `isBrowserOffline(): boolean` — Task 1'de tanımlanır, yalnızca ai.ts/off.ts kullanır (bileşenler kullanmaz).
- `useData().offline: boolean` — Task 2'de Ctx'e eklenir; Task 3 (OffSearch) ve Task 4 (ExportModal) aynı isimle çeker.
- `t("offline.featureUnavailable")` — Task 2 Step 1'de üç dile eklenir; Task 2/3 aynı anahtarı kullanır. Task 4 mevcut `offline.writeUnavailable`'ı kullanır, yeni anahtar eklemez.
- `withCrossTabLock<T>(fn: () => Promise<T>): Promise<T>` — Task 5'te tanımlanır, export edilmez; `SYNC_LOCK_NAME = "nutrimind-sync"`.
- Test yardımcıları `makeData`/`mealItem`/`op`/`queue`/`apiMocks`/`cacheMocks` — offlineSync.test.ts'te MEVCUT tanımlar; Task 5-6 yeniden tanımlamaz.

## No Placeholders kontrol

"TBD/TODO yok; her kod adımı tam kod içeriyor; 'Similar to Task N' yok (Task 1 Step 7'deki tek satırlık guard bilerek kopyalatılıyor)." — kontrol edildi.

## Sonraki adım

**Plan yürütüldü ve tamamlandı** (2026-09-13'te dosya bazında doğrulandı). Yeni iş için
`tasks/todo.md` → AÇIK İŞLER.
