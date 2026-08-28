import { useRef, useState } from "react";
import { useData } from "../lib/data";
import { useTranslation } from "react-i18next";
import type { AppData } from "../lib/api";
import {
  downloadFile,
  exportAliasesToCsv,
  exportBackupToJson,
  exportMealsToCsv,
  executeRestore,
  validateBackup,
} from "../lib/exporters";
import type { ValidationSuccess } from "../lib/exporters";
import { todayISO } from "../lib/format";
import { ErrorText, Label } from "./FormBits";
import { Modal } from "./Modal";
import { ReportView } from "./ReportView";

type ActiveTab = "export" | "import";

export function ExportModal({
  data,
  refresh,
  onClose,
  embedded = false,
}: {
  data: AppData;
  refresh: () => Promise<void>;
  onClose: () => void;
  embedded?: boolean;
}) {
  const { offline } = useData();
  const { t } = useTranslation();
  const [tab, setTab] = useState<ActiveTab>("export");
  const [fileError, setFileError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationSuccess | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    setValidation(null);
    setConfirmed(false);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const raw = JSON.parse(evt.target?.result as string);
        const res = validateBackup(raw);
        if (!res.ok) {
          setFileError(res.error);
        } else {
          setValidation(res);
        }
      } catch {
        setFileError(t("export.invalidJson"));
      }
    };
    reader.onerror = () => setFileError(t("export.fileReadError"));
    reader.readAsText(file);
  };

  const handleStartRestore = async () => {
    if (!validation || restoring) return;
    if (offline) {
      setFileError(t("offline.writeUnavailable"));
      return;
    }
    setRestoring(true);
    setFileError(null);
    try {
      await executeRestore(validation, data, refresh, (curr, tot) => {
        setProgress({ current: curr, total: tot });
      });
      onClose();
    } catch (e) {
      setFileError(`${t("export.restoreError")}: ${String((e as Error)?.message ?? e)}`);
      setRestoring(false);
    }
  };

  const content = (
      <div className="flex flex-col gap-4">
        {/* Alt Sekme Butonları (Pill stili) */}
        <div className="no-print -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => setTab("export")}
            className={`flex-none rounded-pill px-3 py-1.5 text-xs font-bold transition ${
              tab === "export"
                ? "bg-memory text-memory-ink"
                : "border border-line bg-white/[0.06] text-ink-secondary hover:text-ink-primary"
            }`}
          >
            {t("export.tabExport")}
          </button>
          <button
            type="button"
            onClick={() => setTab("import")}
            className={`flex-none rounded-pill px-3 py-1.5 text-xs font-bold transition ${
              tab === "import"
                ? "bg-memory text-memory-ink"
                : "border border-line bg-white/[0.06] text-ink-secondary hover:text-ink-primary"
            }`}
          >
            {t("export.tabImport")}
          </button>
        </div>

        {/* 1. SEKME: DIŞA AKTAR */}
        {tab === "export" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-ink-secondary">
              {t("export.exportIntro")}
            </p>

            <div className="mt-2 flex flex-col gap-2.5">
              <div className="rounded-card border border-line bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-ink-primary">{t("export.mealsCsvTitle")}</h4>
                    <p className="text-[11px] text-ink-tertiary">{t("export.mealsCsvDesc")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const csv = exportMealsToCsv(data);
                      downloadFile(csv, `nutrimind-ogunler-${todayISO()}.csv`, "text/csv;charset=utf-8;");
                    }}
                    className="rounded-pill border border-line bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-ink-primary hover:bg-white/10"
                  >
                    {t("export.downloadCsv")}
                  </button>
                </div>
              </div>

              <div className="rounded-card border border-line bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-ink-primary">{t("export.aliasesCsvTitle")}</h4>
                    <p className="text-[11px] text-ink-tertiary">{t("export.aliasesCsvDesc")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const csv = exportAliasesToCsv(data.aliases);
                      downloadFile(csv, `nutrimind-hafiza-${todayISO()}.csv`, "text/csv;charset=utf-8;");
                    }}
                    className="rounded-pill border border-line bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-ink-primary hover:bg-white/10"
                  >
                    {t("export.downloadCsv")}
                  </button>
                </div>
              </div>

              <div className="rounded-card border border-line bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-ink-primary">{t("export.jsonBackupTitle")}</h4>
                    <p className="text-[11px] text-ink-tertiary">{t("export.jsonBackupDesc")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const json = exportBackupToJson(data);
                      downloadFile(json, `nutrimind-yedek-${todayISO()}.json`, "application/json;charset=utf-8;");
                    }}
                    className="rounded-pill bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-ink hover:opacity-90"
                  >
                    {t("export.downloadJson")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. SEKME: GERİ YÜKLE */}
        {tab === "import" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-ink-secondary">
              {t("export.importIntro")}
            </p>

            <div>
              <Label>{t("export.backupFileLabel")}</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                disabled={restoring}
                className="w-full rounded-chip border border-line bg-white/[0.04] p-2 text-xs text-ink-primary outline-none file:mr-3 file:rounded-pill file:border-0 file:bg-memory file:px-3 file:py-1 file:text-xs file:font-bold file:text-memory-ink"
              />
            </div>

            {fileError && <ErrorText>{fileError}</ErrorText>}

            {validation && (
              <div className="rounded-card border border-line bg-white/[0.02] p-3.5 flex flex-col gap-3">
                <div className="font-mono text-xs font-bold text-memory">{t("export.validationOk")}</div>

                <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
                  <div className="rounded-chip bg-white/[0.04] p-2">
                    <div className="text-ink-tertiary text-[10px]">{t("export.daysLabel")}</div>
                    <div className="font-bold text-ink-primary">{validation.daysCount}</div>
                  </div>
                  <div className="rounded-chip bg-white/[0.04] p-2">
                    <div className="text-ink-tertiary text-[10px]">{t("export.mealsLabel")}</div>
                    <div className="font-bold text-ink-primary">{validation.mealsCount}</div>
                  </div>
                  <div className="rounded-chip bg-white/[0.04] p-2">
                    <div className="text-ink-tertiary text-[10px]">{t("export.aliasesLabel")}</div>
                    <div className="font-bold text-ink-primary">{validation.aliasesCount}</div>
                  </div>
                </div>

                <div className="rounded-chip bg-danger/10 p-2.5 text-xs text-danger font-semibold">
                  ⚠️ {t("export.overwriteWarning")}
                </div>

                <label className="flex items-center gap-2 text-xs text-ink-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    disabled={restoring}
                    className="accent-accent"
                  />
                  <span>{t("export.overwriteConfirm")}</span>
                </label>

                {restoring && progress && (
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between font-mono text-[10px] text-ink-tertiary">
                      <span>{t("export.processing")}</span>
                      <span>{progress.current} / {progress.total}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full bg-accent transition-all duration-200"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!confirmed || restoring || offline}
                  onClick={handleStartRestore}
                  className="mt-1 rounded-pill bg-danger px-4 py-2 text-xs font-extrabold text-white transition disabled:opacity-40"
                >
                  {restoring ? t("export.restoring") : t("export.startRestore")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
  );

  if (embedded) return content;

  return (
    <Modal title={t("export.modalTitle")} onClose={onClose}>
      {content}
    </Modal>
  );
}
