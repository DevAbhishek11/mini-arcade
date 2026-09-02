import { createLogger } from './logger.js';

const log = createLogger('lifecycle');

export type DisposeFn = () => Promise<void> | void;

interface Resource {
  name: string;
  /** Lower numbers are torn down first (drain traffic before closing pools). */
  order: number;
  dispose: DisposeFn;
}

/**
 * Central registry of every long lived resource the process owns.
 * Everything closes in a deterministic order, exactly once, with a hard
 * timeout so a stuck socket can never block a rolling deploy.
 */
class Lifecycle {
  private readonly resources: Resource[] = [];
  private shuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;
  private readonly onShutdownStart = new Set<() => void>();

  register(name: string, dispose: DisposeFn, order = 100): void {
    this.resources.push({ name, dispose, order });
  }

  beforeShutdown(fn: () => void): void {
    this.onShutdownStart.add(fn);
  }

  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  shutdown(reason: string, timeoutMs: number): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shuttingDown = true;
    log.info({ reason, resources: this.resources.length }, 'graceful shutdown started');

    for (const fn of this.onShutdownStart) {
      try {
        fn();
      } catch (error) {
        log.warn({ error }, 'beforeShutdown hook failed');
      }
    }

    const run = async () => {
      const ordered = [...this.resources].sort((a, b) => a.order - b.order);
      for (const resource of ordered) {
        const startedAt = Date.now();
        try {
          await resource.dispose();
          log.debug({ resource: resource.name, ms: Date.now() - startedAt }, 'resource closed');
        } catch (error) {
          log.error({ resource: resource.name, error }, 'resource failed to close');
        }
      }
    };

    const timeout = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        log.error({ timeoutMs }, 'graceful shutdown timed out, forcing exit');
        resolve();
      }, timeoutMs);
      timer.unref();
    });

    this.shutdownPromise = Promise.race([run(), timeout]).then(() => {
      log.info('graceful shutdown complete');
    });
    return this.shutdownPromise;
  }
}

export const lifecycle = new Lifecycle();

export function installProcessHandlers(timeoutMs: number): void {
  const exit = (code: number) => {
    setTimeout(() => process.exit(code), 50).unref();
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void lifecycle.shutdown(signal, timeoutMs).then(() => exit(0));
    });
  }

  process.on('unhandledRejection', (reason) => {
    log.error({ reason }, 'unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    log.fatal({ error }, 'uncaught exception, shutting down');
    void lifecycle.shutdown('uncaughtException', Math.min(timeoutMs, 5_000)).then(() => exit(1));
  });
}
