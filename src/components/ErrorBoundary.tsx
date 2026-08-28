import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { withTranslation } from "react-i18next";

interface Props {
  children: ReactNode;
  t: (key: string) => string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export const ErrorBoundary = withTranslation()(class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    try {
      Sentry.captureException(error, {
        extra: { componentStack: errorInfo.componentStack ?? "" },
      });
    } catch {
      // Sentry yüklenmemişse sessizce geç
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-lg font-bold text-white mb-2">{this.props.t("error.fallbackTitle")}</h2>
          <p className="text-xs text-white/60 max-w-xs mb-6">
            {this.props.t("error.fallbackBody")}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-accent px-5 py-2.5 text-xs font-bold text-black transition-all hover:opacity-90 active:scale-95"
          >
            {this.props.t("error.fallbackReload")}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
});
