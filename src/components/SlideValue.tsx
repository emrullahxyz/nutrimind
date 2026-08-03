import { useEffect, useState } from "react";

interface SlideValueProps {
  value: string;
  className?: string;
}

export function SlideValue({ value, className = "" }: SlideValueProps) {
  const [currentVal, setCurrentVal] = useState(value);
  const [prevVal, setPrevVal] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (value !== currentVal) {
      setPrevVal(currentVal);
      setCurrentVal(value);
      setIsAnimating(true);

      const timer = setTimeout(() => {
        setPrevVal(null);
        setIsAnimating(false);
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [value, currentVal]);

  return (
    <div className="relative inline-flex overflow-hidden align-middle">
      {isAnimating && prevVal !== null && (
        <span
          className={`absolute left-0 top-0 pointer-events-none ${className}`}
          style={{ animation: "slideOutUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards" }}
        >
          {prevVal}
        </span>
      )}
      <span
        className={`inline-block ${className}`}
        style={{
          animation: isAnimating ? "slideInUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards" : "none",
        }}
      >
        {currentVal}
      </span>
    </div>
  );
}
