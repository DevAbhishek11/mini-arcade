import clsx from 'clsx';
import type { LevelProgress } from '@mini-arcade/shared';

/** Level + XP bar. `compact` is the header variant, otherwise a full card row. */
export function XpBar({ level, compact = false }: { level: LevelProgress; compact?: boolean }) {
  const percent = Math.round(level.progress * 100);

  if (compact) {
    return (
      <div className="hidden items-center gap-2 sm:flex" title={`${level.xpIntoLevel} / ${level.xpForNext} XP`}>
        <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-neon-violet to-neon-pink font-display text-[0.7rem] font-bold text-void-950">
          {level.level}
        </span>
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-void-700">
          <span
            className="block h-full rounded-full bg-gradient-to-r from-neon-cyan to-neon-violet transition-[width] duration-700"
            style={{ width: `${percent}%` }}
          />
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-sm font-semibold text-white">Level {level.level}</span>
        <span className="font-mono text-xs tabular-nums text-slate-500">
          {level.xpIntoLevel} / {level.xpForNext} XP
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-void-800">
        <div
          className={clsx('h-full rounded-full bg-gradient-to-r from-neon-cyan via-neon-violet to-neon-pink transition-[width] duration-700')}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
