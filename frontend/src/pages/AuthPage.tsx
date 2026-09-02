import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api';
import { useSession } from '@/store/session';
import { toast } from '@/store/toast';

type Mode = 'login' | 'signup';

const NICKNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,18}$/;

/** Mirrors the server's rules so the form can answer before the round trip. */
function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'At least 8 characters';
  if (!/[a-zA-Z]/.test(password)) return 'Needs at least one letter';
  if (!/[0-9]/.test(password)) return 'Needs at least one number';
  return null;
}

function strengthOf(password: string): { score: number; label: string; tone: string } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return { score, label: 'Weak', tone: 'bg-neon-pink' };
  if (score === 3) return { score, label: 'Fair', tone: 'bg-neon-amber' };
  if (score === 4) return { score, label: 'Good', tone: 'bg-neon-cyan' };
  return { score, label: 'Strong', tone: 'bg-neon-lime' };
}

const PERKS = [
  ['🏆', 'Ranked Elo', 'Your rating and place on the global ladder stick around.'],
  ['🔥', 'Streaks & quests', 'Daily streaks, three fresh quests a day, 12 achievements.'],
  ['📈', 'Full history', 'Every match, XP level and personal best kept on your account.'],
] as const;

export function AuthPage({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { logIn, register, playAsGuest } = useSession();

  const [identifier, setIdentifier] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<'form' | 'guest' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === 'signup';
  const next = params.get('next') ?? (location.state as { next?: string } | null)?.next ?? '/';
  const strength = useMemo(() => strengthOf(password), [password]);

  const nicknameError =
    isSignup && nickname && !NICKNAME_PATTERN.test(nickname) ? '3-18 letters, digits, _ . or -' : null;
  const passwordError = isSignup && password ? passwordProblem(password) : null;
  const canSubmit = isSignup
    ? Boolean(nickname && email && password) && !nicknameError && !passwordError
    : Boolean(identifier && password);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || busy) return;

    setBusy('form');
    setError(null);
    try {
      if (isSignup) {
        await register({ nickname: nickname.trim(), email: email.trim(), password });
        toast.success(`Welcome, ${nickname.trim()}`, 'Your account is ready — jump into a match.');
      } else {
        await logIn(identifier.trim(), password);
        toast.success('Welcome back', 'Signed in — good luck out there.');
      }
      navigate(next, { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function onGuest() {
    if (busy) return;
    setBusy('guest');
    setError(null);
    try {
      await playAsGuest();
      toast.info('Playing as guest', 'Create an account any time to keep your rating.');
      navigate(next, { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Could not start a guest session.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid-backdrop relative min-h-dvh">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(56,189,248,0.16),transparent)]" />

      <div className="relative mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.05fr_1fr]">
        {/* Pitch — hidden on small screens where the form is the whole job. */}
        <aside className="hidden lg:block">
          <Link to="/" className="inline-flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-neon-cyan to-neon-violet font-display text-xl font-bold text-void-950">
              A
            </span>
            <span className="font-display text-lg font-bold tracking-tight">Mini Arcade</span>
          </Link>

          <h1 className="mt-10 font-display text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
            Seven games.
            <br />
            <span className="neon-text">One rating.</span>
          </h1>
          <p className="mt-4 max-w-md text-slate-400">
            Realtime matches against real people in seconds — or a bot that never blunders. Your account keeps
            the rating, the streak and every match you have ever played.
          </p>

          <ul className="mt-10 space-y-4">
            {PERKS.map(([icon, title, copy]) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/5 text-lg">
                  {icon}
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-slate-400">{copy}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* Form */}
        <div className="mx-auto w-full max-w-md">
          <div className="surface rounded-3xl p-7 sm:p-8">
            <Link to="/" className="mb-6 inline-flex items-center gap-2 lg:hidden">
              <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-neon-cyan to-neon-violet font-display font-bold text-void-950">
                A
              </span>
              <span className="font-display font-bold">Mini Arcade</span>
            </Link>

            <div className="mb-6 grid grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1">
              <Link
                to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
                className={`rounded-xl py-2 text-center text-sm font-semibold transition ${
                  !isSignup ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Log in
              </Link>
              <Link
                to={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
                className={`rounded-xl py-2 text-center text-sm font-semibold transition ${
                  isSignup ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign up
              </Link>
            </div>

            <h2 className="font-display text-2xl font-bold">
              {isSignup ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {isSignup
                ? 'Takes about twenty seconds. No email confirmation needed.'
                : 'Sign in with your email or your nickname.'}
            </p>

            <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
              {isSignup ? (
                <>
                  <Field
                    label="Nickname"
                    hint={nicknameError}
                    id="nickname"
                    value={nickname}
                    onChange={setNickname}
                    placeholder="neon_fox"
                    autoComplete="username"
                    maxLength={18}
                  />
                  <Field
                    label="Email"
                    id="email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </>
              ) : (
                <Field
                  label="Email or nickname"
                  id="identifier"
                  value={identifier}
                  onChange={setIdentifier}
                  placeholder="you@example.com"
                  autoComplete="username"
                />
              )}

              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="text-xs text-slate-400 transition hover:text-slate-200"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  className="w-full rounded-xl border border-white/10 bg-void-900/70 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-600 focus:border-neon-cyan/60 focus:ring-2 focus:ring-neon-cyan/20"
                />

                {isSignup && password ? (
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all ${strength.tone}`}
                        style={{ width: `${(strength.score / 5) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400">{passwordError ?? strength.label}</span>
                  </div>
                ) : null}
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-neon-pink/30 bg-neon-pink/10 px-3.5 py-2.5 text-sm text-neon-pink"
                >
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                loading={busy === 'form'}
                disabled={!canSubmit}
              >
                {isSignup ? 'Create account & play' : 'Log in'}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-slate-600">
              <span className="h-px flex-1 bg-white/10" />
              or
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <Button variant="outline" className="w-full" onClick={onGuest} loading={busy === 'guest'}>
              Continue as guest
            </Button>
            <p className="mt-3 text-center text-xs text-slate-500">
              Guests play everything. You can turn a guest into an account later without losing your rating.
            </p>
          </div>

          <p className="mt-5 text-center text-sm text-slate-500">
            {isSignup ? 'Already have an account? ' : 'New here? '}
            <Link
              to={isSignup ? '/login' : '/signup'}
              className="font-semibold text-neon-cyan transition hover:text-neon-cyan/80"
            >
              {isSignup ? 'Log in' : 'Create one'}
            </Link>
            {' · '}
            <Link to="/solo/tic-tac-toe" className="transition hover:text-slate-300">
              Play offline
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  maxLength?: number;
  hint?: string | null;
}

function Field({ label, id, value, onChange, hint, type = 'text', ...rest }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-300">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-void-900/70 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-600 focus:border-neon-cyan/60 focus:ring-2 focus:ring-neon-cyan/20"
        {...rest}
      />
      {hint ? <p className="mt-1.5 text-xs text-neon-amber">{hint}</p> : null}
    </div>
  );
}
