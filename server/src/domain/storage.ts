import type { GameId, LeaderboardEntry, MatchEndReason, MatchResult, PlayerPublic } from '@mini-arcade/shared';

export interface PlayerRecord {
  id: string;
  nickname: string;
  avatar: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface MatchRecord {
  id: string;
  gameId: GameId;
  status: 'active' | 'finished' | 'aborted';
  winnerId: string | null;
  reason: MatchEndReason | null;
  startedAt: Date;
  endedAt: Date | null;
}

export interface MatchPlayerResult {
  playerId: string;
  seat: 0 | 1;
  result: MatchResult;
  ratingBefore: number;
  ratingAfter: number;
}

export interface MatchHistoryItem {
  matchId: string;
  gameId: GameId;
  result: MatchResult;
  ratingDelta: number;
  opponentNickname: string | null;
  endedAt: string | null;
}

export interface LeaderboardQuery {
  gameId: GameId | 'all';
  limit: number;
  offset: number;
}

export interface Storage {
  readonly kind: 'postgres' | 'memory';
  init(): Promise<void>;
  createGuest(nickname: string, avatar: string): Promise<PlayerRecord>;
  findPlayerById(id: string): Promise<PlayerRecord | null>;
  findPlayerByNickname(nickname: string): Promise<PlayerRecord | null>;
  touchPlayer(id: string): Promise<void>;
  renamePlayer(id: string, nickname: string): Promise<PlayerRecord | null>;
  createMatch(match: { id: string; gameId: GameId; playerIds: string[] }): Promise<void>;
  finishMatch(input: {
    matchId: string;
    gameId: GameId;
    winnerId: string | null;
    reason: MatchEndReason;
    results: MatchPlayerResult[];
    aborted?: boolean;
  }): Promise<void>;
  leaderboard(query: LeaderboardQuery): Promise<{ items: LeaderboardEntry[]; total: number }>;
  playerHistory(playerId: string, limit: number): Promise<MatchHistoryItem[]>;
  countMatchesSince(since: Date): Promise<number>;
  countPlayers(): Promise<number>;
  ping(): Promise<{ ok: boolean; latencyMs?: number; detail?: string }>;
}

export function toPublicPlayer(record: PlayerRecord): PlayerPublic {
  return {
    id: record.id,
    nickname: record.nickname,
    avatar: record.avatar,
    rating: record.rating,
    wins: record.wins,
    losses: record.losses,
    draws: record.draws,
    createdAt: record.createdAt.toISOString(),
  };
}

export const nicknameKey = (nickname: string): string => nickname.trim().toLowerCase();
