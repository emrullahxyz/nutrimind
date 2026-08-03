import { useState } from "react";
import { Card } from "../components/Card";
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
  // form kapalıyken undefined; yeni kayıt için null; düzenleme için Alias.
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink-primary">Besin hafızası</h2>
          <p className="text-xs text-ink-tertiary">
            Öğrenilmiş ifadeler → belirli besin. "yoğurt" dediğinde bu besin ve makrosu kullanılır.
          </p>
        </div>
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:overflow-visible">
          <button
            type="button"
            onClick={() => setShowScan(true)}
            className="flex-none rounded-pill border border-line bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-ink-secondary transition hover:border-memory/40 hover:bg-white/[0.09] hover:text-ink-primary"
          >
            📷 Tara
          </button>
          <button
            type="button"
            onClick={() => setEditingRecipe(null)}
            className="flex-none rounded-pill bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-ink transition hover:opacity-90"
          >
            + Tarif oluştur
          </button>
          <button
            type="button"
            onClick={() => setEditingAlias(null)}
            className="flex-none rounded-pill bg-memory px-3 py-1.5 text-xs font-extrabold text-memory-ink transition hover:opacity-90"
          >
            + Yeni besin
          </button>
        </div>
      </div>

      {aliases.length > 0 && (
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Besin adı, marka veya ifade ara..."
            className="w-full rounded-chip border border-line bg-white/[0.03] px-3.5 py-2 text-xs text-ink-primary placeholder:text-ink-tertiary focus:border-memory/50 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-tertiary hover:text-ink-primary"
              title="Aramayı temizle"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {err && <ErrorText>{err}</ErrorText>}

      {aliases.length === 0 ? (
        <p className="text-sm text-ink-tertiary">Henüz alias yok. "+ Tarif oluştur" veya "+ Yeni besin" ile ekle.</p>
      ) : filteredAliases.length === 0 ? (
        <p className="text-sm text-ink-tertiary">"{searchQuery}" için sonuç bulunamadı.</p>
      ) : (
        <div className="grid w-full min-w-0 max-w-full gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredAliases.map((a, i) => {
            const kcal100g = scaleNutrition(a.nutrition, a.serving_g, 100).kcal;
            return (
              <Card
                key={a.id}
                onClick={() => {
                  if (a.recipe) setEditingRecipe(a);
                  else setEditingAlias(a);
                }}
                className="anim-fadeup flex w-full min-w-0 max-w-full flex-col justify-between gap-2.5 p-3 overflow-hidden cursor-pointer hover:border-memory/50 transition group"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div>
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="min-w-0 block truncate text-xs font-bold text-ink-primary group-hover:text-memory transition-colors" title={a.name}>
                          {a.name}
                        </span>
                        {a.recipe && (
                          <span className="shrink-0 rounded-pill bg-accent/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-accent">
                            tarif
                          </span>
                        )}
                      </div>

                      {/* Besin Adının Altında İfadeler (İlk 3 İfade) */}
                      {a.triggers && a.triggers.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {a.triggers.slice(0, 3).map((tr, idx) => (
                            <span
                              key={idx}
                              className="inline-block max-w-[110px] truncate rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary border border-white/5"
                              title={tr}
                            >
                              {tr}
                            </span>
                          ))}
                        </div>
                      )}

                      {a.brand && <div className="mt-0.5 truncate text-[10px] text-ink-tertiary">{a.brand}</div>}
                    </div>
                    <div className="shrink-0 font-mono text-[11px] font-semibold text-ink-secondary whitespace-nowrap">
                      {formatNumber(kcal100g)} kcal/100g
                    </div>
                  </div>
                </div>

                <div
                  className="flex flex-wrap items-center justify-end gap-1.5 border-t border-line/40 pt-2"
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
                    className="rounded-pill bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-ink-tertiary transition hover:text-ink-primary disabled:opacity-40"
                  >
                    {a.recipe ? "Tarifi düzenle" : "Düzenle"}
                  </button>
                  <ConfirmButton onConfirm={() => remove(a.id)} disabled={busy} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t border-line/40 pt-4">
        <div>
          <h2 className="text-lg font-bold text-ink-primary">Şablonlar</h2>
          <p className="text-sm text-ink-tertiary">
            Sık tükettiğin öğünleri tek dokunuşla eklemek için kaydedilmiş şablonlar.
          </p>
        </div>

        {templates.list.length === 0 ? (
          <p className="text-sm text-ink-tertiary">
            Henüz şablon yok. Bir öğünü Bugün ekranında 'Şablon yap' ile kaydedebilirsin.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {templates.list.map((t, i) => (
              <Card key={t.id} className="anim-fadeup flex flex-col justify-between gap-2.5 p-3.5" style={{ animationDelay: `${i * 30}ms` }}>
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink-primary" title={t.name}>
                        {t.name}
                      </span>
                    </div>
                    <div className="shrink-0 font-mono text-xs font-semibold text-ink-secondary">
                      {t.items.length} kalem
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-line/40 pt-2">
                  <ConfirmButton onConfirm={() => removeTemplate(t.id)} disabled={busy} />
                </div>
              </Card>
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
