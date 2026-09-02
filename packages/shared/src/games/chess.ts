import type { ActionResult, GameEngine, GameOutcome, Seat } from './types.js';
import { UNFINISHED, otherSeat } from './types.js';

export const CHESS_SIZE = 8;
/** Plies without a capture or pawn move before the game is drawn (50 moves). */
export const CHESS_HALFMOVE_LIMIT = 100;

export type PieceKind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface ChessPiece {
  seat: Seat;
  kind: PieceKind;
}

export interface ChessMove {
  from: number;
  to: number;
  /** Set when a pawn reaches the back rank. */
  promotion?: Exclude<PieceKind, 'p' | 'k'>;
  /** Square of the captured piece — differs from `to` for en passant. */
  captures?: number;
  castle?: 'king' | 'queen';
  enPassant?: boolean;
}

export interface ChessState {
  /** 64 squares, index 0 = a8, index 63 = h1. Seat 0 is white and moves up. */
  board: (ChessPiece | null)[];
  turn: Seat;
  /** Castling rights, indexed by seat. */
  castling: [{ king: boolean; queen: boolean }, { king: boolean; queen: boolean }];
  /** Square a pawn may be captured on by en passant, if any. */
  enPassant: number | null;
  halfmoveClock: number;
  fullmove: number;
  legal: ChessMove[];
  lastMove: ChessMove | null;
  /** Seat currently in check, if any. */
  check: Seat | null;
  captured: [PieceKind[], PieceKind[]];
  finished: boolean;
  winnerSeat: Seat | null;
  /** Why the game ended — surfaced in the UI. */
  ending: 'checkmate' | 'stalemate' | 'fifty-move' | 'insufficient-material' | null;
  lastMoveAt: number;
}

export interface ChessAction {
  type: 'move';
  from: number;
  to: number;
  promotion?: Exclude<PieceKind, 'p' | 'k'>;
}

const rowOf = (square: number) => Math.floor(square / CHESS_SIZE);
const colOf = (square: number) => square % CHESS_SIZE;
const onBoard = (row: number, col: number) => row >= 0 && row < CHESS_SIZE && col >= 0 && col < CHESS_SIZE;
const at = (row: number, col: number) => row * CHESS_SIZE + col;

/** Direction a seat's pawns travel, in rows. Seat 0 (white) marches up. */
const forwardOf = (seat: Seat) => (seat === 0 ? -1 : 1);
const homeRowOf = (seat: Seat) => (seat === 0 ? 7 : 0);
const pawnRowOf = (seat: Seat) => (seat === 0 ? 6 : 1);
const promotionRowOf = (seat: Seat) => (seat === 0 ? 0 : 7);

const KNIGHT_STEPS: readonly (readonly [number, number])[] = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

const KING_STEPS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

