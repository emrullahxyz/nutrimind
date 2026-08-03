import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  Home,
  BarChart3,
  Brain,
  Settings,
  Footprints,
  Bookmark,
  Search,
  Camera,
  Plus,
} from "lucide-react";

export type TabType = "daily" | "history" | "aliases" | "settings";

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onOpenSettings: () => void;
  onAddMeal?: () => void;
  onScan?: () => void;
  onSavedFoods?: () => void;
  onOpenExercise?: () => void;
}

function FabMenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/15 bg-[#1e202a] p-3 text-center shadow-float backdrop-blur-xl transition hover:border-white/30 hover:bg-[#262836] active:scale-95 disabled:opacity-40 disabled:hover:border-white/15 disabled:hover:bg-[#1e202a]"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-md">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-xs font-extrabold text-white">{label}</span>
    </button>
  );
}

export function BottomNav({
  activeTab,
  onTabChange,
  onOpenSettings,
  onAddMeal,
  onScan,
  onSavedFoods,
  onOpenExercise,
}: BottomNavProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // FAB menüsü açıkken hem body overflow kilitlenir hem de dışarı tıklama dinlenir
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [open]);

  const tabs = [
    { id: "daily" as TabType, label: "Bugün", icon: Home },
    { id: "history" as TabType, label: "İlerleme", icon: BarChart3 },
    { id: "aliases" as TabType, label: "Hafıza", icon: Brain },
    { id: "settings" as const, label: "Ayarlar", icon: Settings },
  ];

  return (
    <>
      {/* FAB Açıkken Arka Planı Karartan & Kaydırmayı Tamamen Kilitleyen Backdrop Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm touch-none"
          onClick={() => setOpen(false)}
          onTouchMove={(e) => e.preventDefault()}
        />
      )}

      <nav
        ref={containerRef}
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#1A1926]/95 backdrop-blur-xl"
      >
        <div className="relative mx-auto flex max-w-md items-center justify-between px-3 py-2 sm:max-w-lg">
          {/* 2x2 FAB Popup Menu */}
          {open && (
            <div className="anim-zoom absolute bottom-20 right-3 mb-2 grid w-64 grid-cols-2 gap-2.5 rounded-3xl border border-white/15 bg-[#1F1E2C]/98 p-3 shadow-float backdrop-blur-2xl z-50">
              <FabMenuItem
                icon={Footprints}
                label="Egzersiz Kaydet"
                onClick={() => {
                  setOpen(false);
                  onOpenExercise?.();
                }}
              />
              <FabMenuItem
                icon={Bookmark}
                label="Kayıtlı Besinler"
                onClick={() => {
                  setOpen(false);
                  onSavedFoods?.();
                }}
              />
              <FabMenuItem
                icon={Search}
                label="Besin Arama"
                onClick={() => {
                  setOpen(false);
                  onAddMeal?.();
                }}
              />
              <FabMenuItem
                icon={Camera}
                label="Yemek Taraması"
                onClick={() => {
                  setOpen(false);
                  onScan?.();
                }}
              />
            </div>
          )}

          {/* Tab Buttons */}
          <div className="flex flex-1 items-center justify-around mr-2">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onTabChange(tab.id as TabType);
                  }}
                  className={`flex flex-col items-center justify-center py-1 px-3.5 transition-all duration-200 ${
                    isActive
                      ? "text-white font-extrabold bg-[#282638] rounded-full py-1.5"
                      : "text-[#A5A2B8] hover:text-white font-medium"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-4.5 w-4.5" />
                    <span className="text-xs font-bold tracking-wide">{tab.label}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Integrated Solid White + FAB Button - Büyütülmüş (h-14 w-14 = 56px) */}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-card transition-transform duration-200 hover:scale-105 active:scale-95 flex-none z-50"
            aria-label="Ekle"
          >
            <Plus className={`h-7 w-7 transition-transform duration-200 ${open ? "rotate-45" : ""}`} />
          </button>
        </div>
      </nav>
    </>
  );
}
