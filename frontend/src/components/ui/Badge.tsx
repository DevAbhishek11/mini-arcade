import clsx from 'clsx';
import type { ReactNode } from 'react';

type Tone = 'neutral' | 'cyan' | 'violet' | 'pink' | 'lime' | 'amber' | 'rose';

const TONES: Record<Tone, string> = {
  neutral: 'bg-white/5 text-slate-300 border-white/10',
  cyan: 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/25',
  violet: 'bg-neon-violet/10 text-neon-violet border-neon-violet/25',
  pink: 'bg-neon-pink/10 text-neon-pink border-neon-pink/25',
  lime: 'bg-neon-lime/10 text-neon-lime border-neon-lime/25',
  amber: 'bg-neon-amber/10 text-neon-amber border-neon-amber/25',
  rose: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  dot,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
