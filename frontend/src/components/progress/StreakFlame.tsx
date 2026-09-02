import clsx from 'clsx';

/** Daily streak indicator — loss aversion is the strongest retention lever. */
export function StreakFlame({ days, className }: { days: number; className?: string }) {
  const hot = days >= 3;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums',
        hot
          ? 'border-neon-amber/30 bg-neon-amber/10 text-neon-amber'
          : 'border-white/10 bg-white/5 text-slate-400',
        className,
      )}
      title={days > 0 ? `${days} day streak — play today to keep it` : 'Play a match to start a streak'}
    >
      <span className={clsx(hot && 'animate-[float_2.4s_ease-in-out_infinite]')}>{hot ? '🔥' : '🕯️'}</span>
      {days}
    </span>
  );
}
