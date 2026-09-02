import type { ActionResult, GameEngine, GameOutcome, Seat } from './types.js';
import { UNFINISHED, otherSeat } from './types.js';

/** English draughts on the 32 dark squares of an 8x8 board. */
export const CHECKERS_SIZE = 8;
/** Plies without a capture or a man move before the game is called a draw. */
export const CHECKERS_DRAW_PLIES = 80;

export interface CheckersPiece {
  seat: Seat;
  king: boolean;
}

export type CheckersSquare = CheckersPiece | null;

export interface CheckersState {
  /** 64 squares, row-major from seat 1's back rank (row 0) to seat 0's (row 7). */
  board: CheckersSquare[];
  turn: Seat;
  /** Set mid multi-jump: that piece must keep jumping. */
  chainFrom: number | null;
  moves: number;
  /** Plies since the last capture or promotion, for the draw rule. */
  quietPlies: number;
  winnerSeat: Seat | null;
  draw: boolean;
  lastMove: { from: number; to: number; captured: number[] } | null;
  lastMoveAt: number;
}

export interface CheckersAction {
  type: 'move';
  from: number;
  to: number;
}

export interface CheckersMove {
  from: number;
  to: number;
  /** Indices of squares jumped over, in order. */
  captured: number[];
}

const rowOf = (index: number) => Math.floor(index / CHECKERS_SIZE);
const colOf = (index: number) => index % CHECKERS_SIZE;
const inside = (row: number, col: number) => row >= 0 && row < CHECKERS_SIZE && col >= 0 && col < CHECKERS_SIZE;
const at = (row: number, col: number) => row * CHECKERS_SIZE + col;

/** Seat 0 moves up the board (row 7 → 0), seat 1 moves down. */
const forwardOf = (seat: Seat) => (seat === 0 ? -1 : 1);

const DIAGONALS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

function directionsFor(piece: CheckersPiece): readonly (readonly [number, number])[] {
  if (piece.king) return DIAGONALS;
  const forward = forwardOf(piece.seat);
  return DIAGONALS.filter(([dr]) => dr === forward);
}

/** Single jumps available from one square (one hop, not the whole chain). */
function jumpsFrom(board: CheckersSquare[], index: number): CheckersMove[] {
  const piece = board[index];
  if (!piece) return [];

  const row = rowOf(index);
  const col = colOf(index);
  const moves: CheckersMove[] = [];

  for (const [dr, dc] of directionsFor(piece)) {
    const overRow = row + dr;
    const overCol = col + dc;
    const landRow = row + dr * 2;
    const landCol = col + dc * 2;
    if (!inside(landRow, landCol)) continue;

    const over = board[at(overRow, overCol)];
    if (!over || over.seat === piece.seat) continue;
    if (board[at(landRow, landCol)] !== null) continue;

    moves.push({ from: index, to: at(landRow, landCol), captured: [at(overRow, overCol)] });
  }
  return moves;
}

function slidesFrom(board: CheckersSquare[], index: number): CheckersMove[] {
  const piece = board[index];
  if (!piece) return [];

  const row = rowOf(index);
  const col = colOf(index);
  const moves: CheckersMove[] = [];

  for (const [dr, dc] of directionsFor(piece)) {
    const nextRow = row + dr;
    const nextCol = col + dc;
    if (!inside(nextRow, nextCol)) continue;
    if (board[at(nextRow, nextCol)] !== null) continue;
    moves.push({ from: index, to: at(nextRow, nextCol), captured: [] });
  }
  return moves;
}

/**
 * All legal moves for the side to move. Captures are compulsory, and a piece
 * in the middle of a multi-jump is the only one allowed to move.
 */
export function checkersLegalMoves(state: CheckersState): CheckersMove[] {
  if (state.winnerSeat !== null || state.draw) return [];

  if (state.chainFrom !== null) return jumpsFrom(state.board, state.chainFrom);

  const mine = state.board.flatMap((piece, index) => (piece && piece.seat === state.turn ? [index] : []));
  const captures = mine.flatMap((index) => jumpsFrom(state.board, index));
  if (captures.length > 0) return captures;

  return mine.flatMap((index) => slidesFrom(state.board, index));
}

