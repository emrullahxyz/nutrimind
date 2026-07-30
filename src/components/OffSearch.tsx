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
// gösterilip düğmeler kilitleniyor.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FOOD_BARCODE_FORMATS,
  OFF_ATTRIBUTION,
  OffError,
  barcodeDetectorCtor,
  cameraScanSupported,
  fetchOffProduct,
  isValidBarcode,
  missingLabels,
  searchOff,
} from "../lib/off";
import type { BarcodeDetectorLike, OffFood } from "../lib/off";
import { formatKcal, formatNumber } from "../lib/format";
import { fieldCls } from "./FormBits";

/** Tuşa basıldıktan sonra beklenen sessizlik. 500 ms hem yazarken rahatsız
 *  etmiyor hem de dakikada 10 isteklik kotayı zorlamıyor. */
const DEBOUNCE_MS = 500;
/** Bundan kısa sorgu OFF'ta anlamlı sonuç vermiyor, boşuna jeton yakar. */
const MIN_QUERY = 2;
const RESULT_LIMIT = 20;
/** Kamera karesi tarama aralığı. 400 ms göze anında görünüyor, CPU'yu yormuyor. */
const SCAN_INTERVAL_MS = 400;

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  /** 429: `until` epoch ms — o ana kadar hiçbir istek atılmaz. Sunucunun kendi
   *  metni TAŞINMIYOR: içindeki saniye donuk kalır, ekrandaki geri sayımla
   *  çelişirdi ("59 sn sonra dene (12 sn)"). Sayı tek yerden, canlı geliyor. */
  | { kind: "cooldown"; until: number };

export function OffSearch({ onPick }: { onPick: (food: OffFood) => void }) {
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [foods, setFoods] = useState<OffFood[] | null>(null);
  const [scope, setScope] = useState<"index" | "post-filter">("index");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [scanning, setScanning] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** Uçan isteği iptal etmek için: kullanıcı yazmaya devam ederse eskisi düşer. */
  const abortRef = useRef<AbortController | null>(null);

  // Kamera düğmesi yalnızca gerçekten çalışacaksa görünür (bkz. cameraScanSupported).
  // Tek seferlik ölçülüyor: yetenek oturum içinde değişmez.
  const [canScan] = useState(cameraScanSupported);

  const cooldownLeft =
    status.kind === "cooldown" ? Math.max(0, Math.ceil((status.until - now) / 1000)) : 0;
  const blocked = cooldownLeft > 0;

  // Geri sayım saniyede bir tazelenir; bitince durum kendiliğinden boşa döner.
  useEffect(() => {
    if (status.kind !== "cooldown") return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [status.kind]);
  useEffect(() => {
    if (status.kind === "cooldown" && cooldownLeft === 0) setStatus({ kind: "idle" });
  }, [status, cooldownLeft]);

  /** Tüm hata yollarının tek çıkışı: 429 geri sayıma, diğerleri düz mesaja. */
  const applyError = useCallback((e: unknown) => {
    if ((e as Error | undefined)?.name === "AbortError") return; // iptal ettik, hata değil
    if (e instanceof OffError && e.status === 429) {
      // Sunucu süre vermezse 30 sn: uydurma ama TEMKİNLİ bir sayı — kotayı
      // yeniden zorlamaktansa fazla beklemek yeğdir.
      const seconds = e.retryAfter ?? 30;
      setStatus({ kind: "cooldown", until: Date.now() + seconds * 1000 });
      setNow(Date.now());
      return;
    }
    setStatus({ kind: "error", message: String((e as Error)?.message ?? e) });
  }, []);

  // --- Metinle arama (gecikmeli) --------------------------------------------
  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_QUERY) {
      abortRef.current?.abort();
      setFoods(null);
      setStatus((s) => (s.kind === "cooldown" ? s : { kind: "idle" }));
      return;
    }
    if (blocked) return; // kota korumasında yeni istek yok

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
  }, [query, blocked, applyError]);

  // --- Barkodla tek ürün ----------------------------------------------------
  const lookupBarcode = useCallback(
    async (raw: string) => {
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
    [applyError],
  );

  // --- Kamera ---------------------------------------------------------------
  // Akış `scanning` true olduğu sürece yaşar; efektin temizliği HER çıkışta
  // (kapatma, seçim, modalın unmount'ı) parçaları durdurur. Açık kalan kamera
  // gerçek bir hatadır — telefon ışığı yanık kalır.
  useEffect(() => {
    if (!scanning) return;
    const Ctor = barcodeDetectorCtor();
    if (!Ctor) {
      setScanning(false);
      return;
    }

    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | null = null;

    const release = () => {
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    (async () => {
      let detector: BarcodeDetectorLike;
      try {
        // Desteklenmeyen biçim istemek Chrome'da fırlatır — kesişim alınıyor.
        const supported = (await Ctor.getSupportedFormats?.()) ?? null;
        const formats = supported
          ? FOOD_BARCODE_FORMATS.filter((f) => supported.includes(f))
          : [...FOOD_BARCODE_FORMATS];
        detector = new Ctor(formats.length > 0 ? { formats } : undefined);

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) {
          release();
          return;
        }
        video.srcObject = stream;
        await video.play();
      } catch (e) {
        if (stopped) return;
        release();
        setScanning(false);
        setStatus({
          kind: "error",
          message: `Kamera açılamadı: ${String((e as Error)?.message ?? e)}`,
        });
        return;
      }

      timer = window.setInterval(async () => {
        const video = videoRef.current;
        if (!video || stopped) return;
        try {
          const hits = await detector.detect(video);
          const value = hits[0]?.rawValue?.trim();
          if (!value) return;
          release();
          setScanning(false);
          setBarcode(value);
          void lookupBarcode(value);
        } catch {
          // Tek karenin çözülememesi normal — sonraki kare denenir.
        }
      }, SCAN_INTERVAL_MS);
    })();

    return release;
  }, [scanning, lookupBarcode]);

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
            aria-pressed={scanning}
            className="flex-none rounded-pill border border-line px-3 py-2 text-sm text-ink-secondary transition hover:text-ink-primary"
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
          if (!blocked) void lookupBarcode(barcode);
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
          disabled={blocked || barcode.trim() === ""}
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
