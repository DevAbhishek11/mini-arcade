import type { GameId, Seat } from '@mini-arcade/shared';
import { GAME_IDS } from '@mini-arcade/shared';
import { config } from '../config/env.js';
import { createLogger } from '../infra/logger.js';
import { getRedis } from '../infra/redis.js';
import { getStorage } from '../domain/storage/index.js';
import { botIdentity, type BotDifficulty } from './bot.js';
import { bus, topics } from './bus.js';
import { Match, type MatchParticipant } from './match.js';
import { matchRegistry } from './match-registry.js';
import { presence } from './presence.js';
import { createSafeInterval } from '../utils/time.js';

const log = createLogger('matchmaking');

export interface Ticket {
  playerId: string;
  nickname: string;
  avatar: string;
  rating: number;
  played: number;
  level: number;
  gameId: GameId;
  nodeId: string;
  joinedAt: number;
}

export interface MatchAssignment {
  matchId: string;
  gameId: GameId;
  hostNodeId: string;
  seat: Seat;
}

const MATCHER_INTERVAL_MS = 600;
const LOCK_TTL_MS = 3_000;
const BASE_RATING_WINDOW = 120;
const WINDOW_GROWTH_PER_SECOND = 90;
const TICKET_TTL_MS = 5 * 60_000;

const queueKey = (gameId: GameId) => `mm:queue:${gameId}`;
const lockKey = (gameId: GameId) => `mm:lock:${gameId}`;

/**
 * Rating aware matchmaking.
 *
 * With Redis the queue is global: every worker/container shares it and a short
 * lived lock elects one matcher per tick, so a pair is created exactly once.
 * Without Redis each worker matches its own local queue (sticky sessions keep
 * a player pinned to one worker, so this still works).
 */
class Matchmaker {
  private readonly local = new Map<GameId, Map<string, Ticket>>();
  private loop: { stop(): void } | null = null;

  constructor() {
    for (const gameId of GAME_IDS) this.local.set(gameId, new Map());
  }

  start(): void {
    if (this.loop) return;
    this.loop = createSafeInterval(() => this.matchAll(), MATCHER_INTERVAL_MS);
  }

  stop(): void {
    this.loop?.stop();
    this.loop = null;
  }

  private bucket(gameId: GameId): Map<string, Ticket> {
    return this.local.get(gameId) as Map<string, Ticket>;
  }

  async join(ticket: Ticket): Promise<{ position: number; size: number }> {
    await this.leaveAll(ticket.playerId);
    const redis = getRedis();
    if (redis) {
      await redis.hset(queueKey(ticket.gameId), ticket.playerId, JSON.stringify(ticket));
    } else {
      this.bucket(ticket.gameId).set(ticket.playerId, ticket);
    }
    const tickets = await this.list(ticket.gameId);
    presence.setQueueSize(ticket.gameId, tickets.length);
    const sorted = tickets.sort((a, b) => a.joinedAt - b.joinedAt);
    return {
      position: Math.max(1, sorted.findIndex((t) => t.playerId === ticket.playerId) + 1),
      size: sorted.length,
    };
  }

  async leave(playerId: string, gameId: GameId): Promise<void> {
    const redis = getRedis();
    if (redis) await redis.hdel(queueKey(gameId), playerId);
    else this.bucket(gameId).delete(playerId);
    presence.setQueueSize(gameId, (await this.list(gameId)).length);
  }

  async leaveAll(playerId: string): Promise<void> {
    await Promise.all(GAME_IDS.map((gameId) => this.leave(playerId, gameId)));
  }

  async list(gameId: GameId): Promise<Ticket[]> {
    const redis = getRedis();
    if (!redis) return [...this.bucket(gameId).values()];
    try {
      const raw = await redis.hgetall(queueKey(gameId));
      return Object.values(raw)
        .map((value) => {
          try {
            return JSON.parse(value) as Ticket;
          } catch {
            return null;
          }
        })
        .filter((t): t is Ticket => t !== null);
    } catch {
      return [...this.bucket(gameId).values()];
    }
  }

  async sizes(): Promise<Record<GameId, number>> {
    const entries = await Promise.all(GAME_IDS.map(async (id) => [id, (await this.list(id)).length] as const));
    return Object.fromEntries(entries) as Record<GameId, number>;
  }

  private async acquireLock(gameId: GameId): Promise<() => Promise<void>> {
    const redis = getRedis();
    if (!redis) return async () => undefined;
    const token = `${bus.nodeId}:${Date.now()}`;
    const acquired = await redis.set(lockKey(gameId), token, 'PX', LOCK_TTL_MS, 'NX').catch(() => null);
    if (acquired !== 'OK') throw new Error('LOCK_BUSY');
    return async () => {
      // Release only if we still own it (compare-and-delete).
      const script = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
      await redis.eval(script, 1, `${config.REDIS_KEY_PREFIX}${lockKey(gameId)}`, token).catch(() => undefined);
    };
  }

