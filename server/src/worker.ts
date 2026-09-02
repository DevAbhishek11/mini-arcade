import cluster from 'node:cluster';
import { createServer } from 'node:http';
import { setupWorker } from '@socket.io/sticky';
import { config } from './config/env.js';
import { initStorage } from './domain/storage/index.js';
import { createApp } from './http/app.js';
import { lifecycle } from './infra/lifecycle.js';
import { createLogger } from './infra/logger.js';
import { getRedis } from './infra/redis.js';
import { createGateway } from './realtime/gateway.js';

const log = createLogger('worker');

/**
 * Boots one HTTP + realtime worker.
 *
 * When it runs inside the cluster the primary owns the listening socket and
 * hands connections over (`@socket.io/sticky`), which guarantees a websocket
 * upgrade lands on the same worker as its handshake.
 */
export async function startWorker(): Promise<void> {
  await initStorage();
  getRedis(); // eagerly warm the connection pool

  const app = createApp();
  const server = createServer(app);

  server.keepAliveTimeout = config.KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = config.KEEP_ALIVE_TIMEOUT_MS + 5_000;
  server.requestTimeout = config.REQUEST_TIMEOUT_MS + 5_000;
  server.maxRequestsPerSocket = 0;

  await createGateway(server);

  // Stop accepting connections first, then let the rest of the resources close.
  lifecycle.register(
    'http:server',
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        setTimeout(resolve, config.SHUTDOWN_TIMEOUT_MS / 2).unref();
      }),
    10,
  );

  if (cluster.isWorker && process.env.STICKY === '1') {
    setupWorker(await import('./realtime/gateway.js').then((m) => m.getIo()));
    log.info({ workerId: cluster.worker?.id }, 'worker attached to sticky primary');
  } else {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.PORT, config.HOST, () => resolve());
    });
    log.info(
      { host: config.HOST, port: config.PORT, pid: process.pid, env: config.NODE_ENV },
      'http server listening',
    );
  }

  if (cluster.isWorker) {
    process.on('message', (message: unknown) => {
      if ((message as { type?: string })?.type !== 'arcade:ping') return;
      process.send?.({
        type: 'arcade:pong',
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        at: Date.now(),
      });
    });
  }
}
