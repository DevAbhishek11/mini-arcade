import type { GameId, Seat } from '@mini-arcade/shared';
import {
  COLUMNS,
  ROWS,
  type ConnectFourState,
  type PongState,
  type TicTacToeState,
  connectFourEngine,
  ticTacToeEngine,
} from '@mini-arcade/shared';

export interface BotDecision {
  action: unknown;
  /** Delay before the action is applied, so bots feel human. */
  delayMs: number;
}

export type BotDifficulty = 'chill' | 'sharp';

const randomInt = (max: number) => Math.floor(Math.random() * max);

/* ------------------------------- tic tac toe ------------------------------ */

function ticTacToeMove(state: TicTacToeState, seat: Seat, difficulty: BotDifficulty): number {
  const empty = state.board.map((cell, index) => (cell === null ? index : -1)).filter((i) => i >= 0);
  if (empty.length === 0) return -1;
  if (difficulty === 'chill' && Math.random() < 0.35) return empty[randomInt(empty.length)] as number;

  const scoreMove = (index: number, mover: Seat): number => {
    const result = ticTacToeEngine.apply(
      { ...state, turn: mover },
      mover,
      { type: 'place', index },
      Date.now(),
    );
    if (!result.ok) return -Infinity;
    if (result.state.winnerSeat === mover) return 100;
    return 0;
  };

  for (const index of empty) if (scoreMove(index, seat) === 100) return index;
  const opponent = (seat === 0 ? 1 : 0) as Seat;
  for (const index of empty) if (scoreMove(index, opponent) === 100) return index;
  if (state.board[4] === null) return 4;
  const corners = [0, 2, 6, 8].filter((i) => state.board[i] === null);
  if (corners.length) return corners[randomInt(corners.length)] as number;
  return empty[randomInt(empty.length)] as number;
}

/* ------------------------------ connect four ------------------------------ */

function connectFourMove(state: ConnectFourState, seat: Seat, difficulty: BotDifficulty): number {
  const playable = Array.from({ length: COLUMNS }, (_, c) => c).filter((column) =>
    state.board.slice(0, COLUMNS).some((_, i) => i === column && state.board[column] === null),
  );
  const open = playable.length ? playable : Array.from({ length: COLUMNS }, (_, c) => c);
  if (difficulty === 'chill' && Math.random() < 0.3) return open[randomInt(open.length)] as number;

  const wins = (column: number, mover: Seat): boolean => {
    const result = connectFourEngine.apply(
      { ...state, turn: mover },
      mover,
      { type: 'drop', column },
      Date.now(),
    );
    return result.ok && result.state.winnerSeat === mover;
  };

  for (const column of open) if (wins(column, seat)) return column;
  const opponent = (seat === 0 ? 1 : 0) as Seat;
  for (const column of open) if (wins(column, opponent)) return column;

  // Prefer the centre, avoid handing the opponent an immediate win.
  const ordered = [...open].sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));
  for (const column of ordered) {
    const after = connectFourEngine.apply({ ...state, turn: seat }, seat, { type: 'drop', column }, Date.now());
    if (!after.ok) continue;
    const gifts = Array.from({ length: COLUMNS }, (_, c) => c).some((reply) => {
      const opp = connectFourEngine.apply(
        { ...after.state, turn: opponent },
        opponent,
        { type: 'drop', column: reply },
        Date.now(),
      );
      return opp.ok && opp.state.winnerSeat === opponent;
    });
    if (!gifts) return column;
  }
  return ordered[0] ?? 3;
}

/* ---------------------------------- pong ---------------------------------- */

function pongMove(state: PongState, seat: Seat, difficulty: BotDifficulty): -1 | 0 | 1 {
  const paddle = state.paddles[seat];
  const deadzone = difficulty === 'chill' ? 34 : 16;
  const noise = difficulty === 'chill' ? (Math.random() - 0.5) * 90 : (Math.random() - 0.5) * 26;
  const target = state.serveCountdownMs > 0 ? ROWS * 0 + 260 : state.ball.y + noise;
  const diff = target - paddle.y;
  if (Math.abs(diff) < deadzone) return 0;
  return diff > 0 ? 1 : -1;
}

/* --------------------------------- driver --------------------------------- */

/** Pong bots play "chill" by default — a perfect tracker is no fun to rally against. */
const DEFAULT_DIFFICULTY: Record<GameId, BotDifficulty> = {
  'tic-tac-toe': 'sharp',
  'connect-four': 'sharp',
  pong: 'chill',
};

export function decide(
  gameId: GameId,
  state: unknown,
  seat: Seat,
  explicitDifficulty?: BotDifficulty,
): BotDecision | null {
  const difficulty = explicitDifficulty ?? DEFAULT_DIFFICULTY[gameId] ?? 'sharp';
  switch (gameId) {
    case 'tic-tac-toe': {
      const typed = state as TicTacToeState;
      if (typed.turn !== seat) return null;
      const index = ticTacToeMove(typed, seat, difficulty);
      if (index < 0) return null;
      return { action: { type: 'place', index }, delayMs: 500 + randomInt(900) };
    }
    case 'connect-four': {
      const typed = state as ConnectFourState;
      if (typed.turn !== seat) return null;
      return {
        action: { type: 'drop', column: connectFourMove(typed, seat, difficulty) },
        delayMs: 600 + randomInt(900),
      };
    }
    case 'pong': {
      const typed = state as PongState;
      const dir = pongMove(typed, seat, difficulty);
      if (dir === typed.paddles[seat].dir) return null;
      return { action: { type: 'move', dir }, delayMs: 0 };
    }
    default:
      return null;
  }
}

export const BOT_NAMES = ['ARC-9', 'PixelBot', 'NullPointer', 'Deep Quarter', 'Cabinet Ghost', 'Byte Rider'];

export function botIdentity(): { playerId: string; nickname: string } {
  const nickname = BOT_NAMES[randomInt(BOT_NAMES.length)] as string;
  return { playerId: `bot:${Math.random().toString(36).slice(2, 10)}`, nickname };
}
