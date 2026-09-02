import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GAME_LIST, type ArcadeStats } from '@mini-arcade/shared';
import { HeroDemo } from '@/components/HeroDemo';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { gameArt } from '@/lib/art';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { toast } from '@/store/toast';

const REASONS = [
  {
    icon: '⚡',
    title: 'Matched in seconds',
    copy: 'Rating-aware matchmaking that widens as you wait. Nobody home? A bot at your level steps in.',
  },
  {
    icon: '🛡️',
    title: 'Server-authoritative',
    copy: 'Every move is validated server side over a websocket. No trusting the client, no cheating.',
  },
  {
    icon: '📶',
    title: 'Works offline',
    copy: 'Install it and all fifteen games keep working with no connection — the engines ship to your browser.',
  },
] as const;

/**
 * What a signed-out visitor sees at "/". It sells the arcade, lets them play a
 * real board immediately, and offers the three ways in: account, login, guest.
 */
export function WelcomePage() {
  const navigate = useNavigate();
  const playAsGuest = useSession((s) => s.playAsGuest);
  const [stats, setStats] = useState<ArcadeStats | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .stats()
      .then((value) => alive && setStats(value))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function startAsGuest() {
    setBusy(true);
    try {
      await playAsGuest();
      toast.info('Playing as guest', 'Create an account any time to keep your rating.');
      navigate('/');
    } catch {
      toast.error('Could not start', 'The arcade server is not reachable right now.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-20 pb-16">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10">
        <img
          src="/art/hero.webp"
          alt=""
          className="absolute inset-0 size-full object-cover opacity-40"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-void-950 via-void-950/85 to-void-950/40" />

        <div className="relative grid items-center gap-10 p-8 sm:p-12 lg:grid-cols-[1.15fr_auto]">
          <div>
            <Badge tone="cyan" dot>
              {stats ? `${stats.playersOnline} playing right now` : 'Free · no download'}
            </Badge>

            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Fifteen classics.
              <br />
              <span className="neon-text">Real opponents.</span>
            </h1>

            <p className="mt-5 max-w-xl text-lg text-slate-300">
              Chess, Checkers, Hex, Sudoku Duel, Bingo Blitz, Nine Men&apos;s Morris, Neon Pong and eight more —
              matched by rating in seconds, or played against a bot that never blunders.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/signup">
                <Button size="lg">Create free account</Button>
              </Link>
              <Button size="lg" variant="outline" onClick={startAsGuest} loading={busy}>
                Play as guest
              </Button>
              <Link to="/login" className="text-sm font-semibold text-slate-300 transition hover:text-white">
                I already have an account →
              </Link>
            </div>

            <p className="mt-4 text-xs text-slate-500">
              Guests can play everything. An account keeps your Elo, streak, quests and match history.
            </p>
          </div>

          <div className="justify-self-center lg:justify-self-end">
            <HeroDemo ctaTo="/solo/tic-tac-toe" ctaLabel="Play more →" />
          </div>
        </div>
      </section>

      {/* Games */}
      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight">The cabinets</h2>
            <p className="mt-1 text-sm text-slate-400">
              Every game is playable solo right now — no account needed.
            </p>
          </div>
          <Link to="/leaderboard" className="text-sm font-semibold text-neon-cyan hover:underline">
            See the ladder →
          </Link>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GAME_LIST.map((game) => (
            <Link
              key={game.id}
              to={`/solo/${game.id}`}
              className="surface surface-hover group relative overflow-hidden rounded-2xl"
            >
              <div className="relative h-32 overflow-hidden">
                <img
                  src={gameArt(game.id)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-void-950 to-transparent" />
                <Badge tone={game.mode === 'realtime' ? 'violet' : 'cyan'} className="absolute right-3 top-3">
                  {game.mode === 'realtime' ? 'realtime' : 'turn based'}
                </Badge>
              </div>
              <div className="p-4">
                <h3 className="font-display font-semibold">{game.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-400">{game.tagline}</p>
                <p className="mt-3 text-xs font-semibold text-neon-cyan opacity-0 transition group-hover:opacity-100">
                  Play now →
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Why */}
      <section className="grid gap-4 md:grid-cols-3">
        {REASONS.map((reason) => (
          <Card key={reason.title} className="p-6">
            <span className="grid size-11 place-items-center rounded-xl bg-white/5 text-xl">{reason.icon}</span>
            <h3 className="mt-4 font-display font-semibold">{reason.title}</h3>
            <p className="mt-1.5 text-sm text-slate-400">{reason.copy}</p>
          </Card>
        ))}
      </section>

      {/* Closing CTA */}
      <section className="relative overflow-hidden rounded-3xl border border-neon-cyan/20 bg-gradient-to-br from-neon-cyan/10 via-void-900 to-neon-violet/10 p-10 text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight">Ready when you are</h2>
        <p className="mx-auto mt-3 max-w-lg text-slate-300">
          Make an account and your next win starts counting — Elo, daily streak, quests and achievements.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/signup">
            <Button size="lg">Create free account</Button>
          </Link>
          <Button size="lg" variant="outline" onClick={startAsGuest} loading={busy}>
            Play as guest
          </Button>
        </div>
      </section>
    </div>
  );
}
