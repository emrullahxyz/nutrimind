import { useState } from "react";
import { Card } from "../components/Card";
import { AliasForm } from "../components/AliasForm";
import { ConfirmButton, ErrorText } from "../components/FormBits";
import { formatKcal, formatNumber } from "../lib/format";
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

              <div className="border-t border-line pt-2 font-mono text-[11px] text-ink-secondary">
                {formatNumber(a.serving_g)} g · {formatKcal(a.nutrition.kcal)}
                <span className="ml-2 text-ink-tertiary">
                  P{formatNumber(a.nutrition.protein)} · K{formatNumber(a.nutrition.carbs)} · Y
                  {formatNumber(a.nutrition.fat)}
                </span>
              </div>

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
