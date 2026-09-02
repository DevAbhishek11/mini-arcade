import { LRUCache } from 'lru-cache';

export interface TokenBucketOptions {
  /** Sustained rate, tokens per second. */
  ratePerSecond: number;
  /** Maximum burst size. */
  burst: number;
  /** Maximum number of tracked keys (bounded memory). */
  maxKeys?: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * Bounded, allocation-light token bucket used for socket events and as the
 * in-process fallback for HTTP rate limiting.
 */
export class TokenBucketLimiter {
  private readonly buckets: LRUCache<string, Bucket>;

  constructor(private readonly options: TokenBucketOptions) {
    this.buckets = new LRUCache<string, Bucket>({
      max: options.maxKeys ?? 10_000,
      // lru-cache demands a positive integer, and burst/rate is rarely whole.
      ttl: Math.ceil(Math.max(60_000, (options.burst / options.ratePerSecond) * 4_000)),
    });
  }

  /** @returns remaining tokens, or `null` when the request must be rejected. */
  take(key: string, cost = 1): number | null {
    const nowMs = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.options.burst, updatedAt: nowMs };
    const elapsedSeconds = (nowMs - bucket.updatedAt) / 1000;
    const tokens = Math.min(this.options.burst, bucket.tokens + elapsedSeconds * this.options.ratePerSecond);

    if (tokens < cost) {
      this.buckets.set(key, { tokens, updatedAt: nowMs });
      return null;
    }

    const remaining = tokens - cost;
    this.buckets.set(key, { tokens: remaining, updatedAt: nowMs });
    return Math.floor(remaining);
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  get size(): number {
    return this.buckets.size;
  }
}
