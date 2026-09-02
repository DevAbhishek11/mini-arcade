import cluster from 'node:cluster';
import { Router } from 'express';
import type { HealthReport } from '@mini-arcade/shared';
import { config } from '../../config/env.js';
import { getStorage } from '../../domain/storage/index.js';
import { cache } from '../../infra/cache/index.js';
import { lifecycle } from '../../infra/lifecycle.js';
import { registry } from '../../infra/metrics.js';
import { pingRedis } from '../../infra/redis.js';
import { matchRegistry } from '../../realtime/match-registry.js';
import { matchmaker } from '../../realtime/matchmaking.js';
import { presence } from '../../realtime/presence.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const systemRouter: Router = Router();

const startedAt = Date.now();

/** Liveness: is the event loop responsive? Never touches dependencies. */
systemRouter.get('/live', (_req, res) => {
  res.json({ status: lifecycle.isShuttingDown ? 'draining' : 'ok', pid: process.pid });
});

/** Readiness: should the load balancer send traffic here? */
systemRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    if (lifecycle.isShuttingDown) {
      res.status(503).json({ status: 'draining' });
      return;
    }
    const storage = await getStorage().ping();
    res.status(storage.ok ? 200 : 503).json({ status: storage.ok ? 'ok' : 'degraded', storage });
  }),
);

systemRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [storage, redis] = await Promise.all([getStorage().ping(), pingRedis()]);
    const checks: HealthReport['checks'] = {
      storage: {
        status: storage.ok ? 'up' : 'down',
        latencyMs: storage.latencyMs,
        detail: `${getStorage().kind}${storage.detail ? ` (${storage.detail})` : ''}`,
      },
      redis: config.hasRedis
        ? { status: redis.ok ? 'up' : 'down', latencyMs: redis.latencyMs, detail: redis.detail }
        : { status: 'skipped', detail: 'not configured' },
      matches: { status: 'up', detail: `${matchRegistry.size} hosted` },
    };

    const down = Object.values(checks).filter((c) => c.status === 'down').length;
    const report: HealthReport = {
      status: down === 0 ? 'ok' : checks.storage?.status === 'down' ? 'down' : 'degraded',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      version: config.VERSION,
      workerId: cluster.worker?.id ?? 0,
      pid: process.pid,
      checks,
    };

    res.status(report.status === 'down' ? 503 : 200).json(report);
  }),
);

systemRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const stats = await presence.snapshot(await matchmaker.sizes());
    res.setHeader('cache-control', 'public, max-age=3');
    res.json(stats);
  }),
);

systemRouter.get(
  '/runtime',
  asyncHandler(async (_req, res) => {
    const memory = process.memoryUsage();
    res.json({
      workerId: cluster.worker?.id ?? 0,
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: {
        rss: +(memory.rss / 1024 / 1024).toFixed(1),
        heapUsed: +(memory.heapUsed / 1024 / 1024).toFixed(1),
        heapTotal: +(memory.heapTotal / 1024 / 1024).toFixed(1),
      },
      hostedMatches: matchRegistry.size,
      onlineLocal: presence.localOnlineCount(),
      cache: cache.stats(),
      storage: getStorage().kind,
      cluster: { workers: config.workerCount },
    });
  }),
);

export const metricsRouter: Router = Router();

metricsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    if (!config.METRICS_ENABLED) {
      res.status(404).end();
      return;
    }
    res.setHeader('content-type', registry.contentType);
    res.end(await registry.metrics());
  }),
);
