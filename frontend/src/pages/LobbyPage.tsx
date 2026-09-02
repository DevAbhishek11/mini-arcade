import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { GAME_LIST, type ArcadeStats, type GameCatalogEntry, type GameMode } from '@mini-arcade/shared';
import { QuestList } from '@/components/progress/QuestList';
import { StreakFlame } from '@/components/progress/StreakFlame';
import { XpBar } from '@/components/progress/XpBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardLabel } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { api } from '@/lib/api';
import { sound } from '@/lib/sound';
import { useArcade } from '@/store/arcade';
import { useProgression } from '@/store/progression';
import { toast } from '@/store/toast';

const GAME_ART: Record<string, string> = {
  'tic-tac-toe': '✕ ◯',
  'connect-four': '⬤ ⬤',
  gomoku: '⬤ ⬡',
  reversi: '◐ ◑',
  'dots-and-boxes': '⬚ ▪',
  pong: '▌ ●',
  'snake-duel': '⌇ ⌇',
};

type Filter = 'all' | GameMode | 'quick';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All games' },
  { id: 'turn-based', label: 'Turn based' },
  { id: 'realtime', label: 'Realtime' },
  { id: 'quick', label: 'Under 3 min' },
];

const DIFFICULTY_TONE = { easy: 'lime', medium: 'amber', hard: 'rose' } as const;

function matches(game: GameCatalogEntry, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'quick') return game.averageMinutes <= 3;
  return game.mode === filter;
}

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

function PrivateRoomCard() {
  const { joinRoom, room } = useArcade();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (room) navigate(`/play/${room.gameId}`);
  }, [room, navigate]);

  // Invite links look like `/?room=ABCDE` — join straight away, then clean the URL.
  useEffect(() => {
    const invite = new URLSearchParams(window.location.search).get('room');
    if (!invite) return;
    window.history.replaceState({}, '', window.location.pathname);
    void joinRoom(invite);
  }, [joinRoom]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.trim().length < 4) {
      toast.warning('That code looks short', 'Room codes are 5 characters.');
      return;
    }
    setBusy(true);
    await joinRoom(code);
    setBusy(false);
  };

  return (
    <Card>
      <CardLabel>Play with a friend</CardLabel>
      <h3 className="mt-1 text-lg font-bold">Join a private room</h3>
      <p className="mt-1.5 text-sm text-slate-400">
        Got a code? Drop it in. To host one, open a cabinet and hit <span className="text-white">Create room</span>.
      </p>
      <form className="mt-4 flex gap-2" onSubmit={submit}>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 5))}
          placeholder="ABCDE"
          aria-label="room code"
          className="h-11 w-full rounded-xl border border-white/8 bg-void-950/60 px-4 text-center font-mono text-lg uppercase tracking-[0.3em] outline-none transition-colors placeholder:text-slate-700 focus:border-neon-cyan/50"
        />
        <Button type="submit" loading={busy} disabled={!code.trim()}>
          Join
        </Button>
      </form>
    </Card>
  );
}

export function LobbyPage() {
  const stats = useArcade((s) => s.stats);
  const progress = useProgression((s) => s.progress);
  const [fallbackStats, setFallbackStats] = useState<ArcadeStats | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

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
  const games = useMemo(() => GAME_LIST.filter((game) => matches(game, filter)), [filter]);

  return (
    <div className="space-y-12">
      <section className="animate-[slide-up_0.5s_cubic-bezier(0.22,1,0.36,1)_both] text-center">
        <Badge tone="cyan" dot className="mb-5">
          7 games · realtime · server authoritative · elo rated
        </Badge>
        <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold leading-[1.05] sm:text-6xl">
          Drop a coin into the{' '}
          <span className="bg-gradient-to-r from-neon-cyan via-neon-violet to-neon-pink bg-clip-text text-transparent">
            Mini Arcade
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-slate-400">
          Seven cabinets, instant rating-based matchmaking, private rooms for friends and bots that actually play
          well. Earn XP, keep your streak alive and climb the ladder.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/play/snake-duel" onClick={() => sound.play('click')}>
            <Button size="lg">Quick play — Snake Duel</Button>
          </Link>
          <Link to="/achievements">
            <Button size="lg" variant="outline">
              Today&apos;s quests
            </Button>
          </Link>
        </div>
      </section>

      <section>
        <LiveStats stats={live} />
      </section>

      {progress && (
        <section className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardLabel>Your progress</CardLabel>
                <h2 className="mt-1 text-xl font-bold">Level {progress.level.level}</h2>
              </div>
              <StreakFlame days={progress.dailyStreak} />
            </div>
            <XpBar level={progress.level} />
            <div className="grid grid-cols-3 gap-3 pt-1">
              <Stat label="Matches today" value={progress.matchesToday} accent="#22d3ee" />
              <Stat label="Win streak" value={progress.winStreak} accent="#a3e635" />
              <Stat label="Badges" value={`${progress.achievements.length}/12`} accent="#a855f7" />
            </div>
          </Card>
          <Card>
            <div className="flex items-center justify-between">
              <CardLabel>Daily quests</CardLabel>
              <Link to="/achievements" className="text-xs text-neon-cyan hover:underline">
                all
              </Link>
            </div>
            <div className="mt-4">
              <QuestList />
            </div>
          </Card>
        </section>
      )}

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <CardLabel>Cabinets</CardLabel>
            <h2 className="mt-1 text-2xl font-bold">Choose your game</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setFilter(entry.id)}
                className={clsx(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  filter === entry.id
                    ? 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan'
                    : 'border-white/8 text-slate-400 hover:border-white/20 hover:text-white',
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game, index) => (
            <Link key={game.id} to={`/play/${game.id}`} className="group">
              <Card
                interactive
                glow={game.accent}
                className="flex h-full flex-col animate-[slide-up_0.5s_cubic-bezier(0.22,1,0.36,1)_both]"
                style={{ animationDelay: `${index * 60}ms` }}
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
                <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-400">{game.description}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone={DIFFICULTY_TONE[game.difficulty]}>{game.difficulty}</Badge>
                  <Badge>~{game.averageMinutes} min</Badge>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
                  <span className="font-mono text-xs text-slate-500">{live?.queued?.[game.id] ?? 0} in queue</span>
                  <span className="text-sm font-semibold text-white transition-transform duration-300 group-hover:translate-x-1">
                    Play →
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <PrivateRoomCard />
        <Card>
          <CardLabel>Not feeling competitive?</CardLabel>
          <h3 className="mt-1 text-lg font-bold">Practice against a bot</h3>
          <p className="mt-1.5 text-sm text-slate-400">
            Three difficulties, no rating at stake, and you still earn 40% XP. Open any cabinet and pick{' '}
            <span className="text-white">Practice</span> — chill for learning, brutal if you want to suffer.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {GAME_LIST.slice(0, 4).map((game) => (
              <Link key={game.id} to={`/play/${game.id}`}>
                <Button size="sm" variant="subtle">
                  {game.name}
                </Button>
              </Link>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        {[
          {
            title: 'Server authoritative',
            body: 'The same pure TypeScript engine runs on the server and in your browser. The server always has the final word, the client just predicts.',
          },
          {
            title: 'Built to scale',
            body: 'Clustered Node workers with sticky sessions, a Redis socket adapter and a two tier cache with stale-while-revalidate. Add containers, not complexity.',
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
