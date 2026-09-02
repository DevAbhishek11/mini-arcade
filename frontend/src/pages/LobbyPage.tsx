import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  GAME_LIST,
  type ArcadeStats,
  type GameCatalogEntry,
  type GameId,
  type GameMode,
} from '@mini-arcade/shared';
import { HeroDemo } from '@/components/HeroDemo';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { QuestList } from '@/components/progress/QuestList';
import { StreakFlame } from '@/components/progress/StreakFlame';
import { XpBar } from '@/components/progress/XpBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardLabel } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { api } from '@/lib/api';
import { useOnline } from '@/lib/online';
import { sound } from '@/lib/sound';
import { soloStats } from '@/lib/solo-stats';
import { useArcade } from '@/store/arcade';
import { useProgression } from '@/store/progression';
import { toast } from '@/store/toast';

const ART: Record<GameId, string> = {
  'tic-tac-toe': '/art/tic-tac-toe.webp',
  'connect-four': '/art/connect-four.webp',
  gomoku: '/art/gomoku.webp',
  reversi: '/art/reversi.webp',
  'dots-and-boxes': '/art/dots-and-boxes.webp',
  pong: '/art/pong.webp',
  'snake-duel': '/art/snake-duel.webp',
};

type Filter = 'all' | GameMode | 'quick';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All games' },
  { id: 'turn-based', label: 'Turn based' },
  { id: 'realtime', label: 'Realtime' },
  { id: 'quick', label: 'Under 3 min' },
];

const DIFFICULTY_TONE = { easy: 'lime', medium: 'amber', hard: 'rose' } as const;

function matchesFilter(game: GameCatalogEntry, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'quick') return game.averageMinutes <= 3;
  return game.mode === filter;
}

/* ------------------------------ hero elements ----------------------------- */

/** Counts up when it scrolls into view — cheap, no dependency, respects reduced motion. */
function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // easeOutCubic
      setDisplay(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {display.toLocaleString()}
    </span>
  );
}

/**
 * A real, playable tic-tac-toe board embedded in the hero. It runs the shared
 * engine with a deliberately beatable opponent, so the very first interaction
 * on the page is playing a game rather than reading about one.
 */

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
        Got a code? Drop it in. To host one, open a cabinet and hit{' '}
        <span className="text-white">Create room</span>.
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

const FAQ = [
  {
    q: 'Do I need an account?',
    a: 'No. You get a guest profile with a nickname and an Elo rating the moment you land. Rename it any time from your profile.',
  },
  {
    q: 'What happens if I lose connection mid-match?',
    a: 'The server keeps your seat warm for a grace period and replays the authoritative state when you reconnect. Nothing is lost.',
  },
  {
    q: 'Can I play with no internet at all?',
    a: 'Yes. Install the app and solo mode keeps working offline — the same rules engine and the same bot, running in your browser.',
  },
  {
    q: 'Are the bots cheating?',
    a: 'They see exactly what you see. Chill makes real mistakes, Sharp plays the obvious best move, Brutal searches ahead.',
  },
];

/* ---------------------------------- page ---------------------------------- */

