import { describe, expect, it } from 'vitest';
import { TokenBucketLimiter } from '../src/utils/token-bucket.js';

describe('TokenBucketLimiter', () => {
  it('accepts rates whose derived ttl is fractional', () => {
    // 500 requests per 60s window → burst/rate = 60.0000000001 seconds.
    expect(() => new TokenBucketLimiter({ ratePerSecond: 500 / 60, burst: 500 })).not.toThrow();
    expect(() => new TokenBucketLimiter({ ratePerSecond: 1 / 3, burst: 7 })).not.toThrow();
  });

  it('allows a burst and then refuses', () => {
    const limiter = new TokenBucketLimiter({ ratePerSecond: 1, burst: 3 });
    expect(limiter.take('ip')).toBe(2);
    expect(limiter.take('ip')).toBe(1);
    expect(limiter.take('ip')).toBe(0);
    expect(limiter.take('ip')).toBeNull();
  });

  it('tracks callers independently and can be reset', () => {
    const limiter = new TokenBucketLimiter({ ratePerSecond: 1, burst: 1 });
    expect(limiter.take('a')).toBe(0);
    expect(limiter.take('b')).toBe(0);
    expect(limiter.take('a')).toBeNull();

    limiter.reset('a');
    expect(limiter.take('a')).toBe(0);
  });

  it('stays bounded in memory', () => {
    const limiter = new TokenBucketLimiter({ ratePerSecond: 10, burst: 10, maxKeys: 50 });
    for (let i = 0; i < 500; i += 1) limiter.take(`ip-${i}`);
    expect(limiter.size).toBeLessThanOrEqual(50);
  });
});
