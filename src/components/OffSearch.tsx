// ============================================================================
// Nutrimind — Open Food Facts arama paneli + barkod tarayıcı (Faz 4).
//
// Üç giriş yolu var ve üçü de aynı `onPick(food)` ile bitiyor:
//   1. Metinle arama (Polonya kataloğu, gecikmeli/debounce),
//   2. Elle barkod yazma — HER tarayıcıda çalışır,
//   3. Kamerayla barkod tarama — yalnızca native `BarcodeDetector` varsa.
//
// HIZ SINIRI BU DOSYANIN TASARIMINI BELİRLİYOR. OFF arama için dakikada 10
// istek veriyor ve sınır IP başına; aşılırsa sunucunun IP'si banlanabiliyor.
// Bu yüzden: her tuşta değil 500 ms sessizlikten sonra arama, aynı sorguyu iki
// kez sormama, ve 429 geldiğinde OTOMATİK YENİDEN DENEME YOK — geri sayım
// gösterilip düğmeler kilitleniyor (KAMERA DAHİL — kamera yaşam döngüsü ve
// kota geri sayımı `../lib/offScanner`'da, ScanSheet (Faz S3) ile PAYLAŞILIYOR).
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useData } from "../lib/data";
import {
  OFF_ATTRIBUTION,
  fetchOffProduct,
  isValidBarcode,
  missingLabels,
  searchOff,
} from "../lib/off";
import type { OffFood } from "../lib/off";
import { useOffCooldown, useOffScanner } from "../lib/offScanner";
import { formatKcal, formatNumber } from "../lib/format";
import { fieldCls } from "./FormBits";

/** Tuşa basıldıktan sonra beklenen sessizlik. 500 ms hem yazarken rahatsız
 *  etmiyor hem de dakikada 10 isteklik kotayı zorlamıyor. */
const DEBOUNCE_MS = 500;
/** Bundan kısa sorgu OFF'ta anlamlı sonuç vermiyor, boşuna jeton yakar. */
const MIN_QUERY = 2;
const RESULT_LIMIT = 20;

