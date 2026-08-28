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
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useModalHistory } from "../hooks/useModalHistory";
import { afterHistoryBackSettles } from "../lib/backStack";
import { useTranslation } from "react-i18next";

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
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/15 bg-nav-item p-3 text-center shadow-float backdrop-blur-xl transition hover:border-white/30 hover:bg-nav-item-hover active:scale-95 disabled:opacity-40 disabled:hover:border-white/15 disabled:hover:bg-nav-item"
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

  // FAB menüsü açıkken body scroll'u paylaşılan, referans-sayaçlı mekanizmayla
  // kilitlenir (bkz. useBodyScrollLock) — burada artık doğrudan
  // document.body.style'a dokunulmuyor.
  useBodyScrollLock(open);

  // FAB menüsü açıkken dışarı tıklama kapatır.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [open]);

  // Android donanım geri tuşu / geri kaydırma — bkz. `useModalHistory` (bu
  // dosya eskiden tek istisnaydı: `markProgrammaticBack()` unutulmuştu, bir
  // menü öğesi aynı anda yeni bir modal açtığında gecikmiş `popstate` o YENİ
  // modalın dinleyicisine düşüp onu açılır açılmaz kapatıyordu — "FAB >
  // Yemek Taraması açılmıyor" şikâyetinin sebebiydi. Ortak hook bunu zaten
  // doğru yapıyor). Menüyü kapatan HİÇBİR `setOpen(false)` çağrısı
  // değişmedi — hook'un temizliği `open` `false` olduğunda otomatik devreye
  // giriyor, ayrı bir `requestClose()` çağrısına gerek yok.
  useModalHistory({ active: open, onClose: () => setOpen(false) });

  const { t } = useTranslation();
  const tabs = [
    { id: "daily" as TabType, label: t("nav.today"), icon: Home },
    { id: "history" as TabType, label: t("nav.progress"), icon: BarChart3 },
    { id: "aliases" as TabType, label: t("nav.memory"), icon: Brain },
    { id: "settings" as const, label: t("nav.settings"), icon: Settings },
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
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-accent-ink/95 backdrop-blur-xl"
      >
        <div className="relative mx-auto flex max-w-md items-center justify-between px-3 py-2 sm:max-w-lg">
          {/* 2x2 FAB Popup Menu — her öğe `afterHistoryBackSettles` ile sarılı:
              menü kapanışı `history.back()` çağırıyor (asenkron), öğe AYNI
              anda yeni bir modal açarsa (senkron `pushState`) tarayıcı
              back()'in hedefini çağrı anındaki konuma göre kaydedip aradaki
              yeni push'u atlıyor — canlıda "FAB > Yemek Taraması, geri, geri"
              dizisiyle uygulamadan çıkışa yol açtığı doğrulandı. Bkz.
              `backStack.ts`'teki fonksiyon yorumu. */}
          {open && (
            <div className="anim-zoom fab-menu glass-island absolute bottom-20 right-3 mb-2 grid w-64 grid-cols-2 gap-2.5 rounded-3xl border border-white/15 bg-fab-panel/98 p-3 shadow-float backdrop-blur-2xl z-50">
              <FabMenuItem
                icon={Footprints}
                label={t("nav.logExercise")}
                onClick={() => {
                  setOpen(false);
                  afterHistoryBackSettles(() => onOpenExercise?.());
                }}
              />
              <FabMenuItem
                icon={Bookmark}
                label={t("nav.savedFoods")}
                onClick={() => {
                  setOpen(false);
                  afterHistoryBackSettles(() => onSavedFoods?.());
                }}
              />
              <FabMenuItem
                icon={Search}
                label={t("nav.foodSearch")}
                onClick={() => {
                  setOpen(false);
                  afterHistoryBackSettles(() => onAddMeal?.());
                }}
              />
              <FabMenuItem
                icon={Camera}
                label={t("nav.foodScan")}
                onClick={() => {
                  setOpen(false);
                  afterHistoryBackSettles(() => onScan?.());
                }}
              />
            </div>
          )}

          {/* Tab Buttons */}
          <div className="flex flex-1 items-center justify-around mr-1">
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
                  aria-current={isActive ? "page" : undefined}
                  aria-label={tab.label}
                  className={`flex flex-col items-center justify-center py-1 px-2 transition-colors duration-200 ${
                    isActive ? "text-white font-bold" : "text-ink-secondary hover:text-white font-normal"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="mt-1 text-[10px] tracking-wide font-medium">{tab.label}</span>
                  {isActive && (
                    <span className="mt-0.5 h-1 w-1 rounded-full bg-white shadow-[0_0_6px_#FFFFFF]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Integrated Solid White + FAB Button */}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-white text-black shadow-card transition-transform duration-200 hover:scale-105 active:scale-95 flex-none z-50 ml-1"
            aria-label={t("common.add")}
          >
            <Plus className={`h-6 w-6 sm:h-7 sm:w-7 transition-transform duration-200 ${open ? "rotate-45" : ""}`} />
          </button>
        </div>
      </nav>
    </>
  );
}
