import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { useSession } from '@/store/session';

const LINKS = [
  { to: '/', label: 'Arcade', end: true },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/profile', label: 'Profile' },
  { to: '/system', label: 'System' },
];

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

export function Header() {
  const player = useSession((s) => s.player);
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

        <div className="ml-auto flex items-center gap-3">
          <ConnectionPill />
          {player && (
            <NavLink
              to="/profile"
              className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-void-900/60 py-1.5 pl-1.5 pr-3 transition-colors hover:border-white/15"
            >
              <Avatar nickname={player.nickname} avatar={player.avatar} size="sm" />
              <div className="hidden text-left sm:block">
                <div className="text-xs font-semibold leading-tight text-white">{player.nickname}</div>
                <div className="font-mono text-[0.68rem] leading-tight text-neon-cyan">{player.rating} elo</div>
              </div>
            </NavLink>
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
