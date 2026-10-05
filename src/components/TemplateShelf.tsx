// Bugün sekmesindeki şablon rafı: en çok kullanılan 3 şablon kart olarak,
// kalanı "+N şablon daha" arkasında. ÖNCEKİ hâli yatay chip şeridiydi
// (`DayView.tsx`): kapsayıcıda `overflow-x-auto` vardı ama `flex` yoktu, kart
// genişliği içeriğe göre değişiyordu (`flex-basis: auto`) — uzun isimler kartı
// şişirip şeridi taşırıyordu. Kullanıcı raporu: "çok fazla şablon koyunca
// göze güzel gözükmüyor, yan yana sıralanıp birikiyor".
//
// Sıralama DİNAMİKTİR: gösterilen 3 şablon en çok kullanılanlardır ve kullanım
// sayısı değiştikçe değişir (`rankTemplatesByUsage`). Sayaç gün verisinden
// türetilir (`buildTemplateUsageIndex`) — config'te tutulmaz, çünkü config
// yazmak offline'ta kapalıdır (docs/operations/offline.md).
//
// "+N" listesi için `Modal` kullanılır: odak tuzağı, geri tuşu ve odak iadesi
// elle YAZILMAZ (AGENTS.md madde 9).
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { NutrientSummaryLine } from "./FormBits";
import { rankTemplatesByUsage, templateTotal } from "../lib/templates";
import type { MealTemplate, TemplateUsageIndex } from "../lib/templates";

/** Kaç şablon kart olarak görünsün. Kullanıcı kararı: en fazla 3, en çok
 *  kullanılanlar. Sabit bir sayı — ayarlanabilir olması için bir PREF anahtarı
 *  EKLENDİ (kimse değiştiremeyecek bir ayar = uydurma ayar). */
const VISIBLE_COUNT = 3;

interface TemplateShelfProps {
  templates: MealTemplate[];
  usage: TemplateUsageIndex;
  busy: boolean;
  /** Şablon KİMLİĞİ ile çağrılır, nesneyle değil: `templates` her render'da
   *  yeni referans (`parseTemplatesConfig` memo'lu değil), nesne taşımak
   *  sıralama sonucu her render'da yeniden üretilirdi. */
  onPick: (templateId: string) => void;
}

export function TemplateShelf({ templates, usage, busy, onPick }: TemplateShelfProps) {
  const { t } = useTranslation();
  const [allOpen, setAllOpen] = useState(false);

  const ranked = rankTemplatesByUsage(templates, usage);
  const top = ranked.slice(0, VISIBLE_COUNT);
  const rest = ranked.slice(VISIBLE_COUNT);

  if (templates.length === 0) return null;

  const card = (template: MealTemplate) => (
    <button
      key={template.id}
      type="button"
      disabled={busy}
      onClick={() => onPick(template.id)}
      className="flex w-full flex-col gap-1 rounded-chip border border-line bg-white/[0.06] px-3 py-2.5 text-left transition hover:border-memory/40 hover:bg-white/[0.09] disabled:opacity-40"
    >
      <span className="block truncate text-xs font-bold text-ink-primary">{template.name}</span>
      <NutrientSummaryLine
        as="span"
        nutrition={templateTotal(template.items)}
        kcal="inline"
        className="block font-mono text-[11px] text-ink-tertiary"
      />
    </button>
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{top.map(card)}</div>

      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setAllOpen(true)}
          className="flex w-full items-center justify-between rounded-pill border border-line px-3 py-2 text-[11px] font-bold text-ink-secondary transition hover:border-memory/40 hover:text-ink-primary sm:w-auto sm:self-start"
        >
          {t("day.templatesMore", { n: rest.length })}
          <ChevronRight className="h-3.5 w-3.5 flex-none" />
        </button>
      )}

      {allOpen && (
        <Modal title={t("day.templatesAll")} onClose={() => setAllOpen(false)}>
          {/* Kullanım sırasıyla: en çok kullanılan başta. */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{ranked.map(card)}</div>
        </Modal>
      )}
    </>
  );
}
