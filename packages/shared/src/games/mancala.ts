import type { ActionResult, GameEngine, GameOutcome, Seat } from './types.js';
import { UNFINISHED, otherSeat } from './types.js';

/** Kalah 6x4: six pits a side, four stones a pit, one store each. */
export const MANCALA_PITS = 6;
export const MANCALA_SEEDS = 4;
/** Pit layout: 0-5 seat 0, 6 seat 0's store, 7-12 seat 1, 13 seat 1's store. */
export const MANCALA_STORE = [6, 13] as const;
const TOTAL_PITS = 14;

export interface MancalaState {
  pits: number[];
  turn: Seat;
  moves: number;
  /** True when the last move earned another turn, for the UI to celebrate. */
  extraTurn: boolean;
  /** Pit emptied by the last move, for animation. */
  lastPit: number | null;
  /** Pit captured by the last move, if any. */
  lastCapture: number | null;
  winnerSeat: Seat | null;
  draw: boolean;
  lastMoveAt: number;
}

export interface MancalaAction {
  type: 'sow';
  pit: number;
}

/** Pit indices a seat may sow from. */
export function mancalaPitsOf(seat: Seat): number[] {
  const start = seat === 0 ? 0 : MANCALA_PITS + 1;
  return Array.from({ length: MANCALA_PITS }, (_, offset) => start + offset);
}

const storeOf = (seat: Seat) => MANCALA_STORE[seat];
const isStore = (index: number) => index === MANCALA_STORE[0] || index === MANCALA_STORE[1];
/** The pit directly across the board, used for captures. */
const oppositeOf = (index: number) => 12 - index;

export function mancalaLegalMoves(state: MancalaState): number[] {
  if (state.winnerSeat !== null || state.draw) return [];
  return mancalaPitsOf(state.turn).filter((pit) => (state.pits[pit] ?? 0) > 0);
}

function sideEmpty(pits: number[], seat: Seat): boolean {
  return mancalaPitsOf(seat).every((pit) => (pits[pit] ?? 0) === 0);
}

/** Ends the game by sweeping every remaining stone into its owner's store. */
function sweep(pits: number[]): number[] {
  const swept = pits.slice();
  for (const seat of [0, 1] as Seat[]) {
    for (const pit of mancalaPitsOf(seat)) {
      swept[storeOf(seat)] = (swept[storeOf(seat)] ?? 0) + (swept[pit] ?? 0);
      swept[pit] = 0;
    }
  }
  return swept;
}

/**
 * Mancala (Kalah rules): sow anticlockwise, land in your own store for a free
 * turn, and land in an empty pit on your side to capture the stones opposite.
 */
export const mancalaEngine: GameEngine<MancalaState, MancalaAction> = {
  id: 'mancala',
  tickMs: 0,

  createState(now) {
    const pits = Array.from({ length: TOTAL_PITS }, () => MANCALA_SEEDS);
    pits[MANCALA_STORE[0]] = 0;
    pits[MANCALA_STORE[1]] = 0;

    return {
      pits,
      turn: 0,
      moves: 0,
      extraTurn: false,
      lastPit: null,
      lastCapture: null,
      winnerSeat: null,
      draw: false,
      lastMoveAt: now,
    };
  },

  apply(state, seat, action, now) {
    const fail = (error: string): ActionResult<MancalaState> => ({ ok: false, state, error });

    if (state.winnerSeat !== null || state.draw) return fail('Match already finished');
    if (seat !== state.turn) return fail('Not your turn');
    if (action?.type !== 'sow') return fail('Unsupported action');
    if (!mancalaLegalMoves(state).includes(action.pit)) return fail('Pick one of your non-empty pits');

    const pits = state.pits.slice();
    let hand = pits[action.pit] as number;
    pits[action.pit] = 0;

    let cursor = action.pit;
    while (hand > 0) {
      cursor = (cursor + 1) % TOTAL_PITS;
      // You never sow into your opponent's store.
      if (cursor === storeOf(otherSeat(seat))) continue;
      pits[cursor] = (pits[cursor] ?? 0) + 1;
      hand -= 1;
    }

    // Landing in an own empty pit captures it plus the pit across from it.
    let capture: number | null = null;
    const landedOwnSide = mancalaPitsOf(seat).includes(cursor);
    if (landedOwnSide && pits[cursor] === 1) {
      const opposite = oppositeOf(cursor);
      const loot = pits[opposite] ?? 0;
      if (loot > 0) {
        pits[storeOf(seat)] = (pits[storeOf(seat)] ?? 0) + loot + 1;
        pits[opposite] = 0;
        pits[cursor] = 0;
        capture = opposite;
      }
    }

    const extraTurn = isStore(cursor) && cursor === storeOf(seat);

    // One side running dry ends the game immediately.
    const finished = sideEmpty(pits, 0) || sideEmpty(pits, 1);
    const finalPits = finished ? sweep(pits) : pits;

    const next: MancalaState = {
      pits: finalPits,
      turn: extraTurn ? seat : otherSeat(seat),
      moves: state.moves + 1,
      extraTurn,
      lastPit: action.pit,
      lastCapture: capture,
      winnerSeat: null,
      draw: false,
      lastMoveAt: now,
    };

    if (finished) {
      const mine = finalPits[storeOf(0)] as number;
      const theirs = finalPits[storeOf(1)] as number;
      if (mine === theirs) next.draw = true;
      else next.winnerSeat = mine > theirs ? 0 : 1;
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
    return { ...state, legal: mancalaLegalMoves(state) };
  },
};
