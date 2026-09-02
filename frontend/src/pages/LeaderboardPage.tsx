import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { GAME_LIST, type LeaderboardEntry } from '@mini-arcade/shared';
import { Avatar } from '@/components/ui/Avatar';
import { Card, CardLabel } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';

const TABS = [{ id: 'all', name: 'Overall' }, ...GAME_LIST.map((g) => ({ id: g.id, name: g.name }))];

const MEDALS = ['🥇', '🥈', '🥉'];

export function LeaderboardPage() {
  const [tab, setTab] = useState('all');
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const player = useSession((s) => s.player);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    api
      .leaderboard(tab, 50)
      .then((page) => !cancelled && setEntries(page.items))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <div className="space-y-6">
      <div>
        <CardLabel>Rankings</CardLabel>
        <h1 className="mt-1 text-3xl font-bold">The ladder</h1>
        <p className="mt-2 text-sm text-slate-400">
          Elo with a dynamic K factor. Cached for 15 seconds and invalidated the moment a match ends.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={clsx(
              'rounded-lg border px-3.5 py-2 text-sm font-medium transition-all',
              tab === entry.id
                ? 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan'
                : 'border-white/8 text-slate-400 hover:border-white/20 hover:text-white',
            )}
          >
            {entry.name}
          </button>
        ))}
      </div>

      <Card className="p-0">
        {error && <p className="p-6 text-sm text-rose-400">{error}</p>}

        {!entries && !error && (
          <div className="space-y-3 p-6">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        )}

        {entries && entries.length === 0 && (
          <EmptyState title="No ranked players yet" description="Finish a match to claim the top spot." />
        )}

        {entries && entries.length > 0 && (
          <div className="divide-y divide-white/5">
            <div className="grid grid-cols-[3rem_1fr_5rem_7rem] items-center gap-3 px-5 py-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:grid-cols-[3.5rem_1fr_6rem_9rem]">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Elo</span>
              <span className="text-right">W / L / D</span>
            </div>
            {entries.map((entry) => (
              <div
                key={entry.playerId}
                className={clsx(
                  'grid grid-cols-[3rem_1fr_5rem_7rem] items-center gap-3 px-5 py-3 transition-colors sm:grid-cols-[3.5rem_1fr_6rem_9rem]',
                  entry.playerId === player?.id ? 'bg-neon-cyan/5' : 'hover:bg-white/[0.03]',
                )}
              >
                <span className="font-display text-lg font-bold tabular-nums text-slate-400">
                  {MEDALS[entry.rank - 1] ?? entry.rank}
                </span>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar nickname={entry.nickname} avatar={entry.avatar} size="sm" />
                  <span className="truncate text-sm font-medium text-white">{entry.nickname}</span>
                  {entry.playerId === player?.id && (
                    <span className="rounded bg-neon-cyan/15 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase text-neon-cyan">
                      you
                    </span>
                  )}
                </div>
                <span className="text-right font-mono text-sm font-semibold tabular-nums text-neon-cyan">
                  {entry.rating}
                </span>
                <span className="text-right font-mono text-xs tabular-nums text-slate-500">
                  {entry.wins} / {entry.losses} / {entry.draws}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
