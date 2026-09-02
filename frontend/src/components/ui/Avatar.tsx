import clsx from 'clsx';

const GRADIENTS: Record<string, string> = {
  aurora: 'from-cyan-400 to-blue-600',
  ember: 'from-orange-400 to-rose-600',
  lagoon: 'from-teal-300 to-emerald-600',
  nebula: 'from-fuchsia-400 to-indigo-600',
  citrus: 'from-amber-300 to-orange-500',
  orchid: 'from-pink-400 to-purple-600',
  glacier: 'from-sky-200 to-cyan-500',
  sunset: 'from-rose-400 to-amber-500',
};

const SIZES = { sm: 'size-8 text-xs', md: 'size-11 text-sm', lg: 'size-16 text-xl' } as const;

export function Avatar({
  nickname,
  avatar = 'aurora',
  size = 'md',
  ring,
  className,
}: {
  nickname: string;
  avatar?: string;
  size?: keyof typeof SIZES;
  ring?: boolean;
  className?: string;
}) {
  const initials =
    nickname
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 2)
      .toUpperCase() || '??';
  return (
    <div
      title={nickname}
      className={clsx(
        'grid shrink-0 place-items-center rounded-xl bg-gradient-to-br font-display font-bold text-void-950',
        GRADIENTS[avatar] ?? GRADIENTS.aurora,
        SIZES[size],
        ring && 'ring-2 ring-neon-cyan/60 ring-offset-2 ring-offset-void-900',
        className,
      )}
    >
      {initials}
    </div>
  );
}
