import type { ActionResult, GameEngine, GameOutcome, Seat } from './types.js';
import { UNFINISHED, otherSeat } from './types.js';

export type TicTacToeCell = Seat | null;

export interface TicTacToeState {
  board: TicTacToeCell[];
  turn: Seat;
  moves: number;
  winnerSeat: Seat | null;
  winningLine: number[] | null;
  lastMoveAt: number;
}

export interface TicTacToeAction {
  type: 'place';
  index: number;
}

const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function findWin(board: TicTacToeCell[]): { seat: Seat; line: number[] } | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    const first = board[a];
    if (first !== null && first !== undefined && first === board[b] && first === board[c]) {
      return { seat: first, line: [a, b, c] };
    }
  }
  return null;
}

export const ticTacToeEngine: GameEngine<TicTacToeState, TicTacToeAction> = {
  id: 'tic-tac-toe',
  tickMs: 0,

  createState(now) {
    return {
      board: Array.from({ length: 9 }, () => null),
      turn: 0,
      moves: 0,
      winnerSeat: null,
      winningLine: null,
      lastMoveAt: now,
    };
  },

  apply(state, seat, action, now): ActionResult<TicTacToeState> {
    if (state.winnerSeat !== null || state.moves === 9) {
      return { ok: false, state, error: 'MATCH_OVER' };
    }
    if (seat !== state.turn) return { ok: false, state, error: 'NOT_YOUR_TURN' };
    if (action.type !== 'place') return { ok: false, state, error: 'UNKNOWN_ACTION' };
    if (!Number.isInteger(action.index) || action.index < 0 || action.index > 8) {
      return { ok: false, state, error: 'OUT_OF_BOUNDS' };
    }
    if (state.board[action.index] !== null) return { ok: false, state, error: 'CELL_TAKEN' };

    const board = state.board.slice();
    board[action.index] = seat;
    const win = findWin(board);

    return {
      ok: true,
      state: {
        board,
        turn: otherSeat(seat),
        moves: state.moves + 1,
        winnerSeat: win ? win.seat : null,
        winningLine: win ? win.line : null,
        lastMoveAt: now,
      },
    };
  },

  outcome(state): GameOutcome {
    if (state.winnerSeat !== null) {
      return { finished: true, winnerSeat: state.winnerSeat, reason: 'victory' };
    }
    if (state.moves >= 9) return { finished: true, winnerSeat: null, reason: 'draw' };
    return UNFINISHED;
  },

  activeSeat(state) {
    return state.winnerSeat !== null || state.moves >= 9 ? null : state.turn;
  },

  toPublic(state) {
    return state;
  },
};
