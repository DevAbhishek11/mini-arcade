import type { ActionResult, GameEngine, GameOutcome, Seat } from './types.js';
import { UNFINISHED, otherSeat } from './types.js';

export const REVERSI_SIZE = 8;

export type ReversiCell = Seat | null;

export interface ReversiState {
  board: ReversiCell[];
  turn: Seat;
  score: [number, number];
  /** Legal move indices for the seat to move — computed by the engine. */
  legal: number[];
  passes: number;
  lastIndex: number | null;
  flipped: number[];
  finished: boolean;
  lastMoveAt: number;
}

export interface ReversiAction {
  type: 'place' | 'pass';
  index?: number;
}

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

const at = (row: number, column: number) => row * REVERSI_SIZE + column;

function flipsFor(board: ReversiCell[], index: number, seat: Seat): number[] {
  if (board[index] !== null) return [];
  const row = Math.floor(index / REVERSI_SIZE);
  const column = index % REVERSI_SIZE;
  const flips: number[] = [];

  for (const [dr, dc] of DIRECTIONS) {
    const run: number[] = [];
    let r = row + dr;
    let c = column + dc;
    while (r >= 0 && r < REVERSI_SIZE && c >= 0 && c < REVERSI_SIZE) {
      const cell = board[at(r, c)];
      if (cell === null) break;
      if (cell === seat) {
        flips.push(...run);
        break;
      }
      run.push(at(r, c));
      r += dr;
      c += dc;
    }
  }
  return flips;
}

export function legalMoves(board: ReversiCell[], seat: Seat): number[] {
  const moves: number[] = [];
  for (let index = 0; index < board.length; index += 1) {
    if (flipsFor(board, index, seat).length > 0) moves.push(index);
  }
  return moves;
}

function tally(board: ReversiCell[]): [number, number] {
  let dark = 0;
  let light = 0;
  for (const cell of board) {
    if (cell === 0) dark += 1;
    else if (cell === 1) light += 1;
  }
  return [dark, light];
}

/** Othello/Reversi: outflank discs to flip them, most discs at the end wins. */
export const reversiEngine: GameEngine<ReversiState, ReversiAction> = {
  id: 'reversi',
  tickMs: 0,

  createState(now) {
    const board: ReversiCell[] = Array.from({ length: REVERSI_SIZE * REVERSI_SIZE }, () => null);
    board[at(3, 3)] = 1;
    board[at(4, 4)] = 1;
    board[at(3, 4)] = 0;
    board[at(4, 3)] = 0;
    return {
      board,
      turn: 0,
      score: tally(board),
      legal: legalMoves(board, 0),
      passes: 0,
      lastIndex: null,
      flipped: [],
      finished: false,
      lastMoveAt: now,
    };
  },

  apply(state, seat, action, now): ActionResult<ReversiState> {
    if (state.finished) return { ok: false, state, error: 'MATCH_OVER' };
    if (seat !== state.turn) return { ok: false, state, error: 'NOT_YOUR_TURN' };

    const next = otherSeat(seat);

    if (action.type === 'pass') {
      if (state.legal.length > 0) return { ok: false, state, error: 'MOVES_AVAILABLE' };
      const legal = legalMoves(state.board, next);
      const passes = state.passes + 1;
      return {
        ok: true,
        state: { ...state, turn: next, legal, passes, flipped: [], finished: passes >= 2, lastMoveAt: now },
      };
    }

    const index = action.index ?? -1;
    if (!Number.isInteger(index) || index < 0 || index >= state.board.length) {
      return { ok: false, state, error: 'OUT_OF_BOUNDS' };
    }
    const flips = flipsFor(state.board, index, seat);
    if (flips.length === 0) return { ok: false, state, error: 'ILLEGAL_MOVE' };

    const board = state.board.slice();
    board[index] = seat;
    for (const flip of flips) board[flip] = seat;

    // If the opponent cannot move, the turn bounces straight back.
    let turn = next;
    let legal = legalMoves(board, next);
    let passes = 0;
    let finished = false;
    if (legal.length === 0) {
      const own = legalMoves(board, seat);
      if (own.length === 0) {
        finished = true;
        passes = 2;
      } else {
        turn = seat;
        legal = own;
        passes = 1;
      }
    }

    return {
      ok: true,
      state: {
        board,
        turn,
        score: tally(board),
        legal,
        passes,
        lastIndex: index,
        flipped: flips,
        finished,
        lastMoveAt: now,
      },
    };
  },

  outcome(state): GameOutcome {
    if (!state.finished) return UNFINISHED;
    const [dark, light] = state.score;
    if (dark === light) return { finished: true, winnerSeat: null, reason: 'draw' };
    return { finished: true, winnerSeat: dark > light ? 0 : 1, reason: 'victory' };
  },

  activeSeat(state) {
    return state.finished ? null : state.turn;
  },

  toPublic(state) {
    return state;
  },
};
