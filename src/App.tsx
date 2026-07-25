import { useState } from "react";
import { DailyPage } from "./pages/DailyPage";
import { HistoryPage } from "./pages/HistoryPage";
import { AliasPage } from "./pages/AliasPage";
import { DataProvider } from "./lib/data";

type Tab = "daily" | "history" | "aliases";

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

export function App() {
  const [tab, setTab] = useState<Tab>("daily");

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 md:max-w-5xl md:px-10 md:py-10">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-memory">Besin Hafızası</div>
          <h1 className="mt-1 text-2xl font-extrabold text-ink-primary md:text-3xl">Nutrimind</h1>
        </div>
        <nav className="flex gap-2">
          <TabButton active={tab === "daily"} onClick={() => setTab("daily")} label="Günlük" />
          <TabButton active={tab === "history"} onClick={() => setTab("history")} label="Geçmiş" />
          <TabButton active={tab === "aliases"} onClick={() => setTab("aliases")} label="Hafıza" />
        </nav>
      </header>

      <main>
        <DataProvider>
          {tab === "daily" ? <DailyPage /> : tab === "history" ? <HistoryPage /> : <AliasPage />}
        </DataProvider>
      </main>
    </div>
  );
}
