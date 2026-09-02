/**
 * Core arcade domain primitives shared by the server and the web client.
 */

export const GAME_IDS = [
  'tic-tac-toe',
  'connect-four',
  'gomoku',
  'reversi',
  'dots-and-boxes',
  'pong',
  'snake-duel',
  'ultimate-tic-tac-toe',
  'checkers',
  'mancala',
  'hex',
] as const;
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
  /** One line rules summary shown in the "how to play" sheet. */
  howTo: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  averageMinutes: number;
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
    difficulty: 'easy',
    averageMinutes: 1,
    howTo: [
      'Take turns claiming a square on the 3x3 grid.',
      'Line up three of your marks horizontally, vertically or diagonally.',
      'Run out of time on your turn and you forfeit the match.',
    ],
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
    difficulty: 'easy',
    averageMinutes: 3,
    howTo: [
      'Drop a disc into any column — it falls to the lowest free slot.',
      'Connect four of your discs in a row, column or diagonal.',
      'Watch the columns your opponent is one move away from completing.',
    ],
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
    difficulty: 'medium',
    averageMinutes: 3,
    howTo: [
      'Move your paddle with W/S, the arrow keys, or by dragging on the field.',
      'The ball speeds up with every rally and the bounce angle follows where it hits your paddle.',
      'First player to five points takes the match.',
    ],
  },
  gomoku: {
    id: 'gomoku',
    name: 'Gomoku',
    tagline: 'Five in a row on a 15x15 board.',
    description:
      'Deceptively deep: build open threats, block double attacks and force a win. A tournament favourite for a reason.',
    mode: 'turn-based',
    players: 2,
    tickRate: 0,
    turnTimeoutMs: 40_000,
    accent: '#38bdf8',
    difficulty: 'medium',
    averageMinutes: 5,
    howTo: [
      'Place a stone on any empty intersection of the 15x15 grid.',
      'Get exactly five (or more) of your stones in an unbroken line to win.',
      'Create two threats at once — your opponent can only block one.',
    ],
  },
  reversi: {
    id: 'reversi',
    name: 'Reversi',
    tagline: 'Outflank, flip, dominate.',
    description:
      'Othello rules with legal-move highlighting. Corners are permanent, edges are strong, and the lead flips constantly.',
    mode: 'turn-based',
    players: 2,
    tickRate: 0,
    turnTimeoutMs: 40_000,
    accent: '#34d399',
    difficulty: 'hard',
    averageMinutes: 6,
    howTo: [
      'Place a disc so it outflanks a line of your opponent — every trapped disc flips.',
      'Legal squares are highlighted; if you have none, your turn is passed automatically.',
      'When the board fills up the player with the most discs wins. Take the corners.',
    ],
  },
  'dots-and-boxes': {
    id: 'dots-and-boxes',
    name: 'Dots & Boxes',
    tagline: 'Close a square, play again.',
    description:
      'Draw lines on a 5x5 grid of boxes. Completing a box gives you another move, so chains of boxes decide the game.',
    mode: 'turn-based',
    players: 2,
    tickRate: 0,
    turnTimeoutMs: 30_000,
    accent: '#fbbf24',
    difficulty: 'medium',
    averageMinutes: 4,
    howTo: [
      'Click an edge between two dots to draw a line.',
      'Complete the fourth side of a box to claim it and take another turn.',
      'Late game is about sacrificing small chains to win the big ones.',
    ],
  },
  'snake-duel': {
    id: 'snake-duel',
    name: 'Snake Duel',
    tagline: 'Two snakes, one arena.',
    description:
      'A realtime grid duel. Eat to grow, cut your rival off, and never crash. Fixed 120 ms steps keep it perfectly fair.',
    mode: 'realtime',
    players: 2,
    tickRate: 15,
    turnTimeoutMs: 0,
    accent: '#a3e635',
    difficulty: 'hard',
    averageMinutes: 2,
    howTo: [
      'Steer with WASD or the arrow keys — you cannot reverse into yourself.',
      'Eat pellets to grow two segments and score a point.',
      'Crash into a wall, yourself or your rival and you lose. Outlast them.',
    ],
  },
  'ultimate-tic-tac-toe': {
    id: 'ultimate-tic-tac-toe',
    name: 'Ultimate Tic Tac Toe',
    tagline: 'Nine boards, one very deep game.',
    description:
      'Tic tac toe inside tic tac toe. Win the small boards to claim squares on the big one — and every move decides where your opponent must play next.',
    mode: 'turn-based',
    players: 2,
    tickRate: 0,
    turnTimeoutMs: 45_000,
    accent: '#f472b6',
    difficulty: 'medium',
    averageMinutes: 6,
    howTo: [
      'The big board is made of nine small tic tac toe boards.',
      'The cell you play in sends your opponent to the matching small board.',
      'If that board is already decided they may play anywhere.',
      'Win three small boards in a row to win the match.',
    ],
  },
  checkers: {
    id: 'checkers',
    name: 'Checkers',
    tagline: 'Forced captures and hungry kings.',
    description:
      'English draughts with compulsory captures, chained multi-jumps and promotion. Reach the far rank and your man becomes a king that moves both ways.',
    mode: 'turn-based',
    players: 2,
    tickRate: 0,
    turnTimeoutMs: 45_000,
    accent: '#fb923c',
    difficulty: 'medium',
    averageMinutes: 8,
    howTo: [
      'Men move one diagonal step forward onto a dark square.',
      'If a capture is available you must take it — and keep jumping if you can.',
      'Reach the far rank to be crowned a king, which moves and jumps backwards too.',
      'Take every piece, or leave your opponent with no legal move, to win.',
    ],
  },
  mancala: {
    id: 'mancala',
    name: 'Mancala',
    tagline: 'Sow, capture, and count the harvest.',
    description:
      'Kalah rules on the classic six pit board. Land your last stone in your own store for a free turn, or in an empty pit to capture everything opposite.',
    mode: 'turn-based',
    players: 2,
    tickRate: 0,
    turnTimeoutMs: 30_000,
    accent: '#fbbf24',
    difficulty: 'easy',
    averageMinutes: 5,
    howTo: [
      'Pick one of your six pits and sow its stones anticlockwise, one per pit.',
      "Skip your opponent's store; drop into your own.",
      'Finish in your store and you go again.',
      'Finish in an empty pit on your side to capture it and the pit opposite.',
      "When one side empties, everything left is swept into its owner's store.",
    ],
  },
  hex: {
    id: 'hex',
    name: 'Hex',
    tagline: 'Connect your edges. No draws, ever.',
    description:
      'The classic connection game on an 11x11 rhombus. A full board always contains exactly one winning path, so somebody always wins. The swap rule keeps the opening fair.',
    mode: 'turn-based',
    players: 2,
    tickRate: 0,
    turnTimeoutMs: 45_000,
    accent: '#4ade80',
    difficulty: 'hard',
    averageMinutes: 7,
    howTo: [
      'Place one stone per turn on any empty hex.',
      'Blue connects the top edge to the bottom; pink connects left to right.',
      'Stones are never captured or moved — the board only fills up.',
      'The second player may steal the opening stone once, with the swap rule.',
    ],
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
  /** True until the player registers; guests can play but are not durable. */
  isGuest: boolean;
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
