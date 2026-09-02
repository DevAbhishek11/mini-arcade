/**
 * Opponent AI for every cabinet.
 *
 * Lives in the shared package on purpose: the server runs it for bot-filled
 * ranked matches and practice, and the browser runs the *exact same* code for
 * single player and offline play. One implementation, no drift.
 */
import type { GameId } from '../domain.js';
import type { Seat } from '../games/types.js';
import {
  BOXES,
  ENGINES,
  COLUMNS,
  GOMOKU_SIZE,
  H_EDGES,
  REVERSI_SIZE,
  SNAKE_GRID,
  TOTAL_EDGES,
  connectFourEngine,
  legalMoves,
  reversiEngine,
  ticTacToeEngine,
  toXY,
  type ConnectFourState,
  type Direction,
  type DotsState,
  type GomokuState,
  type PongState,
  type ReversiState,
  type SnakeState,
  type TicTacToeState,
} from '../games/index.js';

export interface BotDecision {
  action: unknown;
  /** Delay before the action is applied, so bots feel human. */
  delayMs: number;
}

export type BotDifficulty = 'chill' | 'sharp' | 'brutal';

export const BOT_DIFFICULTIES: { id: BotDifficulty; name: string; blurb: string }[] = [
  { id: 'chill', name: 'Chill', blurb: 'Makes mistakes, great for learning a game.' },
  { id: 'sharp', name: 'Sharp', blurb: 'Plays the obvious best move every time.' },
  { id: 'brutal', name: 'Brutal', blurb: 'Searches ahead and punishes every slip.' },
];

const randomInt = (max: number) => Math.floor(Math.random() * max);
const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);
const blunderChance: Record<BotDifficulty, number> = { chill: 0.35, sharp: 0.08, brutal: 0 };

/* ------------------------------- tic tac toe ------------------------------ */

/**
 * Exhaustive minimax for the 3x3 board — only a few thousand nodes, so a
 * `brutal` bot is provably unbeatable (it wins or draws, never loses).
 */
function ticTacToeBest(board: (Seat | null)[], mover: Seat, root: Seat): { score: number; index: number } {
  const winner = ticTacToeWinner(board);
  if (winner !== null) return { score: winner === root ? 1 : -1, index: -1 };
  if (board.every((cell) => cell !== null)) return { score: 0, index: -1 };

  let bestScore = mover === root ? -2 : 2;
  let bestIndex = -1;

  for (let index = 0; index < board.length; index += 1) {
    if (board[index] !== null) continue;
    const next = board.slice();
    next[index] = mover;
    const { score } = ticTacToeBest(next, other(mover), root);

    if (mover === root ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestIndex = index;
      // Cannot do better than a forced win / forced loss avoidance.
      if (mover === root ? score === 1 : score === -1) break;
    }
  }

  return { score: bestScore, index: bestIndex };
}

const TTT_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

function ticTacToeWinner(board: (Seat | null)[]): Seat | null {
  for (const [a, b, c] of TTT_LINES) {
    const value = board[a];
    if (value !== null && value !== undefined && value === board[b] && value === board[c]) return value;
  }
  return null;
}

function ticTacToeMove(state: TicTacToeState, seat: Seat, difficulty: BotDifficulty): number {
  const empty = state.board.map((cell, index) => (cell === null ? index : -1)).filter((i) => i >= 0);
  if (empty.length === 0) return -1;
  if (Math.random() < blunderChance[difficulty]) return empty[randomInt(empty.length)] as number;

  if (difficulty === 'brutal') {
    const best = ticTacToeBest(state.board.slice(), seat, seat);
    if (best.index >= 0) return best.index;
  }

  const wins = (index: number, mover: Seat) => {
    const result = ticTacToeEngine.apply(
      { ...state, turn: mover },
      mover,
      { type: 'place', index },
      Date.now(),
    );
    return result.ok && result.state.winnerSeat === mover;
  };

  for (const index of empty) if (wins(index, seat)) return index;
  for (const index of empty) if (wins(index, other(seat))) return index;
  if (state.board[4] === null) return 4;
  const corners = [0, 2, 6, 8].filter((i) => state.board[i] === null);
  if (corners.length) return corners[randomInt(corners.length)] as number;
  return empty[randomInt(empty.length)] as number;
}

/* ------------------------------ connect four ------------------------------ */