export function LobbyPage() {
  const stats = useArcade((s) => s.stats);
  const progress = useProgression((s) => s.progress);
  const online = useOnline();
  const [fallbackStats, setFallbackStats] = useState<ArcadeStats | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

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
  const games = useMemo(() => GAME_LIST.filter((game) => matchesFilter(game, filter)), [filter]);
  const solo = useMemo(() => soloStats.totals(), []);

  return (
    <div className="space-y-16 pb-8">
      {/* ------------------------------- hero ------------------------------- */}
      <section className="relative -mx-4 overflow-hidden px-4 pb-10 pt-6 sm:-mx-6 sm:px-6">
        <img
          src="/art/hero.webp"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full object-cover opacity-45 [mask-image:radial-gradient(ellipse_75%_75%_at_50%_35%,#000_35%,transparent_100%)]"
          fetchPriority="high"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-void-950/40 to-void-950" />

        <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_auto]">
          <div className="animate-[slide-up_0.5s_cubic-bezier(0.22,1,0.36,1)_both] text-center lg:text-left">
            <Badge tone="cyan" dot className="mb-5">
              {online ? '7 games · realtime · elo rated' : 'offline mode · solo play ready'}
            </Badge>
            <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold leading-[1.03] sm:text-6xl lg:mx-0">
              Real opponents.{' '}
              <span className="bg-gradient-to-r from-neon-cyan via-neon-violet to-neon-pink bg-clip-text text-transparent">
                Real stakes.
              </span>{' '}
              Sixty seconds away.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-slate-400 lg:mx-0">
              Seven classic cabinets with instant rating-based matchmaking, private rooms for friends, bots that
              actually play well — and a full offline mode when the wifi gives up.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link to="/play/snake-duel" onClick={() => sound.play('click')}>
                <Button size="lg">Play now — it&apos;s free</Button>
              </Link>
              <Link to="/solo/tic-tac-toe">
                <Button size="lg" variant="outline">
                  Play offline solo
                </Button>
              </Link>
            </div>

            <dl className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm lg:justify-start">
              {[
                { label: 'games', value: 7 },
                { label: 'matches played', value: (live?.matchesToday ?? 0) + (solo.played || 0) },
                { label: 'players registered', value: live?.totalPlayers ?? 0 },
              ].map((entry) => (
                <div key={entry.label} className="flex items-baseline gap-2">
                  <dd className="font-display text-2xl font-bold text-white">
                    <CountUp value={entry.value} />
                  </dd>
                  <dt className="text-xs uppercase tracking-wider text-slate-500">{entry.label}</dt>
                </div>
              ))}
            </dl>
          </div>

          <Card className="mx-auto w-full max-w-xs animate-[slide-up_0.6s_cubic-bezier(0.22,1,0.36,1)_0.1s_both] p-5">
            <div className="flex items-center justify-between">
              <CardLabel>Try it right here</CardLabel>
              <Badge tone="lime" dot>
                live
              </Badge>
            </div>
            <div className="mt-4 flex justify-center">
              <HeroDemo />
            </div>
          </Card>
        </div>
      </section>

      <InstallPrompt />

      <section>
        <LiveStats stats={live} />
      </section>

      {/* ---------------------------- progression --------------------------- */}
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

      {/* ------------------------------ cabinets ---------------------------- */}
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
            <article
              key={game.id}
              className="group relative animate-[slide-up_0.5s_cubic-bezier(0.22,1,0.36,1)_both] overflow-hidden rounded-[--radius-card] border border-white/5 bg-void-900/70 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/15"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <Link to={`/play/${game.id}`} className="block">
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img
                    src={ART[game.id]}
                    alt={`${game.name} artwork`}
                    loading="lazy"
                    width={640}
                    height={400}
                    className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-void-900 via-void-900/25 to-transparent" />
                  <div className="absolute left-4 top-4 flex gap-2">
                    <Badge tone={game.mode === 'realtime' ? 'pink' : 'violet'}>
                      {game.mode === 'realtime' ? `${game.tickRate} Hz` : 'turn based'}
                    </Badge>
                  </div>
                  <div className="absolute bottom-3 left-4 right-4">
                    <h3 className="text-xl font-bold text-white drop-shadow">{game.name}</h3>
                    <p className="text-sm font-medium" style={{ color: game.accent }}>
                      {game.tagline}
                    </p>
                  </div>
                </div>
              </Link>

              <div className="p-4">
                <p className="line-clamp-2 text-sm leading-relaxed text-slate-400">{game.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone={DIFFICULTY_TONE[game.difficulty]}>{game.difficulty}</Badge>
                  <Badge>~{game.averageMinutes} min</Badge>
                  <Badge>{live?.queued?.[game.id] ?? 0} queued</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link to={`/play/${game.id}`}>
                    <Button size="sm" className="w-full">
                      Play online
                    </Button>
                  </Link>
                  <Link to={`/solo/${game.id}`}>
                    <Button size="sm" variant="outline" className="w-full">
                      Solo
                    </Button>
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ------------------------------- modes ------------------------------ */}
      <section>
        <CardLabel>Four ways to play</CardLabel>
        <h2 className="mt-1 text-2xl font-bold">However you feel like playing</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: '⚡',
              title: 'Quick match',
              body: 'Rated, matched by Elo in seconds. A bot steps in if the arcade is quiet.',
              to: '/play/pong',
              cta: 'Find a match',
            },
            {
              icon: '🤝',
              title: 'Private room',
              body: 'Share a 5-character code or an invite link. No rating, no strangers.',
              to: '/play/connect-four',
              cta: 'Create a room',
            },
            {
              icon: '🤖',
              title: 'Practice',
              body: 'Three bot difficulties, unrated, still earns 40% XP toward your quests.',
              to: '/play/gomoku',
              cta: 'Train up',
            },
            {
              icon: '📴',
              title: 'Solo & offline',
              body: 'Same engines in your browser. Pass-and-play on one device, or vs the bot.',
              to: '/solo/reversi',
              cta: 'Play offline',
            },
          ].map((mode) => (
            <Card key={mode.title} interactive className="flex h-full flex-col p-5">
              <span className="text-3xl">{mode.icon}</span>
              <h3 className="mt-4 text-base font-semibold">{mode.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{mode.body}</p>
              <Link to={mode.to} className="mt-4 text-sm font-semibold text-neon-cyan hover:underline">
                {mode.cta} →
              </Link>
            </Card>
          ))}
        </div>
      </section>

      {/* ------------------------------ friends ----------------------------- */}
      <section className="grid gap-5 md:grid-cols-2">
        <PrivateRoomCard />
        <Card className="relative overflow-hidden">
          <CardLabel>Offline record</CardLabel>
          <h3 className="mt-1 text-lg font-bold">Your solo results</h3>
          <p className="mt-1.5 text-sm text-slate-400">
            Stored on this device, no account needed. Great for the tube, a flight, or a flaky café wifi.
          </p>
          <div className="mt-4 grid grid-cols-4 gap-2">
            <Stat label="Played" value={solo.played} accent="#22d3ee" />
            <Stat label="Won" value={solo.wins} accent="#a3e635" />
            <Stat label="Drawn" value={solo.draws} accent="#fbbf24" />
            <Stat label="Best run" value={solo.bestStreak} accent="#a855f7" />
          </div>
          <Link to="/solo/snake-duel" className="mt-4 inline-block">
            <Button size="sm" variant="subtle">
              Start a solo match
            </Button>
          </Link>
        </Card>
      </section>

      {/* ---------------------------- how it works -------------------------- */}
      <section>
        <div className="text-center">
          <CardLabel>Under the hood</CardLabel>
          <h2 className="mt-1 text-2xl font-bold">Built like a product, not a demo</h2>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {[
            {
              step: '01',
              title: 'Server authoritative',
              body: 'The same pure TypeScript engine runs on the server and in your browser. The server always has the final word, the client just predicts.',
            },
            {
              step: '02',
              title: 'Built to scale',
              body: 'Clustered Node workers with sticky sessions, a Redis socket adapter and a two tier cache with stale-while-revalidate. Add containers, not complexity.',
            },
            {
              step: '03',
              title: 'Fair by design',
              body: 'Elo with a dynamic K factor, rating-aware matchmaking that widens as you wait, and turn clocks that punish stalling.',
            },
          ].map((item) => (
            <Card key={item.title} className="relative p-5">
              <span className="font-display text-4xl font-bold text-white/8">{item.step}</span>
              <h3 className="mt-2 text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* -------------------------------- faq ------------------------------- */}
      <section className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div>
          <CardLabel>Questions</CardLabel>
          <h2 className="mt-1 text-2xl font-bold">Good to know</h2>
          <p className="mt-2 text-sm text-slate-400">
            Everything here is free, no ads, no accounts, no dark patterns.
          </p>
        </div>
        <div className="space-y-2">
          {FAQ.map((entry, index) => {
            const open = openFaq === index;
            return (
              <div key={entry.q} className="overflow-hidden rounded-xl border border-white/5 bg-void-900/50">
                <button
                  type="button"
                  onClick={() => setOpenFaq(open ? null : index)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left text-sm font-medium text-white"
                  aria-expanded={open}
                >
                  {entry.q}
                  <span
                    className={clsx(
                      'shrink-0 text-slate-500 transition-transform duration-200',
                      open && 'rotate-45',
                    )}
                  >
                    +
                  </span>
                </button>
                {open && <p className="px-4 pb-4 text-sm leading-relaxed text-slate-400">{entry.a}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------- cta -------------------------------- */}
      <section className="relative overflow-hidden rounded-[--radius-card] border border-white/8 px-6 py-14 text-center">
        <img
          src="/art/hero.webp"
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-void-950 via-void-950/70 to-void-950" />
        <div className="relative">
          <h2 className="text-balance text-3xl font-bold sm:text-4xl">
            Someone is waiting for a game right now
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-slate-400">
            No signup, no download, no nonsense. Pick a cabinet and drop in.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/play/tic-tac-toe">
              <Button size="lg">Start playing</Button>
            </Link>
            <Link to="/leaderboard">
              <Button size="lg" variant="outline">
                See the ladder
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
