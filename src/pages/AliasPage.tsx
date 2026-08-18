import { useState, useEffect } from "react";
import { Search, Camera, Plus, Utensils, BookOpen, X } from "lucide-react";
import { AliasForm } from "../components/AliasForm";
import { RecipeBuilder } from "../components/RecipeBuilder";
import { ScanSheet } from "../components/ScanSheet";
import type { AIParseItem } from "../types";
import { ConfirmButton, ErrorText } from "../components/FormBits";
import { formatNumber } from "../lib/format";
import { scaleNutrition } from "../lib/nutrition";
import { filterAliases } from "../lib/aliasFilter";
import { useData } from "../lib/data";
import { parseTemplatesConfig } from "../lib/templates";
import type { Alias } from "../types";
import { usePressSpring } from "../hooks/usePressSpring";

export function AliasPage({
  resetKey = 0,
  onVisionResult,
}: {
  resetKey?: number;
  /** Görsel/etiket taraması sonucu — App bunu global öğün formuna yönlendirir.
   *  Barkod yolu ScanSheet'in kendi içinde hafızaya kaydediyor, buraya düşmez. */
  onVisionResult: (items: AIParseItem[]) => void;
}) {
  const { aliases, removeAlias, config, updateConfig } = useData();
  const [editingAlias, setEditingAlias] = useState<Alias | null | undefined>(undefined);
  const [editingRecipe, setEditingRecipe] = useState<Alias | null | undefined>(undefined);
  const [showScan, setShowScan] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (resetKey > 0) {
      setEditingAlias(undefined);
      setEditingRecipe(undefined);
      setShowScan(false);
      setSearchQuery("");
    }
  }, [resetKey]);

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const press = usePressSpring({ pressScale: 0.98 });

  const filteredAliases = filterAliases(aliases, searchQuery);
  const templates = parseTemplatesConfig(config);

  async function remove(id: string) {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      await removeAlias(id);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function removeTemplate(id: string) {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      await updateConfig("templates", {
        list: templates.list.filter((x) => x.id !== id),
      });
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 text-white w-full min-w-0 max-w-full overflow-hidden">
      {/* Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between w-full min-w-0">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-white tracking-tight truncate">Besin Hafızası</h2>
          <p className="text-xs text-white/50 mt-0.5 truncate">
            Öğrenilmiş ifadeler → belirli besin & makrolar (örn. "yoğurt", "protein tozu")
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 w-full sm:flex sm:w-auto shrink-0">
          <button
            type="button"
            onClick={() => setShowScan(true)}
            className="px-2.5 py-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-[11px] sm:text-xs font-bold text-white transition active:scale-95 flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="truncate">Barkod</span>
          </button>
          <button
            type="button"
            onClick={() => setEditingRecipe(null)}
            className="px-2.5 py-2 rounded-full border border-memory/40 bg-memory/15 hover:bg-memory/25 text-[11px] sm:text-xs font-bold text-memory transition active:scale-95 flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Utensils className="w-3.5 h-3.5 text-memory shrink-0" />
            <span className="truncate">Tarif</span>
          </button>
          <button
            type="button"
            onClick={() => setEditingAlias(null)}
            className="px-2.5 py-2 rounded-full bg-white hover:bg-white/90 text-[11px] sm:text-xs font-extrabold text-black transition active:scale-95 flex items-center justify-center gap-1.5 whitespace-nowrap shadow-md"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Yeni Besin</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      {aliases.length > 0 && (
        <div className="relative w-full min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Besin adı, marka veya ifade ara..."
            className="w-full pl-10 pr-9 py-3 rounded-2xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-white placeholder:text-white/40 focus:border-carb focus:outline-none transition shadow-sm min-w-0"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white transition"
              title="Temizle"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {err && <ErrorText>{err}</ErrorText>}

      {/* Aliases Grid */}
      {aliases.length === 0 ? (
        <div className="anim-fadeup rounded-[24px] border border-white/10 bg-white/[0.03] p-8 text-center flex flex-col items-center gap-3 w-full">
          <BookOpen className="w-8 h-8 text-white/30" />
          <p className="text-sm font-semibold text-white/60">Henüz hafızada besin yok.</p>
          <p className="text-xs text-white/40">"+ Tarif Oluştur" veya "+ Yeni Besin" butonları ile ekleyebilirsin.</p>
        </div>
      ) : filteredAliases.length === 0 ? (
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-white/50 w-full">
          "{searchQuery}" aramasıyla eşleşen besin bulunamadı.
        </div>
      ) : (
        <div className="grid w-full min-w-0 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredAliases.map((a, i) => {
            const kcal100g = scaleNutrition(a.nutrition, a.serving_g, 100).kcal;
            return (
              <div
                key={a.id}
                onClick={() => {
                  if (a.recipe) setEditingRecipe(a);
                  else setEditingAlias(a);
                }}
                className="anim-fadeup rounded-[24px] bg-calCard p-3.5 sm:p-4 flex flex-col justify-between gap-3 transition-all hover:bg-cal-hover active:scale-[0.99] cursor-pointer shadow-card group w-full min-w-0 overflow-hidden spring-press"
                style={{ animationDelay: `${i * 25}ms`, ...press.style }}
                {...press.handlers}
              >
                <div className="space-y-2 min-w-0">
                  {/* Top Row: Name & Calorie Pill */}
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h4 className="font-extrabold text-white text-sm sm:text-base truncate group-hover:text-carb transition-colors" title={a.name}>
                          {a.name}
                        </h4>
                        {a.recipe && (
                          <span className="shrink-0 px-2 py-0.5 rounded-full bg-memory/20 text-memory border border-memory/30 text-[9px] font-mono font-bold">
                            tarif
                          </span>
                        )}
                      </div>

                      {a.brand && (
                        <p className="text-[11px] font-semibold text-white/40 truncate mt-0.5">
                          {a.brand}
                        </p>
                      )}
                    </div>

                    <span className="shrink-0 font-mono text-[10px] sm:text-[11px] font-bold text-carb bg-carb/10 px-2 py-0.5 rounded-full border border-carb/20 whitespace-nowrap">
                      {formatNumber(kcal100g)} kcal/100g
                    </span>
                  </div>

                  {/* Trigger Chips */}
                  {a.triggers && a.triggers.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-1 min-w-0 max-w-full overflow-hidden">
                      {a.triggers.slice(0, 3).map((tr, idx) => (
                        <span
                          key={idx}
                          className="inline-block max-w-full truncate px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-carb/10 text-carb border border-carb/20"
                          title={tr}
                        >
                          {tr}
                        </span>
                      ))}
                      {a.triggers.length > 3 && (
                        <span className="text-[10px] text-white/40 font-mono font-bold shrink-0">
                          +{a.triggers.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Actions — kart zaten tıklanınca düzenlemeyi açıyor, burada sadece silme kalır */}
                <div
                  className="flex items-center justify-end gap-2 border-t border-white/10 pt-2.5 w-full min-w-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ConfirmButton onConfirm={() => remove(a.id)} disabled={busy} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Templates Section */}
      <div className="space-y-3 border-t border-white/10 pt-6 w-full min-w-0">
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold text-white tracking-tight truncate">Şablonlar</h3>
          <p className="text-xs text-white/50 truncate">
            Sık tükettiğin öğünleri tek dokunuşla eklemek için kaydedilmiş şablonlar
          </p>
        </div>

        {templates.list.length === 0 ? (
          <p className="text-xs text-white/40">
            Henüz şablon yok. Bugün sekmesinde bir öğünü 'Şablon yap' diyerek kaydedebilirsin.
          </p>
        ) : (
          <div className="grid w-full min-w-0 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {templates.list.map((t, i) => (
              <div
                key={t.id}
                className="anim-fadeup rounded-[22px] border border-white/10 bg-white/[0.04] p-3.5 sm:p-4 flex flex-col justify-between gap-3 shadow-card w-full min-w-0 overflow-hidden"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <h4 className="font-bold text-white text-sm truncate flex-1 min-w-0" title={t.name}>
                    {t.name}
                  </h4>
                  <span className="shrink-0 font-mono text-xs font-bold text-white/60">
                    {t.items.length} kalem
                  </span>
                </div>

                <div className="flex items-center justify-end border-t border-white/10 pt-2 w-full">
                  <ConfirmButton onConfirm={() => removeTemplate(t.id)} disabled={busy} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingAlias !== undefined && <AliasForm initial={editingAlias} onClose={() => setEditingAlias(undefined)} />}
      {editingRecipe !== undefined && <RecipeBuilder initial={editingRecipe} onClose={() => setEditingRecipe(undefined)} />}
      {showScan && (
        <ScanSheet
          onClose={() => setShowScan(false)}
          onVisionResult={(items) => {
            setShowScan(false);
            onVisionResult(items);
          }}
        />
      )}
    </div>
  );
}
