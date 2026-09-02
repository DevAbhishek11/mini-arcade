import { Redis, type RedisOptions } from 'ioredis';
import { config } from '../config/env.js';
import { lifecycle } from './lifecycle.js';
import { createLogger } from './logger.js';

const log = createLogger('redis');

let client: Redis | null = null;
let healthy = false;

const baseOptions: RedisOptions = {
  keyPrefix: config.REDIS_KEY_PREFIX,
  lazyConnect: true,
  enableAutoPipelining: true,
  maxRetriesPerRequest: 2,
  connectTimeout: 5_000,
  keepAlive: 15_000,
  retryStrategy: (attempt) => Math.min(attempt * 250, 5_000),
};

function instrument(instance: Redis, name: string): Redis {
  instance.on('ready', () => {
    healthy = true;
    log.info({ name }, 'redis ready');
  });
  instance.on('error', (error: Error) => {
    healthy = false;
    log.warn({ name, err: error.message }, 'redis error, degrading to local mode');
  });
  instance.on('end', () => {
    healthy = false;
  });
  return instance;
}

/**
 * Returns the shared Redis client, or `null` when Redis is not configured.
 * Every caller must handle `null` — the arcade stays fully functional on a
 * single node without Redis (in-memory cache + local pub/sub).
 */
export function getRedis(): Redis | null {
  if (!config.hasRedis) return null;
  if (client) return client;

  client = instrument(new Redis(config.REDIS_URL as string, baseOptions), 'main');
  client.connect().catch((error: Error) => log.warn({ err: error.message }, 'initial redis connect failed'));
  lifecycle.register(
    'redis:main',
    async () => {
      await client?.quit().catch(() => client?.disconnect());
    },
    60,
  );
  return client;
}

/** Dedicated connections — pub/sub and the socket.io adapter cannot share the command client. */
export function createRedisConnection(name: string): Redis | null {
  if (!config.hasRedis) return null;
  const instance = instrument(
    new Redis(config.REDIS_URL as string, { ...baseOptions, keyPrefix: undefined }),
    name,
  );
  instance.connect().catch((error: Error) => log.warn({ name, err: error.message }, 'redis connect failed'));
  lifecycle.register(
    `redis:${name}`,
    async () => {
      await instance.quit().catch(() => instance.disconnect());
    },
    60,
  );
  return instance;
}

export const redisHealthy = (): boolean => healthy;

export async function pingRedis(): Promise<{ ok: boolean; latencyMs?: number; detail?: string }> {
  const instance = getRedis();
  if (!instance) return { ok: false, detail: 'not configured' };
  const startedAt = Date.now();
  try {
    await instance.ping();
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, detail: (error as Error).message };
  }
}
