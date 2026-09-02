import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { isStandalone } from '@/lib/online';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'mini-arcade.install-dismissed';

/**
 * Install card, shown only when the browser actually offers installation and
 * the player has not dismissed it before. Never nags.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISSED_KEY)) return;

    const onPrompt = (raw: Event) => {
      raw.preventDefault();
      setEvent(raw as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!event) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setEvent(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-neon-violet/25 bg-neon-violet/5 px-4 py-3">
      <span className="text-2xl">📲</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">Install Mini Arcade</p>
        <p className="text-xs text-slate-400">Full screen, instant launch, and playable offline.</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={dismiss}>
          No thanks
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            await event.prompt();
            await event.userChoice;
            setEvent(null);
          }}
        >
          Install
        </Button>
      </div>
    </div>
  );
}
