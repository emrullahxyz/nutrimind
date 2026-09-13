import { useEffect, useState } from "react";
import { armGate, gateReact } from "../lib/pressGate";
import type { GateEvent, PressGate } from "../lib/pressGate";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Menüyü doğuran basışın `click`ini yutar (bkz. `lib/pressGate.ts`teki ölçülmüş
 * sızıntı notu ve kapının iki fazı).
 *
 * `pointerId` verilirse (uzun basma / sağ tık) kapı açılır; `null` ise (⋮
 * düğmesi, klavye) hiç kurulmaz — o yollarda basış zaten bitmiştir.
 *
 * Dönen `gated`, kapı açıkken `true` kalır; panel bu bayrağı kullanarak
 * altındaki satırın basılı/hover görünmesini bastırır (sızıntının görsel
 * yarısı).
 */
export function usePressGate(pointerId: number | null): { gated: boolean } {
  const [gated, setGated] = useState(false);

  useEffect(() => {
    if (pointerId === null || typeof window === "undefined") {
      setGated(false);
      return;
    }

    let gate: PressGate | null = armGate(pointerId);
    let timer: number | null = null;
    setGated(true);

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const apply = (event: GateEvent, domEvent: Event | null): void => {
      const result = gateReact(gate, event, now());
      gate = result.gate;
      if (!gate) {
        clearTimer();
        setGated(false);
      } else if (gate.released) {
        // İkinci faz: `click` hiç gelmezse kapı bu süre sonra kapanır — yoksa
        // panel sonsuza kadar "basılı" kalır ve satırlar ölü görünürdü.
        clearTimer();
        timer = window.setTimeout(() => {
          gate = null;
          setGated(false);
        }, gate.releaseMs);
      }
      if (result.swallow && domEvent) {
        domEvent.preventDefault();
        domEvent.stopPropagation();
      }
    };

    // Capture aşaması ŞART: React'in kök dinleyicisi kabarcık aşamasında
    // çalışır, yani yutma ondan ÖNCE olmalı.
    const onClick = (e: MouseEvent) => apply({ kind: "click", detail: e.detail }, e);
    const onPointerDown = (e: PointerEvent) =>
      apply({ kind: "pointerdown", pointerId: e.pointerId }, null);
    const onPointerUp = (e: PointerEvent) =>
      apply({ kind: "pointerup", pointerId: e.pointerId }, null);
    const onPointerCancel = (e: PointerEvent) =>
      apply({ kind: "pointercancel", pointerId: e.pointerId }, null);

    window.addEventListener("click", onClick, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);

    return () => {
      clearTimer();
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, [pointerId]);

  return { gated };
}
