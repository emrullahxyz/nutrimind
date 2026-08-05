import { useEffect, useRef, useState } from "react";
import { Flame } from "lucide-react";
import { DailyPage } from "./pages/DailyPage";
import { HistoryPage } from "./pages/HistoryPage";
import { AliasPage } from "./pages/AliasPage";
import { DataProvider, useData } from "./lib/data";
import { SettingsSheet } from "./components/SettingsSheet";
import { BottomNav, TabType } from "./components/BottomNav";
import { MealForm } from "./components/MealForm";
import { ScanSheet } from "./components/ScanSheet";
import { ExerciseModal } from "./components/ExerciseModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import type { AIParseItem } from "./types";
import { todayISO } from "./lib/format";
import { calculateStreak } from "./lib/streak";
import { fabTarget } from "./lib/fabRouting";
import { classifyPopState, shouldExitOnSecondPress } from "./lib/backStack";
import { hasOpenOverlay } from "./lib/overlayLock";
import { hasActiveSubView } from "./lib/subViewRegistry";

function MainContent() {
  const [tab, setTab] = useState<TabType>("daily");
  const [tabResetKey, setTabResetKey] = useState<Record<TabType, number>>({
    daily: 0,
    history: 0,
    aliases: 0,
    settings: 0,
  });
  const [triggerAddMeal, setTriggerAddMeal] = useState(false);
  const [triggerScan, setTriggerScan] = useState(false);
  const [triggerExercise, setTriggerExercise] = useState(false);
  const [globalScanOpen, setGlobalScanOpen] = useState(false);
  const [globalAddMealOpen, setGlobalAddMealOpen] = useState(false);
  /** FAB > "Yemek Taraması" sonucunun öğün formuna taşındığı ara durum. */
  const [globalAIItems, setGlobalAIItems] = useState<AIParseItem[] | undefined>(undefined);

  /** DayView'daki kanonik desenin aynısı: tarama sonucu doğrudan öğün formunun
   *  sepetine düşer. FAB ve Hafıza yollarında bu bağlanmadığı için sonuç
   *  sessizce yutuluyordu. */
  const handleVisionResult = (items: AIParseItem[]) => {
    setGlobalAIItems(items);
    setGlobalScanOpen(false);
    setGlobalAddMealOpen(true);
  };
  const [globalExerciseOpen, setGlobalExerciseOpen] = useState(false);
  const [showExitToast, setShowExitToast] = useState(false);
  const lastBackPressRef = useRef<number>(0);

  const { days } = useData();
  const streak = calculateStreak(days);

  // Tab değiştirme sarmalayıcısı (Her sekme ana sekmedir, replaceState ile kök tutulur)
  const handleTabChange = (newTab: TabType) => {
    setGlobalAddMealOpen(false);
    setGlobalScanOpen(false);
    setGlobalExerciseOpen(false);

    setTabResetKey((prev) => ({
      ...prev,
      [newTab]: prev[newTab] + 1,
    }));

    if (newTab !== tab) {
      window.history.replaceState({ tab: newTab, isRoot: true }, "");
      setTab(newTab);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const tabRef = useRef(tab);
  tabRef.current = tab;

  const modalsRef = useRef({ globalAddMealOpen, globalScanOpen, globalExerciseOpen });
  modalsRef.current = { globalAddMealOpen, globalScanOpen, globalExerciseOpen };

  // Sayfa ilk yüklendiğinde kök durumu YALNIZCA BİR KEZ tanımla
  useEffect(() => {
    window.history.replaceState({ tab: "daily", isRoot: true }, "");
  }, []);

  // Uygulama geneli Android Geri Tuşu & Geri Kaydırma (Double Back to Exit) Mantığı:
  // Her sekmenin ÇIPLAK kökündeyken (alt-görünüm/modal kapalıyken) geri tuşu
  // uygulamadan çıkış uyarısı verir. Karar `classifyPopState`'e (saf fonksiyon,
  // bkz. lib/backStack.ts) devredilmiş durumda — burada yalnızca DOM/React yan
  // etkileri var. İki soru artık kırılgan bir DOM sorgusuna
  // (`document.querySelector('.fixed.inset-0')`, FAB backdrop'unu da "modal
  // açık" sanıyordu) değil, iki paylaşılan CANLI sayaca dayanıyor:
  //  - "açık overlay var mı" → `hasOpenOverlay()` (bkz. lib/overlayLock.ts) —
  //    FAB backdrop'u dahil HER overlay zaten bu sayacı kullanıyor.
  //  - "açık alt-görünüm var mı" → `hasActiveSubView()` (bkz.
  //    lib/subViewRegistry.ts) — Ayarlar>Profil, Geçmiş>hafta/gün gibi gömülü
  //    alt-sayfalardan YENİ çıkılırken sahte çıkış toast'ını bastırır. İlk
  //    denenen "bir önceki durumu ref'te tut" yaklaşımı tarayıcıda YANLIŞ
  //    çıkmıştı (bkz. backStack.ts başındaki not) — SettingsSheet/HistoryPage
  //    kendi `pushState`'lerini App'e hiç bildirmiyordu.
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as { tab?: TabType; isRoot?: boolean; isModal?: boolean } | null;
      const decision = classifyPopState({
        newState: state,
        hasOpenOverlay: hasOpenOverlay(),
        hasActiveSubView: hasActiveSubView(),
      });

      if (decision !== "evaluate-exit") {
        return;
      }

      const currentTab = tabRef.current;
      const now = Date.now();
      if (shouldExitOnSecondPress(lastBackPressRef.current, now)) {
        // 2. geri basma (2sn içinde): Çıkışa izin ver.
      } else {
        // 1. geri basma: Toast uyarısı göster ve sekmenin kök durumunu yenile
        lastBackPressRef.current = now;
        window.history.replaceState({ tab: currentTab, isRoot: true }, "");
        setShowExitToast(true);
        setTimeout(() => setShowExitToast(false), 2000);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleAddMeal = () => {
    if (fabTarget(tab) === "daily-local") {
      setTriggerAddMeal(true);
    } else {
      setGlobalAddMealOpen(true);
    }
  };

  const handleScan = () => {
    if (fabTarget(tab) === "daily-local") {
      setTriggerScan(true);
    } else {
      setGlobalScanOpen(true);
    }
  };

  /** FAB > "Egzersiz Kaydet": Bugün sekmesindeyken WeekStrip'te seçili tarihe
   *  bağlı DayView'un kendi (zaten doğru) egzersiz modalını tetikler; diğer
   *  sekmelerde (WeekStrip bağlamı yoktur) bugüne yazan global modal açılır. */
  const handleExercise = () => {
    if (fabTarget(tab) === "daily-local") {
      setTriggerExercise(true);
    } else {
      setGlobalExerciseOpen(true);
    }
  };

  return (
    <>
      <div className="ambient-glow fixed top-0 left-0 right-0 h-72 pointer-events-none z-0" />

      <header className="no-print relative z-10 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/NutriMind_Logo.png" alt="NutriMind" className="h-7 w-7 rounded-lg" />
          <h1 className="text-xl font-extrabold text-white sm:text-2xl">
            NutriMind
          </h1>
        </div>

        <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white border border-white/15 backdrop-blur-md">
          <Flame className="h-4 w-4 text-accent" />
          <span>{streak}</span>
        </div>
      </header>

      <main className="relative pb-28 sm:pb-24">
        {tab === "daily" ? (
          <DailyPage
            triggerAddMeal={triggerAddMeal}
            onResetTriggerAddMeal={() => setTriggerAddMeal(false)}
            triggerScan={triggerScan}
            onResetTriggerScan={() => setTriggerScan(false)}
            triggerExercise={triggerExercise}
            onResetTriggerExercise={() => setTriggerExercise(false)}
            resetKey={tabResetKey.daily}
          />
        ) : tab === "history" ? (
          <HistoryPage />
        ) : tab === "aliases" ? (
          <AliasPage resetKey={tabResetKey.aliases} onVisionResult={handleVisionResult} />
        ) : (
          <SettingsSheet onClose={() => handleTabChange("daily")} embedded resetKey={tabResetKey.settings} />
        )}
      </main>

      <BottomNav
        activeTab={tab}
        onTabChange={handleTabChange}
        onOpenSettings={() => handleTabChange("settings")}
        onAddMeal={handleAddMeal}
        onScan={handleScan}
        onSavedFoods={() => handleTabChange("aliases")}
        onOpenExercise={handleExercise}
      />

      {globalAddMealOpen && (
        <MealForm
          date={todayISO()}
          editIndex={null}
          onClose={() => {
            setGlobalAddMealOpen(false);
            setGlobalAIItems(undefined);
          }}
          initialAIItems={globalAIItems}
        />
      )}

      {globalScanOpen && (
        <ScanSheet onClose={() => setGlobalScanOpen(false)} onVisionResult={handleVisionResult} />
      )}

      <ExerciseModal
        isOpen={globalExerciseOpen}
        onClose={() => setGlobalExerciseOpen(false)}
        date={todayISO()}
      />

      {/* Çift Geri Basma / Çıkış Toast Uyarısı */}
      {showExitToast && (
        <div className="fixed bottom-20 left-1/2 z-[99999] -translate-x-1/2 rounded-full border border-white/20 bg-[#121319]/95 px-4 py-2.5 text-center text-xs font-extrabold text-white shadow-2xl backdrop-blur-md anim-fadeup">
          Uygulamadan çıkmak için bir kez daha geri kaydırın / geri tuşuna basın
        </div>
      )}
    </>
  );
}

export function App() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 py-5 pad-safe sm:px-6 md:max-w-5xl md:px-10 md:py-8">
      <ErrorBoundary>
        <DataProvider>
          <MainContent />
        </DataProvider>
      </ErrorBoundary>
    </div>
  );
}
