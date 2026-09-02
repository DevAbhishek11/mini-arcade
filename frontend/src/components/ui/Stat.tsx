import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Stat({
  label,
  value,
  hint,
  accent,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: string;
  className?: string;
}) {
  return (
    <div className={clsx('rounded-xl border border-white/5 bg-void-900/60 px-4 py-3', className)}>
      <div className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div
        className="mt-1 font-display text-2xl font-bold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
