import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/store/toast';

/**
 * Service worker lifecycle UI: tells the player when the arcade is ready to
 * play offline, and offers a one-click reload when a new build ships.
 */
export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new build every 30 minutes on long-lived sessions.
      if (registration) window.setInterval(() => void registration.update(), 30 * 60_000);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    toast.success('Ready to play offline', 'Solo mode now works with no connection.');
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-sm rounded-xl border border-neon-cyan/30 bg-void-900/95 p-4 shadow-2xl backdrop-blur-xl sm:left-auto sm:right-4">
      <p className="text-sm font-semibold text-white">A new version is available</p>
      <p className="mt-1 text-xs text-slate-400">Reload to get the latest games and fixes.</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="subtle" className="flex-1" onClick={() => setNeedRefresh(false)}>
          Later
        </Button>
        <Button size="sm" className="flex-1" onClick={() => void updateServiceWorker(true)}>
          Reload
        </Button>
      </div>
    </div>
  );
}
