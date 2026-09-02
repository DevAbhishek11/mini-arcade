import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
      {icon && <div className="text-3xl opacity-60">{icon}</div>}
      <div>
        <p className="font-display font-semibold text-white">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}
