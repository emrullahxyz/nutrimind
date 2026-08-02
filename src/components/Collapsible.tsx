import { useId } from "react";
import type { ReactNode } from "react";
import { sectionLabelCls } from "./FormBits";

interface CollapsibleProps {
  title: string;
  badge?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** Kontrollü katlanır bölüm — `FormBits.tsx`'teki mikro besinler deseninin
 *  genelleştirilmiş hali. Açıklık durumu dışarıdan (`open`/`onToggle`) gelir;
 *  bu bileşen kendi state'ini tutmaz — çağıran taraf kalıcı (localStorage) ya
 *  da geçici (useState) tutabilir, Collapsible ikisini de bilmez. */
export function Collapsible({ title, badge, open, onToggle, children }: CollapsibleProps) {
  const contentId = useId();

  return (
    <div className="rounded-chip border border-line bg-white/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? contentId : undefined}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-white/[0.03]"
      >
        <span className="flex items-center gap-2">
          <span className={sectionLabelCls}>{title}</span>
          {badge}
        </span>
        <span aria-hidden="true" className="font-mono text-xs text-ink-tertiary">
          {open ? "\u2212" : "+"}
        </span>
      </button>
      {open && (
        <div id={contentId} className="border-t border-line p-3">
          {children}
        </div>
      )}
    </div>
  );
}
