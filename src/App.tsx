import { useState } from "react";
import { DailyPage } from "./pages/DailyPage";
import { HistoryPage } from "./pages/HistoryPage";
import { AliasPage } from "./pages/AliasPage";
import { DataProvider } from "./lib/data";
import { SettingsSheet } from "./components/SettingsSheet";

type Tab = "daily" | "history" | "aliases";

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-none rounded-pill px-4 py-2 text-sm font-bold transition ${
        active
          ? "bg-memory text-memory-ink"
          : "border border-line bg-white/[0.06] text-ink-secondary hover:text-ink-primary"
      }`}
    >
      {label}
    </button>
  );
}

function MainContent() {
  const [tab, setTab] = useState<Tab>("daily");
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      {/* Mobilde başlık dikey yer kazanmak için sıkıştırılmış: süsleme satırı
          ("Besin Hafızası") yalnızca sm'den itibaren görünür. Bu ekranın asıl
          işi öğün listesi ve o liste ilk ekranda kalmalı. */}
      <header className="no-print mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-center justify-between sm:justify-start sm:gap-4">
          <div>
            <div className="hidden font-mono text-xs uppercase tracking-[0.2em] text-memory sm:block">
              Besin Hafızası
            </div>
            <h1 className="text-xl font-extrabold text-ink-primary sm:mt-1 sm:text-2xl md:text-3xl">
              Nutrimind
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Ayarlar"
            className="flex h-9 w-9 items-center justify-center rounded-pill border border-line bg-white/[0.04] text-base font-semibold text-ink-secondary transition hover:bg-white/10 hover:text-ink-primary"
            aria-label="Ayarlar"
          >
            ⚙
          </button>
        </div>
        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <TabButton active={tab === "daily"} onClick={() => setTab("daily")} label="Bugün" />
          <TabButton active={tab === "history"} onClick={() => setTab("history")} label="Geçmiş" />
          <TabButton active={tab === "aliases"} onClick={() => setTab("aliases")} label="Hafıza" />
        </nav>
      </header>

      <main>
        {tab === "daily" ? (
          <DailyPage />
        ) : tab === "history" ? (
          <HistoryPage />
        ) : (
          <AliasPage />
        )}
      </main>

      {settingsOpen && (
        <SettingsSheet onClose={() => setSettingsOpen(false)} />
      )}
    </>
  );
}

export function App() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 md:max-w-5xl md:px-10 md:py-10">
      <DataProvider>
        <MainContent />
      </DataProvider>
    </div>
  );
}
