// ============================================================================
// Nutrimind — Su takibi ayarları (Ayarlar alt-görünümü, v0.30.8).
//
// Üç karar burada verilir: günlük hedef · kartın görünürlüğü · (varsa) kiloya
// göre öneri. Hepsi `config.water`'a TEK yazma yolundan gider; kart ile aynı
// anahtarı paylaştıkları için birbirlerinin üstüne bayat değer yazmamaları
// kritik — bu yüzden her yazma TAZE `parseWaterConfig(config)` çıktısını
// temel alır (bileşenin kendi render anındaki kopyasını değil).
// ============================================================================
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useData } from "../lib/data";
import { ErrorText, acceptsNumericEntry, fieldCls } from "./FormBits";
import { addDaysISO, formatNumber, todayISO } from "../lib/format";
import { latestEntry, parseWeightConfig } from "../lib/weight";
import {
  WATER_ML_PER_KG,
  normalizeTargetMl,
  parseWaterConfig,
  suggestTargetMl,
  waterAverageMl,
} from "../lib/water";
import type { WaterConfig } from "../lib/water";

function liters(ml: number, digits = 2): string {
  return formatNumber(ml / 1000, digits);
}

export function WaterSettings() {
  const { t } = useTranslation();
  const { config, updateConfig, offline } = useData();
  const water = parseWaterConfig(config);

  const [draft, setDraft] = useState(String(water.targetMl));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const currentWeight = latestEntry(parseWeightConfig(config).entries)?.kg ?? null;
  const suggestion = suggestTargetMl(currentWeight);

  const last7 = Array.from({ length: 7 }, (_, i) => addDaysISO(todayISO(), -i));
  const average = waterAverageMl(water, last7);

  async function write(next: Partial<WaterConfig>) {
    if (busy || offline) return;
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      // Taze okuma + değişen alan: kart ile aynı anahtarı paylaştığımız için
      // bayat bir kopya yazmak diğer tarafın son girişini silerdi.
      const fresh = parseWaterConfig(config);
      await updateConfig("water", { ...fresh, ...next });
      setSaved(true);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function saveTarget(e: React.FormEvent) {
    e.preventDefault();
    const targetMl = normalizeTargetMl(draft);
    if (targetMl === null) {
      setErr(t("water.targetRange"));
      return;
    }
    void write({ targetMl });
  }

  function applySuggestion() {
    if (suggestion === null) return;
    setDraft(String(suggestion));
    void write({ targetMl: suggestion });
  }

  function toggleEnabled() {
    void write({ enabled: !water.enabled });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* --- Hedef --- */}
      <form onSubmit={saveTarget} className="flex flex-col gap-3">
        <label className="block">
          <span className="mb-1 block font-mono text-[11px] tracking-mono uppercase text-ink-tertiary">
            {t("water.targetLabel")}
          </span>
          <input
            className={`${fieldCls} font-mono`}
            inputMode="numeric"
            value={draft}
            onChange={(e) => {
              if (acceptsNumericEntry(e.target.value)) setDraft(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <p className="text-[11px] text-ink-tertiary">
          {t("water.targetHint", {
            current: `${liters(water.targetMl)} ${t("water.unitLiters")}`,
          })}
        </p>
        <button
          type="submit"
          disabled={busy || offline}
          className="self-start rounded-pill border border-line bg-white/[0.06] px-4 py-2 text-xs font-bold text-white transition hover:bg-white/[0.1] disabled:opacity-40"
        >
          {busy ? "…" : t("common.save")}
        </button>
        {saved && <p className="text-[11px] font-bold text-water">{t("water.saved")}</p>}
      </form>

      {/* --- Kiloya göre öneri --- */}
      <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-row p-4">
        <span className="text-xs font-bold text-white">{t("water.suggestTitle")}</span>
        {suggestion === null ? (
          <p className="text-[11px] leading-relaxed text-ink-tertiary">{t("water.suggestNoWeight")}</p>
        ) : (
          <>
            <p className="text-[11px] leading-relaxed text-ink-tertiary">
              {t("water.suggestBody", {
                perKg: WATER_ML_PER_KG,
                amount: `${liters(suggestion)} ${t("water.unitLiters")}`,
              })}
            </p>
            <button
              type="button"
              onClick={applySuggestion}
              disabled={busy || offline || suggestion === water.targetMl}
              className="self-start rounded-pill border border-water/40 bg-water/10 px-3 py-1.5 text-[11px] font-bold text-water transition hover:bg-water/20 disabled:opacity-40"
            >
              {t("water.applySuggestion")}
            </button>
          </>
        )}
      </div>

      {/* --- Görünürlük --- */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-row p-4">
        <div className="min-w-0">
          <span className="block text-xs font-bold text-white">{t("water.visibilityTitle")}</span>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-tertiary">
            {t("water.visibilityBody")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={water.enabled}
          aria-label={t("water.visibilityTitle")}
          disabled={busy || offline}
          onClick={toggleEnabled}
          className={`relative h-6 w-11 flex-none rounded-full border transition disabled:opacity-40 ${
            water.enabled ? "border-water/50 bg-water/40" : "border-white/15 bg-white/10"
          }`}
        >
          <span
            className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-all ${
              water.enabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {/* --- Kayıt özeti --- */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-row p-4 text-[11px]">
        <span className="text-ink-tertiary">{t("water.averageLabel")}</span>
        <span className="font-mono font-bold text-white">
          {average === null
            ? t("water.averageNone")
            : `${liters(average)} ${t("water.unitLiters")}`}
        </span>
      </div>

      {offline && (
        <p className="rounded-chip bg-warn/10 px-3 py-2 text-[11px] text-warn">
          {t("offline.writeUnavailable")}
        </p>
      )}
      {err && <ErrorText>{err}</ErrorText>}
    </div>
  );
}
