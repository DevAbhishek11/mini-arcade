import { useEffect, type ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt';
import { Toaster } from '@/components/ui/Toaster';
import { AchievementsPage } from '@/pages/AchievementsPage';
import { AuthPage } from '@/pages/AuthPage';
import { LeaderboardPage } from '@/pages/LeaderboardPage';
import { LobbyPage } from '@/pages/LobbyPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PlayPage } from '@/pages/PlayPage';
import { SoloPage } from '@/pages/SoloPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { SystemPage } from '@/pages/SystemPage';
import { WelcomePage } from '@/pages/WelcomePage';
import { useArcade } from '@/store/arcade';
import { useProgression } from '@/store/progression';
import { useSession } from '@/store/session';

function BootScreen({ error }: { error: string | null }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-neon-cyan to-neon-violet font-display text-2xl font-bold text-void-950">
          A
        </div>
        {error ? (
          <>
            <h1 className="mt-6 text-xl font-bold">Cannot reach the arcade</h1>
            <p className="mt-2 max-w-sm text-sm text-slate-400">{error}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button onClick={() => window.location.reload()}>Try again</Button>
              <a href="/solo/tic-tac-toe">
                <Button variant="outline">Play offline</Button>
              </a>
            </div>
          </>
        ) : (
          <p className="mt-6 animate-pulse text-sm text-slate-500">Inserting coin…</p>
        )}
      </div>
    </div>
  );
}

/**
 * Online play needs an identity (guest or account). Anonymous visitors are
 * sent to the login screen and returned to wherever they were headed.
 */
function RequireSession({ children }: { children: ReactElement }) {
  const status = useSession((s) => s.status);
  const location = useLocation();

  if (status === 'ready') return children;
  return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
}

/** Signed-in players never need to see the welcome or auth screens again. */
function RedirectIfSignedIn({ children }: { children: ReactElement }) {
  const status = useSession((s) => s.status);
  const location = useLocation();
  const next = new URLSearchParams(location.search).get('next');

  if (status === 'ready') return <Navigate to={next && next.startsWith('/') ? next : '/'} replace />;
  return children;
}

export default function App() {
  const { status, error, bootstrap } = useSession();
  const listen = useArcade((s) => s.listen);
  const loadProgress = useProgression((s) => s.load);
  const subscribeProgress = useProgression((s) => s.subscribe);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Realtime plumbing only makes sense once somebody is signed in.
  useEffect(() => {
    if (status !== 'ready') return;
    listen();
    subscribeProgress();
    void loadProgress();
  }, [status, listen, loadProgress, subscribeProgress]);

  if (status === 'loading' || status === 'error') {
    return <BootScreen error={status === 'error' ? error : null} />;
  }

  return (
    <>
      <Routes>
        {/* Full-bleed pages without the app chrome. */}
        <Route
          path="/login"
          element={
            <RedirectIfSignedIn>
              <AuthPage mode="login" />
            </RedirectIfSignedIn>
          }
        />
        <Route
          path="/signup"
          element={
            <RedirectIfSignedIn>
              <AuthPage mode="signup" />
            </RedirectIfSignedIn>
          }
        />

        <Route
          path="*"
          element={
            <AppShell>
              <Routes>
                {/* Signed in players land straight in the arcade; visitors get the pitch. */}
                <Route path="/" element={status === 'ready' ? <LobbyPage /> : <WelcomePage />} />
                <Route
                  path="/play/:gameId"
                  element={
                    <RequireSession>
                      <PlayPage />
                    </RequireSession>
                  }
                />
                {/* Solo runs entirely in the browser — no identity required. */}
                <Route path="/solo/:gameId" element={<SoloPage />} />
                <Route path="/leaderboard" element={<LeaderboardPage />} />
                <Route
                  path="/achievements"
                  element={
                    <RequireSession>
                      <AchievementsPage />
                    </RequireSession>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <RequireSession>
                      <ProfilePage />
                    </RequireSession>
                  }
                />
                <Route path="/system" element={<SystemPage />} />
                <Route path="/play" element={<Navigate to="/" replace />} />
                <Route path="/solo" element={<Navigate to="/solo/tic-tac-toe" replace />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </AppShell>
          }
        />
      </Routes>
      <Toaster />
      <UpdatePrompt />
    </>
  );
}
