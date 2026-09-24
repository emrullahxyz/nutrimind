// ============================================================================
// Nutrimind — günlük su kartı (v0.30.8).
//
// NEDEN VAR: kullanıcı geri bildirimi "ne kadar su içtiğimi görebilmek
// isterdim" idi — yani eksik olan yalnızca bir sayaç değil, GÖRÜNÜRLÜKTÜ.
// Bu yüzden kart varsayılan olarak AÇIK (`config.water.enabled` yalnızca
// kullanıcı kapatırsa false olur) ve Bugün ekranında takviye kartının
// ÜSTÜNDE durur.
//
// TASARIM SINIRLARI:
//   • Modal YOK. "Özel miktar" satır içi bir kutu; bu sayede odak tuzağı /
//     geri-tuşu yönetimi (AGENTS.md madde 9) hiç gerekmez.
//   • Renk `--water`: mor (`memory`) "besin hafızası" anlamını taşır, `under`
//     ise "hedefin altında" durumunun rengidir — su ikisi de değil.
//   • Aşım KIRMIZI DEĞİL: hedefi aşmak bir hata değil, bilgi.
//   • Yazma yolu TEK: `updateConfig("water", …)` — iyimser güncelleme yok,
//     mutate→refetch sözleşmesi (AGENTS.md madde 3) korunur.
// ============================================================================
import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Droplets, RotateCcw, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useData } from "../lib/data";
import { ErrorText, acceptsNumericEntry, fieldCls } from "./FormBits";
import { formatNumber, todayISO } from "../lib/format";
import { PREF } from "../lib/prefs";
import { usePersistedBool } from "../lib/usePersistedBool";
import { usePressSpring } from "../hooks/usePressSpring";
import {
  WATER_MAX_DAY_ML,
  WATER_PRESETS_ML,
  addWaterEntry,
  isToday,
  normalizeAmount,
  parseWaterConfig,
  removeLastWaterEntry,
  shouldShowWaterCard,
  waterRatio,
  waterTotalMl,
} from "../lib/water";
import type { WaterConfig } from "../lib/water";

/** Litreyi iki ondalıkla, yerel ayırıcıyla gösterir ("1,25"). */
function liters(ml: number): string {
  return formatNumber(ml / 1000, 2);
}

