import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Base surface card: bg-surface + line border + card radius + soft shadow. */
export function Card({ children, className = "", ...rest }: CardProps) {
  return (
    <div
      className={`rounded-card border border-line bg-surface shadow-card ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
