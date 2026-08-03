import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/animation";

interface RollValueProps {
  value: string;
}

// Dikey "çark" (odometer) geçişi: eski değer bir üst kademede kalıp yukarı kayarken
// yeni değer alttan kayarak girer. İki kare de aynı satır yüksekliğini miras aldığı
// için (bkz. src/index.css .roll-*) JS ile yükseklik ölçümü gerekmez.
export function RollValue({ value }: RollValueProps) {
  const committedRef = useRef(value);
  const idRef = useRef(0);
  const [prev, setPrev] = useState<string | null>(null);

  useEffect(() => {
    if (value === committedRef.current) return;
    const from = committedRef.current;
    committedRef.current = value;

    if (prefersReducedMotion()) {
      setPrev(null);
      return;
    }

    idRef.current += 1;
    setPrev(from);
  }, [value]);

  if (prev === null) {
    return <>{value}</>;
  }

  return (
    <span className="roll-viewport">
      <span key={idRef.current} className="roll-track" onAnimationEnd={() => setPrev(null)}>
        <span className="roll-frame">{prev}</span>
        <span className="roll-frame">{value}</span>
      </span>
    </span>
  );
}
