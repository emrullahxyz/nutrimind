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
import { todayISO } from "./lib/format";
import { calculateStreak } from "./lib/streak";

function MainContent() {
  const [tab, setTab] = useState<TabType>("daily");
  const [triggerAddMeal, setTriggerAddMeal] = useState(false);
  const [triggerScan, setTriggerScan] = useState(false);
  const [globalScanOpen, setGlobalScanOpen] = useState(false);
  const [globalAddMealOpen, setGlobalAddMealOpen] = useState(false);
  const [globalExerciseOpen, setGlobalExerciseOpen] = useState(false);
  const [showExitToast, setShowExitToast] = useState(false);
  const lastBackPressRef = useRef<number>(0);

  const { days } = useData();
  const streak = calculateStreak(days);

  // Tab değiştirme sarmalayıcısı (history state ekler)
  const handleTabChange = (newTab: TabType) => {
    if (newTab !== tab) {
      window.history.pushState({ tab: newTab }, "");
      setTab(newTab);
    }
  };

  const tabRef = useRef(tab);
  tabRef.current = tab;

  const modalsRef = useRef({ globalAddMealOpen, globalScanOpen, globalExerciseOpen });
  modalsRef.current = { globalAddMealOpen, globalScanOpen, globalExerciseOpen };

  // Sayfa ilk yüklendiğinde kök durumu YALNIZCA BİR KEZ tanımla (sekme değişiminde ezilmesini önler)
  useEffect(() => {
    window.history.replaceState({ tab: "daily", isRoot: true }, "");
  }, []);

  // Uygulama geneli Android Geri Tuşu & Geri Kaydırma (Double Back to Exit) Mantığı
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const { globalAddMealOpen, globalScanOpen, globalExerciseOpen } = modalsRef.current;

      // 1. Eğer açık bir global modal/sheet varsa kapat
      if (globalAddMealOpen) {
        setGlobalAddMealOpen(false);
        return;
      }
      if (globalScanOpen) {
        setGlobalScanOpen(false);
        return;
      }
      if (globalExerciseOpen) {
        setGlobalExerciseOpen(false);
        return;
      }

      const state = e.state;
      const currentTab = tabRef.current;

      // 2. Tarayıcı geçmişinde hedef sekme bilgisi varsa o sekmeye geç
      if (state && state.tab) {
        // Yalnızca en kök (isRoot) olan daily durumuna gelinirse VE halihazırda daily sekmesindeysek çift basma uyarısı ver
        if (state.tab === "daily" && state.isRoot && currentTab === "daily") {
          const now = Date.now();
          if (now - lastBackPressRef.current < 2000) {
            // 2 saniye içinde 2. geri kaydırma! Çıkışa izin ver.
          } else {
            // 1. geri kaydırma! Toast uyarısı göster ve kök durumu yeniden push et
            lastBackPressRef.current = now;
            window.history.pushState({ tab: "daily", isRoot: true }, "");
            setShowExitToast(true);
            setTimeout(() => setShowExitToast(false), 2000);
          }
          return;
        }

        // Normal sekme geçişi: Sadece sekmeyi güncelle
        setTab(state.tab);
        return;
      }

      // 3. Geçmiş state bulunamazsa ve halihazırda "daily" sekmesindeysek
      if (currentTab === "daily") {
        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          // Çıkış
        } else {
          lastBackPressRef.current = now;
          window.history.pushState({ tab: "daily", isRoot: true }, "");
          setShowExitToast(true);
          setTimeout(() => setShowExitToast(false), 2000);
        }
      } else {
        setTab("daily");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleAddMeal = () => {
    if (tab === "daily") {
      setTriggerAddMeal(true);
    } else {
      setGlobalAddMealOpen(true);
    }
  };

  const handleScan = () => {
    if (tab === "daily") {
      setTriggerScan(true);
    } else {
      setGlobalScanOpen(true);
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
          />
        ) : tab === "history" ? (
          <HistoryPage />
        ) : tab === "aliases" ? (
          <AliasPage />
        ) : (
          <SettingsSheet onClose={() => handleTabChange("daily")} embedded />
        )}
      </main>

      <BottomNav
        activeTab={tab}
        onTabChange={handleTabChange}
        onOpenSettings={() => handleTabChange("settings")}
        onAddMeal={handleAddMeal}
        onScan={handleScan}
        onSavedFoods={() => handleTabChange("aliases")}
        onOpenExercise={() => setGlobalExerciseOpen(true)}
      />

      {globalAddMealOpen && (
        <MealForm date={todayISO()} editIndex={null} onClose={() => setGlobalAddMealOpen(false)} />
      )}

      {globalScanOpen && (
        <ScanSheet onClose={() => setGlobalScanOpen(false)} />
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
      <DataProvider>
        <MainContent />
      </DataProvider>
    </div>
  );
}
