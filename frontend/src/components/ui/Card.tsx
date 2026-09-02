import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  glow?: string;
}

export function Card({ interactive, glow, className, children, style, ...props }: CardProps) {
  return (
    <div
      {...props}
      style={{ ...style, ...(glow ? ({ '--glow': glow } as Record<string, string>) : {}) }}
      className={clsx('surface relative overflow-hidden p-6', interactive && 'surface-hover', className)}
    >
      {glow && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full opacity-25 blur-3xl transition-opacity duration-500 group-hover:opacity-45"
          style={{ background: glow }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={clsx('text-lg font-semibold', className)}>{children}</h3>;
}

export function CardLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">{children}</span>
  );
}
