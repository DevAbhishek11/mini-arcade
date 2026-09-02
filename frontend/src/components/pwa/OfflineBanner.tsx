import { Link } from 'react-router-dom';
import { useOnline } from '@/lib/online';

/** Persistent, non-blocking notice that steers offline players into solo mode. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div className="sticky top-16 z-30 border-y border-neon-amber/25 bg-neon-amber/10 px-4 py-2 text-center text-xs text-neon-amber backdrop-blur-xl">
      You are offline — multiplayer is paused, but{' '}
      <Link to="/solo/tic-tac-toe" className="font-semibold underline underline-offset-2">
        solo play still works
      </Link>
      .
    </div>
  );
}