function connectFourMove(state: ConnectFourState, seat: Seat, difficulty: BotDifficulty): number {
  const open = Array.from({ length: COLUMNS }, (_, c) => c).filter((c) => state.board[c] === null);
  if (open.length === 0) return 0;
  if (Math.random() < blunderChance[difficulty]) return open[randomInt(open.length)] as number;

  const wins = (column: number, mover: Seat) => {
    const result = connectFourEngine.apply(
      { ...state, turn: mover },
      mover,
      { type: 'drop', column },
      Date.now(),
    );
    return result.ok && result.state.winnerSeat === mover;
  };

  for (const column of open) if (wins(column, seat)) return column;
  for (const column of open) if (wins(column, other(seat))) return column;

  const ordered = [...open].sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));
  for (const column of ordered) {
    const after = connectFourEngine.apply({ ...state, turn: seat }, seat, { type: 'drop', column }, Date.now());
    if (!after.ok) continue;
    const gifts = open.some((reply) => {
      const opp = connectFourEngine.apply(
        { ...after.state, turn: other(seat) },
        other(seat),
        { type: 'drop', column: reply },
        Date.now(),
      );
      return opp.ok && opp.state.winnerSeat === other(seat);
    });
    if (!gifts) return column;
  }
  return ordered[0] ?? 3;
}

/* --------------------------------- gomoku --------------------------------- */

const GOMOKU_DIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** Scores a candidate point by the length and openness of the lines it extends. */
function gomokuScore(board: (Seat | null)[], index: number, seat: Seat): number {
  const row = Math.floor(index / GOMOKU_SIZE);
  const column = index % GOMOKU_SIZE;
  let score = 0;

  for (const [dr, dc] of GOMOKU_DIRS) {
    let run = 1;
    let openEnds = 0;
    for (const sign of [1, -1] as const) {
      let r = row + dr * sign;
      let c = column + dc * sign;
      while (r >= 0 && r < GOMOKU_SIZE && c >= 0 && c < GOMOKU_SIZE && board[r * GOMOKU_SIZE + c] === seat) {
        run += 1;
        r += dr * sign;
        c += dc * sign;
      }
      const inBounds = r >= 0 && r < GOMOKU_SIZE && c >= 0 && c < GOMOKU_SIZE;
      if (inBounds && board[r * GOMOKU_SIZE + c] === null) openEnds += 1;
    }
    if (run >= 5) score += 1_000_000;
    else if (run === 4) score += openEnds >= 1 ? 50_000 : 800;
    else if (run === 3) score += openEnds === 2 ? 6_000 : 400;
    else if (run === 2) score += openEnds === 2 ? 500 : 60;
    else score += openEnds * 10;
  }
  return score;
}

