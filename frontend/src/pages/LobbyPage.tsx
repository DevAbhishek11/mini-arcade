import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GAME_LIST, type ArcadeStats } from '@mini-arcade/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardLabel } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { api } from '@/lib/api';
import { useArcade } from '@/store/arcade';

const GAME_ART: Record<string, string> = {
  'tic-tac-toe': '✕ ◯',
  'connect-four': '⬤ ⬤',
  pong: '▌ ●',
};

function LiveStats({ stats }: { stats: ArcadeStats | null }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Players online" value={stats?.playersOnline ?? '—'} accent="#22d3ee" />
      <Stat label="Live matches" value={stats?.matchesInProgress ?? '—'} accent="#a855f7" />
      <Stat label="Matches today" value={stats?.matchesToday ?? '—'} accent="#f472b6" />
      <Stat label="Registered" value={stats?.totalPlayers ?? '—'} accent="#a3e635" />
    </div>
  );
}

export function LobbyPage() {
  const stats = useArcade((s) => s.stats);
  const [fallbackStats, setFallbackStats] = useState<ArcadeStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .stats()
      .then((value) => !cancelled && setFallbackStats(value))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const live = stats ?? fallbackStats;

  return (
    <div className="space-y-12">
      <section className="animate-[slide-up_0.5s_cubic-bezier(0.22,1,0.36,1)_both] text-center">
        <Badge tone="cyan" dot className="mb-5">
          realtime · server authoritative · elo rated
        </Badge>
        <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold leading-[1.05] sm:text-6xl">
          Drop a coin into the{' '}
          <span className="bg-gradient-to-r from-neon-cyan via-neon-violet to-neon-pink bg-clip-text text-transparent">
            Mini Arcade
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-slate-400">
          Pick a cabinet, get matched by rating in seconds, and play against a real opponent over websockets.
          Every move is validated on the server — no cheating, no desync.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/play/pong">
            <Button size="lg">Quick play — Neon Pong</Button>
          </Link>
          <Link to="/leaderboard">
            <Button size="lg" variant="outline">
              View the ladder
            </Button>
          </Link>
        </div>
      </section>

      <section>
        <LiveStats stats={live} />
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between">
          <div>
            <CardLabel>Cabinets</CardLabel>
            <h2 className="mt-1 text-2xl font-bold">Choose your game</h2>
          </div>
          <span className="text-sm text-slate-500">{GAME_LIST.length} available</span>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GAME_LIST.map((game, index) => (
            <Link key={game.id} to={`/play/${game.id}`} className="group">
              <Card
                interactive
                glow={game.accent}
                className="h-full animate-[slide-up_0.5s_cubic-bezier(0.22,1,0.36,1)_both]"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div className="flex items-start justify-between">
                  <span
                    className="font-display text-3xl tracking-tighter transition-transform duration-500 group-hover:scale-110"
                    style={{ color: game.accent }}
                  >
                    {GAME_ART[game.id] ?? '★'}
                  </span>
                  <Badge tone={game.mode === 'realtime' ? 'pink' : 'violet'}>
                    {game.mode === 'realtime' ? `${game.tickRate} Hz` : 'turn based'}
                  </Badge>
                </div>

                <h3 className="mt-6 text-xl font-bold">{game.name}</h3>
                <p className="mt-1 text-sm font-medium" style={{ color: game.accent }}>
                  {game.tagline}
                </p>
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-400">{game.description}</p>

                <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4">
                  <span className="font-mono text-xs text-slate-500">
                    {live?.queued?.[game.id] ?? 0} in queue
                  </span>
                  <span className="text-sm font-semibold text-white transition-transform duration-300 group-hover:translate-x-1">
                    Play →
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        {[
          {
            title: 'Server authoritative',
            body: 'The same pure TypeScript engine runs on the server and in your browser. The server always has the final word, the client just predicts.',
          },
          {
            title: 'Built to scale',
            body: 'Clustered Node workers with sticky sessions, a Redis socket adapter and a two tier cache. Add containers, not complexity.',
          },
          {
            title: 'Fair by design',
            body: 'Elo with a dynamic K factor, rating-aware matchmaking that widens as you wait, and turn clocks that punish stalling.',
          },
        ].map((item) => (
          <Card key={item.title} className="p-5">
            <h3 className="text-base font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.body}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
