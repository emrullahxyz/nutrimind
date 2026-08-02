// ============================================================================
// Nutrimind — "Tara → yedim" (Faz S3).
//
// Kullanıcının en yüksek değerli isteği: barkod okutup öğünü kaydetmek 7
// dokunuşa mal oluyordu ve mükemmel bir tarama sonrasında bile Kaydet
// açıklamasız kilitli kalıyordu (`triggers` boş kaldığı için — bkz.
// AliasForm.tsx). Bu bileşen TEK ekranda biter: tara → onayla → hem hafızaya
// yaz hem (istenirse) bugüne işle.
//
// Kamera yaşam döngüsü ve kota (429) geri sayımı OffSearch (Faz 4) ile
// PAYLAŞILIYOR (`../lib/offScanner`) — kopyalanmış kod değil.
//
// ÇİFT YAZMA TUZAĞI (CLAUDE.md'nin uyardığı, projeyi daha önce ısırmış olan):
//   1. `saveAlias` yeni id'yi DÖNER (`upsertAlias` context aksiyonu artık bunu
//      taşıyor) — `MealSource.aliasId` için şart, yoksa Faz 6'nın miktar
//      tahmini bu öğünün izini sessizce kaybeder.
//   2. Gün yazımı günün TÜM öğün dizisini DEĞİŞTİRİR. Bu yüzden payload'ı
//      `mealsOf(days, date)`'ten alias yazımının kendi refetch'i SONRASINDA,
//      TAZE çekilen veriden türetiyoruz — bileşenin kendi `useData()`
//      kapanışındaki (closure) `days`'ten DEĞİL. React state güncellemesi bu
//      async akışın ortasında henüz bu render'a yansımamış olabilir; bayat
//      diziyle yazmak bugün az önce kaydedilmiş başka öğünleri SİLERDİ.
//   3. Alias yazımı başarılı ama gün yazımı başarısız olursa: besin GERÇEKTEN
//      hafızaya kaydedildi, bunu toptan bir "başarısız" gibi göstermek yalan
//      olur — ayrı, dürüst bir mesaj var.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { ErrorText, Label, NumField, NutrientSummaryLine, fieldCls } from "./FormBits";
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
import { useOffCooldown, useOffScanner } from "../lib/offScanner";
import { todayISO } from "../lib/format";
import type { MealPayload, MealSource } from "../types";

type Saving = "today" | "memory" | null;

