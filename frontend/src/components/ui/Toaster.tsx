import clsx from 'clsx';
import { useToasts, type ToastTone } from '@/store/toast';

const TONES: Record<ToastTone, { ring: string; icon: string }> = {
  info: { ring: 'border-white/10', icon: 'ℹ️' },
  success: { ring: 'border-neon-lime/40', icon: '✅' },
  warning: { ring: 'border-neon-amber/40', icon: '⚠️' },
  error: { ring: 'border-rose-500/40', icon: '⛔' },
  reward: { ring: 'border-neon-violet/50', icon: '🎁' },
};

export function Toaster() {
  const { toasts, dismiss } = useToasts();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-auto sm:right-4 sm:top-20 sm:items-end sm:px-0">
      {toasts.map((entry) => {
        const tone = TONES[entry.tone];
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => dismiss(entry.id)}
            className={clsx(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-void-900/95 px-4 py-3 text-left shadow-2xl backdrop-blur-xl',
              'animate-[slide-up_0.3s_cubic-bezier(0.22,1,0.36,1)_both]',
              tone.ring,
            )}
          >
            <span className="text-lg leading-none">{entry.icon ?? tone.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white">{entry.title}</span>
              {entry.description && (
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">{entry.description}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
