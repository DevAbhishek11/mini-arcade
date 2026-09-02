import { LRUCache } from 'lru-cache';
import { config } from '../../config/env.js';
import { cacheOperations } from '../metrics.js';
import { createLogger } from '../logger.js';
import { createRedisConnection, getRedis } from '../redis.js';

const log = createLogger('cache');

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export interface CacheOptions {
  /** Time to live in ms for the shared (L2) layer. */
  ttlMs?: number;
  /** Time to live in ms for the process local (L1) layer. Defaults to min(ttlMs, CACHE_L1_TTL_MS). */
  l1TtlMs?: number;
}

const INVALIDATION_CHANNEL = `${config.REDIS_KEY_PREFIX}cache:invalidate`;

/**
 * Two tier cache:
 *   L1 — per process LRU, microsecond reads, tiny TTL to bound staleness.
 *   L2 — Redis, shared by every worker and container (optional).
 *
 * Writes/invalidation publish to a Redis channel so every worker's L1 is
 * dropped at the same time; without Redis the L1 TTL alone bounds staleness.
 * A single flight map collapses concurrent misses for the same key into one
 * upstream call (stampede protection).
 */
class LayeredCache {
  private readonly l1: LRUCache<string, Entry<unknown>>;
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly instanceId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  private subscriber = false;

  constructor() {
    this.l1 = new LRUCache<string, Entry<unknown>>({
      max: config.CACHE_L1_MAX_ITEMS,
      ttl: config.CACHE_L1_TTL_MS,
      ttlAutopurge: false,
      updateAgeOnGet: false,
    });
    this.initSubscriber();
  }

  private initSubscriber(): void {
    if (this.subscriber) return;
    const sub = createRedisConnection('cache-invalidation');
    if (!sub) return;
    this.subscriber = true;
    sub.subscribe(INVALIDATION_CHANNEL).catch((error: Error) => {
      log.warn({ err: error.message }, 'cache invalidation subscribe failed');
    });
    sub.on('message', (_channel, raw) => {
      try {
        const message = JSON.parse(raw) as { origin: string; prefixes: string[] };
        if (message.origin === this.instanceId) return;
        for (const prefix of message.prefixes) this.dropLocal(prefix);
      } catch {
        /* ignore malformed invalidation payloads */
      }
    });
  }

  private dropLocal(prefix: string): void {
    for (const key of this.l1.keys()) {
      if (key.startsWith(prefix)) this.l1.delete(key);
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const local = this.l1.get(key) as Entry<T> | undefined;
    if (local && local.expiresAt > Date.now()) {
      cacheOperations.inc({ layer: 'l1', result: 'hit' });
      return local.value;
    }
    cacheOperations.inc({ layer: 'l1', result: 'miss' });

    const redis = getRedis();
    if (!redis) return undefined;
    try {
      const raw = await redis.get(key);
      if (raw === null) {
        cacheOperations.inc({ layer: 'l2', result: 'miss' });
        return undefined;
      }
      cacheOperations.inc({ layer: 'l2', result: 'hit' });
      const value = JSON.parse(raw) as T;
      this.setLocal(key, value, config.CACHE_L1_TTL_MS);
      return value;
    } catch (error) {
      cacheOperations.inc({ layer: 'l2', result: 'error' });
      log.debug({ key, err: (error as Error).message }, 'cache read failed');
      return undefined;
    }
  }

  private setLocal<T>(key: string, value: T, ttlMs: number): void {
    this.l1.set(key, { value, expiresAt: Date.now() + ttlMs }, { ttl: ttlMs });
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const ttlMs = options.ttlMs ?? config.CACHE_DEFAULT_TTL_MS;
    this.setLocal(key, value, Math.min(options.l1TtlMs ?? config.CACHE_L1_TTL_MS, ttlMs));

    const redis = getRedis();
    if (!redis) return;
    try {
      await redis.set(key, JSON.stringify(value), 'PX', ttlMs);
      cacheOperations.inc({ layer: 'l2', result: 'write' });
    } catch (error) {
      cacheOperations.inc({ layer: 'l2', result: 'error' });
      log.debug({ key, err: (error as Error).message }, 'cache write failed');
    }
  }

  /** Cache aside helper with single flight de-duplication. */
  async wrap<T>(key: string, options: CacheOptions, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;

    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) {
      cacheOperations.inc({ layer: 'singleflight', result: 'join' });
      return existing;
    }

    const promise = loader()
      .then(async (value) => {
        await this.set(key, value, options);
        return value;
      })
      .finally(() => this.inflight.delete(key));

    this.inflight.set(key, promise);
    return promise;
  }

  async invalidate(...prefixes: string[]): Promise<void> {
    for (const prefix of prefixes) this.dropLocal(prefix);

    const redis = getRedis();
    if (!redis) return;
    try {
      for (const prefix of prefixes) {
        // SCAN instead of KEYS: never blocks the Redis event loop.
        let cursor = '0';
        do {
          const [next, keys] = await redis.scan(
            cursor,
            'MATCH',
            `${config.REDIS_KEY_PREFIX}${prefix}*`,
            'COUNT',
            200,
          );
          cursor = next;
          if (keys.length > 0) {
            // keys from SCAN already include the prefix; strip it for the prefixed client.
            await redis.del(...keys.map((k) => k.slice(config.REDIS_KEY_PREFIX.length)));
          }
        } while (cursor !== '0');
      }
      await redis.publish(INVALIDATION_CHANNEL, JSON.stringify({ origin: this.instanceId, prefixes }));
    } catch (error) {
      log.debug({ err: (error as Error).message }, 'cache invalidation failed');
    }
  }

  stats(): { l1Size: number; l1Max: number; redis: boolean } {
    return { l1Size: this.l1.size, l1Max: config.CACHE_L1_MAX_ITEMS, redis: Boolean(getRedis()) };
  }

  clear(): void {
    this.l1.clear();
  }
}

export const cache = new LayeredCache();

export const cacheKeys = {
  leaderboard: (gameId: string, limit: number, offset: number) => `lb:${gameId}:${limit}:${offset}`,
  leaderboardPrefix: 'lb:',
  player: (id: string) => `player:${id}`,
  playerPrefix: 'player:',
  playerMatches: (id: string, limit: number) => `player:${id}:matches:${limit}`,
  stats: () => 'stats:global',
  statsPrefix: 'stats:',
};
