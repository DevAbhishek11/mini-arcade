import { describe, expect, it, vi } from 'vitest';
import { cache } from '../src/infra/cache/index.js';
import { TokenBucketLimiter } from '../src/utils/token-bucket.js';

describe('layered cache', () => {
  it('serves the second read from L1', async () => {
    const loader = vi.fn().mockResolvedValue({ value: 1 });
    await cache.wrap('test:hit', { ttlMs: 5_000 }, loader);
    await cache.wrap('test:hit', { ttlMs: 5_000 }, loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent misses into a single upstream call', async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return calls;
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => cache.wrap('test:stampede', { ttlMs: 5_000 }, loader)),
    );
    expect(calls).toBe(1);
    expect(new Set(results).size).toBe(1);
  });

  it('drops keys by prefix on invalidation', async () => {
    await cache.set('lb:all:20:0', ['a'], { ttlMs: 30_000 });
    expect(await cache.get('lb:all:20:0')).toEqual(['a']);
    await cache.invalidate('lb:');
    expect(await cache.get('lb:all:20:0')).toBeUndefined();
  });
});

describe('token bucket', () => {
  it('allows a burst then refuses', () => {
    const limiter = new TokenBucketLimiter({ ratePerSecond: 1, burst: 3 });
    expect(limiter.take('k')).not.toBeNull();
    expect(limiter.take('k')).not.toBeNull();
    expect(limiter.take('k')).not.toBeNull();
    expect(limiter.take('k')).toBeNull();
  });

  it('refills over time', async () => {
    const limiter = new TokenBucketLimiter({ ratePerSecond: 50, burst: 1 });
    expect(limiter.take('k')).not.toBeNull();
    expect(limiter.take('k')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(limiter.take('k')).not.toBeNull();
  });
});
