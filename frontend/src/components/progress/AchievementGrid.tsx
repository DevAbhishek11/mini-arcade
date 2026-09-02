import clsx from 'clsx';
import { ACHIEVEMENT_LIST, type UnlockedAchievement } from '@mini-arcade/shared';

const TIER_RING: Record<string, string> = {
  bronze: 'border-amber-700/40 bg-amber-900/10',
  silver: 'border-slate-400/30 bg-slate-400/5',
  gold: 'border-neon-amber/40 bg-neon-amber/10',
};

export function AchievementGrid({ unlocked }: { unlocked: UnlockedAchievement[] }) {
  const map = new Map(unlocked.map((entry) => [entry.id, entry.unlockedAt]));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ACHIEVEMENT_LIST.map((achievement) => {
        const at = map.get(achievement.id);
        const isUnlocked = Boolean(at);
        return (
          <div
            key={achievement.id}
            className={clsx(
              'flex items-start gap-3 rounded-xl border p-3.5 transition-colors',
              isUnlocked ? TIER_RING[achievement.tier] : 'border-white/5 bg-void-900/40',
            )}
          >
            <span className={clsx('text-2xl leading-none', !isUnlocked && 'opacity-25 grayscale')}>
              {achievement.icon}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={clsx('text-sm font-semibold', isUnlocked ? 'text-white' : 'text-slate-500')}>
                  {achievement.name}
                </span>
                <span className="font-mono text-[0.65rem] uppercase tracking-wider text-slate-600">
                  {achievement.tier}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{achievement.description}</p>
              <p className="mt-1 font-mono text-[0.65rem] text-slate-600">
                {isUnlocked ? `unlocked ${new Date(at as string).toLocaleDateString()}` : `+${achievement.xp} XP`}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
