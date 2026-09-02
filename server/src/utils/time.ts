export const now = (): number => Date.now();

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });

export function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * setInterval that never overlaps: the next run is scheduled only after the
 * previous one settles, which keeps slow ticks from stacking up.
 */
export function createSafeInterval(fn: () => void | Promise<void>, intervalMs: number) {
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const run = async () => {
    if (stopped) return;
    try {
      await fn();
    } finally {
      if (!stopped) {
        timer = setTimeout(run, intervalMs);
        timer.unref();
      }
    }
  };

  timer = setTimeout(run, intervalMs);
  timer.unref();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
