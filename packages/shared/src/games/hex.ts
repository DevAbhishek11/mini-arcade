import type { ActionResult, GameEngine, GameOutcome, Seat } from './types.js';
import { UNFINISHED, otherSeat } from './types.js';

/** Hex on an 11x11 rhombus — the classic size. */
export const HEX_SIZE = 11;

export type HexCell = Seat | null;

export interface HexState {
  board: HexCell[];
  turn: Seat;
  moves: number;
  winnerSeat: Seat | null;
  /** The connecting chain, for the win animation. */
  winningPath: number[] | null;
  lastIndex: number | null;
  /** Seat 1 may steal seat 0's opening move once (the swap rule). */
  swapAvailable: boolean;
  lastMoveAt: number;
}

export type HexAction = { type: 'place'; index: number } | { type: 'swap' };

/** Six neighbours on a rhombus board stored row-major. */
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
];

const rowOf = (index: number) => Math.floor(index / HEX_SIZE);
const colOf = (index: number) => index % HEX_SIZE;
const inside = (row: number, col: number) => row >= 0 && row < HEX_SIZE && col >= 0 && col < HEX_SIZE;

export function hexNeighbours(index: number): number[] {
  const row = rowOf(index);
  const col = colOf(index);
  const result: number[] = [];
  for (const [dr, dc] of NEIGHBOURS) {
    const r = row + dr;
    const c = col + dc;
    if (inside(r, c)) result.push(r * HEX_SIZE + c);
  }
  return result;
}

/**
 * Seat 0 connects top to bottom, seat 1 connects left to right. Returns the
 * connecting path when the seat has joined its two edges.
 * Hex can never end in a draw: a full board always contains exactly one path.
 */
function findConnection(board: HexCell[], seat: Seat): number[] | null {
  const isStart = (index: number) => (seat === 0 ? rowOf(index) === 0 : colOf(index) === 0);
  const isEnd = (index: number) => (seat === 0 ? rowOf(index) === HEX_SIZE - 1 : colOf(index) === HEX_SIZE - 1);

  const cameFrom = new Map<number, number>();
  const stack: number[] = [];

  for (let index = 0; index < board.length; index += 1) {
    if (board[index] === seat && isStart(index)) {
      stack.push(index);
      cameFrom.set(index, -1);
    }
  }

  while (stack.length > 0) {
    const current = stack.pop() as number;
    if (isEnd(current)) {
      const path: number[] = [];
      for (
        let node: number | undefined = current;
        node !== undefined && node !== -1;
        node = cameFrom.get(node)
      ) {
        path.push(node);
      }
      return path.reverse();
    }
    for (const next of hexNeighbours(current)) {
      if (board[next] !== seat || cameFrom.has(next)) continue;
      cameFrom.set(next, current);
      stack.push(next);
    }
  }

  return null;
}

export function hexLegalMoves(state: HexState): number[] {
  if (state.winnerSeat !== null) return [];
  return state.board.flatMap((cell, index) => (cell === null ? [index] : []));
}

/**
 * Hex: place a stone, connect your two edges, and you have won. There are no
 * draws, and the swap rule on move two keeps the first-player edge in check.
 */
export const hexEngine: GameEngine<HexState, HexAction> = {
  id: 'hex',
  tickMs: 0,

  createState(now) {
    return {
      board: Array.from({ length: HEX_SIZE * HEX_SIZE }, () => null),
      turn: 0,
      moves: 0,
      winnerSeat: null,
      winningPath: null,
      lastIndex: null,
      swapAvailable: false,
      lastMoveAt: now,
    };
  },

  apply(state, seat, action, now) {
    const fail = (error: string): ActionResult<HexState> => ({ ok: false, state, error });

    if (state.winnerSeat !== null) return fail('Match already finished');
    if (seat !== state.turn) return fail('Not your turn');

    if (action?.type === 'swap') {
      if (!state.swapAvailable || seat !== 1) return fail('Swap is not available');

      // The swap: seat 1 takes over the opening stone instead of answering it.
      const board = state.board.slice();
      const opening = state.lastIndex as number;
      board[opening] = 1;

      return {
        ok: true,
        state: {
          ...state,
          board,
          turn: 0,
          moves: state.moves + 1,
          swapAvailable: false,
          lastIndex: opening,
          lastMoveAt: now,
        },
      };
    }

    if (action?.type !== 'place') return fail('Unsupported action');

    const { index } = action;
    if (!Number.isInteger(index) || index < 0 || index >= HEX_SIZE * HEX_SIZE) return fail('Out of range');
    if (state.board[index] !== null) return fail('Cell already taken');

    const board = state.board.slice();
    board[index] = seat;

    const winningPath = findConnection(board, seat);

    return {
      ok: true,
      state: {
        board,
        turn: otherSeat(seat),
        moves: state.moves + 1,
        winnerSeat: winningPath ? seat : null,
        winningPath,
        lastIndex: index,
        // Offered exactly once, immediately after the opening stone.
        swapAvailable: state.moves === 0,
        lastMoveAt: now,
      },
    };
  },

  outcome(state): GameOutcome {
    if (state.winnerSeat !== null) return { finished: true, winnerSeat: state.winnerSeat, reason: 'victory' };
    return UNFINISHED;
  },

  activeSeat(state) {
    return state.winnerSeat === null ? state.turn : null;
  },

  toPublic(state) {
    return { ...state, legal: hexLegalMoves(state) };
  },
};
