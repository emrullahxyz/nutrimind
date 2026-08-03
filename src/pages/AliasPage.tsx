import { useState } from "react";
import { Search, Camera, Plus, Utensils, BookOpen, Trash2, Edit3, X } from "lucide-react";
import { AliasForm } from "../components/AliasForm";
import { RecipeBuilder } from "../components/RecipeBuilder";
import { ScanSheet } from "../components/ScanSheet";
import { ConfirmButton, ErrorText } from "../components/FormBits";
import { formatNumber } from "../lib/format";
import { scaleNutrition } from "../lib/nutrition";
import { filterAliases } from "../lib/aliasFilter";
import { useData } from "../lib/data";
import { parseTemplatesConfig } from "../lib/templates";
import type { Alias } from "../types";

export function AliasPage() {
  const { aliases, removeAlias, config, updateConfig } = useData();
  const [editingAlias, setEditingAlias] = useState<Alias | null | undefined>(undefined);
  const [editingRecipe, setEditingRecipe] = useState<Alias | null | undefined>(undefined);
  const [showScan, setShowScan] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <div className="flex flex-col gap-6 text-white">
      {/* Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">Besin Hafızası</h2>
          <p className="text-xs text-white/50 mt-0.5">
            Öğrenilmiş ifadeler → belirli besin & makrolar (örn. "yoğurt", "protein tozu")
          </p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            onClick={() => setShowScan(true)}
            className="px-3.5 py-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-white transition active:scale-95 flex items-center gap-1.5 whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5 text-sky-400" /> Barkod Tara
          </button>
          <button
            type="button"
            onClick={() => setEditingRecipe(null)}
            className="px-3.5 py-2 rounded-full border border-purple-500/40 bg-purple-500/15 hover:bg-purple-500/25 text-xs font-bold text-purple-300 transition active:scale-95 flex items-center gap-1.5 whitespace-nowrap"
          >
            <Utensils className="w-3.5 h-3.5 text-purple-400" /> Tarif Oluştur
          </button>
          <button
            type="button"
            onClick={() => setEditingAlias(null)}
            className="px-4 py-2 rounded-full bg-white hover:bg-white/90 text-xs font-extrabold text-black transition active:scale-95 flex items-center gap-1.5 whitespace-nowrap shadow-md"
          >
            <Plus className="w-3.5 h-3.5" /> Yeni Besin
          </button>
        </div>
      </div>

      {/* Search Input */}
      {aliases.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Besin adı, marka veya ifade ara..."
            className="w-full pl-10 pr-9 py-3 rounded-2xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none transition shadow-sm"
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
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-8 text-center flex flex-col items-center gap-3">
          <BookOpen className="w-8 h-8 text-white/30" />
          <p className="text-sm font-semibold text-white/60">Henüz hafızada besin yok.</p>
          <p className="text-xs text-white/40">"+ Tarif Oluştur" veya "+ Yeni Besin" butonları ile ekleyebilirsin.</p>
        </div>
      ) : filteredAliases.length === 0 ? (
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-white/50">
          "{searchQuery}" aramasıyla eşleşen besin bulunamadı.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredAliases.map((a, i) => {
            const kcal100g = scaleNutrition(a.nutrition, a.serving_g, 100).kcal;
            return (
              <div
                key={a.id}
                onClick={() => {
                  if (a.recipe) setEditingRecipe(a);
                  else setEditingAlias(a);
                }}
                className="anim-fadeup rounded-[24px] border border-white/10 bg-white/[0.04] p-4 sm:p-5 flex flex-col justify-between gap-3 transition-all hover:border-white/20 active:scale-[0.99] cursor-pointer shadow-card group"
                style={{ animationDelay: `${i * 25}ms` }}
              >
                <div className="space-y-2">
                  {/* Top Row: Name & Recipe badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-extrabold text-white text-base truncate group-hover:text-amber-300 transition-colors" title={a.name}>
                          {a.name}
                        </h4>
                        {a.recipe && (
                          <span className="shrink-0 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-mono font-bold">
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

                    <span className="shrink-0 font-mono text-xs font-bold text-amber-400 whitespace-nowrap">
                      {formatNumber(kcal100g)} kcal/100g
                    </span>
                  </div>

                  {/* Trigger Chips */}
                  {a.triggers && a.triggers.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {a.triggers.slice(0, 3).map((tr, idx) => (
                        <span
                          key={idx}
                          className="inline-block max-w-[120px] truncate px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400/10 text-amber-300 border border-amber-400/20"
                          title={tr}
                        >
                          {tr}
                        </span>
                      ))}
                      {a.triggers.length > 3 && (
                        <span className="text-[10px] text-white/40 font-mono font-bold">
                          +{a.triggers.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div
                  className="flex items-center justify-end gap-2 border-t border-white/10 pt-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (a.recipe) setEditingRecipe(a);
                      else setEditingAlias(a);
                    }}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition disabled:opacity-40 flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3 text-white/70" /> {a.recipe ? "Tarifi Düzenle" : "Düzenle"}
                  </button>
                  <ConfirmButton onConfirm={() => remove(a.id)} disabled={busy} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Templates Section */}
      <div className="space-y-3 border-t border-white/10 pt-6">
        <div>
          <h3 className="text-lg font-extrabold text-white tracking-tight">Şablonlar</h3>
          <p className="text-xs text-white/50">
            Sık tükettiğin öğünleri tek dokunuşla eklemek için kaydedilmiş şablonlar
          </p>
        </div>

        {templates.list.length === 0 ? (
          <p className="text-xs text-white/40">
            Henüz şablon yok. Bugün sekmesinde bir öğünü 'Şablon yap' diyerek kaydedebilirsin.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {templates.list.map((t, i) => (
              <div
                key={t.id}
                className="anim-fadeup rounded-[24px] border border-white/10 bg-white/[0.04] p-4 flex flex-col justify-between gap-3 shadow-card"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-bold text-white text-sm truncate" title={t.name}>
                    {t.name}
                  </h4>
                  <span className="shrink-0 font-mono text-xs font-bold text-white/60">
                    {t.items.length} kalem
                  </span>
                </div>

                <div className="flex items-center justify-end border-t border-white/10 pt-2">
                  <ConfirmButton onConfirm={() => removeTemplate(t.id)} disabled={busy} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingAlias !== undefined && <AliasForm initial={editingAlias} onClose={() => setEditingAlias(undefined)} />}
      {editingRecipe !== undefined && <RecipeBuilder initial={editingRecipe} onClose={() => setEditingRecipe(undefined)} />}
      {showScan && <ScanSheet onClose={() => setShowScan(false)} />}
    </div>
  );
}
