import { useEffect } from 'react';
import { GAME_CATALOG, type GameId } from '@mini-arcade/shared';
import { AchievementGrid } from '@/components/progress/AchievementGrid';
import { QuestList } from '@/components/progress/QuestList';
import { StreakFlame } from '@/components/progress/StreakFlame';
import { XpBar } from '@/components/progress/XpBar';
import { Card, CardLabel } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { useProgression } from '@/store/progression';

export function AchievementsPage() {
  const { progress, load } = useProgression();

  useEffect(() => {
    void load();
  }, [load]);

  const unlocked = progress?.achievements.length ?? 0;

  return (
    <div className="space-y-8">
      <section>
        <CardLabel>Your journey</CardLabel>
        <h1 className="mt-1 text-3xl font-bold">Quests &amp; achievements</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Every match earns XP. Daily quests reroll at midnight, streaks stack a bonus up to +50 XP per match,
          and achievements are permanent bragging rights.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardLabel>Progress</CardLabel>
                <h2 className="mt-1 text-xl font-bold">
                  {progress ? `Level ${progress.level.level}` : 'Level —'}
                </h2>
              </div>
              <StreakFlame days={progress?.dailyStreak ?? 0} />
            </div>
            {progress && <XpBar level={progress.level} />}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total XP" value={progress?.xp ?? '—'} accent="#22d3ee" />
              <Stat label="Best streak" value={progress?.longestStreak ?? '—'} accent="#fbbf24" />
              <Stat label="Win streak" value={progress?.winStreak ?? '—'} accent="#a3e635" />
              <Stat label="Badges" value={`${unlocked}/12`} accent="#a855f7" />
            </div>
          </Card>

          <section>
            <CardLabel>Badges</CardLabel>
            <div className="mt-3">
              <AchievementGrid unlocked={progress?.achievements ?? []} />
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardLabel>Today&apos;s quests</CardLabel>
            <div className="mt-4">
              <QuestList />
            </div>
          </Card>

          <Card>
            <CardLabel>Games mastered</CardLabel>
            <p className="mt-2 text-xs text-slate-500">
              Win at least once in every cabinet to unlock Polyglot.
            </p>
            <ul className="mt-3 space-y-1.5">
              {(Object.keys(GAME_CATALOG) as GameId[]).map((id) => {
                const won = progress?.gamesWon.includes(id) ?? false;
                return (
                  <li key={id} className="flex items-center justify-between text-sm">
                    <span className={won ? 'text-white' : 'text-slate-500'}>{GAME_CATALOG[id].name}</span>
                    <span className={won ? 'text-neon-lime' : 'text-slate-700'}>{won ? '✓' : '—'}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
