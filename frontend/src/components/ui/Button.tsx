import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-br from-neon-cyan to-neon-violet text-void-950 font-semibold shadow-[0_10px_40px_-12px] shadow-neon-cyan/60 hover:brightness-110 hover:shadow-neon-violet/50',
  ghost: 'text-slate-300 hover:text-white hover:bg-white/5',
  outline: 'border border-white/10 text-slate-200 hover:border-neon-cyan/50 hover:text-white hover:bg-white/5',
  danger: 'bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25',
  subtle: 'bg-white/5 text-slate-200 hover:bg-white/10',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-5 text-sm rounded-xl gap-2',
  lg: 'h-13 px-7 text-base rounded-xl gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center whitespace-nowrap transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/60 focus-visible:ring-offset-2 focus-visible:ring-offset-void-950',
        'disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.97]',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
