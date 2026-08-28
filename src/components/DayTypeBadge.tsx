// ============================================================================
// Nutrimind — gün tipi rozeti (Faz 8).
//
// Tek dokunuşla o GÜNÜN profilini değiştirir: 🏋️ Antrenman ⇄ ☕ Dinlenme.
// Yazdığı tek şey `overrides[date]` — haftalık şablon bozulmaz, geçmiş günlere
// veri yazılmaz. İkinci bir buton şablona geri dönmeyi sağlar.
//
// Tek profil varsa rozet HİÇ ÇİZİLMEZ: seçenek yokken "Varsayılan" yazan bir
// düğme, dokunulunca hiçbir şey yapmadığı için arayüzde gürültüden ibaret olur.
// Gün tipleri "Hedef" formundaki öneriyle kuruluyor.
// ============================================================================
import { useState } from "react";
import { useData } from "../lib/data";
import { effectiveProfile, hasOverride, nextProfileId, profileIcon, withOverride } from "../lib/goals";
import { useTranslation } from "react-i18next";

export function DayTypeBadge({ date }: { date: string }) {
  const { t } = useTranslation();
  const { goals, updateGoals } = useData();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const profile = effectiveProfile(goals, date);
  const pinned = hasOverride(goals, date);

  if (goals.profiles.length < 2) return null;

  async function write(profileId: string | null) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      // Payload kayıt anındaki TAZE `goals`'tan türetilir (gün yazımıyla aynı
      // kural): eski bir kopyayı göndermek arada yapılan profil düzenlemesini
      // sessizce geri alırdı.
      await updateGoals(withOverride(goals, date, profileId));
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => write(nextProfileId(goals, profile.id))}
        title={t("dayType.changeTitle")}
        className="flex items-center gap-1.5 rounded-pill border border-line bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-ink-primary transition hover:border-memory/40 hover:bg-white/[0.09] disabled:opacity-40"
      >
        <span aria-hidden>{profileIcon(profile.id)}</span>
        {profile.name}
      </button>

      {pinned ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => write(null)}
          className="rounded-pill px-2 py-1 text-[11px] font-semibold text-ink-tertiary transition hover:text-ink-primary disabled:opacity-40"
        >
          {t("dayType.backToTemplate")}
        </button>
      ) : (
        <span className="text-[11px] text-ink-faint">{t("dayType.fromTemplate")}</span>
      )}

      {err && <span className="text-[11px] text-danger">{err}</span>}
    </div>
  );
}
