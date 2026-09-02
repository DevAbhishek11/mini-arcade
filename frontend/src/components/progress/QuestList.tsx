import clsx from 'clsx';
import { useProgression } from '@/store/progression';

/** Three daily quests that reroll every day — the "come back tomorrow" hook. */
export function QuestList({ limit }: { limit?: number }) {
  const quests = useProgression((s) => s.quests());
  const visible = limit ? quests.slice(0, limit) : quests;

  if (visible.length === 0) {
    return <p className="text-sm text-slate-500">Play a match to pick up today&apos;s quests.</p>;
  }

  return (
    <ul className="space-y-3">
      {visible.map((quest) => {
        const percent = Math.min(100, Math.round((quest.progress / quest.target) * 100));
        return (
          <li key={quest.id} className="flex items-center gap-3">
            <span
              className={clsx(
                'grid size-9 shrink-0 place-items-center rounded-xl border text-base',
                quest.completed ? 'border-neon-lime/40 bg-neon-lime/10' : 'border-white/8 bg-void-900/70',
              )}
            >
              {quest.completed ? '✓' : quest.def.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={clsx('truncate text-sm font-medium', quest.completed ? 'text-neon-lime' : 'text-white')}>
                  {quest.def.description}
                </span>
                <span className="font-mono text-[0.7rem] tabular-nums text-slate-500">
                  {Math.min(quest.progress, quest.target)}/{quest.target}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-void-800">
                <div
                  className={clsx(
                    'h-full rounded-full transition-[width] duration-500',
                    quest.completed ? 'bg-neon-lime' : 'bg-gradient-to-r from-neon-cyan to-neon-violet',
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
            <span className="shrink-0 font-mono text-[0.7rem] text-slate-500">+{quest.def.xp}</span>
          </li>
        );
      })}
    </ul>
  );
}