const BISHOP_RAYS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const ROOK_RAYS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const BACK_RANK: readonly PieceKind[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

function startingBoard(): (ChessPiece | null)[] {
  const board: (ChessPiece | null)[] = new Array(64).fill(null);
  for (let col = 0; col < CHESS_SIZE; col += 1) {
    board[at(0, col)] = { seat: 1, kind: BACK_RANK[col] as PieceKind };
    board[at(1, col)] = { seat: 1, kind: 'p' };
    board[at(6, col)] = { seat: 0, kind: 'p' };
    board[at(7, col)] = { seat: 0, kind: BACK_RANK[col] as PieceKind };
  }
  return board;
}

/** Squares a piece attacks, ignoring whether the move would expose its king. */
function attacksFrom(board: (ChessPiece | null)[], square: number): number[] {
  const piece = board[square];
  if (!piece) return [];

  const row = rowOf(square);
  const col = colOf(square);
  const squares: number[] = [];

  const ray = (steps: readonly (readonly [number, number])[]) => {
    for (const [dr, dc] of steps) {
      let r = row + dr;
      let c = col + dc;
      while (onBoard(r, c)) {
        squares.push(at(r, c));
        if (board[at(r, c)]) break;
        r += dr;
        c += dc;
      }
    }
  };

  switch (piece.kind) {
    case 'p': {
      const dr = forwardOf(piece.seat);
      for (const dc of [-1, 1]) {
        if (onBoard(row + dr, col + dc)) squares.push(at(row + dr, col + dc));
      }
      break;
    }
    case 'n':
      for (const [dr, dc] of KNIGHT_STEPS) {
        if (onBoard(row + dr, col + dc)) squares.push(at(row + dr, col + dc));
      }
      break;
    case 'k':
      for (const [dr, dc] of KING_STEPS) {
        if (onBoard(row + dr, col + dc)) squares.push(at(row + dr, col + dc));
      }
      break;
    case 'b':
      ray(BISHOP_RAYS);
      break;
    case 'r':
      ray(ROOK_RAYS);
      break;
    case 'q':
      ray([...BISHOP_RAYS, ...ROOK_RAYS]);
      break;
  }

  return squares;
}

/** True when `seat` attacks `target`. */
function isAttacked(board: (ChessPiece | null)[], target: number, seat: Seat): boolean {
  for (let square = 0; square < board.length; square += 1) {
    const piece = board[square];
    if (piece?.seat !== seat) continue;
    if (attacksFrom(board, square).includes(target)) return true;
  }
  return false;
}

function kingSquare(board: (ChessPiece | null)[], seat: Seat): number {
  return board.findIndex((piece) => piece?.seat === seat && piece.kind === 'k');
}

export function chessInCheck(board: (ChessPiece | null)[], seat: Seat): boolean {
  const king = kingSquare(board, seat);
  return king >= 0 && isAttacked(board, king, otherSeat(seat));
}

/** Applies a move to a board copy. Rules are validated by the caller. */
function boardAfter(board: (ChessPiece | null)[], move: ChessMove): (ChessPiece | null)[] {
  const next = board.slice();
  const piece = next[move.from];
  if (!piece) return next;

  if (move.captures !== undefined) next[move.captures] = null;
  next[move.from] = null;
  next[move.to] = move.promotion ? { seat: piece.seat, kind: move.promotion } : piece;

  if (move.castle) {
    const row = rowOf(move.to);
    const [rookFrom, rookTo] = move.castle === 'king' ? [at(row, 7), at(row, 5)] : [at(row, 0), at(row, 3)];
    next[rookTo] = next[rookFrom] ?? null;
    next[rookFrom] = null;
  }

  return next;
}

/** Every move that is legal for `seat`, king safety included. */
export function chessLegalMoves(state: ChessState, seat: Seat = state.turn): ChessMove[] {
  const { board } = state;
  const pseudo: ChessMove[] = [];

  const addPawnMove = (from: number, to: number, captures?: number, enPassant?: boolean) => {
    if (rowOf(to) === promotionRowOf(seat)) {
      for (const promotion of ['q', 'r', 'b', 'n'] as const) {
        pseudo.push({ from, to, promotion, captures, enPassant });
      }
    } else {
      pseudo.push({ from, to, captures, enPassant });
    }
  };

  for (let from = 0; from < board.length; from += 1) {
    const piece = board[from];
    if (piece?.seat !== seat) continue;

    const row = rowOf(from);
    const col = colOf(from);

    if (piece.kind === 'p') {
      const dr = forwardOf(seat);

      // Single and double pushes onto empty squares.
      const oneAhead = at(row + dr, col);
      if (onBoard(row + dr, col) && !board[oneAhead]) {
        addPawnMove(from, oneAhead);
        const twoAhead = at(row + 2 * dr, col);
        if (row === pawnRowOf(seat) && !board[twoAhead]) pseudo.push({ from, to: twoAhead });
      }

      // Diagonal captures, including en passant.
      for (const dc of [-1, 1]) {
        if (!onBoard(row + dr, col + dc)) continue;
        const to = at(row + dr, col + dc);
        const target = board[to];
        if (target && target.seat !== seat) addPawnMove(from, to, to);
        else if (!target && state.enPassant === to) addPawnMove(from, to, at(row, col + dc), true);
      }
      continue;
    }

    for (const to of attacksFrom(board, from)) {
      const target = board[to];
      if (target?.seat === seat) continue;
      pseudo.push({ from, to, captures: target ? to : undefined });
    }
  }

  // Castling: rights intact, path clear, and the king never passes through check.
  const king = kingSquare(board, seat);
  const rights = state.castling[seat];
  if (king >= 0 && !chessInCheck(board, seat)) {
    const row = homeRowOf(seat);
    const enemy = otherSeat(seat);

    if (rights.king && !board[at(row, 5)] && !board[at(row, 6)]) {
      if (!isAttacked(board, at(row, 5), enemy) && !isAttacked(board, at(row, 6), enemy)) {
        pseudo.push({ from: king, to: at(row, 6), castle: 'king' });
      }
    }
    if (rights.queen && !board[at(row, 1)] && !board[at(row, 2)] && !board[at(row, 3)]) {
      if (!isAttacked(board, at(row, 3), enemy) && !isAttacked(board, at(row, 2), enemy)) {
        pseudo.push({ from: king, to: at(row, 2), castle: 'queen' });
      }
    }
  }

  // Finally, discard anything that leaves our own king in check.
  return pseudo.filter((move) => !chessInCheck(boardAfter(board, move), seat));
}

/** Neither side can force mate — a dead position. */
function insufficientMaterial(board: (ChessPiece | null)[]): boolean {
  const pieces = board.filter((piece): piece is ChessPiece => piece !== null);
  if (pieces.length > 4) return false;

  const minors = pieces.filter((piece) => piece.kind === 'b' || piece.kind === 'n');
  const others = pieces.filter((piece) => piece.kind !== 'k' && piece.kind !== 'b' && piece.kind !== 'n');
  return others.length === 0 && minors.length <= 2;
}

/**
 * Recomputes the derived fields of a position: legal moves, check, and any
 * ending. Exported so a position assembled by hand (a puzzle, a test, a
 * restored save) can be brought up to date.
 */
export function chessAnalyse(state: ChessState): ChessState {
  const legal = chessLegalMoves(state);
  const inCheck = chessInCheck(state.board, state.turn);

  if (legal.length === 0) {
    return {
      ...state,
      legal,
      check: inCheck ? state.turn : null,
      finished: true,
      winnerSeat: inCheck ? otherSeat(state.turn) : null,
      ending: inCheck ? 'checkmate' : 'stalemate',
    };
  }

  if (state.halfmoveClock >= CHESS_HALFMOVE_LIMIT) {
    return { ...state, legal, check: null, finished: true, winnerSeat: null, ending: 'fifty-move' };
  }

  if (insufficientMaterial(state.board)) {
    return {
      ...state,
      legal,
      check: null,
      finished: true,
      winnerSeat: null,
      ending: 'insufficient-material',
    };
  }

  return { ...state, legal, check: inCheck ? state.turn : null };
}

export const chessEngine: GameEngine<ChessState, ChessAction> = {
  id: 'chess',
  tickMs: 0,

  createState(now) {
    return chessAnalyse({
      board: startingBoard(),
      turn: 0,
      castling: [
        { king: true, queen: true },
        { king: true, queen: true },
      ],
      enPassant: null,
      halfmoveClock: 0,
      fullmove: 1,
      legal: [],
      lastMove: null,
      check: null,
      captured: [[], []],
      finished: false,
      winnerSeat: null,
      ending: null,
      lastMoveAt: now,
    });
  },

  apply(state, seat, action, now): ActionResult<ChessState> {
    if (state.finished) return { ok: false, state, error: 'The game is over' };
    if (seat !== state.turn) return { ok: false, state, error: 'Not your turn' };
    if (action.type !== 'move') return { ok: false, state, error: 'Unknown action' };

    const move = state.legal.find(
      (candidate) =>
        candidate.from === action.from &&
        candidate.to === action.to &&
        // Default an unspecified promotion to a queen.
        (candidate.promotion ?? null) === (action.promotion ?? candidate.promotion ?? null),
    );
    if (!move) return { ok: false, state, error: 'Illegal move' };

    const piece = state.board[move.from];
    if (!piece) return { ok: false, state, error: 'No piece there' };

    const capturedPiece = move.captures !== undefined ? state.board[move.captures] : null;
    const board = boardAfter(state.board, move);

    // Moving a king or a rook — or capturing a rook — spends castling rights.
    const castling: ChessState['castling'] = [{ ...state.castling[0] }, { ...state.castling[1] }];
    const spend = (owner: Seat, square: number) => {
      const row = homeRowOf(owner);
      if (square === at(row, 7)) castling[owner].king = false;
      if (square === at(row, 0)) castling[owner].queen = false;
    };
    if (piece.kind === 'k') castling[seat] = { king: false, queen: false };
    if (piece.kind === 'r') spend(seat, move.from);
    if (capturedPiece?.kind === 'r' && move.captures !== undefined) {
      spend(capturedPiece.seat, move.captures);
    }

    // A double pawn push opens an en passant window for exactly one ply.
    const doublePush =
      piece.kind === 'p' && Math.abs(rowOf(move.to) - rowOf(move.from)) === 2
        ? at((rowOf(move.from) + rowOf(move.to)) / 2, colOf(move.from))
        : null;

    const captured: ChessState['captured'] = [state.captured[0].slice(), state.captured[1].slice()];
    if (capturedPiece) captured[seat].push(capturedPiece.kind);

    return {
      ok: true,
      state: chessAnalyse({
        ...state,
        board,
        turn: otherSeat(seat),
        castling,
        enPassant: doublePush,
        halfmoveClock: piece.kind === 'p' || capturedPiece ? 0 : state.halfmoveClock + 1,
        fullmove: seat === 1 ? state.fullmove + 1 : state.fullmove,
        lastMove: move,
        captured,
        lastMoveAt: now,
      }),
    };
  },

  outcome(state): GameOutcome {
    if (!state.finished) return UNFINISHED;
    return {
      finished: true,
      winnerSeat: state.winnerSeat,
      reason: state.winnerSeat === null ? 'draw' : 'victory',
    };
  },

  activeSeat(state) {
    return state.finished ? null : state.turn;
  },

  toPublic(state) {
    return state;
  },
};
