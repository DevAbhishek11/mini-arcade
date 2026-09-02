import type { ActionResult, GameEngine, GameOutcome, Seat } from './types.js';
import { UNFINISHED, otherSeat } from './types.js';

export const COLUMNS = 7;
export const ROWS = 6;

export type ConnectFourCell = Seat | null;

export interface ConnectFourState {
  /** Row major, `row 0` is the top of the board. */
  board: ConnectFourCell[];
  turn: Seat;
  moves: number;
  winnerSeat: Seat | null;
  winningLine: number[] | null;
  lastColumn: number | null;
  lastMoveAt: number;
}

export interface ConnectFourAction {
  type: 'drop';
  column: number;
}

const idx = (row: number, column: number) => row * COLUMNS + column;

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

function findWin(board: ConnectFourCell[], row: number, column: number): number[] | null {
  const seat = board[idx(row, column)];
  if (seat === null || seat === undefined) return null;

  for (const [dr, dc] of DIRECTIONS) {
    const line = [idx(row, column)];
    for (const sign of [1, -1] as const) {
      let r = row + dr * sign;
      let c = column + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLUMNS && board[idx(r, c)] === seat) {
        line.push(idx(r, c));
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 4) return line.sort((a, b) => a - b);
  }
  return null;
}

function lowestEmptyRow(board: ConnectFourCell[], column: number): number {
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    if (board[idx(row, column)] === null) return row;
  }
  return -1;
}

export const connectFourEngine: GameEngine<ConnectFourState, ConnectFourAction> = {
  id: 'connect-four',
  tickMs: 0,

  createState(now) {
    return {
      board: Array.from({ length: ROWS * COLUMNS }, () => null),
      turn: 0,
      moves: 0,
      winnerSeat: null,
      winningLine: null,
      lastColumn: null,
      lastMoveAt: now,
    };
  },

  apply(state, seat, action, now): ActionResult<ConnectFourState> {
    if (state.winnerSeat !== null || state.moves >= ROWS * COLUMNS) {
      return { ok: false, state, error: 'MATCH_OVER' };
    }
    if (seat !== state.turn) return { ok: false, state, error: 'NOT_YOUR_TURN' };
    if (action.type !== 'drop') return { ok: false, state, error: 'UNKNOWN_ACTION' };
    if (!Number.isInteger(action.column) || action.column < 0 || action.column >= COLUMNS) {
      return { ok: false, state, error: 'OUT_OF_BOUNDS' };
    }

    const row = lowestEmptyRow(state.board, action.column);
    if (row < 0) return { ok: false, state, error: 'COLUMN_FULL' };

    const board = state.board.slice();
    board[idx(row, action.column)] = seat;
    const winningLine = findWin(board, row, action.column);

    return {
      ok: true,
      state: {
        board,
        turn: otherSeat(seat),
        moves: state.moves + 1,
        winnerSeat: winningLine ? seat : null,
        winningLine,
        lastColumn: action.column,
        lastMoveAt: now,
      },
    };
  },

  outcome(state): GameOutcome {
    if (state.winnerSeat !== null) {
      return { finished: true, winnerSeat: state.winnerSeat, reason: 'victory' };
    }
    if (state.moves >= ROWS * COLUMNS) return { finished: true, winnerSeat: null, reason: 'draw' };
    return UNFINISHED;
  },

  activeSeat(state) {
    return this.outcome(state).finished ? null : state.turn;
  },

  toPublic(state) {
    return state;
  },
};
