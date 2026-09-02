import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '../../config/env.js';
import { getRedis } from '../../infra/redis.js';
import { AppError } from '../../utils/errors.js';
import { TokenBucketLimiter } from '../../utils/token-bucket.js';

export interface RateLimitOptions {
  name: string;
  windowMs?: number;
  max?: number;
  keyFn?: (req: Request) => string;
}

/**
 * Distributed fixed-window rate limiting backed by Redis (`INCR` + `PEXPIRE`
 * in one round trip), with an in-process token bucket fallback so the limit
 * still applies when Redis is down.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const windowMs = options.windowMs ?? config.RATE_LIMIT_WINDOW_MS;
  const max = options.max ?? config.RATE_LIMIT_MAX;
  const fallback = new TokenBucketLimiter({
    ratePerSecond: max / (windowMs / 1000),
    burst: max,
    maxKeys: 20_000,
  });

  const keyFn = options.keyFn ?? ((req: Request) => req.playerId ?? req.ip ?? 'anonymous');

  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const identity = keyFn(req);
    const redis = getRedis();

    if (!redis) {
      const remaining = fallback.take(identity);
      res.setHeader('x-ratelimit-limit', max);
      if (remaining === null) return next(AppError.tooManyRequests());
      res.setHeader('x-ratelimit-remaining', remaining);
      return next();
    }

    const bucket = Math.floor(Date.now() / windowMs);
    const key = `rl:${options.name}:${identity}:${bucket}`;
    try {
      const [countResult] = (await redis.multi().incr(key).pexpire(key, windowMs).exec()) as [
        [Error | null, number],
        ...unknown[],
      ];
      const count = Number(countResult?.[1] ?? 0);
      res.setHeader('x-ratelimit-limit', max);
      res.setHeader('x-ratelimit-remaining', Math.max(0, max - count));
      res.setHeader('x-ratelimit-reset', Math.ceil(((bucket + 1) * windowMs - Date.now()) / 1000));
      if (count > max) {
        return next(
          AppError.tooManyRequests('Rate limit exceeded', {
            retryAfterMs: (bucket + 1) * windowMs - Date.now(),
          }),
        );
      }
      return next();
    } catch {
      const remaining = fallback.take(identity);
      if (remaining === null) return next(AppError.tooManyRequests());
      return next();
    }
  };
}
