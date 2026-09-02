import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt';
import { Toaster } from '@/components/ui/Toaster';
import { AchievementsPage } from '@/pages/AchievementsPage';
import { LeaderboardPage } from '@/pages/LeaderboardPage';
import { LobbyPage } from '@/pages/LobbyPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PlayPage } from '@/pages/PlayPage';
import { SoloPage } from '@/pages/SoloPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { SystemPage } from '@/pages/SystemPage';
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

export default function App() {
  const { status, error, bootstrap } = useSession();
  const listen = useArcade((s) => s.listen);
  const loadProgress = useProgression((s) => s.load);
  const subscribeProgress = useProgression((s) => s.subscribe);

  useEffect(() => {
    void bootstrap().then(() => {
      listen();
      subscribeProgress();
      void loadProgress();
    });
  }, [bootstrap, listen, loadProgress, subscribeProgress]);

  if (status !== 'ready') return <BootScreen error={status === 'error' ? error : null} />;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/play/:gameId" element={<PlayPage />} />
        <Route path="/solo/:gameId" element={<SoloPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/achievements" element={<AchievementsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/system" element={<SystemPage />} />
        <Route path="/play" element={<Navigate to="/" replace />} />
        <Route path="/solo" element={<Navigate to="/solo/tic-tac-toe" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
      <UpdatePrompt />
    </AppShell>
  );
}
