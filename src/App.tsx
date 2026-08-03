import { useState } from "react";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [triggerAddMeal, setTriggerAddMeal] = useState(false);
  const [triggerScan, setTriggerScan] = useState(false);
  const [globalScanOpen, setGlobalScanOpen] = useState(false);
  const [globalAddMealOpen, setGlobalAddMealOpen] = useState(false);
  const [globalExerciseOpen, setGlobalExerciseOpen] = useState(false);

  const { days } = useData();
  const streak = calculateStreak(days);

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
        ) : (
          <AliasPage />
        )}
      </main>

      <BottomNav
        activeTab={tab}
        onTabChange={setTab}
        onOpenSettings={() => setSettingsOpen(true)}
        onAddMeal={handleAddMeal}
        onScan={handleScan}
        onSavedFoods={() => setTab("aliases")}
        onOpenExercise={() => setGlobalExerciseOpen(true)}
      />

      {settingsOpen && (
        <SettingsSheet onClose={() => setSettingsOpen(false)} />
      )}

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
