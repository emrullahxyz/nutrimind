import { useEffect, useRef, useState } from "react";

interface FABProps {
  onAddMeal: () => void;
  onScan: () => void;
}

export function FAB({ onAddMeal, onScan }: FABProps) {
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
      {/* Menu overlay above FAB */}
      {open && (
        <div className="anim-zoom absolute bottom-16 right-0 mb-2 flex w-44 flex-col gap-1.5 rounded-2xl border border-calBorder bg-[#181824]/95 p-2 shadow-float backdrop-blur-xl">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAddMeal();
            }}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10"
          >
            <span className="text-base">📝</span>
            <span>Öğün ekle</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onScan();
            }}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10"
          >
            <span className="text-base">📷</span>
            <span>Tara</span>
          </button>
        </div>
      )}

      {/* Main + FAB Button */}
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
