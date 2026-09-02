import { config } from '../../config/env.js';
import { TokenBucketLimiter } from '../../utils/token-bucket.js';

/**
 * Per-player socket budgets. Every limiter is a bounded LRU, so a flood of
 * unique players cannot grow memory without limit.
 */
export const limiters = {
  action: new TokenBucketLimiter({
    ratePerSecond: config.SOCKET_ACTION_RATE,
    burst: config.SOCKET_ACTION_BURST,
    maxKeys: 20_000,
  }),
  queue: new TokenBucketLimiter({ ratePerSecond: 1, burst: 8, maxKeys: 20_000 }),
  chat: new TokenBucketLimiter({ ratePerSecond: 1, burst: 5, maxKeys: 20_000 }),
  emote: new TokenBucketLimiter({ ratePerSecond: 1.5, burst: 6, maxKeys: 20_000 }),
  room: new TokenBucketLimiter({ ratePerSecond: 0.5, burst: 6, maxKeys: 20_000 }),
  practice: new TokenBucketLimiter({ ratePerSecond: 0.4, burst: 4, maxKeys: 20_000 }),
};

export type LimiterName = keyof typeof limiters;

export function allow(name: LimiterName, playerId: string): boolean {
  return limiters[name].take(playerId) !== null;
}
