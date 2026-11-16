import { useId, useLayoutEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Inline disclosure: stays in normal tab order and does not add browser history. */
export function HistorySearch({
  query,
  onQueryChange,
  shown,
  total,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  shown: number;
  total: number;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const [open, setOpen] = useState(query.length > 0);
  const [instant, setInstant] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hovered = useRef(false);
  const dismissed = useRef(false);
  const focusOnOpen = useRef(false);

  useLayoutEffect(() => {
    if (open && focusOnOpen.current) {
      focusOnOpen.current = false;
      inputRef.current?.focus();
    }
  }, [open]);

  return (
    <div
      className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2 lg:grid-cols-[auto_auto_minmax(0,1fr)_auto]"
      onPointerEnter={(event) => {
        hovered.current =
          event.pointerType === "mouse" &&
          window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      }}
      onPointerLeave={(event) => {
        hovered.current = false;
        dismissed.current = false;
        if (!query && !event.currentTarget.contains(document.activeElement)) setOpen(false);
      }}
      onBlur={(event) => {
        if (!query && !hovered.current && !event.currentTarget.contains(event.relatedTarget))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        dismissed.current = true;
        onQueryChange("");
        setOpen(false);
        buttonRef.current?.focus();
      }}
    >
      <h2 className="text-sm font-bold text-ink-secondary">{t("history.weeks")}</h2>
      <button
        ref={buttonRef}
        type="button"
        aria-label={t("history.searchLabel")}
        aria-expanded={open}
        aria-controls={inputId}
        className="flex h-11 w-11 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-white/5 hover:text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:scale-95"
        onPointerEnter={(event) => {
          if (
            event.pointerType !== "mouse" ||
            dismissed.current ||
            !window.matchMedia("(hover: hover) and (pointer: fine)").matches
          )
            return;
          setInstant(false);
          setOpen(true);
        }}
        onClick={(event) => {
          dismissed.current = false;
          setInstant(event.detail === 0);
          if (open) inputRef.current?.focus();
          else {
            focusOnOpen.current = true;
            setOpen(true);
          }
        }}
      >
        <Search size={17} aria-hidden="true" />
      </button>
      <div
        className={`${open ? "flex" : "hidden"} history-search-field col-span-3 col-start-1 row-start-2 min-w-0 items-center rounded-xl border border-line bg-white/[0.04] focus-within:border-memory/50 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:max-w-xs`}
        data-instant={instant || undefined}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label={t("history.searchLabel")}
          placeholder={t("history.searchPlaceholder")}
          className="history-search-input min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base text-ink-primary placeholder:text-ink-tertiary focus:outline-none sm:text-sm"
        />
        {query && (
          <button
            type="button"
            aria-label={t("history.clearSearch")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-secondary hover:text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => {
              onQueryChange("");
              inputRef.current?.focus();
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="col-start-3 row-start-1 text-right font-mono text-xs text-ink-tertiary lg:col-start-4"
      >
        {query.trim()
          ? t("history.matchingWeeksShown", { shown, total })
          : t("history.weeksShown", { shown, total })}
      </span>
    </div>
  );
}
