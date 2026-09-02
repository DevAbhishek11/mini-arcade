import type { ActionResult, GameEngine, GameOutcome, Seat } from './types.js';
import { UNFINISHED, otherSeat } from './types.js';

/** Nine Men's Morris: 24 points on three nested squares. */
export const MORRIS_POINTS = 24;
export const MORRIS_PIECES = 9;
/** Plies without a mill before the game is called a draw. */
export const MORRIS_DRAW_PLIES = 50;

export type MorrisPhase = 'placing' | 'moving' | 'flying';

export interface MorrisState {
  board: (Seat | null)[];
  turn: Seat;
  /** Pieces still to be placed, per seat. */
  hand: [number, number];
  /** Pieces on the board, per seat. */
  onBoard: [number, number];
  /** Set when the mover just formed a mill and must remove a piece. */
  mustRemove: boolean;
  lastMill: number[] | null;
  lastMove: { from: number | null; to: number } | null;
  lastRemoved: number | null;
  pliesSinceMill: number;
  finished: boolean;
  winnerSeat: Seat | null;
  lastMoveAt: number;
}

export interface MorrisAction {
  type: 'place' | 'move' | 'remove';
  from?: number;
  to?: number;
  point?: number;
}

/**
 * Board layout, outer ring first (0-7), then middle (8-15), then inner
 * (16-23), each clockwise from the top left corner.
 */
export const MORRIS_ADJACENCY: readonly (readonly number[])[] = [
  [1, 7],
  [0, 2, 9],
  [1, 3],
  [2, 4, 11],
  [3, 5],
  [4, 6, 13],
  [5, 7],
  [0, 6, 15],
  [9, 15],
  [1, 8, 10, 17],
  [9, 11],
  [3, 10, 12, 19],
  [11, 13],
  [5, 12, 14, 21],
  [13, 15],
  [7, 8, 14, 23],
  [17, 23],
  [9, 16, 18],
  [17, 19],
  [11, 18, 20],
  [19, 21],
  [13, 20, 22],
  [21, 23],
  [15, 16, 22],
];

/** The 16 mills: eight along the rings, eight along the spokes. */
export const MORRIS_MILLS: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [2, 3, 4],
  [4, 5, 6],
  [6, 7, 0],
  [8, 9, 10],
  [10, 11, 12],
  [12, 13, 14],
  [14, 15, 8],
  [16, 17, 18],
  [18, 19, 20],
  [20, 21, 22],
  [22, 23, 16],
  [1, 9, 17],
  [3, 11, 19],
  [5, 13, 21],
  [7, 15, 23],
];

/** Screen coordinates in a 6x6 grid, for the board component. */
export const MORRIS_COORDS: readonly (readonly [number, number])[] = [
  [0, 0],
  [3, 0],
  [6, 0],
  [6, 3],
  [6, 6],
  [3, 6],
  [0, 6],
  [0, 3],
  [1, 1],
  [3, 1],
  [5, 1],
  [5, 3],
  [5, 5],
  [3, 5],
  [1, 5],
  [1, 3],
  [2, 2],
  [3, 2],
  [4, 2],
  [4, 3],
  [4, 4],
  [3, 4],
  [2, 4],
  [2, 3],
];

/** Mills through `point` that the seat has just completed. */
function millsAt(board: (Seat | null)[], point: number, seat: Seat): number[] {
  return MORRIS_MILLS.filter(
    (mill) => mill.includes(point) && mill.every((cell) => board[cell] === seat),
  ).flat();
}

function inMill(board: (Seat | null)[], point: number, seat: Seat): boolean {
  return MORRIS_MILLS.some((mill) => mill.includes(point) && mill.every((cell) => board[cell] === seat));
}

export function morrisPhaseOf(state: MorrisState, seat: Seat): MorrisPhase {
  if (state.hand[seat] > 0) return 'placing';
  // Down to three pieces, you may jump anywhere — the classic "flying" rule.
  return state.onBoard[seat] === 3 ? 'flying' : 'moving';
}

/** Pieces the mover may take: not in a mill, unless every piece is. */
export function morrisRemovable(state: MorrisState, seat: Seat): number[] {
  const enemy = otherSeat(seat);
  const theirs = state.board.flatMap((cell, index) => (cell === enemy ? [index] : []));
  const open = theirs.filter((point) => !inMill(state.board, point, enemy));
  return open.length > 0 ? open : theirs;
}

export function morrisLegalMoves(state: MorrisState): MorrisAction[] {
  const seat = state.turn;

  if (state.mustRemove) {
    return morrisRemovable(state, seat).map((point) => ({ type: 'remove', point }));
  }

  const phase = morrisPhaseOf(state, seat);
  if (phase === 'placing') {
    return state.board.flatMap((cell, index) => (cell === null ? [{ type: 'place' as const, to: index }] : []));
  }

  const mine = state.board.flatMap((cell, index) => (cell === seat ? [index] : []));
  return mine.flatMap((from) => {
    const destinations =
      phase === 'flying'
        ? state.board.flatMap((cell, index) => (cell === null ? [index] : []))
        : (MORRIS_ADJACENCY[from] ?? []).filter((point) => state.board[point] === null);
    return destinations.map((to) => ({ type: 'move' as const, from, to }));
  });
}

