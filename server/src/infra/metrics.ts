import client, { type Registry } from 'prom-client';
import { config } from '../config/env.js';

export const registry: Registry = new client.Registry();

registry.setDefaultLabels({ service: config.SERVICE_NAME, version: config.VERSION });

if (config.METRICS_ENABLED) {
  client.collectDefaultMetrics({ register: registry, prefix: 'arcade_' });
}

export const httpRequestDuration = new client.Histogram({
  name: 'arcade_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const httpRequestsTotal = new client.Counter({
  name: 'arcade_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const cacheOperations = new client.Counter({
  name: 'arcade_cache_operations_total',
  help: 'Cache operations by layer and result',
  labelNames: ['layer', 'result'] as const,
  registers: [registry],
});

export const dbQueryDuration = new client.Histogram({
  name: 'arcade_db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'status'] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 3],
  registers: [registry],
});

export const dbPoolGauge = new client.Gauge({
  name: 'arcade_db_pool_connections',
  help: 'Database pool connection counts',
  labelNames: ['state'] as const,
  registers: [registry],
});

export const socketConnections = new client.Gauge({
  name: 'arcade_socket_connections',
  help: 'Currently connected realtime sockets on this worker',
  registers: [registry],
});

export const matchesActive = new client.Gauge({
  name: 'arcade_matches_active',
  help: 'Matches currently simulated by this worker',
  labelNames: ['game'] as const,
  registers: [registry],
});

export const matchesTotal = new client.Counter({
  name: 'arcade_matches_total',
  help: 'Matches completed',
  labelNames: ['game', 'reason'] as const,
  registers: [registry],
});

export const queueGauge = new client.Gauge({
  name: 'arcade_matchmaking_queue_size',
  help: 'Players waiting in matchmaking',
  labelNames: ['game'] as const,
  registers: [registry],
});

export const tickDuration = new client.Histogram({
  name: 'arcade_game_tick_duration_seconds',
  help: 'Time spent simulating one scheduler tick',
  buckets: [0.0005, 0.001, 0.002, 0.005, 0.01, 0.025, 0.05, 0.1],
  registers: [registry],
});

export const socketEvents = new client.Counter({
  name: 'arcade_socket_events_total',
  help: 'Realtime events processed',
  labelNames: ['event', 'result'] as const,
  registers: [registry],
});
