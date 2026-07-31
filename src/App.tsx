import { useState } from "react";
import { DailyPage } from "./pages/DailyPage";
import { HistoryPage } from "./pages/HistoryPage";
import { TrendPage } from "./pages/TrendPage";
import { AliasPage } from "./pages/AliasPage";
import { DataProvider, useData } from "./lib/data";
import { ExportModal } from "./components/ExportModal";

type Tab = "daily" | "history" | "trend" | "aliases";

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-pill px-4 py-2 text-sm font-bold transition ${
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
  const [modalOpen, setModalOpen] = useState(false);
  const dataCtx = useData();

  return (
    <>
      <header className="no-print mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between sm:justify-start sm:gap-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-memory">Besin Hafızası</div>
            <h1 className="mt-1 text-2xl font-extrabold text-ink-primary md:text-3xl">Nutrimind</h1>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            title="Veri dışa/içe aktarma ve PDF raporu"
            className="rounded-pill border border-line bg-white/[0.04] px-3 py-1.5 font-mono text-xs font-semibold text-ink-secondary transition hover:bg-white/10 hover:text-ink-primary"
          >
            📊 Veri / Rapor
          </button>
        </div>
        <nav className="flex gap-2">
          <TabButton active={tab === "daily"} onClick={() => setTab("daily")} label="Günlük" />
          <TabButton active={tab === "history"} onClick={() => setTab("history")} label="Geçmiş" />
          <TabButton active={tab === "trend"} onClick={() => setTab("trend")} label="Trend" />
          <TabButton active={tab === "aliases"} onClick={() => setTab("aliases")} label="Hafıza" />
        </nav>
      </header>

      <main>
        {tab === "daily" ? (
          <DailyPage />
        ) : tab === "history" ? (
          <HistoryPage />
        ) : tab === "trend" ? (
          <TrendPage />
        ) : (
          <AliasPage />
        )}
      </main>

      {modalOpen && (
        <ExportModal
          data={dataCtx}
          refresh={dataCtx.refresh}
          onClose={() => setModalOpen(false)}
        />
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
