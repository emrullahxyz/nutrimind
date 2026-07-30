import { useState } from "react";
import { Card } from "../components/Card";
import { AliasForm } from "../components/AliasForm";
import { ConfirmButton, ErrorText, NutrientSummaryLine } from "../components/FormBits";
import { formatNumber } from "../lib/format";
import { useData } from "../lib/data";
import type { Alias } from "../types";

export function AliasPage() {
  const { aliases, removeAlias } = useData();
  // form kapalıyken undefined; yeni kayıt için null; düzenleme için Alias.
  const [editing, setEditing] = useState<Alias | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-primary">Besin hafızası</h2>
          <p className="text-sm text-ink-tertiary">
            Öğrenilmiş ifadeler → belirli besin. "yoğurt" dediğinde bu besin ve makrosu kullanılır.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="flex-none rounded-pill bg-memory px-3 py-1.5 text-xs font-extrabold text-memory-ink transition hover:opacity-90"
        >
          + Yeni besin
        </button>
      </div>

      {err && <ErrorText>{err}</ErrorText>}

      {aliases.length === 0 ? (
        <p className="text-sm text-ink-tertiary">Henüz alias yok. "+ Yeni besin" ile ekle.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {aliases.map((a, i) => (
            <Card key={a.id} className="anim-fadeup flex flex-col gap-3 p-4" style={{ animationDelay: `${i * 50}ms` }}>
              <div>
                <div className="text-sm font-bold text-ink-primary">{a.name}</div>
                {a.brand && <div className="text-[11px] text-ink-tertiary">{a.brand}</div>}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {a.triggers.map((t) => (
                  <span
                    key={t}
                    className="rounded-pill bg-memory/15 px-2.5 py-1 text-[11px] font-semibold text-memory"
                  >
                    {t}
                  </span>
                ))}
              </div>

              {a.units && a.units.length > 0 && (
                <div className="flex flex-wrap gap-1 text-[11px] font-mono text-ink-tertiary">
                  {a.units.map((u) => (
                    <span key={u.name} className="rounded bg-white/[0.04] px-1.5 py-0.5 border border-line/40">
                      1 {u.name} = {formatNumber(u.grams)} g
                    </span>
                  ))}
                </div>
              )}

              {/* Lif dahil TÜM makrolar — uygulamanın diğer özet satırlarıyla
                  aynı liste. `decimals={0}` bilinçli: 11px mono kartta tam sayı
                  okunuyor, "12,0 · 30,0" satırı gereksiz yere şişiriyordu. */}
              <NutrientSummaryLine
                nutrition={a.nutrition}
                decimals={0}
                kcal="inline"
                prefix={`${formatNumber(a.serving_g)} g · `}
                className="border-t border-line pt-2 font-mono text-[11px] text-ink-secondary"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(a)}
                  disabled={busy}
                  className="rounded-pill bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-ink-tertiary transition hover:text-ink-primary disabled:opacity-40"
                >
                  Düzenle
                </button>
                <ConfirmButton onConfirm={() => remove(a.id)} disabled={busy} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing !== undefined && <AliasForm initial={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