export function ScanSheet({ onClose }: { onClose: () => void }) {
  const { aliases, upsertAlias, setDayMeals } = useData();

  // --- Tarama adımı ---
  const [food, setFood] = useState<OffFood | null>(null);
  const [barcode, setBarcode] = useState("");
  const { status, setStatus, cooldownLeft, blocked, applyError } = useOffCooldown();

  /** Bu barkod hafızada zaten var mı? Tarama-öncelikli bir akışta aynı ürün
   *  defalarca okutulur; her seferinde yeni bir besin yaratsaydık hafıza
   *  kopyalarla dolardı. Varsa kayıt YENİDEN YAZILMAZ — kullanıcının elle
   *  düzelttiği tetikleyiciler/birimler ezilmesin diye olduğu gibi kullanılır. */
  const knownAlias = food ? (aliases.find((a) => a.barcode === food.code) ?? null) : null;

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
    const code = raw.trim();
    if (!isValidBarcode(code)) {
      setStatus({ kind: "error", message: "Barkod 4-20 haneli bir sayı olmalı." });
      return;
    }
    setStatus({ kind: "loading" });
    try {
      const found = await fetchOffProduct(code);
      if (!found) {
        setStatus({ kind: "error", message: `${code} Open Food Facts'te bulunamadı — elle girebilirsin.` });
        return;
      }
      setStatus({ kind: "idle" });
      selectFood(found);
    } catch (e) {
      applyError(e);
    }
  }

  const { scanning, setScanning, videoRef, canScan, cameraError } = useOffScanner({
    blocked,
    onDetected: (value) => {
      setBarcode(value);
      void lookupBarcode(value);
    },
  });

  // Kamera destekleniyorsa DOĞRUDAN aç — ek bir açılır panele gerek yok, tek
  // dokunuş tasarrufunun asıl kaynağı bu (bkz. brief).
  useEffect(() => {
    if (canScan) setScanning(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cameraError) setStatus({ kind: "error", message: cameraError });
  }, [cameraError, setStatus]);

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
  const canLogToday = canSaveAlias && scaledNutrition !== null;

  function requestClose() {
    if (saving) return;
    onClose();
  }

  function backToScan() {
    if (saving) return;
    setFood(null);
    setErr(null);
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

  async function saveAndLog() {
    if (!food || !canLogToday || !scaledNutrition || saving) return;
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

  // Camera scan mode state (CAL AI modes)
  const [scanMode, setScanMode] = useState<"scan_food" | "barcode" | "food_label" | "gallery">("scan_food");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleGallerySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Fotoğraftan besin tanıma (Gemini Vision, /api/ai/vision) henüz YOK —
      // bu yalnızca dürüst bir "henüz yok" mesajı. Var olan bir özelliği
      // ima eden yanlış bir "hazır" iddiası kullanıcıyı yanıltırdı.
      setScanMode("gallery");
      setStatus({ kind: "error", message: `${file.name} seçildi — fotoğraftan besin tanıma henüz eklenmedi.` });
    }
  };

  return (
    <Modal title={food ? "Onayla ve kaydet" : "Kamera / Tara"} onClose={requestClose}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleGallerySelect}
      />
      {!food ? (
        <div className="flex flex-col gap-3">
          {canScan ? (
            <div className="relative overflow-hidden rounded-chip border border-line bg-black">
              {scanning ? (
                <>
                  {/* muted + playsInline: mobil tarayıcılar sessiz olmayan videoyu
                      kendiliğinden oynatmaz. */}
                  <video ref={videoRef} muted playsInline className="h-52 w-full object-cover" />
                  
                  {/* Overlay according to mode */}
                  {scanMode === "food_label" && (
                    <div className="pointer-events-none absolute inset-4 border-2 border-dashed border-accent/70 rounded-xl flex items-center justify-center">
                      <span className="bg-black/60 px-3 py-1 rounded-full text-[10px] text-accent font-semibold">
                        Etiketi çerçeveye hizala
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                    <p className="text-[11px] text-ink-tertiary">
                      {scanMode === "barcode"
                        ? "Barkodu çerçeveye getir — okununca otomatik seçilir."
                        : scanMode === "food_label"
                        ? "Besin değerleri etiketini odakla."
                        : "Yemeği çerçeveye hizala."}
                    </p>
                    <button
                      type="button"
                      onClick={() => setScanning(false)}
                      className="flex-none text-[11px] font-semibold text-ink-tertiary underline transition hover:text-ink-primary"
                    >
                      Kapat
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setScanning(true)}
                  disabled={blocked}
                  className="flex h-24 w-full items-center justify-center text-sm font-semibold text-ink-secondary transition hover:text-ink-primary disabled:opacity-40"
                >
                  📷 Kamerayı aç
                </button>
              )}
            </div>
          ) : (
            <p className="rounded-chip border border-line bg-white/[0.02] p-3 text-[11px] text-ink-tertiary">
              Bu tarayıcıda kamerayla barkod okuma desteklenmiyor. Barkodu aşağıya elle girebilir veya galeriden fotoğraf seçebilirsin.
            </p>
          )}

          {/* CAL AI Camera Bottom Mode Selector */}
          <div className="flex items-center justify-around gap-1 rounded-2xl border border-white/10 bg-white/5 p-1.5 text-[11px] font-semibold text-white/70 backdrop-blur-md overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setScanMode("barcode")}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition ${
                scanMode === "barcode" ? "bg-white text-black font-bold shadow" : "hover:text-white"
              }`}
            >
              <span>📊</span>
              <span>Barcode</span>
            </button>
            <button
              type="button"
              onClick={() => setScanMode("food_label")}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition ${
                scanMode === "food_label" ? "bg-white text-black font-bold shadow" : "hover:text-white"
              }`}
            >
              <span>🏷️</span>
              <span>Food Label</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setScanMode("scan_food");
                if (!scanning && canScan) setScanning(true);
              }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition ${
                scanMode === "scan_food" ? "bg-white text-black font-bold shadow" : "hover:text-white"
              }`}
            >
              <span>📷</span>
              <span>Scan Food</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition ${
                scanMode === "gallery" ? "bg-white text-black font-bold shadow" : "hover:text-white"
              }`}
            >
              <span>🖼️</span>
              <span>Gallery</span>
            </button>
          </div>

          {/* --- Elle barkod: her tarayıcıda çalışan, HER ZAMAN görünen yedek yol --- */}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!blocked) void lookupBarcode(barcode);
            }}
          >
            <label className="block flex-1">
              <Label>Barkod (elle)</Label>
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

          {status.kind === "loading" && <p className="text-[11px] text-ink-tertiary">Aranıyor…</p>}
          {status.kind === "error" && (
            <p className="rounded-chip bg-danger/10 px-3 py-2 text-[11px] text-danger">{status.message}</p>
          )}
          {blocked && (
            <p className="rounded-chip bg-warn/10 px-3 py-2 text-[11px] text-warn">
              Çok hızlı arama yapıldı. Open Food Facts kotası korunuyor —{" "}
              <span className="font-mono font-semibold">{cooldownLeft} sn</span> sonra tekrar dene.
            </p>
          )}

          <p className="text-[10px] text-ink-faint">{OFF_ATTRIBUTION}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={backToScan}
            disabled={!!saving}
            className="self-start text-[11px] font-semibold text-ink-tertiary underline transition hover:text-ink-primary disabled:opacity-40"
          >
            ‹ Barkodu değiştir
          </button>

          {/* --- Ürün özeti: SALT-OKUNUR. Tam düzenleme AliasForm'da. --- */}
          <div className="rounded-chip border border-line bg-white/[0.03] p-3">
            <div className="text-sm font-bold text-ink-primary">{food.name}</div>
            {food.brand && <div className="text-[11px] text-ink-tertiary">{food.brand}</div>}
            <NutrientSummaryLine
              nutrition={food.nutrition}
              defs={MACROS}
              kcal="inline"
              prefix="100 g · "
              className="mt-2 border-t border-line pt-2 font-mono text-[11px] text-ink-secondary"
            />
            {missingLabels(food).length > 0 && (
              <p className="mt-1 text-[10px] text-warn">eksik veri: {missingLabels(food).join(", ")}</p>
            )}
          </div>

          {knownAlias && (
            <p className="rounded-chip border border-memory/40 bg-memory/10 p-2.5 text-[11px] text-memory">
              Bu ürün hafızanda zaten var — yeni bir kayıt oluşturulmayacak, mevcut besin
              kullanılacak.
            </p>
          )}

          <label className="block">
            <Label>İfadeler (virgülle ayır)</Label>
            {/* Ürün zaten hafızadaysa kayıt yeniden yazılmıyor, dolayısıyla bu
                alanı düzenlemek bir işe yaramazdı — kapalı ve mevcut değerleri
                gösteriyor. Değiştirmek için Hafıza ekranından düzenlenir. */}
            <input
              className={`${fieldCls} disabled:opacity-60`}
              value={triggers}
              disabled={!!knownAlias}
              placeholder="örn. skyr"
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
            <p className="text-[11px] text-warn">
              En az bir ifade gerekli — düğmeler bu yüzden kapalı. Yukarıya kısa bir kelime yaz
              (örn. ürünün kısaltılmış adı).
            </p>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <NumField label="Miktar" value={grams} onChange={setGrams} />
            </div>
            <div className="w-24 flex-none">
              <label className="block">
                <Label>Birim</Label>
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

          <div className="mt-2 flex flex-col gap-2">
            <button
              type="button"
              onClick={saveAndLog}
              disabled={!canLogToday || !!saving}
              className="w-full rounded-pill bg-accent px-4 py-2.5 text-sm font-extrabold text-accent-ink transition disabled:opacity-40"
            >
              {saving === "today" ? "…" : "Kaydet ve bugüne ekle"}
            </button>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={requestClose}
                disabled={!!saving}
                className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink-secondary transition hover:text-ink-primary disabled:opacity-40"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={saveOnly}
                disabled={!canSaveAlias || !!saving || !!knownAlias}
                className="rounded-pill border border-memory bg-memory/10 px-4 py-2 text-sm font-bold text-memory transition hover:bg-memory hover:text-memory-ink disabled:opacity-40"
              >
                {saving === "memory" ? "…" : knownAlias ? "Hafızada var" : "Sadece hafızaya"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
