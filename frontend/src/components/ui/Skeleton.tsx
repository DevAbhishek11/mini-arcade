import clsx from 'clsx';

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton h-4 w-full', className)} />;
}
