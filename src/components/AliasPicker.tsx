import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Alias } from "../types";
import { filterAliases } from "../lib/aliasFilter";
import { buildUsageIndex, rankAliases } from "../lib/aliasRank";
import { useData } from "../lib/data";
import { todayISO, weekdayIndex } from "../lib/format";
import { effectiveProfile } from "../lib/goals";
import { Label, fieldCls } from "./FormBits";

export interface AliasPickerProps {
  aliases: Alias[];
  selectedAliasId: string;
  onSelectAlias: (id: string) => void;
  label?: string;
  mealIndex?: number;
}

export function AliasPicker({
  aliases,
  selectedAliasId,
  onSelectAlias,
  label = "Hafızadan besin seç",
  mealIndex = 0,
}: AliasPickerProps) {
  const { days, goals } = useData();
  const usageIndex = useMemo(() => buildUsageIndex(days, goals), [days, goals]);

  const selectedAlias = aliases.find((a) => a.id === selectedAliasId);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(selectedAlias?.name ?? "");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Seçili alias değiştiğinde veya menü kapalıyken kutuyu seçili besin adıyla senkronize et
  useEffect(() => {
    if (!isOpen) {
      setQuery(selectedAlias?.name ?? "");
    }
  }, [selectedAliasId, selectedAlias?.name, isOpen]);

  const filtered = filterAliases(aliases, query);
  const ranked = useMemo(() => {
    const today = todayISO();
    const ctx = {
      today,
      weekday: weekdayIndex(today),
      profileId: effectiveProfile(goals, today).id,
      mealIndex,
    };
    return rankAliases(filtered, usageIndex, ctx, query);
  }, [filtered, usageIndex, goals, mealIndex, query]);

  // Arama sorgusu değiştiğinde vurgulanan elemanı sıfırla
  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  // Vurgulanan elemanın görüş alanında olmasını sağla
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Dışarıya tıklanınca menüyü kapat
  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  function handleSelect(alias: Alias) {
    onSelectAlias(alias.id);
    setQuery(alias.name);
    setIsOpen(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (ranked.length > 0 ? (prev + 1) % ranked.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (ranked.length > 0 ? (prev - 1 + ranked.length) % ranked.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (ranked[highlightedIndex]) {
        handleSelect(ranked[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setQuery(selectedAlias?.name ?? "");
    }
  }

  return (
    <div ref={containerRef} className="relative block">
      <Label>{label}</Label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className={`${fieldCls} pr-8`}
          value={query}
          placeholder="Besin ara..."
          onFocus={(e) => {
            setIsOpen(true);
            e.target.select();
          }}
          onClick={(e) => {
            (e.target as HTMLInputElement).select();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {query && isOpen ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-tertiary hover:text-ink-primary"
          >
            ✕
          </button>
        ) : (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-tertiary">
            ▼
          </span>
        )}
      </div>

      {isOpen && (
        <ul
          ref={listRef}
          tabIndex={-1}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-chip border border-white/15 bg-[#191a22] p-1 shadow-2xl backdrop-blur-xl"
        >
          {ranked.length === 0 ? (
            <li className="px-3 py-2 text-xs text-ink-tertiary">Sonuç bulunamadı</li>
          ) : (
            ranked.map((alias, idx) => {
              const isSelected = alias.id === selectedAliasId;
              const isHighlighted = idx === highlightedIndex;

              return (
                <li
                  key={alias.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(alias);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`flex cursor-pointer items-center justify-between rounded px-3 py-2 text-xs transition ${
                    isHighlighted ? "bg-white/[0.08]" : ""
                  } ${isSelected ? "text-memory font-semibold" : "text-ink-primary"}`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="min-w-0 block truncate">{alias.name}</span>
                    {alias.brand && (
                      <span className="flex-none rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-ink-tertiary">
                        {alias.brand}
                      </span>
                    )}
                  </div>
                  {isSelected && <span className="ml-2 font-bold text-memory">✓</span>}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
