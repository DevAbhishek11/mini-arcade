/**
 * Core arcade domain primitives shared by the server and the web client.
 */

export const GAME_IDS = ['tic-tac-toe', 'connect-four', 'pong'] as const;
export type GameId = (typeof GAME_IDS)[number];

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && (GAME_IDS as readonly string[]).includes(value);
}

export type GameMode = 'realtime' | 'turn-based';

export interface GameCatalogEntry {
  id: GameId;
  name: string;
  tagline: string;
  description: string;
  mode: GameMode;
  players: number;
  /** Server simulation frequency. `0` for purely event driven games. */
  tickRate: number;
  /** Milliseconds a player may take before forfeiting their turn (turn based only). */
  turnTimeoutMs: number;
  accent: string;
}

export const GAME_CATALOG: Record<GameId, GameCatalogEntry> = {
  'tic-tac-toe': {
    id: 'tic-tac-toe',
    name: 'Tic Tac Toe',
    tagline: 'Three in a row, sixty seconds a move.',
    description:
      'The classic 3x3 duel with a server authoritative clock. Every move is validated, replayed and rated.',
    mode: 'turn-based',
    players: 2,
    tickRate: 0,
    turnTimeoutMs: 30_000,
    accent: '#22d3ee',
  },
  'connect-four': {
    id: 'connect-four',
    name: 'Connect Four',
    tagline: 'Gravity powered strategy.',
    description:
      'Drop discs into a 7x6 grid and line up four before your opponent does. Deterministic engine, shared by client and server.',
    mode: 'turn-based',
    players: 2,
    tickRate: 0,
    turnTimeoutMs: 30_000,
    accent: '#a855f7',
  },
  pong: {
    id: 'pong',
    name: 'Neon Pong',
    tagline: 'Sixty ticks per second of reflex.',
    description:
      'A fully server simulated Pong match. Inputs are streamed, physics run on the server, the client renders interpolated state.',
    mode: 'realtime',
    players: 2,
    tickRate: 30,
    turnTimeoutMs: 0,
    accent: '#f472b6',
  },
};

export const GAME_LIST: GameCatalogEntry[] = GAME_IDS.map((id) => GAME_CATALOG[id]);

export type MatchStatus = 'waiting' | 'active' | 'finished' | 'aborted';
export type MatchResult = 'win' | 'loss' | 'draw';
export type MatchEndReason = 'victory' | 'draw' | 'forfeit' | 'timeout' | 'disconnect' | 'aborted';

export interface PlayerPublic {
  id: string;
  nickname: string;
  avatar: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  createdAt: string;
}

export interface PlayerSlot {
  playerId: string;
  nickname: string;
  avatar: string;
  rating: number;
  seat: 0 | 1;
  connected: boolean;
}

export interface MatchSummary {
  id: string;
  gameId: GameId;
  status: MatchStatus;
  players: PlayerSlot[];
  winnerId: string | null;
  reason: MatchEndReason | null;
  startedAt: string | null;
  endedAt: string | null;
  ratingDelta: Record<string, number>;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  nickname: string;
  avatar: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  played: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  uptimeSeconds: number;
  version: string;
  workerId: number;
  pid: number;
  checks: Record<string, { status: 'up' | 'down' | 'skipped'; latencyMs?: number; detail?: string }>;
}

export interface ArcadeStats {
  playersOnline: number;
  matchesInProgress: number;
  queued: Record<GameId, number>;
  matchesToday: number;
  totalPlayers: number;
}
