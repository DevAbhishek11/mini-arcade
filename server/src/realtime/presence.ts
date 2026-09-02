import type { ArcadeStats, GameId } from '@mini-arcade/shared';
import { GAME_IDS } from '@mini-arcade/shared';
import { config } from '../config/env.js';
import { getStorage } from '../domain/storage/index.js';
import { createLogger } from '../infra/logger.js';
import { getRedis } from '../infra/redis.js';
import { queueGauge, socketConnections } from '../infra/metrics.js';
import { startOfToday } from '../utils/time.js';

const log = createLogger('presence');

const ONLINE_KEY = 'presence:online';
const MATCH_KEY = 'presence:matches';
const HEARTBEAT_TTL_SECONDS = 45;

/**
 * Fleet wide presence. Redis sorted sets give an exact, self healing count
 * (stale entries expire by timestamp); without Redis we count locally.
 */
class PresenceTracker {
  private readonly localPlayers = new Set<string>();
  private readonly localMatches = new Set<string>();
  private readonly localQueue = new Map<GameId, number>();

  async playerOnline(playerId: string): Promise<void> {
    this.localPlayers.add(playerId);
    socketConnections.set(this.localPlayers.size);
    const redis = getRedis();
    if (!redis) return;
    await redis.zadd(ONLINE_KEY, Date.now(), playerId).catch(() => undefined);
  }

  async playerOffline(playerId: string): Promise<void> {
    this.localPlayers.delete(playerId);
    socketConnections.set(this.localPlayers.size);
    const redis = getRedis();
    if (!redis) return;
    await redis.zrem(ONLINE_KEY, playerId).catch(() => undefined);
  }

  async heartbeat(playerIds: Iterable<string>): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    const pipeline = redis.pipeline();
    const stamp = Date.now();
    for (const id of playerIds) pipeline.zadd(ONLINE_KEY, stamp, id);
    pipeline.zremrangebyscore(ONLINE_KEY, 0, stamp - HEARTBEAT_TTL_SECONDS * 1000);
    await pipeline.exec().catch(() => undefined);
  }

  async matchStarted(matchId: string): Promise<void> {
    this.localMatches.add(matchId);
    const redis = getRedis();
    if (!redis) return;
    await redis.zadd(MATCH_KEY, Date.now(), matchId).catch(() => undefined);
  }

  async matchEnded(matchId: string): Promise<void> {
    this.localMatches.delete(matchId);
    const redis = getRedis();
    if (!redis) return;
    await redis.zrem(MATCH_KEY, matchId).catch(() => undefined);
  }

  setQueueSize(gameId: GameId, size: number): void {
    this.localQueue.set(gameId, size);
    queueGauge.set({ game: gameId }, size);
  }

  localOnlineCount(): number {
    return this.localPlayers.size;
  }

  async snapshot(queueSizes: Record<GameId, number>): Promise<ArcadeStats> {
    const redis = getRedis();
    let playersOnline = this.localPlayers.size;
    let matchesInProgress = this.localMatches.size;

    if (redis) {
      try {
        const cutoff = Date.now() - HEARTBEAT_TTL_SECONDS * 1000;
        const [online, matches] = await Promise.all([
          redis.zcount(ONLINE_KEY, cutoff, '+inf'),
          redis.zcard(MATCH_KEY),
        ]);
        playersOnline = online;
        matchesInProgress = matches;
      } catch (error) {
        log.debug({ err: (error as Error).message }, 'presence snapshot degraded to local counts');
      }
    }

    const storage = getStorage();
    const [matchesToday, totalPlayers] = await Promise.all([
      storage.countMatchesSince(startOfToday()).catch(() => 0),
      storage.countPlayers().catch(() => 0),
    ]);

    const queued = Object.fromEntries(GAME_IDS.map((id) => [id, queueSizes[id] ?? 0])) as Record<
      GameId,
      number
    >;
    return { playersOnline, matchesInProgress, queued, matchesToday, totalPlayers };
  }

  /** Drop this node's entries on shutdown so counters stay accurate. */
  async clearLocal(): Promise<void> {
    const redis = getRedis();
    if (redis) {
      const pipeline = redis.pipeline();
      for (const id of this.localPlayers) pipeline.zrem(ONLINE_KEY, id);
      for (const id of this.localMatches) pipeline.zrem(MATCH_KEY, id);
      await pipeline.exec().catch(() => undefined);
    }
    this.localPlayers.clear();
    this.localMatches.clear();
  }
}

export const presence = new PresenceTracker();
export const presenceConfig = {
  heartbeatMs: Math.floor((HEARTBEAT_TTL_SECONDS * 1000) / 3),
  keyPrefix: config.REDIS_KEY_PREFIX,
};
