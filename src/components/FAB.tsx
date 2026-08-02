import { useEffect, useRef, useState } from "react";

interface FABProps {
  onAddMeal: () => void;
  onScan: () => void;
  onSavedFoods?: () => void;
}

function FabMenuItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-calBorder bg-calCard p-4 text-center shadow-card backdrop-blur-sm transition hover:border-white/20 disabled:opacity-40 disabled:hover:border-calBorder"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-lg text-black">
        {icon}
      </span>
      <span className="text-xs font-bold text-white">{label}</span>
    </button>
  );
}

export function FAB({ onAddMeal, onScan, onSavedFoods }: FABProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="fixed bottom-20 right-5 z-50 sm:right-8">
      {/* 2x2 kart ızgarası (CAL AI ekran görüntüsündeki gibi) */}
      {open && (
        <div className="anim-zoom absolute bottom-16 right-0 mb-2 grid w-64 grid-cols-2 gap-2.5">
          {/* Egzersiz takibi henüz yok (bu brief'in kapsamı dışında) —
              kart görsel bütünlük için var ama devre dışı. */}
          <FabMenuItem icon="👟" label="Egzersiz Kaydet" disabled />
          <FabMenuItem
            icon="💾"
            label="Kayıtlı Besinler"
            onClick={() => {
              setOpen(false);
              onSavedFoods?.();
            }}
          />
          <FabMenuItem
            icon="🔍"
            label="Besin Veritabanı"
            onClick={() => {
              setOpen(false);
              onAddMeal();
            }}
          />
          <FabMenuItem
            icon="📷"
            label="Tara"
            onClick={() => {
              setOpen(false);
              onScan();
            }}
          />
        </div>
      )}

      {/* Ana + FAB butonu */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#4DD4E6] text-black shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95"
        aria-label="Ekle"
      >
        <span className={`text-2xl font-bold transition-transform duration-200 ${open ? "rotate-45" : ""}`}>
          +
        </span>
      </button>
    </div>
  );
}
