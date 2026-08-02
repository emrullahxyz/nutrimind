import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Base surface card: bg-surface + line border + card radius + soft shadow. */
export function Card({ children, className = "", ...rest }: CardProps) {
  return (
    <div
      className={`rounded-card border border-calBorder bg-calCard shadow-card backdrop-blur-sm ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
