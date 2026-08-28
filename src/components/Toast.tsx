import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { prefersReducedMotion } from "../lib/animation";
import { useTranslation } from "react-i18next";

export type ToastVariant = "success" | "info" | "error";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, durationMs?: number) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

const ICONS: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  info: Info,
  error: AlertCircle,
};

const STYLES: Record<ToastVariant, { border: string; bg: string; text: string; icon: string }> = {
  success: {
    border: "border-emerald-500/30",
    bg: "bg-[#161f1c]/95",
    text: "text-emerald-200",
    icon: "text-emerald-400",
  },
  info: {
    border: "border-amber-500/30",
    bg: "bg-[#211d16]/95",
    text: "text-amber-200",
    icon: "text-amber-400",
  },
  error: {
    border: "border-rose-500/30",
    bg: "bg-[#211618]/95",
    text: "text-rose-200",
    icon: "text-rose-400",
  },
};

function SingleToast({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  const Icon = ICONS[toast.variant];
  const style = STYLES[toast.variant];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Giriş animasyonu için bir kare bekle
    const frame = requestAnimationFrame(() => setVisible(true));
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 200);
    }, toast.durationMs);

    return () => {
      cancelAnimationFrame(frame);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.durationMs, onDismiss]);

  const reduced = prefersReducedMotion();

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 shadow-float backdrop-blur-xl transition-all duration-200 ${
        style.border
      } ${style.bg} ${style.text} ${
        reduced
          ? "opacity-100"
          : visible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-2 scale-95 opacity-0"
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${style.icon}`} />
      <span className="text-xs font-bold leading-tight">{toast.message}</span>
      <button
        type="button"
        onClick={() => {
          setVisible(false);
          setTimeout(() => onDismiss(toast.id), 150);
        }}
        aria-label={t("common.close")}
        className="ml-1 rounded-full p-0.5 text-white/40 transition hover:bg-white/10 hover:text-white"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success", durationMs = 3000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-2), { id, message, variant, durationMs }]);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed bottom-20 left-0 right-0 z-[10000] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:left-auto sm:right-6 sm:items-end"
            aria-label={t("toast.region")}
          >
            {toasts.map((t) => (
              <SingleToast key={t.id} toast={t} onDismiss={dismissToast} />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}
