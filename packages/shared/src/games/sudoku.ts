import type { ActionResult, GameEngine, GameOutcome, Seat } from './types.js';
import { UNFINISHED, otherSeat } from './types.js';

export const SUDOKU_SIZE = 9;
export const SUDOKU_CELLS = SUDOKU_SIZE * SUDOKU_SIZE;
/** Clues left on the board at the start. */
export const SUDOKU_CLUES = 36;
/** Points lost for a wrong digit. */
export const SUDOKU_MISTAKE_PENALTY = 1;

export interface SudokuState {
  /** The puzzle as shown: given clues plus everything solved so far. */
  board: (number | null)[];
  /** Who filled each cell, or null for a starting clue / empty cell. */
  owners: (Seat | null)[];
  /** The full solution — stripped before broadcast. */
  solution: number[];
  /** Cells that were given for free. */
  clues: boolean[];
  turn: Seat;
  score: [number, number];
  mistakes: [number, number];
  lastCell: number | null;
  /** Set for one turn after a wrong guess, so the UI can flash it. */
  lastMistake: { cell: number; value: number; seat: Seat } | null;
  finished: boolean;
  lastMoveAt: number;
}

export interface SudokuAction {
  type: 'fill';
  cell: number;
  value: number;
}

/** Small deterministic PRNG so both peers generate the identical puzzle. */
function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/**
 * Builds a solved grid from the canonical base pattern, then relabels the
 * digits and permutes rows/columns within their bands. Every transformation
 * preserves validity, so the result is always a real sudoku solution.
 */
function solvedGrid(random: () => number): number[] {
  const pattern = (row: number, col: number) => (row * 3 + Math.floor(row / 3) + col) % SUDOKU_SIZE;

  const bands = shuffle([0, 1, 2], random);
  const rows = bands.flatMap((band) => shuffle([0, 1, 2], random).map((offset) => band * 3 + offset));
  const stacks = shuffle([0, 1, 2], random);
  const cols = stacks.flatMap((stack) => shuffle([0, 1, 2], random).map((offset) => stack * 3 + offset));
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random);

  const grid = new Array<number>(SUDOKU_CELLS);
  for (let row = 0; row < SUDOKU_SIZE; row += 1) {
    for (let col = 0; col < SUDOKU_SIZE; col += 1) {
      grid[row * SUDOKU_SIZE + col] = digits[pattern(rows[row] as number, cols[col] as number)] as number;
    }
  }
  return grid;
}

/**
 * Sudoku Clash: one grid, two players, alternating turns.
 *
 * A correct digit scores a point and hands over the turn; a wrong one costs a
 * point and the turn. Whoever has the most points once the grid is full wins,
 * which turns a solo puzzle into a race where the easy cells are contested.
 */
export const sudokuEngine: GameEngine<SudokuState, SudokuAction> = {
  id: 'sudoku',
  tickMs: 0,

  createState(now) {
    const random = rng(Math.floor(Math.random() * 0xffff_ffff));
    const solution = solvedGrid(random);

    const revealed = shuffle(
      Array.from({ length: SUDOKU_CELLS }, (_, index) => index),
      random,
    ).slice(0, SUDOKU_CLUES);
    const clues = new Array<boolean>(SUDOKU_CELLS).fill(false);
    for (const index of revealed) clues[index] = true;

    return {
      board: solution.map((value, index) => (clues[index] ? value : null)),
      owners: new Array<Seat | null>(SUDOKU_CELLS).fill(null),
      solution,
      clues,
      turn: 0,
      score: [0, 0],
      mistakes: [0, 0],
      lastCell: null,
      lastMistake: null,
      finished: false,
      lastMoveAt: now,
    };
  },

  apply(state, seat, action, now): ActionResult<SudokuState> {
    if (state.finished) return { ok: false, state, error: 'The grid is already full' };
    if (seat !== state.turn) return { ok: false, state, error: 'Not your turn' };
    if (action.type !== 'fill') return { ok: false, state, error: 'Unknown action' };

    const { cell, value } = action;
    if (!Number.isInteger(cell) || cell < 0 || cell >= SUDOKU_CELLS) {
      return { ok: false, state, error: 'That cell is off the grid' };
    }
    if (!Number.isInteger(value) || value < 1 || value > 9) {
      return { ok: false, state, error: 'Digits run from 1 to 9' };
    }
    if (state.board[cell] !== null) return { ok: false, state, error: 'That cell is already filled' };

    const correct = state.solution[cell] === value;
    const score: [number, number] = [...state.score];
    const mistakes: [number, number] = [...state.mistakes];

    if (correct) score[seat] += 1;
    else {
      score[seat] = Math.max(0, score[seat] - SUDOKU_MISTAKE_PENALTY);
      mistakes[seat] += 1;
    }

    const board = state.board.slice();
    const owners = state.owners.slice();
    if (correct) {
      board[cell] = value;
      owners[cell] = seat;
    }

    return {
      ok: true,
      state: {
        ...state,
        board,
        owners,
        turn: otherSeat(seat),
        score,
        mistakes,
        lastCell: correct ? cell : state.lastCell,
        lastMistake: correct ? null : { cell, value, seat },
        finished: board.every((entry) => entry !== null),
        lastMoveAt: now,
      },
    };
  },

  outcome(state): GameOutcome {
    if (!state.finished) return UNFINISHED;
    const [first, second] = state.score;
    if (first === second) return { finished: true, winnerSeat: null, reason: 'draw' };
    return { finished: true, winnerSeat: first > second ? 0 : 1, reason: 'victory' };
  },

  activeSeat(state) {
    return state.finished ? null : state.turn;
  },

  toPublic(state) {
    // The solution stays on the server; sending it would hand out the answers.
    const { solution: _solution, ...visible } = state;
    return { ...visible, remaining: state.board.filter((cell) => cell === null).length };
  },
};

/** Digits that do not clash with the row, column or box — the pencil marks. */
export function sudokuCandidates(board: (number | null)[], cell: number): number[] {
  const row = Math.floor(cell / SUDOKU_SIZE);
  const col = cell % SUDOKU_SIZE;
  const used = new Set<number>();

  for (let i = 0; i < SUDOKU_SIZE; i += 1) {
    const inRow = board[row * SUDOKU_SIZE + i];
    const inCol = board[i * SUDOKU_SIZE + col];
    if (inRow !== null && inRow !== undefined) used.add(inRow);
    if (inCol !== null && inCol !== undefined) used.add(inCol);
  }

  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r += 1) {
    for (let c = boxCol; c < boxCol + 3; c += 1) {
      const value = board[r * SUDOKU_SIZE + c];
      if (value !== null && value !== undefined) used.add(value);
    }
  }

  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((digit) => !used.has(digit));
}

/** Empty cells, easiest (fewest candidates) first. */
export function sudokuOpenCells(state: SudokuState): number[] {
  return state.board
    .flatMap((value, index) => (value === null ? [index] : []))
    .sort((a, b) => sudokuCandidates(state.board, a).length - sudokuCandidates(state.board, b).length);
}