/** Losing conditions are checked for the side about to move. */
function settle(state: MorrisState): MorrisState {
  const seat = state.turn;
  if (state.mustRemove) return state;

  // Fewer than three pieces once everything is placed, or no legal move at all.
  if (state.hand[seat] === 0 && state.onBoard[seat] < 3) {
    return { ...state, finished: true, winnerSeat: otherSeat(seat) };
  }
  if (morrisLegalMoves(state).length === 0) {
    return { ...state, finished: true, winnerSeat: otherSeat(seat) };
  }
  if (state.pliesSinceMill >= MORRIS_DRAW_PLIES) {
    return { ...state, finished: true, winnerSeat: null };
  }
  return state;
}

export const morrisEngine: GameEngine<MorrisState, MorrisAction> = {
  id: 'nine-mens-morris',
  tickMs: 0,

  createState(now) {
    return {
      board: new Array<Seat | null>(MORRIS_POINTS).fill(null),
      turn: 0,
      hand: [MORRIS_PIECES, MORRIS_PIECES],
      onBoard: [0, 0],
      mustRemove: false,
      lastMill: null,
      lastMove: null,
      lastRemoved: null,
      pliesSinceMill: 0,
      finished: false,
      winnerSeat: null,
      lastMoveAt: now,
    };
  },

  apply(state, seat, action, now): ActionResult<MorrisState> {
    if (state.finished) return { ok: false, state, error: 'The game is over' };
    if (seat !== state.turn) return { ok: false, state, error: 'Not your turn' };

    // Removing an enemy piece completes the previous move; the turn only
    // passes afterwards.
    if (state.mustRemove) {
      if (action.type !== 'remove' || action.point === undefined) {
        return { ok: false, state, error: 'You formed a mill — take an enemy piece' };
      }
      if (!morrisRemovable(state, seat).includes(action.point)) {
        return { ok: false, state, error: 'That piece is protected by a mill' };
      }

      const board = state.board.slice();
      board[action.point] = null;
      const onBoard: [number, number] = [...state.onBoard];
      onBoard[otherSeat(seat)] -= 1;

      return {
        ok: true,
        state: settle({
          ...state,
          board,
          onBoard,
          mustRemove: false,
          lastRemoved: action.point,
          turn: otherSeat(seat),
          lastMoveAt: now,
        }),
      };
    }

    const phase = morrisPhaseOf(state, seat);
    const board = state.board.slice();
    const hand: [number, number] = [...state.hand];
    const onBoard: [number, number] = [...state.onBoard];
    let landed: number;
    let lastMove: MorrisState['lastMove'];

    if (phase === 'placing') {
      if (action.type !== 'place' || action.to === undefined) {
        return { ok: false, state, error: 'Place a piece from your hand' };
      }
      if (action.to < 0 || action.to >= MORRIS_POINTS) {
        return { ok: false, state, error: 'That point is off the board' };
      }
      if (board[action.to] !== null) return { ok: false, state, error: 'That point is taken' };

      board[action.to] = seat;
      hand[seat] -= 1;
      onBoard[seat] += 1;
      landed = action.to;
      lastMove = { from: null, to: action.to };
    } else {
      if (action.type !== 'move' || action.from === undefined || action.to === undefined) {
        return { ok: false, state, error: 'Move one of your pieces' };
      }
      if (board[action.from] !== seat) return { ok: false, state, error: 'That is not your piece' };
      if (board[action.to] !== null) return { ok: false, state, error: 'That point is taken' };
      if (phase === 'moving' && !(MORRIS_ADJACENCY[action.from] ?? []).includes(action.to)) {
        return { ok: false, state, error: 'Pieces slide along a line to a neighbouring point' };
      }

      board[action.to] = seat;
      board[action.from] = null;
      landed = action.to;
      lastMove = { from: action.from, to: action.to };
    }

    const mill = millsAt(board, landed, seat);
    const opponentHasPieces = onBoard[otherSeat(seat)] > 0;
    const mustRemove = mill.length > 0 && opponentHasPieces;

    return {
      ok: true,
      state: settle({
        ...state,
        board,
        hand,
        onBoard,
        // A mill keeps the turn so the mover can take a piece.
        turn: mustRemove ? seat : otherSeat(seat),
        mustRemove,
        lastMill: mill.length > 0 ? mill : null,
        lastMove,
        lastRemoved: null,
        pliesSinceMill: mill.length > 0 ? 0 : state.pliesSinceMill + 1,
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
    return { ...state, phase: morrisPhaseOf(state, state.turn), legal: morrisLegalMoves(state) };
  },
};
