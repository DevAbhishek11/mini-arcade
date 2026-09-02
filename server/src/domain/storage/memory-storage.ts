import { randomUUID } from 'node:crypto';
import type { LeaderboardEntry } from '@mini-arcade/shared';
import { DEFAULT_RATING, GAME_IDS } from '@mini-arcade/shared';
import { createLogger } from '../../infra/logger.js';
import { emailKey } from '../../utils/password.js';
import {
  nicknameKey,
  type AccountInput,
  type LeaderboardQuery,
  type MatchHistoryItem,
  type MatchRecord,
  type PlayerRecord,
  type Storage,
} from '../storage.js';

const log = createLogger('storage:memory');

interface GameStats {
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

interface MemMatch extends MatchRecord {
  playerIds: string[];
  results: Map<string, { result: 'win' | 'loss' | 'draw'; delta: number }>;
}

/**
 * Zero dependency storage used for local development, tests and as a
 * degraded mode when Postgres is unavailable. Same contract as the
 * Postgres driver, bounded in size so it can never leak memory.
 */
export class MemoryStorage implements Storage {
  readonly kind = 'memory' as const;

  private readonly players = new Map<string, PlayerRecord>();
  private readonly byNickname = new Map<string, string>();
  private readonly byEmail = new Map<string, string>();
  private readonly gameStats = new Map<string, Map<string, GameStats>>();
  private readonly matches = new Map<string, MemMatch>();
  private readonly matchOrder: string[] = [];
  private readonly maxMatches = 5_000;

  async init(): Promise<void> {
    log.warn('using in-memory storage — data is not durable across restarts');
  }

  private statsFor(playerId: string, gameId: string): GameStats {
    let perGame = this.gameStats.get(playerId);
    if (!perGame) {
      perGame = new Map();
      this.gameStats.set(playerId, perGame);
    }
    let stats = perGame.get(gameId);
    if (!stats) {
      stats = { rating: DEFAULT_RATING, wins: 0, losses: 0, draws: 0 };
      perGame.set(gameId, stats);
    }
    return stats;
  }

  async createGuest(nickname: string, avatar: string): Promise<PlayerRecord> {
    const now = new Date();
    const record: PlayerRecord = {
      id: randomUUID(),
      nickname,
      avatar,
      rating: DEFAULT_RATING,
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: now,
      lastSeenAt: now,
      isGuest: true,
      email: null,
      passwordHash: null,
    };
    this.players.set(record.id, record);
    this.byNickname.set(nicknameKey(nickname), record.id);
    for (const gameId of GAME_IDS) this.statsFor(record.id, gameId);
    return record;
  }

  async createAccount(input: AccountInput): Promise<PlayerRecord> {
    const key = emailKey(input.email);
    if (this.byEmail.has(key)) throw Object.assign(new Error('email taken'), { code: 'EMAIL_TAKEN' });
    if (this.byNickname.has(nicknameKey(input.nickname))) {
      throw Object.assign(new Error('nickname taken'), { code: 'NICKNAME_TAKEN' });
    }

    const record = await this.createGuest(input.nickname, input.avatar);
    record.isGuest = false;
    record.email = input.email;
    record.passwordHash = input.passwordHash;
    this.byEmail.set(key, record.id);
    return record;
  }

  async upgradeGuest(id: string, input: Omit<AccountInput, 'avatar'>): Promise<PlayerRecord | null> {
    const player = this.players.get(id);
    if (!player) return null;

    const key = emailKey(input.email);
    const emailOwner = this.byEmail.get(key);
    if (emailOwner && emailOwner !== id) throw Object.assign(new Error('email taken'), { code: 'EMAIL_TAKEN' });

    const nickKey = nicknameKey(input.nickname);
    const nickOwner = this.byNickname.get(nickKey);
    if (nickOwner && nickOwner !== id)
      throw Object.assign(new Error('nickname taken'), { code: 'NICKNAME_TAKEN' });

    this.byNickname.delete(nicknameKey(player.nickname));
    this.byNickname.set(nickKey, id);
    this.byEmail.set(key, id);

    player.nickname = input.nickname;
    player.email = input.email;
    player.passwordHash = input.passwordHash;
    player.isGuest = false;
    return player;
  }

  async findPlayerByEmail(email: string): Promise<PlayerRecord | null> {
    const id = this.byEmail.get(emailKey(email));
    return id ? (this.players.get(id) ?? null) : null;
  }

  async findPlayerById(id: string): Promise<PlayerRecord | null> {
    return this.players.get(id) ?? null;
  }

