import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { StreakFlame } from '@/components/progress/StreakFlame';
import { XpBar } from '@/components/progress/XpBar';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { sound } from '@/lib/sound';
import { useProgression } from '@/store/progression';
import { useSession } from '@/store/session';

const LINKS = [
  { to: '/', label: 'Arcade', end: true },
  { to: '/solo/tic-tac-toe', label: 'Solo' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/achievements', label: 'Quests' },
  { to: '/profile', label: 'Profile' },
  { to: '/system', label: 'System' },
];

function SoundToggle() {
  const [on, setOn] = useState(sound.isEnabled);
  return (
    <button
      type="button"
      aria-label={on ? 'mute sound' : 'unmute sound'}
      onClick={() => setOn(sound.toggle())}
      className="grid size-9 place-items-center rounded-xl border border-white/5 bg-void-900/60 text-sm transition-colors hover:border-white/15"
    >
      {on ? '🔊' : '🔇'}
    </button>
  );
}

function ConnectionPill() {
  const connection = useSession((s) => s.connection);
  const latency = useSession((s) => s.latencyMs);

  const map = {
    online: { tone: 'lime', label: latency !== null ? `${latency} ms` : 'online' },
    connecting: { tone: 'amber', label: 'connecting' },
    offline: { tone: 'rose', label: 'offline' },
    idle: { tone: 'neutral', label: 'idle' },
  } as const;

  const state = map[connection];
  return (
    <Badge tone={state.tone} dot className="font-mono tabular-nums">
      {state.label}
    </Badge>
  );
}

/** Avatar button with a small popover: profile, upgrade, sign out. */
function AccountMenu() {
  const player = useSession((s) => s.player);
  const signOut = useSession((s) => s.signOut);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  if (!player) return null;

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-void-900/60 py-1.5 pl-1.5 pr-3 transition-colors hover:border-white/15"
      >
        <Avatar nickname={player.nickname} avatar={player.avatar} size="sm" />
        <div className="hidden text-left sm:block">
          <div className="text-xs font-semibold leading-tight text-white">{player.nickname}</div>
          <div className="font-mono text-[0.68rem] leading-tight text-neon-cyan">
            {player.isGuest ? 'guest' : `${player.rating} elo`}
          </div>
        </div>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-white/10 bg-void-900/95 shadow-2xl backdrop-blur-xl"
        >
          <div className="border-b border-white/5 px-4 py-3">
            <p className="truncate text-sm font-semibold">{player.nickname}</p>
            <p className="text-xs text-slate-500">
              {player.isGuest ? 'Guest session — not saved' : `${player.rating} elo · registered`}
            </p>
          </div>

          {player.isGuest ? (
            <Link
              to="/signup"
              onClick={() => setOpen(false)}
              className="block bg-neon-cyan/10 px-4 py-3 text-sm font-semibold text-neon-cyan transition hover:bg-neon-cyan/15"
            >
              Save my progress → create account
            </Link>
          ) : null}

          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            Profile & history
          </Link>
          <Link
            to="/achievements"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            Quests & achievements
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              signOut();
              navigate('/login');
            }}
            className="block w-full px-4 py-2.5 text-left text-sm text-slate-300 transition hover:bg-white/5 hover:text-neon-pink"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Header() {
  const player = useSession((s) => s.player);
  const progress = useProgression((s) => s.progress);
  const location = useLocation();

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-void-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <NavLink to="/" className="group flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-neon-cyan to-neon-violet font-display text-lg font-bold text-void-950 transition-transform duration-300 group-hover:rotate-6">
            A
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-white">
            Mini<span className="text-neon-cyan neon-text">Arcade</span>
          </span>
        </NavLink>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                clsx(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-white/8 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {progress && <StreakFlame days={progress.dailyStreak} />}
          {progress && <XpBar level={progress.level} compact />}
          <ConnectionPill />
          <SoundToggle />
          {player ? (
            <AccountMenu />
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login">
                <Button variant="subtle" size="sm">
                  Log in
                </Button>
              </Link>
              <Link to="/signup" className="hidden sm:block">
                <Button size="sm">Sign up</Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      <nav className="flex items-center gap-1 overflow-x-auto border-t border-white/5 px-4 py-2 md:hidden">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={clsx(
              'rounded-lg px-3 py-1.5 text-sm',
              location.pathname === link.to ? 'bg-white/8 text-white' : 'text-slate-400',
            )}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
