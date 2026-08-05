import React, { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/animation";

export type SwapMode = "LEFT" | "EATEN";

export interface DirectionalTextSwapProps {
  /** Active mode: "LEFT" (Calories/Macro Left) vs "EATEN" (Calories/Macro Eaten) */
  mode: SwapMode;
  /** Primary text/number value */
  value: React.ReactNode;
  /** Optional secondary label or subtext */
  label?: React.ReactNode;
  /** Optional third row/subtext */
  subtext?: React.ReactNode;
  /** Custom CSS classes for value */
  valueClassName?: string;
  /** Custom CSS classes for label */
  labelClassName?: string;
  /** Custom CSS classes for subtext */
  subtextClassName?: string;
  /** Outer container class name */
  className?: string;
  /** Animation duration in ms (default: 380) */
  durationMs?: number;
  /** Order of items: "label-first" or "value-first" */
  layout?: "label-first" | "value-first";
}

interface SlotItem {
  id: string;
  mode: SwapMode;
  value: React.ReactNode;
  label?: React.ReactNode;
  subtext?: React.ReactNode;
  animClass: string;
  isExiting: boolean;
}

export function DirectionalTextSwap({
  mode,
  value,
  label,
  subtext,
  valueClassName = "",
  labelClassName = "",
  subtextClassName = "",
  className = "",
  durationMs = 380,
  layout = "label-first",
}: DirectionalTextSwapProps) {
  const prevModeRef = useRef<SwapMode>(mode);
  const slotIdCounter = useRef(0);

  const [items, setItems] = useState<SlotItem[]>(() => [
    {
      id: `slot-${++slotIdCounter.current}`,
      mode,
      value,
      label,
      subtext,
      animClass: "",
      isExiting: false,
    },
  ]);

  const valueRef = useRef(value);
  valueRef.current = value;
  const labelRef = useRef(label);
  labelRef.current = label;
  const subtextRef = useRef(subtext);
  subtextRef.current = subtext;

  // Mode degisimi ve kalinti (exiting) oge temizlik zamanlayicisi:
  // value/label/subtext animasyon tiklerinden etkilenmemesi icin bagimliliklar ayrilmistir.
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      const prevMode = prevModeRef.current;
      prevModeRef.current = mode;

      const newSlotId = `slot-${++slotIdCounter.current}`;

      if (prefersReducedMotion()) {
        setItems([
          {
            id: newSlotId,
            mode,
            value: valueRef.current,
            label: labelRef.current,
            subtext: subtextRef.current,
            animClass: "",
            isExiting: false,
          },
        ]);
        return;
      }

      // Motion direction:
      // LEFT -> EATEN : Downward motion (dir = "down")
      // EATEN -> LEFT : Upward motion (dir = "up")
      const isDown = prevMode === "LEFT" && mode === "EATEN";
      const exitAnimClass = isDown ? "anim-swap-down-out" : "anim-swap-up-out";
      const enterAnimClass = isDown ? "anim-swap-down-in" : "anim-swap-up-in";

      setItems((prev) => {
        const exiting = prev.map((item) => ({
          ...item,
          isExiting: true,
          animClass: exitAnimClass,
        }));

        const entering: SlotItem = {
          id: newSlotId,
          mode,
          value: valueRef.current,
          label: labelRef.current,
          subtext: subtextRef.current,
          animClass: enterAnimClass,
          isExiting: false,
        };

        return [...exiting, entering];
      });

      // Clean up exiting slot after animation finishes
      const cleanupTimer = setTimeout(() => {
        setItems((prev) => prev.filter((item) => !item.isExiting));
      }, durationMs);

      return () => clearTimeout(cleanupTimer);
    }
  }, [mode, durationMs]);

  // Deger/etiket degistiginde aktif (exiting olmayan) ogenin icerigini guncelle
  useEffect(() => {
    setItems((prev) =>
      prev.map((item) => (!item.isExiting ? { ...item, value, label, subtext } : item))
    );
  }, [value, label, subtext]);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ "--swap-duration": `${durationMs}ms` } as React.CSSProperties}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={`w-full ${
            item.isExiting ? "absolute inset-0 pointer-events-none" : "relative"
          } ${item.animClass}`}
        >
          {layout === "label-first" ? (
            <>
              {item.label && <div className={labelClassName}>{item.label}</div>}
              <div className={valueClassName}>{item.value}</div>
              {item.subtext && <div className={subtextClassName}>{item.subtext}</div>}
            </>
          ) : (
            <>
              <div className={valueClassName}>{item.value}</div>
              {item.label && <div className={labelClassName}>{item.label}</div>}
              {item.subtext && <div className={subtextClassName}>{item.subtext}</div>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
