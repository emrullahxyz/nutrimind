// ============================================================================
// Nutrimind — "Tara → yedim" (Faz S3, Faz A'da tam ekran kameraya taşındı).
//
// Kullanıcının en yüksek değerli isteği: barkod okutup öğünü kaydetmek 7
// dokunuşa mal oluyordu ve mükemmel bir tarama sonrasında bile Kaydet
// açıklamasız kilitli kalıyordu (`triggers` boş kaldığı için — bkz.
// AliasForm.tsx). Bu bileşen TEK ekranda biter: tara → onayla → hem hafızaya
// yaz hem (istenirse) bugüne işle.
//
// FAZ A'DA DÜZELTİLEN ÜÇ ŞEY:
//   1. Kamera, barkod dedektörüne kilitliydi (`cameraScanSupported` önce
//      `BarcodeDetector` arıyordu). Dedektörü olmayan cihazlarda yemek fotoğrafı
//      ve etiket okuma için kamera HİÇ açılmıyordu. Artık `useCameraStream`
//      (kamera) ile `useBarcodeDetection` (barkod) ayrı — bkz. ../lib/camera.
//   2. "Food Label" düğmesi `fileInputRef.click()` çağırıyordu, yani canlı etiket
//      okuma diye bir şey yoktu; galeri açılıyordu. Artık canlı bir kamera modu.
//   3. Canlı kameradan AI'a giden yol hiç yoktu — yalnızca galeriden seçilen
//      dosya analiz edilebiliyordu. Artık deklanşör kareyi ÇERÇEVEYE KIRPARAK
//      yakalıyor (`captureVideoFrame` + `cropRectFor`); kırpma sayesinde model
//      tüm sahne yerine sadece etiketi/tabağı görüyor.
//
// ÇİFT YAZMA TUZAĞI (CLAUDE.md'nin uyardığı, projeyi daha önce ısırmış olan):
//   1. `saveAlias` yeni id'yi DÖNER (`upsertAlias` context aksiyonu artık bunu
//      taşıyor) — `MealSource.aliasId` için şart, yoksa Faz 6'nın miktar
//      tahmini bu öğünün izini sessizce kaybeder.
//   2. Gün yazımı günün TÜM öğün dizisini DEĞİŞTİRİR. Bu yüzden payload'ı
//      `mealsOf(days, date)`'ten alias yazımının kendi refetch'i SONRASINDA,
//      TAZE çekilen veriden türetiyoruz — bileşenin kendi `useData()`
//      kapanışındaki (closure) `days`'ten DEĞİL.
//   3. Alias yazımı başarılı ama gün yazımı başarısız olursa: besin GERÇEKTEN
//      hafızaya kaydedildi, bunu toptan bir "başarısız" gibi göstermek yalan
//      olur — ayrı, dürüst bir mesaj var.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { ErrorText, Label, NumField, NutrientSummaryLine, fieldCls } from "./FormBits";
import { VisionReviewScreen } from "./VisionReview";
import { useData } from "../lib/data";
import { fetchData } from "../lib/api";
import { mealsOf, toPayload } from "../lib/days";
import { GRAM_UNIT, parseNum, scaleNutrition, toGrams, unitOptions } from "../lib/nutrition";
import { MACROS } from "../lib/nutrients";
import { defaultScanGrams, seedTrigger } from "../lib/scan";
import {
  OFF_ATTRIBUTION,
  OFF_SERVING_G,
  fetchOffProduct,
  isValidBarcode,
  missingLabels,
} from "../lib/off";
import type { OffFood } from "../lib/off";
import { useOffCooldown } from "../lib/offScanner";
import {
  cameraSupported,
  cropRectFor,
  guideRectFor,
  useBarcodeDetection,
  useCameraStream,
  visionModeFor,
} from "../lib/camera";
import type { ScanMode } from "../lib/camera";
import { todayISO } from "../lib/format";
import type { AIParseItem, MealPayload, MealSource, VisionMode } from "../types";
import { AiError, grantAiConsent, hasAiConsent, parseMealImage } from "../lib/ai";
import { useTranslation } from "react-i18next";
import { captureVideoFrame, compressImageToBase64 } from "../lib/image";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

/** Üç kayıt yolu var; hangisinin sürdüğünü ayrı ayrı bilmek gerekiyor ki doğru
 *  düğme "…" göstersin. `dayOnly` = hafızaya HİÇ yazmadan yalnızca bugüne ekle. */
type Saving = "today" | "memory" | "dayOnly" | null;

const MODES: { mode: ScanMode; icon: string; labelKey: string }[] = [
  { mode: "scan_food", icon: "🍽️", labelKey: "scan.modeFood" },
  { mode: "food_label", icon: "🏷️", labelKey: "scan.modeLabel" },
  { mode: "barcode", icon: "📊", labelKey: "scan.modeBarcode" },
];