function crownRow(seat: Seat): number {
  return seat === 0 ? 0 : CHECKERS_SIZE - 1;
}

function countPieces(board: CheckersSquare[], seat: Seat): number {
  return board.reduce((total, piece) => (piece && piece.seat === seat ? total + 1 : total), 0);
}

/**
 * Checkers (English draughts): forced captures, multi-jumps, and men that
 * become kings on the far rank.
 */
export const checkersEngine: GameEngine<CheckersState, CheckersAction> = {
  id: 'checkers',
  tickMs: 0,

  createState(now) {
    const board: CheckersSquare[] = Array.from({ length: CHECKERS_SIZE * CHECKERS_SIZE }, () => null);

    for (let row = 0; row < CHECKERS_SIZE; row += 1) {
      for (let col = 0; col < CHECKERS_SIZE; col += 1) {
        // Only dark squares are used.
        if ((row + col) % 2 === 0) continue;
        if (row < 3) board[at(row, col)] = { seat: 1, king: false };
        if (row > 4) board[at(row, col)] = { seat: 0, king: false };
      }
    }

    return {
      board,
      turn: 0,
      chainFrom: null,
      moves: 0,
      quietPlies: 0,
      winnerSeat: null,
      draw: false,
      lastMove: null,
      lastMoveAt: now,
    };
  },

  apply(state, seat, action, now) {
    const fail = (error: string): ActionResult<CheckersState> => ({ ok: false, state, error });

    if (state.winnerSeat !== null || state.draw) return fail('Match already finished');
    if (seat !== state.turn) return fail('Not your turn');
    if (action?.type !== 'move') return fail('Unsupported action');

    const legal = checkersLegalMoves(state);
    const move = legal.find((candidate) => candidate.from === action.from && candidate.to === action.to);
    if (!move) {
      return fail(legal.some((m) => m.captured.length > 0) ? 'You must take the capture' : 'Illegal move');
    }

    const board = state.board.slice();
    const piece = board[move.from] as CheckersPiece;
    board[move.from] = null;
    for (const captured of move.captured) board[captured] = null;

    const promoted = !piece.king && rowOf(move.to) === crownRow(piece.seat);
    board[move.to] = promoted ? { seat: piece.seat, king: true } : piece;

    // A promotion always ends the turn, even mid chain — standard draughts rule.
    const canChain =
      move.captured.length > 0 && !promoted && jumpsFrom(board, move.to).length > 0 ? move.to : null;

    const opponent = otherSeat(seat);
    const quiet = move.captured.length === 0 && !promoted ? state.quietPlies + 1 : 0;

    const next: CheckersState = {
      board,
      turn: canChain !== null ? seat : opponent,
      chainFrom: canChain,
      moves: state.moves + 1,
      quietPlies: quiet,
      winnerSeat: null,
      draw: false,
      lastMove: { from: move.from, to: move.to, captured: move.captured },
      lastMoveAt: now,
    };

    // Losing every piece, or having no legal reply, loses the game.
    if (countPieces(board, opponent) === 0) {
      next.winnerSeat = seat;
    } else if (canChain === null && checkersLegalMoves(next).length === 0) {
      next.winnerSeat = seat;
    } else if (quiet >= CHECKERS_DRAW_PLIES) {
      next.draw = true;
    }

    return { ok: true, state: next };
  },

  outcome(state): GameOutcome {
    if (state.winnerSeat !== null) return { finished: true, winnerSeat: state.winnerSeat, reason: 'victory' };
    if (state.draw) return { finished: true, winnerSeat: null, reason: 'draw' };
    return UNFINISHED;
  },

  activeSeat(state) {
    return state.winnerSeat === null && !state.draw ? state.turn : null;
  },

  toPublic(state) {
    return { ...state, legal: checkersLegalMoves(state) };
  },
};
