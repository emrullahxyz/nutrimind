import { useState } from "react";
import { Modal } from "./Modal";
import { GoalsForm } from "./GoalsForm";
import { ExportModal } from "./ExportModal";
import { ReportView } from "./ReportView";
import { useData } from "../lib/data";

type SettingsTab = "goals" | "data" | "report";

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>("goals");
  const dataCtx = useData();

  return (
    <Modal title="Ayarlar" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* Pill Sekmeler */}
        <div className="no-print -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => setTab("goals")}
            className={`flex-none rounded-pill px-3.5 py-1.5 text-xs font-bold transition ${
              tab === "goals"
                ? "bg-memory text-memory-ink"
                : "border border-line bg-white/[0.06] text-ink-secondary hover:text-ink-primary"
            }`}
          >
            Hedefler
          </button>
          <button
            type="button"
            onClick={() => setTab("data")}
            className={`flex-none rounded-pill px-3.5 py-1.5 text-xs font-bold transition ${
              tab === "data"
                ? "bg-memory text-memory-ink"
                : "border border-line bg-white/[0.06] text-ink-secondary hover:text-ink-primary"
            }`}
          >
            Veri
          </button>
          <button
            type="button"
            onClick={() => setTab("report")}
            className={`flex-none rounded-pill px-3.5 py-1.5 text-xs font-bold transition ${
              tab === "report"
                ? "bg-memory text-memory-ink"
                : "border border-line bg-white/[0.06] text-ink-secondary hover:text-ink-primary"
            }`}
          >
            Rapor
          </button>
        </div>

        {/* Tab İçerikleri */}
        {tab === "goals" && <GoalsForm onClose={onClose} embedded />}
        {tab === "data" && <ExportModal data={dataCtx} refresh={dataCtx.refresh} onClose={onClose} embedded />}
        {tab === "report" && <ReportView data={dataCtx} />}
      </div>
    </Modal>
  );
}