const MODE_HINT_KEY: Record<ScanMode, string> = {
  scan_food: "scan.hintFood",
  food_label: "scan.hintLabel",
  barcode: "scan.hintBarcode",
};

/** Etiket okuma ayrıntı ister (küçük punto besin tablosu), yemek fotoğrafı istemez.
 *  Etikette kalite bilerek yüksek: JPEG artefaktları en çok ince yazıyı yiyor ve
 *  kırpılmış kare zaten küçük olduğu için birkaç KB'lik fark önemsiz. */
const CAPTURE_OPTS: Record<VisionMode, { maxDim: number; quality: number }> = {
  food_label: { maxDim: 1600, quality: 0.92 },
  food_photo: { maxDim: 1024, quality: 0.7 },
};

export function ScanSheet({
  onClose,
  onVisionResult,
}: {
  onClose: () => void;
  /** ZORUNLU. Opsiyonelken iki çağıran (App'in FAB yolu ve AliasPage) bunu
   *  geçirmeyi unutmuştu; `onVisionResult?.()` sessizce hiçbir şey yapmadığı için
   *  görsel/etiket taraması o iki yolda sonuçsuz kalıyordu. Opsiyonel yapma. */
  onVisionResult: (items: AIParseItem[]) => void;
}) {
  useBodyScrollLock(true);
  const { t } = useTranslation();
  const { aliases, upsertAlias, setDayMeals, offline } = useData();

  // --- Tarama adımı ---
  const [food, setFood] = useState<OffFood | null>(null);
  const [barcode, setBarcode] = useState("");
  const { status, setStatus, cooldownLeft, blocked, applyError } = useOffCooldown();

  const [scanMode, setScanMode] = useState<ScanMode>("scan_food");
  const [showManual, setShowManual] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  /** Deklanşörle çekilen kare, AI'a gitmeden ÖNCE burada bekler. Telefon tam
   *  basılırken oynarsa (fiziksel titreşim) kullanıcı bunu AI'ın yanıtını
   *  bekleyip kotayı harcamadan fark edip tekrar çeksin diye — bkz. systematic
   *  debugging notu: kırpma/çekim senkronizasyonunda kod hatası yoktu, eksik
   *  olan çekilen kareyi göndermeden önce göstermekti. */
  const [capturedPreview, setCapturedPreviewState] = useState<{
    base64: string;
    mimeType: string;
    mode: VisionMode;
  } | null>(null);
  /** `capturedPreview`'ın SENKRON aynası. Modal'ın `onClose`'u popstate'te
   *  render beklemeden HEMEN karar vermek zorunda (aşağıdaki `handleModalClose`)
   *  — React state güncellemesi bir sonraki render'a kadar görünmez, ama arka
   *  arkaya hızlı iki geri basış (gerçek cihazda görülen, ara sıra tetiklenen
   *  bir hata) ikinci popstate'i o render'dan ÖNCE tetikleyebiliyor. State'e
   *  güvenilseydi ikinci basış hâlâ "tekrar çek" sanılır, geçmişe fazladan bir
   *  girdi daha pushlanır ve BİR SONRAKİ geri basış uygulamanın kendisinden
   *  çıkardı. Ref senkron olduğu için bu yarışı ortadan kaldırıyor. */
  const capturedPreviewRef = useRef<typeof capturedPreview>(null);
  function setCapturedPreview(value: typeof capturedPreview) {
    capturedPreviewRef.current = value;
    setCapturedPreviewState(value);
  }
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Yetenek oturum içinde değişmez, bir kez ölçülüyor. `cameraScanSupported`'tan
  // farkı: BarcodeDetector ARAMAZ — yemek/etiket çekimi ona ihtiyaç duymuyor.
  const [canUseCamera] = useState(cameraSupported);

  // Etiket/Yemek modunda `runVision()` artık `onVisionResult`'ı doğrudan
  // çağırmıyor — sonucu burada tutup barkodla AYNI Modal içinde üçüncü bir
  // onay dalı (`VisionReviewScreen`) açıyor (bkz. dosya altındaki render).
  const [visionItems, setVisionItems] = useState<AIParseItem[] | null>(null);
  const [visionMode, setVisionMode] = useState<VisionMode | null>(null);
  const [visionSaving, setVisionSaving] = useState(false);
  const [aiConsentOpen, setAiConsentOpen] = useState(false);
  // Onay bekleyen görsel çağrısı: kullanıcı "Anladım"a basınca otomatik tekrar parse edilir.
  const pendingVisionRef = useRef<{ base64: string; mimeType: string; mode: VisionMode } | null>(null);

  const scanning = food === null && visionItems === null;

  const { videoRef, ready, error: cameraError, retry: retryCamera } = useCameraStream(
    scanning && canUseCamera && !offline,
  );

  // Barkod taraması YALNIZCA barkod modunda ve akış hazırken çalışır. `blocked`
  // değişimi yalnızca bu aralığı yeniden kurar — kamerayı DEĞİL (telefon ışığı
  // sönüp yeniden yanmasın).
  useBarcodeDetection({
    videoRef,
    active: scanning && scanMode === "barcode" && ready && !blocked && !offline,
    onDetected: (value) => {
      setBarcode(value);
      void lookupBarcode(value);
    },
  });

  // Asist çerçevesi için sahnenin gerçek ölçüsü gerekiyor: hem çizim hem de
  // yakalanan karenin kırpılması AYNI dikdörtgeni kullanmalı.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setStage({ width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scanning]);

  const guide = guideRectFor(scanMode, stage.width, stage.height);

  function selectFood(f: OffFood) {
    // TEK sonuç: ekstra bir liste/tık yok, doğrudan onay ekranına geçilir.
    const known = aliases.find((a) => a.barcode === f.code) ?? null;
    setFood(f);
    setTriggers(known ? known.triggers.join(", ") : seedTrigger(f.name));
    setGrams(String(known ? known.serving_g : defaultScanGrams(f)));
    setUnitName(GRAM_UNIT.name);
    setErr(null);
  }

  async function lookupBarcode(raw: string) {
    if (offline) {
      setStatus({ kind: "error", message: t("offline.featureUnavailable") });
      return;
    }
    const code = raw.trim();
    if (!isValidBarcode(code)) {
      setStatus({ kind: "error", message: t("scan.barcodeInvalid") });
      return;
    }
    setStatus({ kind: "loading" });
    try {
      const found = await fetchOffProduct(code);
      if (!found) {
        setStatus({ kind: "error", message: t("scan.barcodeNotFound", { code }) });
        return;
      }
      setStatus({ kind: "idle" });
      selectFood(found);
    } catch (e) {
      applyError(e);
    }
  }

  /** Bu barkod hafızada zaten var mı? Tarama-öncelikli bir akışta aynı ürün
   *  defalarca okutulur; her seferinde yeni bir besin yaratsaydık hafıza
   *  kopyalarla dolardı. Varsa kayıt YENİDEN YAZILMAZ — kullanıcının elle
   *  düzelttiği tetikleyiciler/birimler ezilmesin diye olduğu gibi kullanılır. */
  const knownAlias = food ? (aliases.find((a) => a.barcode === food.code) ?? null) : null;

  // --- Görsel analiz (kamera karesi ve galeri dosyası aynı yolu paylaşır) ---

  async function runVision(base64: string, mimeType: string, mode: VisionMode) {
    if (offline) {
      setStatus({ kind: "error", message: t("offline.featureUnavailable") });
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAnalyzing(true);
    setStatus({ kind: "idle" });
    pendingVisionRef.current = { base64, mimeType, mode };
    try {
      const result = await parseMealImage(base64, mimeType, mode, ctrl.signal);
      if (result.items.length === 0) {
        // `healthNote` sunucunun gerçek gerekçesi ("görselde yemek tespit
        // edilemedi" gibi) — genel bir hata metninden çok daha yardımcı.
        setStatus({
          kind: "error",
          message: result.healthNote ?? t("scan.noFoodExtracted"),
        });
        return;
      }
      // Etiket/Yemek artık `MealForm`'un sepetine hiç uğramıyor — sonucu
      // burada tutup barkodun onay ekranıyla AYNI desende (`VisionReviewScreen`)
      // direkt güne/hafızaya yazdırıyoruz.
      setVisionItems(result.items);
      setVisionMode(mode);
    } catch (e) {
      if ((e as Error | undefined)?.name === "AbortError") return; // kullanıcı iptal etti
      if ((e as Error | undefined)?.message === "AI_CONSENT_REQUIRED") {
        setAiConsentOpen(true);
        return;
      }
      // `AiError.message` zaten kullanıcıya gösterilebilir Türkçe metin.
      setStatus({
        kind: "error",
        message: e instanceof AiError ? e.message : String((e as Error)?.message ?? e),
      });
    } finally {
      setAnalyzing(false);
      abortRef.current = null;
    }
  }

  async function captureAndAnalyze() {
    const video = videoRef.current;
    if (!video || !ready || analyzing || offline) return;
    const mode = visionModeFor(scanMode);
    // Çerçeve dekor değil: kare tam olarak buraya kırpılıyor.
    const crop = guide
      ? cropRectFor(video.videoWidth, video.videoHeight, stage.width, stage.height, guide)
      : undefined;
    try {
      const { base64, mimeType } = await captureVideoFrame(video, { ...CAPTURE_OPTS[mode], crop });
      // Doğrudan AI'a gönderme — önce göster, kullanıcı onaylasın/tekrar çeksin.
      setCapturedPreview({ base64, mimeType, mode });
    } catch (e) {
      setStatus({ kind: "error", message: String((e as Error)?.message ?? e) });
    }
  }

  function confirmCapture() {
    if (!capturedPreview) return;
    const { base64, mimeType, mode } = capturedPreview;
    setCapturedPreview(null);
    void runVision(base64, mimeType, mode);
  }

  function retakeCapture() {
    // Video akışı hiç durmadı — önizleme kapanınca canlı kare zaten hazır.
    setCapturedPreview(null);
  }

  /** Modal'a HER ZAMAN aynı, kararlı referans olarak geçiyoruz (bkz. aşağıdaki
   *  `<Modal onClose=...>`) — geri tuşu/kaydırma/X/Escape'in HEPSİ Modal'ın TEK
   *  history girdisini `history.back()` ile tüketip bunu çağırıyor. Karar
   *  `capturedPreviewRef`'ten (senkron) okunuyor, React state'ten DEĞİL —
   *  neden önemli olduğu yukarıdaki ref yorumunda. Önizlemedeysek o girdi az
   *  önce gitti ama sheet React'te hâlâ açık: girdiyi geri pushlayıp TEK
   *  seviye korumayı sürdürüyoruz. Değilsek gerçek kapanış. */
  function handleModalClose() {
    if (capturedPreviewRef.current) {
      setCapturedPreview(null);
      window.history.pushState({ isModal: true, title: "Kamera / Tara" }, "");
    } else {
      requestClose();
    }
  }

  const handleGallerySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // aynı dosya tekrar seçilebilsin diye input'u sıfırla
    if (!file || !file.type.startsWith("image/")) return;
    // Galeri bir MOD değil, bir eylem: o anda hangi moddaysan onun istemiyle
    // okunur (etiket modundayken galeriden seçilen fotoğraf da etiket sayılır).
    const mode = visionModeFor(scanMode);
    try {
      const { base64, mimeType } = await compressImageToBase64(file, CAPTURE_OPTS[mode]);
      await runVision(base64, mimeType, mode);
    } catch (err) {
      setStatus({ kind: "error", message: String((err as Error)?.message ?? err) });
    }
  };

  function cancelAnalyze() {
    abortRef.current?.abort();
    abortRef.current = null;
    setAnalyzing(false);
  }

  // --- Onay adımı ---
  const [triggers, setTriggers] = useState("");
  const [grams, setGrams] = useState(String(OFF_SERVING_G));
  const [unitName, setUnitName] = useState(GRAM_UNIT.name);
  const [saving, setSaving] = useState<Saving>(null);
  const [err, setErr] = useState<string | null>(null);

  const triggerList = [
    ...new Set(
      triggers
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  // Hafızada varsa kullanıcının o besne tanımladığı özel birimler de seçilebilsin.
  const availableUnits = unitOptions(knownAlias?.units);
  const selectedUnit = availableUnits.find((u) => u.name === unitName) ?? GRAM_UNIT;
  const amountValue = parseNum(grams);
  const gramsTotal = toGrams(amountValue, selectedUnit);
  const scaledNutrition = food && gramsTotal > 0 ? scaleNutrition(food.nutrition, OFF_SERVING_G, gramsTotal) : null;

  const canSaveAlias = triggerList.length > 0;
  const canLogWithMemory = canSaveAlias && scaledNutrition !== null;
  /** "Sadece öğüne" ifade İSTEMEZ — hafızaya hiçbir şey yazılmadığı için
   *  tetikleyiciye ihtiyaç yok. Eskiden tek kayıt yolu hafızadan geçtiği için
   *  taranan bir ürünü bugüne eklemek, uydurma bir ifade yazmayı zorunlu
   *  kılıyordu. */
  const canLogOnly = scaledNutrition !== null;

  function requestClose() {
    if (saving || visionSaving) return;
    if (analyzing) cancelAnalyze();
    onClose();
  }

  function backToScan() {
    if (saving) return;
    setFood(null);
    setErr(null);
  }

  /** `VisionReviewScreen`'in "‹ Yeniden çek"i: `backToScan`'ın Etiket/Yemek
   *  karşılığı — tarama sonucunu atıp kameraya döner. */
  function backFromVision() {
    if (visionSaving) return;
    setVisionItems(null);
    setVisionMode(null);
  }

  function aliasPayload(f: OffFood) {
    return {
      triggers: triggerList,
      name: f.name,
      brand: f.brand,
      serving_g: OFF_SERVING_G,
      nutrition: f.nutrition,
      units: [],
      barcode: f.code,
      off_id: f.code,
    };
  }

  async function saveOnly() {
    if (!food || !canSaveAlias || saving) return;
    // Zaten hafızada: yapacak bir şey yok, üstüne yazıp kullanıcının
    // düzenlemelerini ezmenin anlamı da yok.
    if (knownAlias) {
      onClose();
      return;
    }
    setSaving("memory");
    setErr(null);
    try {
      await upsertAlias(aliasPayload(food));
      onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSaving(null);
    }
  }

  /** Yalnızca bugüne ekler — hafızaya HİÇBİR ŞEY yazmaz.
   *
   *  `sources` bilerek YOK: `MealSource.aliasId` gerçek bir hafıza kaydına
   *  işaret etmek zorunda; alias yaratmadığımız için uyduracak bir id de yok.
   *  Bu öğün miktar tahmini öğrenmesine katılmaz — kullanıcı zaten "hafızaya
   *  yazma" demiş oluyor. */
  async function logOnly() {
    if (!food || !scaledNutrition || saving) return;
    setSaving("dayOnly");
    setErr(null);
    try {
      // Gün yazımı günün TÜM dizisini değiştirir → payload TAZE veriden
      // türetilir (bkz. dosya başındaki çift yazma tuzağı notu).
      const date = todayISO();
      const fresh = await fetchData();
      const existing = toPayload(mealsOf(fresh.days, date));
      const entry: MealPayload = { name: food.name, nutrition: scaledNutrition };
      await setDayMeals(date, [...existing, entry]);
      onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSaving(null);
    }
  }

  async function saveAndLog() {
    if (!food || !canLogWithMemory || !scaledNutrition || saving) return;
    setSaving("today");
    setErr(null);

    let aliasId: string;
    if (knownAlias) {
      // Ürün zaten hafızada: yazma yok, doğrudan öğüne geç.
      aliasId = knownAlias.id;
    } else {
      try {
        aliasId = await upsertAlias(aliasPayload(food));
      } catch (e) {
        setErr(String((e as Error)?.message ?? e));
        setSaving(null);
        return;
      }
    }

    // ALIAS YAZILDI VE HAFIZA TAZELENDİ. Gün payload'ını burada, bileşenin
    // KENDİ `days` kapanışından değil, TAZE bir `fetchData()`'dan türetiyoruz
    // — bkz. dosya başındaki çift yazma tuzağı notu.
    try {
      const date = todayISO();
      const fresh = await fetchData();
      const existing = toPayload(mealsOf(fresh.days, date));
      const source: MealSource = { aliasId, qty: amountValue, unit: selectedUnit.name };
      const entry: MealPayload = { name: food.name, nutrition: scaledNutrition, sources: [source] };
      await setDayMeals(date, [...existing, entry]);
      onClose();
    } catch (e) {
      // Besin GERÇEKTEN hafızaya kaydedildi — bunu toptan başarısızlık gibi
      // göstermek yanlış olur.
      setErr(
        `Besin hafızaya kaydedildi, ancak bugüne eklenemedi: ${String((e as Error)?.message ?? e)}. Hafızadan elle ekleyebilirsin.`,
      );
    } finally {
      setSaving(null);
    }
  }

  const footerContent = food ? (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={saveAndLog}
        disabled={!canLogWithMemory || !!saving}
        className="w-full rounded-pill bg-accent px-4 py-2.5 text-sm font-extrabold text-accent-ink transition disabled:opacity-40"
      >
        {saving === "today" ? "…" : t("scan.saveToDayAndMemory")}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={logOnly}
          disabled={!canLogOnly || !!saving}
          className="rounded-pill border border-line bg-white/[0.04] px-4 py-2 text-sm font-bold text-ink-primary transition hover:bg-white/[0.08] disabled:opacity-40"
        >
          {saving === "dayOnly" ? "…" : t("scan.saveToDayOnly")}
        </button>
        <button
          type="button"
          onClick={saveOnly}
          disabled={!canSaveAlias || !!saving || !!knownAlias}
          className="rounded-pill border border-memory bg-memory/10 px-4 py-2 text-sm font-bold text-memory transition hover:bg-memory hover:text-memory-ink disabled:opacity-40"
        >
          {saving === "memory" ? "…" : knownAlias ? t("scan.inMemory") : t("scan.saveToMemoryOnly")}
        </button>
      </div>
      <button
        type="button"
        onClick={requestClose}
        disabled={!!saving}
        className="self-center text-[11px] font-semibold text-ink-tertiary underline transition hover:text-ink-primary disabled:opacity-40"
      >
        {t("common.cancel")}
      </button>
    </div>
  ) : undefined;

  const manualBarcodeForm = (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!blocked) void lookupBarcode(barcode);
      }}
    >
      <label className="block flex-1">
        <Label>{t("scan.barcodeLabel")}</Label>
        <input
          className={`${fieldCls} font-mono`}
          inputMode="numeric"
          value={barcode}
          placeholder={t("scan.barcodePlaceholder")}
          onChange={(e) => setBarcode(e.target.value)}
        />
      </label>
      <button
        type="submit"
        disabled={blocked || barcode.trim() === ""}
        className="flex-none rounded-pill border border-line px-3 py-2 text-sm text-ink-secondary transition hover:text-ink-primary disabled:opacity-40"
      >
        {t("offSearch.fetch")}
      </button>
    </form>
  );

  const statusBand =
    status.kind === "loading" ? (
      <p className="rounded-chip bg-black/60 px-3 py-2 text-center text-[11px] text-white/80 backdrop-blur-sm">
        {t("offSearch.searching")}
      </p>
    ) : status.kind === "error" ? (
      <p className="rounded-chip bg-danger/20 px-3 py-2 text-center text-[11px] text-danger backdrop-blur-sm">
        {status.message}
      </p>
    ) : blocked ? (
      <p className="rounded-chip bg-warn/20 px-3 py-2 text-center text-[11px] text-warn backdrop-blur-sm">
        {t("scan.cooldown", { seconds: cooldownLeft })}
      </p>
    ) : null;

  const visionTitle =
    visionMode === "food_label" ? t("scan.titleFoodLabel") : visionMode === "food_photo" ? t("scan.titleFoodPhoto") : t("scan.title");

  return (
    <Modal
      fullScreen
      bleed={scanning}
      title={food ? t("scan.titleReview") : visionItems && visionMode ? visionTitle : t("scan.title")}
      // SABİT referans — capturedPreview'a göre koşullu DEĞİL. Kararı kendi
      // içinde senkron ref'ten okuyor (bkz. `handleModalClose` yorumu); render
      // bekleyen bir koşullu swap, arka arkaya hızlı iki geri basışta yarışa
      // girip ikinci basışta uygulamadan çıkışa yol açıyordu.
      onClose={handleModalClose}
      footer={footerContent}
    >
      {/* Galeri seçici: SADECE "Galeri" düğmesi tetikler. Eskiden "Food Label"
          da bunu açıyordu — canlı etiket okuma diye bir şey yoktu. */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleGallerySelect} />

      {scanning ? (
        <div ref={stageRef} className="relative h-full w-full overflow-hidden bg-black">
          {canUseCamera && !cameraError ? (
            <>
              {/* muted + playsInline: mobil tarayıcılar sessiz olmayan videoyu
                  kendiliğinden oynatmaz. */}
              <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover" />

              {/* Asist çerçevesi. Dev `box-shadow` yayılımı çerçevenin DIŞINI
                  karartıyor — tek eleman hem çerçeve hem maske (sahne
                  `overflow-hidden` olduğu için taşma görünmez).
                  GEÇİŞ ANİMASYONU YOK ve olmamalı: çerçeve dekor değil, deklanşörün
                  kırpacağı bölgenin ta kendisi. Animasyon sırasında görünen
                  dikdörtgen ile gerçekte kırpılan bölge birbirini tutmuyordu. */}
              {guide && (
                <div
                  className="pointer-events-none absolute rounded-2xl border-2 border-dashed border-accent/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                  style={{ left: guide.x, top: guide.y, width: guide.width, height: guide.height }}
                />
              )}

              <p className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit max-w-[86%] rounded-pill bg-black/60 px-3 py-1.5 text-center text-[11px] font-semibold text-white/90 backdrop-blur-sm">
                {t(MODE_HINT_KEY[scanMode])}
              </p>

              {!ready && (
                <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-white/60">
                  {t("scan.cameraStarting")}
                </p>
              )}
            </>
          ) : (
            /* Kamera yok ya da açılamadı — özellik burada ÖLMEZ: galeri ve elle
               barkod her cihazda çalışır. */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-[12px] text-ink-secondary">
                {cameraError && cameraError.toLowerCase().includes("notallowed")
                  ? t("scan.cameraNotAllowed")
                  : (cameraError ?? t("scan.cameraUnavailable"))}
              </p>
              {cameraError && cameraError.toLowerCase().includes("notallowed") ? (
                <p className="text-[11px] text-ink-tertiary max-w-xs">
                  {t("scan.cameraSettingsHint")}
                </p>
              ) : (
                <p className="text-[11px] text-ink-tertiary">
                  {t("scan.cameraFallback")}
                </p>
              )}
              {canUseCamera && (
                <button
                  type="button"
                  onClick={retryCamera}
                  className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink-secondary transition hover:text-ink-primary"
                >
                  {t("scan.retry")}
                </button>
              )}
            </div>
          )}

          {/* --- Alt kontroller --- */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 bg-gradient-to-t from-black via-black/85 to-transparent px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-10">
            {statusBand}

            <div className="mx-auto flex items-center gap-1 rounded-pill border border-white/10 bg-black/50 p-1 text-[11px] font-semibold text-white/70 backdrop-blur-md">
              {MODES.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => setScanMode(m.mode)}
                  aria-pressed={scanMode === m.mode}
                  className={`flex items-center gap-1 rounded-pill px-3 py-1.5 transition ${
                    scanMode === m.mode ? "bg-white font-bold text-black shadow" : "hover:text-white"
                  }`}
                >
                  <span aria-hidden>{m.icon}</span>
                  <span>{t(m.labelKey)}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 items-center">
              <button
                type="button"
                onClick={() => setShowManual((v) => !v)}
                aria-expanded={showManual}
                className="justify-self-start rounded-pill border border-white/15 bg-black/40 px-3 py-2 text-[11px] font-semibold text-white/80 backdrop-blur-sm transition hover:text-white"
              >
                ⌨ Elle
              </button>

              <div className="justify-self-center">
                {scanMode === "barcode" ? (
                  <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full border-2 border-dashed border-white/40 text-center text-[10px] font-semibold leading-tight text-white/70">
                    {t("scan.autoReading1")}
                    <br />
                    {t("scan.autoReading2")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={captureAndAnalyze}
                    disabled={!ready || analyzing || offline}
                    aria-label={
                      scanMode === "food_label"
                        ? t("scan.captureLabel")
                        : t("scan.captureFood")
                    }
                    className="flex h-[68px] w-[68px] items-center justify-center rounded-full border-4 border-white/90 transition active:scale-95 disabled:opacity-40"
                  >
                    <span className="h-[52px] w-[52px] rounded-full bg-white transition" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={offline}
                className="justify-self-end rounded-pill border border-white/15 bg-black/40 px-3 py-2 text-[11px] font-semibold text-white/80 opacity-100 backdrop-blur-sm transition hover:text-white disabled:opacity-40"
              >
                🖼️ {t("scan.gallery")}
              </button>
            </div>

            {showManual && (
              <div className="rounded-chip border border-white/10 bg-black/60 p-3 backdrop-blur-md">
                {manualBarcodeForm}
                <p className="mt-2 text-[10px] text-ink-faint">{OFF_ATTRIBUTION}</p>
              </div>
            )}
          </div>

          {/* --- Çekim önizlemesi: AI'a gitmeden önce kullanıcı onaylar/tekrar çeker --- */}
          {capturedPreview && (
            <div className="absolute inset-0 z-20 flex flex-col bg-black">
              <img
                src={`data:${capturedPreview.mimeType};base64,${capturedPreview.base64}`}
                alt={t("scan.capturedFrameAlt")}
                className="min-h-0 flex-1 object-contain"
              />
              <div className="flex items-center justify-center gap-3 bg-gradient-to-t from-black via-black/90 to-transparent px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-8">
                <button
                  type="button"
                  onClick={retakeCapture}
                  className="rounded-pill border border-white/15 bg-black/40 px-5 py-2.5 text-sm font-semibold text-white/80 backdrop-blur-sm transition hover:text-white"
                >
                  ↺ Tekrar çek
                </button>
                <button
                  type="button"
                  onClick={confirmCapture}
                  className="rounded-pill bg-white px-6 py-2.5 text-sm font-extrabold text-black transition active:scale-95"
                >
                  ✓ Kullan
                </button>
              </div>
            </div>
          )}

          {/* --- Analiz örtüsü --- */}
          {analyzing && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 backdrop-blur-sm">
              <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
              <p className="text-sm font-extrabold text-ink-primary">{t("scan.analyzing")}</p>
              <p className="text-[11px] text-ink-tertiary">
                {scanMode === "food_label" ? t("scan.readingLabel") : t("scan.recognizingFood")}
              </p>
              <button
                type="button"
                onClick={cancelAnalyze}
                className="mt-2 rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink-secondary transition hover:text-ink-primary"
              >
                İptal
              </button>
            </div>
          )}
        </div>
      ) : food ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={backToScan}
            disabled={!!saving}
            className="self-start text-[11px] font-semibold text-ink-tertiary underline transition hover:text-ink-primary disabled:opacity-40"
          >
            ‹ {t("scan.changeBarcode")}
          </button>

          {/* --- Ürün özeti: SALT-OKUNUR. Tam düzenleme AliasForm'da. --- */}
          <div className="rounded-chip border border-line bg-white/[0.03] p-3">
            <div className="text-sm font-bold text-ink-primary">{food!.name}</div>
            {food!.brand && <div className="text-[11px] text-ink-tertiary">{food!.brand}</div>}
            <NutrientSummaryLine
              nutrition={food!.nutrition}
              defs={MACROS}
              kcal="inline"
              prefix="100 g · "
              className="mt-2 border-t border-line pt-2 font-mono text-[11px] text-ink-secondary"
            />
            {missingLabels(food!).length > 0 && (
              <p className="mt-1 text-[10px] text-warn">{t("scan.missingData")}: {missingLabels(food!).join(", ")}</p>
            )}
          </div>

          {knownAlias && (
            <p className="rounded-chip border border-memory/40 bg-memory/10 p-2.5 text-[11px] text-memory">
              {t("scan.knownAliasNote")}
            </p>
          )}

          <label className="block">
            <Label>{t("scan.triggersLabel")}</Label>
            {/* Ürün zaten hafızadaysa kayıt yeniden yazılmıyor, dolayısıyla bu
                alanı düzenlemek bir işe yaramazdı — kapalı ve mevcut değerleri
                gösteriyor. Değiştirmek için Hafıza ekranından düzenlenir. */}
            <input
              className={`${fieldCls} disabled:opacity-60`}
              value={triggers}
              disabled={!!knownAlias}
              placeholder={t("scan.triggersPlaceholder")}
              onChange={(e) => setTriggers(e.target.value)}
            />
          </label>
          {triggerList.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {triggerList.map((t) => (
                <span key={t} className="rounded-pill bg-memory/15 px-2.5 py-1 text-[11px] font-semibold text-memory">
                  {t}
                </span>
              ))}
            </div>
          ) : (
            /* Artık bir ÇIKMAZ değil: "Sadece öğüne" ifade istemiyor. Metin de
               bunu söylemeli — eskiden "düğmeler bu yüzden kapalı" diyordu ve
               taranan ürünü bugüne eklemenin tek yolu uydurma bir ifade yazmaktı. */
            <p className="text-[11px] text-ink-tertiary">
              {t("scan.memoryHint", { memory: <span className="font-semibold text-memory">{t("scan.memoryWord")}</span> })}
            </p>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <NumField label="Miktar" value={grams} onChange={setGrams} />
            </div>
            <div className="w-24 flex-none">
              <label className="block">
                <Label>{t("scan.unitLabel")}</Label>
                <select className={fieldCls} value={unitName} onChange={(e) => setUnitName(e.target.value)}>
                  {availableUnits.map((u) => (
                    <option key={u.name} value={u.name} className="bg-elevated-2">
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {scaledNutrition && (
            <NutrientSummaryLine
              nutrition={scaledNutrition}
              defs={MACROS}
              kcal="inline"
              prefix={`${amountValue} ${selectedUnit.name} · `}
              className="font-mono text-[11px] text-ink-secondary"
            />
          )}

          {err && <ErrorText>{err}</ErrorText>}
        </div>
      ) : visionItems && visionMode ? (
        <VisionReviewScreen
          mode={visionMode}
          items={visionItems}
          onBack={backFromVision}
          // Barkodun saveOnly/logOnly/saveAndLog'u gibi: başarılı yazımdan
          // sonra HAM `onClose` prop'u çağrılır (requestClose'un guard'ını
          // beklemeden) — aksi halde `finally`de sıfırlanan `visionSaving`
          // henüz `false` olmadığı için `requestClose` kapanışı YUTARDI.
          onClose={onClose}
          onSavingChange={setVisionSaving}
        />
      ) : null}

      {/* AI fotoğraf onay modalı — ilk kullanımda bir kez sorulur, onay
          localStorage'a yazılır. Play Store 'Data safety' gereği. */}
      {aiConsentOpen && (
        <Modal onClose={() => setAiConsentOpen(false)} title={t("ai.consentTitle")}>
          <div className="space-y-3">
            <p className="text-sm text-white/80">
              {t("ai.consentBody")}
            </p>
            <p className="text-xs text-white/50">
              {t("ai.consentPrivacy")}{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 underline"
              >
                policies.google.com/privacy
              </a>
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAiConsentOpen(false)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white/80"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={async () => {
                  grantAiConsent();
                  setAiConsentOpen(false);
                  // Onay öncesi askıya alınmış görseli otomatik tekrar gönder.
                  const pending = pendingVisionRef.current;
                  if (pending) {
                    pendingVisionRef.current = null;
                    await runVision(pending.base64, pending.mimeType, pending.mode);
                  }
                }}
                className="flex-1 rounded-xl bg-emerald-500/20 py-2.5 text-sm font-semibold text-emerald-300"
              >
                {t("scan.understoodContinue")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
