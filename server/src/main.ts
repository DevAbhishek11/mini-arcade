import cluster from 'node:cluster';
import { createServer } from 'node:http';
import { setupPrimary as setupClusterAdapter } from '@socket.io/cluster-adapter';
import { setupMaster } from '@socket.io/sticky';
import { config } from './config/env.js';
import { installProcessHandlers, lifecycle } from './infra/lifecycle.js';
import { createLogger } from './infra/logger.js';
import { startWorker } from './worker.js';

const log = createLogger('bootstrap');

interface WorkerHealth {
  lastPongAt: number;
  restarts: number;
}

const health = new Map<number, WorkerHealth>();
const RESTART_BACKOFF_MS = 1_000;
const MAX_RESTARTS_PER_WORKER = 20;

function forkWorker(reason: string): void {
  if (lifecycle.isShuttingDown) return;
  const worker = cluster.fork({ STICKY: '1' });
  health.set(worker.id, { lastPongAt: Date.now(), restarts: 0 });
  log.info({ workerId: worker.id, pid: worker.process.pid, reason }, 'worker forked');

  worker.on('message', (message: unknown) => {
    const payload = message as { type?: string; rssMb?: number };
    if (payload?.type !== 'arcade:pong') return;
    const entry = health.get(worker.id);
    if (entry) entry.lastPongAt = Date.now();

    if (config.WORKER_MAX_RSS_MB > 0 && (payload.rssMb ?? 0) > config.WORKER_MAX_RSS_MB) {
      log.warn({ workerId: worker.id, rssMb: payload.rssMb }, 'worker exceeded RSS budget, recycling');
      worker.send({ type: 'arcade:drain' });
      worker.kill('SIGTERM');
    }
  });
}

function startPrimary(): void {
  const workers = config.workerCount;
  log.info(
    { workers, cores: workers, port: config.PORT, node: process.version, env: config.NODE_ENV },
    'starting mini-arcade cluster',
  );

  if (workers < config.clusterRequested) {
    log.warn(
      { requested: config.clusterRequested },
      'clustering disabled: set DATABASE_URL and REDIS_URL so workers can share state',
    );
  }

  if (workers === 1) {
    // Single worker: skip the sticky proxy entirely, the worker listens itself.
    void startWorker().catch((error: Error) => {
      log.fatal({ err: error.message, stack: error.stack }, 'failed to start server');
      process.exit(1);
    });
    return;
  }

  // The primary owns the listening socket and routes each connection to a
  // worker by client IP, so websocket upgrades always reach the right process.
  const server = createServer();
  setupMaster(server, { loadBalancingMethod: 'least-connection' });
  setupClusterAdapter();
  cluster.setupPrimary({ serialization: 'advanced' });

  server.listen(config.PORT, config.HOST, () => {
    log.info({ host: config.HOST, port: config.PORT, workers }, 'cluster primary listening');
  });

  for (let i = 0; i < workers; i += 1) forkWorker('initial');

  cluster.on('exit', (worker, code, signal) => {
    const entry = health.get(worker.id);
    health.delete(worker.id);
    if (lifecycle.isShuttingDown) return;

    const restarts = (entry?.restarts ?? 0) + 1;
    log.error({ workerId: worker.id, code, signal, restarts }, 'worker died, respawning');
    if (restarts > MAX_RESTARTS_PER_WORKER) {
      log.fatal('worker restart budget exhausted, exiting');
      process.exit(1);
    }
    setTimeout(() => forkWorker('respawn'), RESTART_BACKOFF_MS).unref();
  });

  // Liveness supervision: a worker with a blocked event loop is replaced.
  const heartbeat = setInterval(() => {
    const nowMs = Date.now();
    for (const [id, worker] of Object.entries(cluster.workers ?? {})) {
      if (!worker) continue;
      const entry = health.get(Number(id));
      if (entry && nowMs - entry.lastPongAt > config.WORKER_HEARTBEAT_TIMEOUT_MS) {
        log.error({ workerId: id, silentMs: nowMs - entry.lastPongAt }, 'worker unresponsive, killing');
        worker.kill('SIGKILL');
        continue;
      }
      worker.send({ type: 'arcade:ping' });
    }
  }, config.WORKER_HEARTBEAT_MS);
  heartbeat.unref();

  lifecycle.register(
    'cluster:primary',
    async () => {
      clearInterval(heartbeat);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      const workersList = Object.values(cluster.workers ?? {});
      await Promise.all(
        workersList.map(
          (worker) =>
            new Promise<void>((resolve) => {
              if (!worker) return resolve();
              worker.once('exit', () => resolve());
              worker.kill('SIGTERM');
              setTimeout(() => {
                worker.kill('SIGKILL');
                resolve();
              }, config.SHUTDOWN_TIMEOUT_MS).unref();
            }),
        ),
      );
    },
    10,
  );
}

installProcessHandlers(config.SHUTDOWN_TIMEOUT_MS);

if (cluster.isPrimary) {
  startPrimary();
} else {
  startWorker().catch((error: Error) => {
    log.fatal({ err: error.message, stack: error.stack }, 'worker failed to start');
    process.exit(1);
  });
}
