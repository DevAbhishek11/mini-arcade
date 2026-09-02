import type { PlayerPublic } from '@mini-arcade/shared';
import { config } from '../config/env.js';
import { cache, cacheKeys } from '../infra/cache/index.js';
import { toPublicPlayer, type MatchHistoryItem } from './storage.js';
import { getStorage } from './storage/index.js';
import { AppError } from '../utils/errors.js';
import { NICKNAME_PATTERN, sanitizeNickname } from '../utils/nickname.js';

export const playerService = {
  /** Cache aside read with single flight protection (see LayeredCache.wrap). */
  async getById(id: string): Promise<PlayerPublic | null> {
    const cached = await cache.wrap<PlayerPublic | null>(
      cacheKeys.player(id),
      { ttlMs: config.CACHE_DEFAULT_TTL_MS },
      async () => {
        const record = await getStorage().findPlayerById(id);
        return record ? toPublicPlayer(record) : null;
      },
    );
    return cached;
  },

  async requireById(id: string): Promise<PlayerPublic> {
    const player = await this.getById(id);
    if (!player) throw AppError.notFound('Player not found');
    return player;
  },

  async rename(id: string, nickname: string): Promise<PlayerPublic> {
    const clean = sanitizeNickname(nickname);
    if (!NICKNAME_PATTERN.test(clean)) {
      throw AppError.badRequest('Nickname must be 3-18 characters: letters, digits, _ . or -');
    }
    try {
      const record = await getStorage().renamePlayer(id, clean);
      if (!record) throw AppError.notFound('Player not found');
      await cache.invalidate(cacheKeys.player(id), cacheKeys.leaderboardPrefix);
      return toPublicPlayer(record);
    } catch (error) {
      if ((error as { code?: string }).code === 'NICKNAME_TAKEN') {
        throw AppError.conflict('NICKNAME_TAKEN', 'That nickname is already taken');
      }
      throw error;
    }
  },

  async history(id: string, limit: number): Promise<MatchHistoryItem[]> {
    return cache.wrap(cacheKeys.playerMatches(id, limit), { ttlMs: 10_000 }, () =>
      getStorage().playerHistory(id, limit),
    );
  },

  async touch(id: string): Promise<void> {
    await getStorage()
      .touchPlayer(id)
      .catch(() => undefined);
  },

  async invalidate(...ids: string[]): Promise<void> {
    await cache.invalidate(
      ...ids.map((id) => cacheKeys.player(id)),
      cacheKeys.leaderboardPrefix,
      cacheKeys.statsPrefix,
    );
  },
};