  private async remove(gameId: GameId, playerIds: string[]): Promise<void> {
    const redis = getRedis();
    if (redis) await redis.hdel(queueKey(gameId), ...playerIds).catch(() => undefined);
    else for (const id of playerIds) this.bucket(gameId).delete(id);
  }

  private async matchAll(): Promise<void> {
    for (const gameId of GAME_IDS) {
      try {
        await this.matchGame(gameId);
      } catch (error) {
        if ((error as Error).message !== 'LOCK_BUSY') {
          log.warn({ gameId, err: (error as Error).message }, 'matchmaking pass failed');
        }
      }
    }
  }

  private async matchGame(gameId: GameId): Promise<void> {
    const tickets = await this.list(gameId);
    presence.setQueueSize(gameId, tickets.length);
    if (tickets.length === 0) return;
    if (matchRegistry.atCapacity()) {
      log.warn({ gameId }, 'worker at match capacity, deferring matchmaking');
      return;
    }

    const release = await this.acquireLock(gameId);
    try {
      const nowMs = Date.now();
      const fresh = tickets
        .filter((t) => nowMs - t.joinedAt < TICKET_TTL_MS)
        .sort((a, b) => a.rating - b.rating);
      const stale = tickets.filter((t) => nowMs - t.joinedAt >= TICKET_TTL_MS);
      if (stale.length)
        await this.remove(
          gameId,
          stale.map((t) => t.playerId),
        );

      const paired = new Set<string>();

      for (let i = 0; i < fresh.length; i += 1) {
        const a = fresh[i] as Ticket;
        if (paired.has(a.playerId)) continue;
        for (let j = i + 1; j < fresh.length; j += 1) {
          const b = fresh[j] as Ticket;
          if (paired.has(b.playerId)) continue;
          const waited = Math.max(nowMs - a.joinedAt, nowMs - b.joinedAt) / 1000;
          const window = BASE_RATING_WINDOW + waited * WINDOW_GROWTH_PER_SECOND;
          if (Math.abs(a.rating - b.rating) > window) continue;
          paired.add(a.playerId);
          paired.add(b.playerId);
          await this.remove(gameId, [a.playerId, b.playerId]);
          await this.createMatch(gameId, [a, b]);
          break;
        }
      }

      // Nobody to play against for a while: drop in a bot so the cabinet is never idle.
      if (config.BOT_FILL_MS > 0) {
        for (const ticket of fresh) {
          if (paired.has(ticket.playerId)) continue;
          if (nowMs - ticket.joinedAt < config.BOT_FILL_MS) continue;
          await this.remove(gameId, [ticket.playerId]);
          await this.createMatch(gameId, [ticket]);
        }
      }

      presence.setQueueSize(gameId, (await this.list(gameId)).length);
    } finally {
      await release();
    }
  }

  private async createMatch(gameId: GameId, tickets: Ticket[]): Promise<void> {
    const participants: MatchParticipant[] = tickets.map((ticket, index) => ({
      playerId: ticket.playerId,
      nickname: ticket.nickname,
      avatar: ticket.avatar,
      rating: ticket.rating,
      played: ticket.played,
      seat: index as Seat,
      connected: true,
      isBot: false,
      nodeId: ticket.nodeId,
      disconnectedAt: null,
    }));

    if (participants.length === 1) {
      // Match the bot roughly to the waiting player's rating.
      const ticket = tickets[0] as Ticket;
      const difficulty: BotDifficulty =
        ticket.rating >= 1400 ? 'brutal' : ticket.rating >= 1240 ? 'sharp' : 'chill';
      participants.push({
        ...botIdentity(difficulty),
        avatar: 'nebula',
        rating: Math.max(1000, Math.round(ticket.rating + (Math.random() * 80 - 40))),
        played: 50,
        seat: 1,
        connected: true,
        isBot: true,
        difficulty,
        nodeId: bus.nodeId,
        disconnectedAt: null,
      });
    }

    // Randomise who starts so seat 0 is not a permanent advantage.
    if (Math.random() < 0.5 && participants.length === 2) {
      participants[0]!.seat = 1;
      participants[1]!.seat = 0;
    }

    const match = new Match(gameId, participants);
    matchRegistry.add(match);

    const humans = participants.filter((p) => !p.isBot);
    await getStorage()
      .createMatch({ id: match.id, gameId, playerIds: humans.map((p) => p.playerId) })
      .catch((error: Error) => log.error({ err: error.message }, 'failed to persist match'));

    log.info({ matchId: match.id, gameId, players: participants.map((p) => p.nickname) }, 'match created');

    for (const participant of humans) {
      await bus.publish<MatchAssignment>(topics.player(participant.playerId), {
        matchId: match.id,
        gameId,
        hostNodeId: bus.nodeId,
        seat: participant.seat,
      });
    }
  }
}

export const matchmaker = new Matchmaker();
