import clsx from 'clsx';

/**
 * The Mini Arcade mark: an "A" built from a joystick.
 *
 * Hand authored as SVG rather than shipped as a bitmap so it stays sharp at
 * favicon size, inherits the page's colours, and can animate.
 */
export function Logo({
  className,
  animated = false,
  title = 'Mini Arcade',
}: {
  className?: string;
  /** Pulses the stick ball and traces the strokes on mount. */
  animated?: boolean;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={clsx('block', className)}
      role="img"
      aria-label={title}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="arcade-mark" x1="8" y1="56" x2="56" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="55%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <radialGradient id="arcade-ball" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0%" stopColor="#fda4d4" />
          <stop offset="45%" stopColor="#f43f8e" />
          <stop offset="100%" stopColor="#be1259" />
        </radialGradient>
      </defs>

      {/* The two legs and the crossbar of the A. */}
      <g
        stroke="url(#arcade-mark)"
        strokeWidth={7}
        strokeLinecap="square"
        strokeLinejoin="miter"
        className={clsx(animated && 'origin-center [stroke-dasharray:120] [stroke-dashoffset:0] animate-draw')}
      >
        <path d="M11 57 L31 21" />
        <path d="M33 21 L53 57" />
        <path d="M21 44 H43" />
      </g>

      {/* Stick and ball. */}
      <path d="M32 21 V13" stroke="#f43f8e" strokeWidth={5} strokeLinecap="round" />
      <circle
        cx="32"
        cy="11"
        r="7.5"
        fill="url(#arcade-ball)"
        className={clsx(animated && 'animate-stick-pulse origin-center')}
      />
      <circle cx="29.5" cy="8.5" r="2" fill="#ffffff" opacity="0.65" />
    </svg>
  );
}

/** Mark plus wordmark, for headers and the landing page. */
export function LogoLockup({
  className,
  animated = false,
  compact = false,
}: {
  className?: string;
  animated?: boolean;
  /** Hides the wordmark, e.g. on narrow screens. */
  compact?: boolean;
}) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <Logo className="size-9 drop-shadow-[0_0_10px_rgba(34,211,238,0.35)]" animated={animated} />
      {!compact && (
        <span className="font-display text-lg font-bold leading-none tracking-tight">
          Mini<span className="neon-text"> Arcade</span>
        </span>
      )}
    </span>
  );
}
