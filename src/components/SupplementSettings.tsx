import { useState } from "react";
import { useData } from "../lib/data";
import { ConfirmButton, ErrorText, TextField } from "./FormBits";
import {
  newSupplementId,
  parseSupplementsConfig,
  type SupplementItem,
} from "../lib/supplements";

export function SupplementSettings() {
  const { config, updateConfig } = useData();
  const suppConfig = parseSupplementsConfig(config);
  const { items, log } = suppConfig;

  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErr("Takviye adı zorunludur.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setErr(null);

    try {
      const newItem: SupplementItem = {
        id: newSupplementId(),
        name: trimmedName,
        ...(dose.trim() ? { dose: dose.trim() } : {}),
      };
      const nextItems = [...items, newItem];
      await updateConfig("supplements", { items: nextItems, log });
      setName("");
      setDose("");
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);

    try {
      const nextItems = items.filter((item) => item.id !== id);
      const nextLog: Record<string, string[]> = {};
      for (const [date, ids] of Object.entries(log)) {
        const filtered = ids.filter((suppId) => suppId !== id);
        if (filtered.length > 0) {
          nextLog[date] = filtered;
        }
      }
      await updateConfig("supplements", { items: nextItems, log: nextLog });
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Mevcut Takviyeler Listesi */}
      <div className="flex flex-col gap-2.5">
        <h4 className="font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">
          Tanımlı Takviyeler ({items.length})
        </h4>

        {items.length === 0 ? (
          <p className="text-xs text-ink-tertiary">Henüz tanımlı takviye yok.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-chip border border-line bg-white/[0.03] p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline gap-2 min-w-0">
                  <span className="font-semibold text-ink-primary">{item.name}</span>
                  {item.dose && (
                    <span className="font-mono text-xs text-ink-tertiary">({item.dose})</span>
                  )}
                </div>
                <ConfirmButton
                  onConfirm={() => handleDelete(item.id)}
                  disabled={busy}
                  label="Sil"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Yeni Takviye Ekleme Formu */}
      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <h4 className="font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">
          Yeni Takviye Ekle
        </h4>

        <div className="flex flex-col gap-3">
          <TextField
            label="Takviye Adı"
            value={name}
            onChange={(v) => {
              setName(v);
              if (err) setErr(null);
            }}
            placeholder="örn. D3-K2 Damla, Omega 3, Magnezyum"
          />
          <TextField
            label="Doz (opsiyonel)"
            value={dose}
            onChange={(v) => {
              setDose(v);
              if (err) setErr(null);
            }}
            placeholder="örn. 1000 IU, 500 mg, 1 ölçek"
          />

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleAdd}
              disabled={busy || !name.trim()}
              className="rounded-pill bg-accent px-4 py-2 text-xs font-extrabold text-accent-ink transition disabled:opacity-40"
            >
              {busy ? "…" : "+ Ekle"}
            </button>
          </div>
        </div>
      </div>

      {err && <ErrorText>{err}</ErrorText>}
    </div>
  );
}