export function WaterCard({
  date,
  onOpenSettings,
}: {
  date: string;
  onOpenSettings?: () => void;
}) {
  const { t } = useTranslation();
  const { config, updateConfig, offline } = useData();
  const water = parseWaterConfig(config);

  const [busy, setBusy] = useState(false);
  const [open, setOpen] = usePersistedBool(PREF.waterOpen, true);
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const press = usePressSpring({ pressScale: 0.97 });

  const totalMl = waterTotalMl(water, date);
  const entries = water.log[date] ?? [];
  const ratio = waterRatio(totalMl, water.targetMl);
  const reached = totalMl >= water.targetMl;
  const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;
  const percent = Math.round(ratio * 100);

  // Hook'ların HEPSİ yukarıda — erken çıkış bu yüzden burada güvenli.
  if (!shouldShowWaterCard(water.enabled, totalMl, isToday(date, todayISO()))) {
    return null;
  }

  /** Tek yazma yolu: hedef state'i gönderir, sunucu dönüşünü bekler. */
  async function write(next: WaterConfig | null) {
    if (busy) return;
    if (next === null) {
      setErr(t("water.limitReached", { max: WATER_MAX_DAY_ML }));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await updateConfig("water", { ...next });
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function addAmount(raw: number | string) {
    if (offline) return;
    const ml = normalizeAmount(raw);
    if (ml === null) {
      setErr(t("water.invalidAmount"));
      return;
    }
    void write(addWaterEntry(water, date, ml));
  }

  function undoLast() {
    if (offline) return;
    const next = removeLastWaterEntry(water, date);
    if (next === water) return; // boş gün: yazacak bir şey yok
    void write(next);
  }

  const locked = busy || offline;

  return (
    <div className="flex flex-col gap-3 rounded-[24px] bg-calCard glass-card p-4 shadow-card backdrop-blur-sm transition-all sm:p-5">
      {/* --- Başlık: dokununca açılır/kapanır --- */}
      <div
        onClick={() => setOpen(!open)}
        className="flex cursor-pointer select-none items-center justify-between"
        {...press.handlers}
        style={press.style}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Droplets className="h-4 w-4 shrink-0 text-water" />
          <h3 className="truncate text-sm font-bold text-white">{t("water.title")}</h3>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold transition-all ${
              reached ? "border border-water/40 bg-water/20 text-water" : "bg-white/5 text-ink-secondary"
            }`}
          >
            {liters(totalMl)} / {liters(water.targetMl)} {t("water.unitLiters")}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {open ? (
            <ChevronUp className="h-4 w-4 text-ink-secondary" />
          ) : (
            <ChevronDown className="h-4 w-4 text-ink-secondary" />
          )}
          {onOpenSettings && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSettings();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-ink-secondary transition hover:bg-white/[0.12] hover:text-white"
              title={t("water.manage")}
              aria-label={t("water.manage")}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* --- İlerleme çubuğu: kapanınca da görünür (şikâyetin özü görünürlük) --- */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t("water.progressAria", { percent })}
        className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]"
      >
        <div
          className="h-full rounded-full bg-water transition-[width] duration-500"
          style={{ width: `${Math.max(percent, totalMl > 0 ? 3 : 0)}%` }}
        />
      </div>

      <p className="text-[11px] text-ink-tertiary">
        {reached
          ? t("water.goalReached")
          : totalMl === 0
            ? t("water.emptyToday")
            : t("water.remaining", { amount: water.targetMl - totalMl })}
      </p>

      {/* --- Açık hâl: hızlı ekleme + geri alma --- */}
      {open && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5">
            {WATER_PRESETS_ML.map((ml) => (
              <button
                key={ml}
                type="button"
                disabled={locked}
                onClick={() => addAmount(ml)}
                className="flex-1 rounded-pill border border-water/30 bg-water/10 px-2 py-2 font-mono text-[12px] font-bold text-water transition active:scale-95 hover:bg-water/20 disabled:opacity-40"
                aria-label={t("water.addAmount", { amount: ml })}
              >
                +{ml}
              </button>
            ))}
          </div>

          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim() === "") return;
              addAmount(custom);
              setCustom("");
            }}
          >
            <label className="block flex-1">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-mono text-ink-tertiary">
                {t("water.customLabel")}
              </span>
              <input
                className={`${fieldCls} font-mono`}
                inputMode="numeric"
                value={custom}
                placeholder={t("water.customPlaceholder", { amount: WATER_PRESETS_ML[0] })}
                onChange={(e) => {
                  if (acceptsNumericEntry(e.target.value)) setCustom(e.target.value);
                }}
              />
            </label>
            <button
              type="submit"
              disabled={locked || custom.trim() === ""}
              className="flex-none rounded-pill border border-line px-3 py-2 text-sm font-semibold text-ink-secondary transition hover:text-ink-primary disabled:opacity-40"
            >
              {t("common.add")}
            </button>
            <button
              type="button"
              onClick={undoLast}
              disabled={locked || lastEntry === null}
              title={t("water.undo")}
              aria-label={t("water.undo")}
              className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-pill border border-line text-ink-secondary transition hover:text-ink-primary disabled:opacity-30"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </form>

          <div className="flex items-center justify-between gap-2 text-[10px] text-ink-faint">
            <span className="font-mono">
              {lastEntry !== null
                ? t("water.lastEntry", { amount: lastEntry })
                : t("water.noEntryYet")}
            </span>
            {reached && (
              <span className="flex items-center gap-1 font-bold text-water">
                <Check className="h-3 w-3 stroke-[3]" />
                {t("water.done")}
              </span>
            )}
          </div>
        </div>
      )}

      {offline && (
        <p className="rounded-chip bg-warn/10 px-3 py-2 text-[11px] text-warn">
          {t("offline.writeUnavailable")}
        </p>
      )}
      {err && <ErrorText>{err}</ErrorText>}
    </div>
  );
}
