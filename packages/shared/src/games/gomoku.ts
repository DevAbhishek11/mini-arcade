import type { ActionResult, GameEngine, GameOutcome, Seat } from './types.js';
import { UNFINISHED, otherSeat } from './types.js';

export const GOMOKU_SIZE = 15;
export const GOMOKU_WIN = 5;

export type GomokuCell = Seat | null;

export interface GomokuState {
  board: GomokuCell[];
  turn: Seat;
  moves: number;
  winnerSeat: Seat | null;
  winningLine: number[] | null;
  lastIndex: number | null;
  lastMoveAt: number;
}

export interface GomokuAction {
  type: 'place';
  index: number;
}

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

function findWin(board: GomokuCell[], index: number): number[] | null {
  const seat = board[index];
  if (seat === null || seat === undefined) return null;
  const row = Math.floor(index / GOMOKU_SIZE);
  const column = index % GOMOKU_SIZE;

  for (const [dr, dc] of DIRECTIONS) {
    const line = [index];
    for (const sign of [1, -1] as const) {
      let r = row + dr * sign;
      let c = column + dc * sign;
      while (r >= 0 && r < GOMOKU_SIZE && c >= 0 && c < GOMOKU_SIZE && board[r * GOMOKU_SIZE + c] === seat) {
        line.push(r * GOMOKU_SIZE + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= GOMOKU_WIN) return line.sort((a, b) => a - b);
  }
  return null;
}

/** Five in a row on a 15x15 grid — the classic "gomoku" / "five in a row". */
export const gomokuEngine: GameEngine<GomokuState, GomokuAction> = {
  id: 'gomoku',
  tickMs: 0,

  createState(now) {
    return {
      board: Array.from({ length: GOMOKU_SIZE * GOMOKU_SIZE }, () => null),
      turn: 0,
      moves: 0,
      winnerSeat: null,
      winningLine: null,
      lastIndex: null,
      lastMoveAt: now,
    };
  },

  apply(state, seat, action, now): ActionResult<GomokuState> {
    if (this.outcome(state).finished) return { ok: false, state, error: 'MATCH_OVER' };
    if (seat !== state.turn) return { ok: false, state, error: 'NOT_YOUR_TURN' };
    if (action.type !== 'place') return { ok: false, state, error: 'UNKNOWN_ACTION' };
    const size = GOMOKU_SIZE * GOMOKU_SIZE;
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= size) {
      return { ok: false, state, error: 'OUT_OF_BOUNDS' };
    }
    if (state.board[action.index] !== null) return { ok: false, state, error: 'CELL_TAKEN' };

    const board = state.board.slice();
    board[action.index] = seat;
    const winningLine = findWin(board, action.index);

    return {
      ok: true,
      state: {
        board,
        turn: otherSeat(seat),
        moves: state.moves + 1,
        winnerSeat: winningLine ? seat : null,
        winningLine,
        lastIndex: action.index,
        lastMoveAt: now,
      },
    };
  },

  outcome(state): GameOutcome {
    if (state.winnerSeat !== null) {
      return { finished: true, winnerSeat: state.winnerSeat, reason: 'victory' };
    }
    if (state.moves >= GOMOKU_SIZE * GOMOKU_SIZE) {
      return { finished: true, winnerSeat: null, reason: 'draw' };
    }
    return UNFINISHED;
  },

  activeSeat(state) {
    return this.outcome(state).finished ? null : state.turn;
  },

  toPublic(state) {
    return state;
  },
};
