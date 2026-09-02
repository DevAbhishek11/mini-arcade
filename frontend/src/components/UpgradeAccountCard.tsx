import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ApiRequestError } from '@/lib/api';
import { useSession } from '@/store/session';
import { toast } from '@/store/toast';

/**
 * Guests keep their id when they register, so this converts the throwaway
 * session into a real account without touching rating, history or XP.
 */
export function UpgradeAccountCard() {
  const player = useSession((s) => s.player);
  const upgradeGuest = useSession((s) => s.upgradeGuest);

  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState(player?.nickname ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!player?.isGuest) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      await upgradeGuest({ nickname: nickname.trim(), email: email.trim(), password });
      toast.success('Account created', 'Your rating, streak and history carried over.');
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-neon-cyan/25 bg-gradient-to-br from-neon-cyan/8 to-transparent p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold">You are playing as a guest</h2>
          <p className="mt-1 max-w-md text-sm text-slate-400">
            This session disappears if you clear your browser data. Add an email and password to keep your{' '}
            <span className="font-semibold text-slate-200">{player.rating} elo</span>, your streak and every
            match you have played.
          </p>
        </div>
        {!open ? <Button onClick={() => setOpen(true)}>Keep my progress</Button> : null}
      </div>

      {open ? (
        <form className="mt-6 grid gap-3 sm:grid-cols-3" onSubmit={submit} noValidate>
          <input
            aria-label="Nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="Nickname"
            maxLength={18}
            autoComplete="username"
            className="rounded-xl border border-white/10 bg-void-900/70 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-600 focus:border-neon-cyan/60"
          />
          <input
            aria-label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="rounded-xl border border-white/10 bg-void-900/70 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-600 focus:border-neon-cyan/60"
          />
          <input
            aria-label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password (8+ chars)"
            autoComplete="new-password"
            className="rounded-xl border border-white/10 bg-void-900/70 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-600 focus:border-neon-cyan/60"
          />

          {error ? <p className="text-sm text-neon-pink sm:col-span-3">{error}</p> : null}

          <div className="flex gap-2 sm:col-span-3">
            <Button type="submit" loading={busy} disabled={!nickname || !email || !password}>
              Create account
            </Button>
            <Button type="button" variant="subtle" onClick={() => setOpen(false)}>
              Not now
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
