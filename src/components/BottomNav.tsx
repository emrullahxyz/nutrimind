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

export type TabType = "daily" | "history" | "aliases";

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onOpenSettings: () => void;
  onAddMeal?: () => void;
  onScan?: () => void;
  onSavedFoods?: () => void;
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
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/15 bg-[#1e202a] p-3.5 text-center shadow-float backdrop-blur-xl transition hover:border-white/30 hover:bg-[#262836] active:scale-95 disabled:opacity-40 disabled:hover:border-white/15 disabled:hover:bg-[#1e202a]"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-md">
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
}: BottomNavProps) {
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

  const tabs = [
    { id: "daily" as TabType, label: "Bugün", icon: Home },
    { id: "history" as TabType, label: "İlerleme", icon: BarChart3 },
    { id: "aliases" as TabType, label: "Hafıza", icon: Brain },
    { id: "settings" as const, label: "Ayarlar", icon: Settings },
  ];

  return (
    <nav
      ref={containerRef}
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-calBorder bg-[#0D0D14]/90 backdrop-blur-xl"
    >
      <div className="relative mx-auto flex max-w-md items-center justify-between px-3 py-2 sm:max-w-lg">
        {/* 2x2 FAB Popup Menu */}
        {open && (
          <div className="anim-zoom absolute bottom-16 right-3 mb-2 grid w-64 grid-cols-2 gap-2.5 rounded-3xl border border-white/15 bg-[#121319]/98 p-2.5 shadow-float backdrop-blur-2xl z-50">
            <FabMenuItem icon={Footprints} label="Egzersiz Kaydet" disabled />
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
              label="Besin Veritabanı"
              onClick={() => {
                setOpen(false);
                onAddMeal?.();
              }}
            />
            <FabMenuItem
              icon={Camera}
              label="Tara"
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
            const isSettings = tab.id === "settings";
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (isSettings) {
                    onOpenSettings();
                  } else {
                    onTabChange(tab.id as TabType);
                  }
                }}
                className={`flex flex-col items-center justify-center py-1 px-3 transition-colors duration-200 ${
                  isActive ? "text-white font-bold" : "text-[#8E8E93] hover:text-white/80 font-normal"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="mt-1 text-[10px] tracking-wide">{tab.label}</span>
                {isActive && (
                  <span className="mt-0.5 h-1 w-1 rounded-full bg-[#4DD4E6] shadow-[0_0_6px_#4DD4E6]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Integrated Solid White + FAB Button at the right end */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-card transition-transform duration-200 hover:scale-105 active:scale-95 flex-none"
          aria-label="Ekle"
        >
          <Plus className={`h-6 w-6 transition-transform duration-200 ${open ? "rotate-45" : ""}`} />
        </button>
      </div>
    </nav>
  );
}