export function OffSearch({ onPick }: { onPick: (food: OffFood) => void }) {
  const { t } = useTranslation();
  const { offline } = useData();
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [foods, setFoods] = useState<OffFood[] | null>(null);
  const [scope, setScope] = useState<"index" | "post-filter">("index");

  const { status, setStatus, cooldownLeft, blocked, applyError } = useOffCooldown();

  /** Uçan isteği iptal etmek için: kullanıcı yazmaya devam ederse eskisi düşer. */
  const abortRef = useRef<AbortController | null>(null);

  // --- Metinle arama (gecikmeli) --------------------------------------------
  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_QUERY) {
      abortRef.current?.abort();
      setFoods(null);
      setStatus((s) => (s.kind === "cooldown" ? s : { kind: "idle" }));
      return;
    }
    if (blocked || offline) return; // kota koruması ya da çevrimdışı: yeni istek yok

    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setStatus({ kind: "loading" });
      searchOff(term, RESULT_LIMIT, ctrl.signal)
        .then((res) => {
          if (ctrl.signal.aborted) return;
          setFoods(res.foods);
          setScope(res.scope);
          setStatus({ kind: "idle" });
        })
        .catch((e) => {
          if (ctrl.signal.aborted) return;
          applyError(e);
        });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
    // `blocked` bağımlılığı bilinçli: geri sayım bitince son sorgu tekrar denenir.
  }, [query, blocked, offline, applyError, setStatus]);

  // --- Barkodla tek ürün ----------------------------------------------------
  const lookupBarcode = useCallback(
    async (raw: string) => {
      if (offline) {
        setStatus({ kind: "error", message: t("offline.featureUnavailable") });
        return;
      }
      const code = raw.trim();
      if (!isValidBarcode(code)) {
        setStatus({ kind: "error", message: "Barkod 4-20 haneli bir sayı olmalı." });
        return;
      }
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setStatus({ kind: "loading" });
      try {
        const food = await fetchOffProduct(code, ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (!food) {
          // "Bulunamadı" bir arıza değil: OFF topluluk veritabanı, ürün henüz
          // eklenmemiş olabilir. Elle giriş yolu hâlâ açık.
          setStatus({ kind: "error", message: `${code} Open Food Facts'te bulunamadı — elle girebilirsin.` });
          setFoods([]);
          return;
        }
        setFoods([food]);
        setStatus({ kind: "idle" });
      } catch (e) {
        if (!ctrl.signal.aborted) applyError(e);
      }
    },
    [applyError, setStatus],
  );

  // --- Kamera: OffSearch + ScanSheet'in PAYLAŞTIĞI hook ----------------------
  const { scanning, setScanning, videoRef, canScan, cameraError } = useOffScanner({
    blocked: blocked || offline,
    onDetected: (value) => {
      setBarcode(value);
      void lookupBarcode(value);
    },
  });

  // Kamera açılamadıysa (izin reddi, cihaz yok…) aynı durum satırında göster.
  useEffect(() => {
    if (cameraError) setStatus({ kind: "error", message: cameraError });
  }, [cameraError, setStatus]);

  const showEmpty = foods !== null && foods.length === 0 && status.kind === "idle";

  return (
    <div className="flex flex-col gap-3 rounded-chip border border-line bg-white/[0.02] p-3">
      {/* --- Arama kutusu + kamera --- */}
      <div className="flex items-end gap-2">
        <label className="block flex-1">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">
            Open Food Facts'te ara (Polonya)
          </span>
          <input
            className={fieldCls}
            value={query}
            placeholder="örn. skyr, twaróg, Piątnica"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {canScan && (
          <button
            type="button"
            onClick={() => {
              setStatus({ kind: "idle" });
              setScanning((s) => !s);
            }}
            disabled={(blocked || offline) && !scanning}
            aria-pressed={scanning}
            className="flex-none rounded-pill border border-line px-3 py-2 text-sm text-ink-secondary transition hover:text-ink-primary disabled:opacity-40"
          >
            {scanning ? "Kamerayı kapat" : "Barkod tara"}
          </button>
        )}
      </div>

      {/* --- Kamera önizlemesi --- */}
      {scanning && (
        <div className="overflow-hidden rounded-chip border border-line bg-black">
          {/* muted + playsInline: mobil tarayıcılar sessiz olmayan videoyu
              kendiliğinden oynatmaz. */}
          <video ref={videoRef} muted playsInline className="h-44 w-full object-cover" />
          <p className="px-2 py-1.5 text-[11px] text-ink-tertiary">
            Barkodu çerçeveye getir — okununca otomatik aranır.
          </p>
        </div>
      )}

      {/* --- Elle barkod: her tarayıcıda çalışan yedek yol --- */}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocked && !offline) void lookupBarcode(barcode);
        }}
      >
        <label className="block flex-1">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">
            Barkod (elle)
          </span>
          <input
            className={`${fieldCls} font-mono`}
            inputMode="numeric"
            value={barcode}
            placeholder="5900531004544"
            onChange={(e) => setBarcode(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={blocked || offline || barcode.trim() === ""}
          className="flex-none rounded-pill border border-line px-3 py-2 text-sm text-ink-secondary transition hover:text-ink-primary disabled:opacity-40"
        >
          Getir
        </button>
      </form>

      {/* --- Durum satırı --- */}
      {status.kind === "loading" && <p className="text-[11px] text-ink-tertiary">Aranıyor…</p>}
      {status.kind === "error" && (
        <p className="rounded-chip bg-danger/10 px-3 py-2 text-[11px] text-danger">{status.message}</p>
      )}
      {blocked && (
        <p className="rounded-chip bg-warn/10 px-3 py-2 text-[11px] text-warn">
          Çok hızlı arama yapıldı. Open Food Facts kotası korunuyor —{" "}
          <span className="font-mono font-semibold">{cooldownLeft} sn</span> sonra kendiliğinden
          tekrar denenecek.
        </p>
      )}
      {offline && (
        <p className="rounded-chip bg-warn/10 px-3 py-2 text-[11px] text-warn">
          {t("offline.featureUnavailable")}
        </p>
      )}
      {showEmpty && (
        <p className="text-[11px] text-ink-tertiary">
          Polonya kataloğunda sonuç yok. Ürünü elle girebilir ya da barkodunu deneyebilirsin.
        </p>
      )}

      {/* --- Sonuçlar --- */}
      {foods !== null && foods.length > 0 && (
        <>
          {scope === "post-filter" && (
            <p className="text-[11px] text-ink-faint">
              Çok kelimeli aramada Polonya süzgeci sonradan uygulanıyor — liste beklenenden kısa olabilir.
            </p>
          )}
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {foods.map((food) => (
              <li key={food.code}>
                <OffResultRow food={food} onPick={() => onPick(food)} />
              </li>
            ))}
          </ul>
        </>
      )}

      {/* --- Atıf: OFF verisi ODbL lisanslı, kaynak belirtmek zorunlu --- */}
      <p className="text-[10px] text-ink-faint">{OFF_ATTRIBUTION}</p>
    </div>
  );
}

/** Tek sonuç satırı. Eksik besin varsa AÇIKÇA söylenir: OFF'un kapsaması dengesiz
 *  (paketli ürünlerde iyi, ham gıdada zayıf) ve eksik alan forma 0 olarak
 *  düşeceği için kullanıcının bunu görmesi şart. */
function OffResultRow({ food, onPick }: { food: OffFood; onPick: () => void }) {
  const missing = missingLabels(food);
  const hasKcal = food.present.includes("kcal");

  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-2.5 rounded-chip border border-line bg-white/[0.03] p-2 text-left transition hover:border-memory/60 hover:bg-white/[0.06]"
    >
      {food.imageUrl ? (
        <img
          src={food.imageUrl}
          alt=""
          loading="lazy"
          className="h-10 w-10 flex-none rounded-chip object-cover"
        />
      ) : (
        <span className="grid h-10 w-10 flex-none place-items-center rounded-chip bg-white/[0.05] font-mono text-[10px] text-ink-faint">
          —
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-ink-primary">{food.name}</span>
        <span className="block truncate font-mono text-[10px] text-ink-tertiary">
          {[food.brand, food.quantity, food.code].filter(Boolean).join(" · ")}
        </span>
        {missing.length > 0 && (
          <span className="mt-0.5 block truncate text-[10px] text-warn">
            eksik: {missing.join(", ")}
          </span>
        )}
      </span>

      <span className="flex-none text-right font-mono text-[10px] text-ink-secondary">
        {/* kcal bildirilmemişse "0 kcal" yazmak yalan olur. */}
        <span className="block">{hasKcal ? formatKcal(food.nutrition.kcal) : "kcal yok"}</span>
        <span className="block text-ink-faint">
          {food.present.includes("protein") ? `P${formatNumber(food.nutrition.protein, 1)}` : "P?"} /100 g
        </span>
      </span>
    </button>
  );
}
