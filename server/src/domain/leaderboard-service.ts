import type { GameId, LeaderboardEntry, Paginated } from '@mini-arcade/shared';
import { config } from '../config/env.js';
import { cache, cacheKeys } from '../infra/cache/index.js';
import { getStorage } from './storage/index.js';

export const leaderboardService = {
  async top(gameId: GameId | 'all', limit: number, offset: number): Promise<Paginated<LeaderboardEntry>> {
    const key = cacheKeys.leaderboard(gameId, limit, offset);
    const { items, total } = await cache.wrap(key, { ttlMs: config.CACHE_LEADERBOARD_TTL_MS }, () =>
      getStorage().leaderboard({ gameId, limit, offset }),
    );
    return { items, total, limit, offset };
  },

  async invalidate(): Promise<void> {
    await cache.invalidate(cacheKeys.leaderboardPrefix);
  },
};
