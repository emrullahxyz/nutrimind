import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OfflineOperation } from "../lib/offlineCache";
import type { SyncState } from "../lib/offlineSync";
import { operationInfo, summarizeOperations } from "../lib/offlineSync";

type Props = {
  offline: boolean;
  cachedAt: string | null;
  ops: OfflineOperation[];
  syncState: SyncState;
  onSyncNow: () => void;
  onRetryOp: (id: string) => void;
  onCancelOp: (id: string) => void;
  onResolveOp: (id: string, choice: "server" | "device") => void;
};

const buttonClass =
  "rounded-chip border border-line bg-white/[0.08] px-2.5 py-1 text-[10px] font-semibold text-ink-primary transition hover:bg-white/[0.12] active:scale-95";

function operationLabel(
  operation: OfflineOperation,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const info = operationInfo(operation);
  switch (info.kind) {
    case "day":
      return t("offline.opDay", { date: info.date });
    case "delete-day":
      return t("offline.opDeleteDay", { date: info.date });
    case "alias":
      return t("offline.opAlias", { name: info.name });
    case "delete-alias":
      return t("offline.opDeleteAlias", { name: info.name });
  }
}

function StatusBadge({
  operation,
  t,
}: {
  operation: OfflineOperation;
  t: (key: string) => string;
}) {
  if (operation.status === "pending") {
    return (
      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
        {t("offline.statusPending")}
      </span>
    );
  }
  if (operation.status === "failed") {
    return (
      <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-200">
        {t("offline.statusFailed")}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-200">
      {t("offline.statusConflict")}
    </span>
  );
}

/** Bekleyen işlem kuyruğunun canlı durumu: senkronize ediliyor / X bekliyor /
 *  başarısız işlemler için yeniden dene + iptal, çakışma için cihaz/sunucu seçimi.
 *  Çevrimdışı banner'ıyla aynı bölgede çizilir; kuyruk boşsa ve çevrimiçiyse görünmez. */
export function SyncStatus({
  offline,
  cachedAt,
  ops,
  syncState,
  onSyncNow,
  onRetryOp,
  onCancelOp,
  onResolveOp,
}: Props) {
  const { t, i18n } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);
  const summary = useMemo(() => summarizeOperations(ops), [ops]);

  if (!offline && summary.total === 0) return null;

  const timeLabel = cachedAt
    ? new Date(cachedAt).toLocaleString(i18n.resolvedLanguage || i18n.language || "en", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      })
    : t("offline.unknownTime");

  const headline = syncState.syncing
    ? t("offline.syncing")
    : summary.total > 0
      ? t("offline.pendingCount", { count: summary.total })
      : t("offline.banner", { time: timeLabel });

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-50 border-b px-4 py-2 text-xs ${
        offline
          ? "border-amber-500/30 bg-amber-500/15 text-amber-100"
          : "border-sky-500/30 bg-sky-500/15 text-sky-100"
      }`}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            {syncState.syncing && (
              <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
            )}
            <span className="truncate">{headline}</span>
            {offline && summary.total > 0 && (
              <span className="truncate opacity-80">· {timeLabel}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {(summary.failed > 0 || summary.conflicts > 0) && (
              <button
                type="button"
                className={buttonClass}
                onClick={() => setShowDetails((v) => !v)}
              >
                {showDetails ? t("offline.hideDetails") : t("offline.details")}
              </button>
            )}
            <button type="button" className={buttonClass} onClick={onSyncNow}>
              {t("offline.bannerRetry")}
            </button>
          </span>
        </div>
        {!syncState.syncing && summary.failed > 0 && (
          <span className="opacity-90">{t("offline.failedCount", { count: summary.failed })}</span>
        )}
        {!syncState.syncing && summary.conflicts > 0 && (
          <span className="opacity-90">
            {t("offline.conflictCount", { count: summary.conflicts })}
          </span>
        )}
        {!syncState.syncing && syncState.nextRetryAt && (
          <span className="opacity-90">{t("offline.retryingSoon")}</span>
        )}
        {showDetails && (
          <ul className="flex flex-col gap-2">
            {ops.map((operation) => (
              <li
                key={operation.id}
                className="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{operationLabel(operation, t)}</span>
                  <StatusBadge operation={operation} t={t} />
                </div>
                {operation.error && (
                  <p className="text-[10px] text-ink-tertiary">{operation.error}</p>
                )}
                <div className="flex items-center gap-2">
                  {operation.status === "failed" && (
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => onRetryOp(operation.id)}
                    >
                      {t("offline.opRetry")}
                    </button>
                  )}
                  {operation.status === "conflict" && (
                    <>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => onResolveOp(operation.id, "device")}
                      >
                        {t("offline.keepDevice")}
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => onResolveOp(operation.id, "server")}
                      >
                        {t("offline.keepServer")}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => onCancelOp(operation.id)}
                  >
                    {t("offline.cancelOp")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