  async findPlayerByNickname(nickname: string): Promise<PlayerRecord | null> {
    const id = this.byNickname.get(nicknameKey(nickname));
    return id ? (this.players.get(id) ?? null) : null;
  }

  async touchPlayer(id: string): Promise<void> {
    const player = this.players.get(id);
    if (player) player.lastSeenAt = new Date();
  }

  async renamePlayer(id: string, nickname: string): Promise<PlayerRecord | null> {
    const player = this.players.get(id);
    if (!player) return null;
    const key = nicknameKey(nickname);
    const owner = this.byNickname.get(key);
    if (owner && owner !== id) throw Object.assign(new Error('nickname taken'), { code: 'NICKNAME_TAKEN' });
    this.byNickname.delete(nicknameKey(player.nickname));
    player.nickname = nickname;
    this.byNickname.set(key, id);
    return player;
  }

  async createMatch(match: { id: string; gameId: never; playerIds: string[] }): Promise<void> {
    this.matches.set(match.id, {
      id: match.id,
      gameId: match.gameId,
      status: 'active',
      winnerId: null,
      reason: null,
      startedAt: new Date(),
      endedAt: null,
      playerIds: match.playerIds,
      results: new Map(),
    });
    this.matchOrder.push(match.id);
    while (this.matchOrder.length > this.maxMatches) {
      const oldest = this.matchOrder.shift();
      if (oldest) this.matches.delete(oldest);
    }
  }

  async finishMatch(input: Parameters<Storage['finishMatch']>[0]): Promise<void> {
    const match = this.matches.get(input.matchId);
    if (match) {
      match.status = input.aborted ? 'aborted' : 'finished';
      match.winnerId = input.winnerId;
      match.reason = input.reason;
      match.endedAt = new Date();
    }

    if (input.aborted) return;

    for (const entry of input.results) {
      const player = this.players.get(entry.playerId);
      if (!player) continue;
      const delta = entry.ratingAfter - entry.ratingBefore;
      player.rating = entry.ratingAfter;
      const stats = this.statsFor(entry.playerId, input.gameId);
      stats.rating += delta;
      if (entry.result === 'win') {
        player.wins += 1;
        stats.wins += 1;
      } else if (entry.result === 'loss') {
        player.losses += 1;
        stats.losses += 1;
      } else {
        player.draws += 1;
        stats.draws += 1;
      }
      match?.results.set(entry.playerId, { result: entry.result, delta });
    }
  }

  async leaderboard(query: LeaderboardQuery): Promise<{ items: LeaderboardEntry[]; total: number }> {
    const rows = [...this.players.values()].map((player) => {
      const stats =
        query.gameId === 'all'
          ? { rating: player.rating, wins: player.wins, losses: player.losses, draws: player.draws }
          : this.statsFor(player.id, query.gameId);
      return { player, stats };
    });

    const ranked = rows
      .filter(({ stats }) => stats.wins + stats.losses + stats.draws > 0 || query.gameId === 'all')
      .sort((a, b) => b.stats.rating - a.stats.rating || b.stats.wins - a.stats.wins)
      .map(({ player, stats }, index) => ({
        rank: index + 1,
        playerId: player.id,
        nickname: player.nickname,
        avatar: player.avatar,
        rating: stats.rating,
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws,
        played: stats.wins + stats.losses + stats.draws,
      }));

    return { items: ranked.slice(query.offset, query.offset + query.limit), total: ranked.length };
  }

  async playerHistory(playerId: string, limit: number): Promise<MatchHistoryItem[]> {
    const items: MatchHistoryItem[] = [];
    for (let i = this.matchOrder.length - 1; i >= 0 && items.length < limit; i -= 1) {
      const match = this.matches.get(this.matchOrder[i] as string);
      if (!match || !match.playerIds.includes(playerId) || match.status === 'active') continue;
      const own = match.results.get(playerId);
      const opponentId = match.playerIds.find((id) => id !== playerId) ?? null;
      items.push({
        matchId: match.id,
        gameId: match.gameId,
        result: own?.result ?? 'draw',
        ratingDelta: own?.delta ?? 0,
        opponentNickname: opponentId ? (this.players.get(opponentId)?.nickname ?? null) : null,
        endedAt: match.endedAt?.toISOString() ?? null,
      });
    }
    return items;
  }

  async countMatchesSince(since: Date): Promise<number> {
    let count = 0;
    for (const match of this.matches.values()) {
      if (match.startedAt >= since) count += 1;
    }
    return count;
  }

  async countPlayers(): Promise<number> {
    return this.players.size;
  }

  async ping(): Promise<{ ok: boolean; latencyMs?: number; detail?: string }> {
    return { ok: true, latencyMs: 0, detail: 'in-memory' };
  }
}
