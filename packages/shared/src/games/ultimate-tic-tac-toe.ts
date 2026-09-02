import type { ActionResult, GameEngine, GameOutcome, Seat } from './types.js';
import { UNFINISHED, otherSeat } from './types.js';

/** Nine little boards in a 3x3 arrangement; the move you play picks the board your opponent must use. */
export const UTTT_BOARDS = 9;
export const UTTT_CELLS = 9;

export type UtttCell = Seat | null;
/** `null` while undecided, a seat when won, `'draw'` when full with no winner. */
export type UtttBoardResult = Seat | 'draw' | null;

export interface UltimateTicTacToeState {
  /** 81 cells, board-major: `board * 9 + cell`. */
  cells: UtttCell[];
  /** Per small board result. */
  boards: UtttBoardResult[];
  turn: Seat;
  /** Board the mover must play in, or `null` when any board is allowed. */
  activeBoard: number | null;
  moves: number;
  winnerSeat: Seat | null;
  winningBoards: number[] | null;
  lastCell: number | null;
  lastMoveAt: number;
}

export interface UltimateTicTacToeAction {
  type: 'place';
  /** Absolute cell index, 0-80. */
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

/** Winner of one 3x3 line set, plus the line itself. */
function lineWinner<T>(get: (index: number) => T, empty: T): { winner: T; line: number[] } | null {
  for (const [a, b, c] of LINES) {
    const value = get(a);
    if (value !== empty && value === get(b) && value === get(c)) return { winner: value, line: [a, b, c] };
  }
  return null;
}

export function utttBoardOf(index: number): number {
  return Math.floor(index / UTTT_CELLS);
}

export function utttCellOf(index: number): number {
  return index % UTTT_CELLS;
}

/** Every legal absolute cell index for the side to move. */
export function utttLegalMoves(state: UltimateTicTacToeState): number[] {
  if (state.winnerSeat !== null) return [];

  const boards =
    state.activeBoard !== null && state.boards[state.activeBoard] === null
      ? [state.activeBoard]
      : state.boards.flatMap((result, board) => (result === null ? [board] : []));

  const moves: number[] = [];
  for (const board of boards) {
    for (let cell = 0; cell < UTTT_CELLS; cell += 1) {
      const index = board * UTTT_CELLS + cell;
      if (state.cells[index] === null) moves.push(index);
    }
  }
  return moves;
}

/**
 * Ultimate Tic Tac Toe: win small boards to claim squares on the big board.
 * Your move dictates which board your opponent plays in next, which turns a
 * one minute game into a genuinely deep one.
 */
export const ultimateTicTacToeEngine: GameEngine<UltimateTicTacToeState, UltimateTicTacToeAction> = {
  id: 'ultimate-tic-tac-toe',
  tickMs: 0,

  createState(now) {
    return {
      cells: Array.from({ length: UTTT_BOARDS * UTTT_CELLS }, () => null),
      boards: Array.from({ length: UTTT_BOARDS }, () => null),
      turn: 0,
      activeBoard: null,
      moves: 0,
      winnerSeat: null,
      winningBoards: null,
      lastCell: null,
      lastMoveAt: now,
    };
  },

  apply(state, seat, action, now) {
    const fail = (error: string): ActionResult<UltimateTicTacToeState> => ({ ok: false, state, error });

    if (state.winnerSeat !== null) return fail('Match already finished');
    if (seat !== state.turn) return fail('Not your turn');
    if (action?.type !== 'place') return fail('Unsupported action');

    const index = action.index;
    if (!Number.isInteger(index) || index < 0 || index >= UTTT_BOARDS * UTTT_CELLS) return fail('Out of range');
    if (state.cells[index] !== null) return fail('Cell already taken');

    const board = utttBoardOf(index);
    if (state.boards[board] !== null) return fail('That board is already decided');
    if (state.activeBoard !== null && state.boards[state.activeBoard] === null && board !== state.activeBoard) {
      return fail('You must play in the highlighted board');
    }

    const cells = state.cells.slice();
    cells[index] = seat;

    // Did that finish the small board?
    const boards = state.boards.slice();
    const base = board * UTTT_CELLS;
    const small = lineWinner<UtttCell>((i) => cells[base + i] ?? null, null);
    if (small) {
      boards[board] = small.winner;
    } else if (cells.slice(base, base + UTTT_CELLS).every((cell) => cell !== null)) {
      boards[board] = 'draw';
    }

    // Did that finish the big board?
    const big = lineWinner<UtttBoardResult>((i) => boards[i] ?? null, null);
    const bigWinner = big && big.winner !== 'draw' ? (big.winner as Seat) : null;

    const nextBoard = utttCellOf(index);
    const next: UltimateTicTacToeState = {
      cells,
      boards,
      // Sending a player to a decided board frees them to choose any board.
      turn: otherSeat(seat),
      activeBoard: boards[nextBoard] === null ? nextBoard : null,
      moves: state.moves + 1,
      winnerSeat: bigWinner,
      winningBoards: bigWinner !== null && big ? big.line : null,
      lastCell: index,
      lastMoveAt: now,
    };

    return { ok: true, state: next };
  },

  outcome(state): GameOutcome {
    if (state.winnerSeat !== null) {
      return { finished: true, winnerSeat: state.winnerSeat, reason: 'victory' };
    }
    if (state.boards.every((result) => result !== null) || utttLegalMoves(state).length === 0) {
      // Nobody lined up three boards: most boards won takes it, else a draw.
      const won = [0, 1].map((seat) => state.boards.filter((result) => result === seat).length) as [
        number,
        number,
      ];
      const winnerSeat = won[0] === won[1] ? null : ((won[0] > won[1] ? 0 : 1) as Seat);
      return { finished: true, winnerSeat, reason: winnerSeat === null ? 'draw' : 'victory' };
    }
    return UNFINISHED;
  },

  activeSeat(state) {
    return state.winnerSeat === null ? state.turn : null;
  },

  toPublic(state) {
    return { ...state, legal: utttLegalMoves(state) };
  },
};