function gomokuMove(state: GomokuState, seat: Seat, difficulty: BotDifficulty): number {
  const size = GOMOKU_SIZE * GOMOKU_SIZE;
  if (state.moves === 0) return Math.floor(size / 2);

  // Only consider points near existing stones — keeps the search tiny.
  const candidates = new Set<number>();
  for (let index = 0; index < size; index += 1) {
    if (state.board[index] === null) continue;
    const row = Math.floor(index / GOMOKU_SIZE);
    const column = index % GOMOKU_SIZE;
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const r = row + dr;
        const c = column + dc;
        if (r < 0 || c < 0 || r >= GOMOKU_SIZE || c >= GOMOKU_SIZE) continue;
        const candidate = r * GOMOKU_SIZE + c;
        if (state.board[candidate] === null) candidates.add(candidate);
      }
    }
  }

  const list = [...candidates];
  if (list.length === 0) return state.board.findIndex((cell) => cell === null);
  if (Math.random() < blunderChance[difficulty]) return list[randomInt(list.length)] as number;

  const defenceWeight = difficulty === 'brutal' ? 1.05 : 0.9;
  let best = list[0] as number;
  let bestScore = -Infinity;
  for (const index of list) {
    const score =
      gomokuScore(state.board, index, seat) + gomokuScore(state.board, index, other(seat)) * defenceWeight;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

/* --------------------------------- reversi -------------------------------- */

const REVERSI_WEIGHTS = [
  120, -20, 20, 5, 5, 20, -20, 120, -20, -40, -5, -5, -5, -5, -40, -20, 20, -5, 15, 3, 3, 15, -5, 20, 5, -5, 3,
  3, 3, 3, -5, 5, 5, -5, 3, 3, 3, 3, -5, 5, 20, -5, 15, 3, 3, 15, -5, 20, -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];

function reversiMove(state: ReversiState, seat: Seat, difficulty: BotDifficulty): number | null {
  const legal = state.legal.length > 0 ? state.legal : legalMoves(state.board, seat);
  if (legal.length === 0) return null;
  if (Math.random() < blunderChance[difficulty]) return legal[randomInt(legal.length)] as number;

  let best = legal[0] as number;
  let bestScore = -Infinity;
  for (const index of legal) {
    const applied = reversiEngine.apply({ ...state, turn: seat }, seat, { type: 'place', index }, Date.now());
    if (!applied.ok) continue;
    const positional = REVERSI_WEIGHTS[index] ?? 0;
    const mobility = applied.state.legal.length;
    const discs = applied.state.score[seat] - applied.state.score[other(seat)];
    const score =
      difficulty === 'brutal' ? positional * 2 - mobility * 6 + discs : positional + discs * 2 - mobility;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

/* ------------------------------ dots and boxes ---------------------------- */

function edgesOfBox(box: number): number[] {
  const row = Math.floor(box / BOXES);
  const column = box % BOXES;
  return [
    row * BOXES + column,
    (row + 1) * BOXES + column,
    H_EDGES + row * (BOXES + 1) + column,
    H_EDGES + row * (BOXES + 1) + column + 1,
  ];
}

function dotsMove(state: DotsState, _seat: Seat, difficulty: BotDifficulty): number {
  const free = Array.from({ length: TOTAL_EDGES }, (_, e) => e).filter((edge) => !state.edges[edge]);
  if (free.length === 0) return 0;
  if (Math.random() < blunderChance[difficulty]) return free[randomInt(free.length)] as number;

  const sidesOf = (box: number) => edgesOfBox(box).filter((edge) => state.edges[edge]).length;

  // 1. Complete any box that is one edge away.
  for (const edge of free) {
    const closes = Array.from({ length: BOXES * BOXES }, (_, b) => b).some(
      (box) => edgesOfBox(box).includes(edge) && sidesOf(box) === 3,
    );
    if (closes) return edge;
  }

  // 2. Otherwise avoid handing over a third side.
  const safe = free.filter(
    (edge) =>
      !Array.from({ length: BOXES * BOXES }, (_, b) => b).some(
        (box) => edgesOfBox(box).includes(edge) && sidesOf(box) === 2,
      ),
  );
  const pool = safe.length > 0 ? safe : free;
  return pool[randomInt(pool.length)] as number;
}

/* ---------------------------------- pong ---------------------------------- */

function pongMove(state: PongState, seat: Seat, difficulty: BotDifficulty): -1 | 0 | 1 {
  const paddle = state.paddles[seat];
  const deadzone = difficulty === 'chill' ? 34 : difficulty === 'sharp' ? 16 : 8;
  const spread = difficulty === 'chill' ? 90 : difficulty === 'sharp' ? 26 : 6;
  const noise = (Math.random() - 0.5) * spread;
  const target = state.serveCountdownMs > 0 ? 260 : state.ball.y + noise;
  const diff = target - paddle.y;
  if (Math.abs(diff) < deadzone) return 0;
  return diff > 0 ? 1 : -1;
}

/* -------------------------------- snake duel ------------------------------ */

const SNAKE_DIRS: Direction[] = ['up', 'down', 'left', 'right'];
const SNAKE_DELTA: Record<Direction, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const SNAKE_OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

function snakeMove(state: SnakeState, seat: Seat, difficulty: BotDifficulty): Direction | null {
  const snake = state.snakes[seat];
  if (!snake.alive) return null;

  const blocked = new Set<number>([...state.snakes[0].cells, ...state.snakes[1].cells]);
  const head = snake.cells[0] as number;
  const [hx, hy] = toXY(head);
  const food = state.food.map((cell) => toXY(cell));

  const lookahead = difficulty === 'brutal' ? 8 : difficulty === 'sharp' ? 4 : 2;

  const floodFill = (start: number): number => {
    const seen = new Set<number>([start]);
    const queue = [start];
    let count = 0;
    while (queue.length > 0 && count < 60) {
      const current = queue.shift() as number;
      count += 1;
      const [cx, cy] = toXY(current);
      for (const dir of SNAKE_DIRS) {
        const [dx, dy] = SNAKE_DELTA[dir];
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= SNAKE_GRID || ny >= SNAKE_GRID) continue;
        const next = ny * SNAKE_GRID + nx;
        if (blocked.has(next) || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return count;
  };

  let best: Direction | null = null;
  let bestScore = -Infinity;

  for (const dir of SNAKE_DIRS) {
    if (dir === SNAKE_OPPOSITE[snake.dir]) continue;
    const [dx, dy] = SNAKE_DELTA[dir];
    const nx = hx + dx;
    const ny = hy + dy;
    if (nx < 0 || ny < 0 || nx >= SNAKE_GRID || ny >= SNAKE_GRID) continue;
    const next = ny * SNAKE_GRID + nx;
    if (blocked.has(next)) continue;

    const nearest = food.reduce(
      (min, [fx, fy]) => Math.min(min, Math.abs(fx - nx) + Math.abs(fy - ny)),
      Number.POSITIVE_INFINITY,
    );
    const space = floodFill(next);
    const jitter = difficulty === 'chill' ? Math.random() * 6 : 0;
    const score = space * lookahead - (Number.isFinite(nearest) ? nearest : 0) * 2 + jitter;
    if (score > bestScore) {
      bestScore = score;
      best = dir;
    }
  }

  return best;
}

/* --------------------------------- driver --------------------------------- */

/** Pong/Snake bots play "chill" by default — a perfect tracker is no fun. */
const DEFAULT_DIFFICULTY: Record<GameId, BotDifficulty> = {
  'tic-tac-toe': 'sharp',
  'connect-four': 'sharp',
  gomoku: 'sharp',
  reversi: 'sharp',
  'dots-and-boxes': 'sharp',
  pong: 'chill',
  'snake-duel': 'sharp',
};

const thinkTime = (difficulty: BotDifficulty) =>
  (difficulty === 'brutal' ? 350 : 500) + randomInt(difficulty === 'chill' ? 1100 : 700);

export function decide(
  gameId: GameId,
  state: unknown,
  seat: Seat,
  explicitDifficulty?: BotDifficulty,
): BotDecision | null {
  const difficulty = explicitDifficulty ?? DEFAULT_DIFFICULTY[gameId] ?? 'sharp';

  // A decided match never gets another move, whoever asks.
  const engine = ENGINES[gameId];
  if (engine && engine.outcome(state as never).finished) return null;

  switch (gameId) {
    case 'tic-tac-toe': {
      const typed = state as TicTacToeState;
      if (typed.turn !== seat) return null;
      const index = ticTacToeMove(typed, seat, difficulty);
      return index < 0 ? null : { action: { type: 'place', index }, delayMs: thinkTime(difficulty) };
    }
    case 'connect-four': {
      const typed = state as ConnectFourState;
      if (typed.turn !== seat) return null;
      return {
        action: { type: 'drop', column: connectFourMove(typed, seat, difficulty) },
        delayMs: thinkTime(difficulty),
      };
    }
    case 'gomoku': {
      const typed = state as GomokuState;
      if (typed.turn !== seat) return null;
      return {
        action: { type: 'place', index: gomokuMove(typed, seat, difficulty) },
        delayMs: thinkTime(difficulty),
      };
    }
    case 'reversi': {
      const typed = state as ReversiState;
      if (typed.turn !== seat || typed.finished) return null;
      const index = reversiMove(typed, seat, difficulty);
      return index === null
        ? { action: { type: 'pass' }, delayMs: 400 }
        : { action: { type: 'place', index }, delayMs: thinkTime(difficulty) };
    }
    case 'dots-and-boxes': {
      const typed = state as DotsState;
      if (typed.turn !== seat) return null;
      return {
        action: { type: 'draw', edge: dotsMove(typed, seat, difficulty) },
        delayMs: thinkTime(difficulty),
      };
    }
    case 'pong': {
      const typed = state as PongState;
      const dir = pongMove(typed, seat, difficulty);
      return dir === typed.paddles[seat].dir ? null : { action: { type: 'move', dir }, delayMs: 0 };
    }
    case 'snake-duel': {
      const typed = state as SnakeState;
      const dir = snakeMove(typed, seat, difficulty);
      if (!dir || dir === typed.snakes[seat].dir) return null;
      return { action: { type: 'turn', dir }, delayMs: 0 };
    }
    default:
      return null;
  }
}

export const BOT_NAMES = [
  'ARC-9',
  'PixelBot',
  'NullPointer',
  'Deep Quarter',
  'Cabinet Ghost',
  'Byte Rider',
  'Vector Vex',
  'Coin Op',
];

export function botIdentity(difficulty: BotDifficulty = 'sharp'): { playerId: string; nickname: string } {
  const suffix = difficulty === 'brutal' ? ' ⚡' : difficulty === 'chill' ? ' ☕' : '';
  const nickname = `${BOT_NAMES[randomInt(BOT_NAMES.length)] as string}${suffix}`;
  return { playerId: `bot:${Math.random().toString(36).slice(2, 10)}`, nickname };
}

export { REVERSI_SIZE };
