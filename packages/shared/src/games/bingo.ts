import type { ActionResult, GameEngine, GameOutcome, Seat } from './types.js';
import { UNFINISHED, otherSeat } from './types.js';

export const BINGO_SIZE = 5;
export const BINGO_CELLS = BINGO_SIZE * BINGO_SIZE;
/** Numbers per column, B-I-N-G-O style: 1-15, 16-30, … */
export const BINGO_COLUMN_RANGE = 15;
export const BINGO_MAX_NUMBER = BINGO_COLUMN_RANGE * BINGO_SIZE;
/** How many balls the caller may choose between each turn. */
export const BINGO_CHOICES = 3;
/** Index of the free centre square. */
export const BINGO_FREE_CELL = 12;

export interface BingoState {
  /** One card per seat; `null` marks the free centre square. */
  cards: [(number | null)[], (number | null)[]];
  marked: [boolean[], boolean[]];
  turn: Seat;
  /** Numbers the caller may pick from this turn. */
  choices: number[];
  called: number[];
  /** Numbers still in the bag, in draw order. */
  bag: number[];
  lines: [number[], number[]];
  lastCalled: number | null;
  finished: boolean;
  winnerSeat: Seat | null;
  lastMoveAt: number;
}

export interface BingoAction {
  type: 'call';
  number: number;
}

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

/** A standard card: each column drawn from its own range, free centre square. */
function makeCard(random: () => number): (number | null)[] {
  const card: (number | null)[] = new Array(BINGO_CELLS).fill(null);
  for (let col = 0; col < BINGO_SIZE; col += 1) {
    const low = col * BINGO_COLUMN_RANGE + 1;
    const pool = shuffle(
      Array.from({ length: BINGO_COLUMN_RANGE }, (_, i) => low + i),
      random,
    );
    for (let row = 0; row < BINGO_SIZE; row += 1) {
      const index = row * BINGO_SIZE + col;
      card[index] = index === BINGO_FREE_CELL ? null : (pool[row] as number);
    }
  }
  return card;
}

/** All 12 winning lines: 5 rows, 5 columns and both diagonals. */
const LINES: readonly number[][] = (() => {
  const lines: number[][] = [];
  for (let row = 0; row < BINGO_SIZE; row += 1) {
    lines.push(Array.from({ length: BINGO_SIZE }, (_, col) => row * BINGO_SIZE + col));
  }
  for (let col = 0; col < BINGO_SIZE; col += 1) {
    lines.push(Array.from({ length: BINGO_SIZE }, (_, row) => row * BINGO_SIZE + col));
  }
  lines.push(Array.from({ length: BINGO_SIZE }, (_, i) => i * BINGO_SIZE + i));
  lines.push(Array.from({ length: BINGO_SIZE }, (_, i) => i * BINGO_SIZE + (BINGO_SIZE - 1 - i)));
  return lines;
})();

function completedLines(marked: boolean[]): number[] {
  return LINES.flatMap((line, index) => (line.every((cell) => marked[cell]) ? [index] : []));
}

function markCard(card: (number | null)[], marked: boolean[], value: number): boolean[] {
  const next = marked.slice();
  card.forEach((entry, index) => {
    if (entry === value) next[index] = true;
  });
  return next;
}

/**
 * Bingo Blitz: both players share the caller's bag, and every ball marks
 * *both* cards. On your turn you choose one of three balls, so the luck of the
 * draw becomes a real decision — take the number you need, or deny the one
 * that would complete your opponent's line.
 */
export const bingoEngine: GameEngine<BingoState, BingoAction> = {
  id: 'bingo',
  tickMs: 0,

  createState(now) {
    const random = rng(Math.floor(Math.random() * 0xffff_ffff));
    const cards: BingoState['cards'] = [makeCard(random), makeCard(random)];

    const marked: BingoState['marked'] = [
      new Array<boolean>(BINGO_CELLS).fill(false),
      new Array<boolean>(BINGO_CELLS).fill(false),
    ];
    // The centre square is free for both players.
    marked[0][BINGO_FREE_CELL] = true;
    marked[1][BINGO_FREE_CELL] = true;

    const bag = shuffle(
      Array.from({ length: BINGO_MAX_NUMBER }, (_, i) => i + 1),
      random,
    );

    return {
      cards,
      marked,
      turn: 0,
      choices: bag.slice(0, BINGO_CHOICES),
      called: [],
      bag: bag.slice(BINGO_CHOICES),
      lines: [[], []],
      lastCalled: null,
      finished: false,
      winnerSeat: null,
      lastMoveAt: now,
    };
  },

  apply(state, seat, action, now): ActionResult<BingoState> {
    if (state.finished) return { ok: false, state, error: 'The game is over' };
    if (seat !== state.turn) return { ok: false, state, error: 'Not your turn' };
    if (action.type !== 'call') return { ok: false, state, error: 'Unknown action' };
    if (!state.choices.includes(action.number)) {
      return { ok: false, state, error: 'That ball is not on offer this turn' };
    }

    const marked: BingoState['marked'] = [
      markCard(state.cards[0], state.marked[0], action.number),
      markCard(state.cards[1], state.marked[1], action.number),
    ];
    const lines: BingoState['lines'] = [completedLines(marked[0]), completedLines(marked[1])];

    // Refill the offer from the bag, keeping the balls nobody picked.
    const kept = state.choices.filter((ball) => ball !== action.number);
    const bag = state.bag.slice();
    const choices = kept.slice();
    while (choices.length < BINGO_CHOICES && bag.length > 0) choices.push(bag.shift() as number);

    // The caller wins ties: they chose the ball that completed both cards.
    const callerWon = lines[seat].length > 0;
    const rivalWon = lines[otherSeat(seat)].length > 0;
    const finished = callerWon || rivalWon || choices.length === 0;
    const winnerSeat = callerWon ? seat : rivalWon ? otherSeat(seat) : null;

    return {
      ok: true,
      state: {
        ...state,
        marked,
        lines,
        turn: otherSeat(seat),
        choices,
        bag,
        called: [...state.called, action.number],
        lastCalled: action.number,
        finished,
        winnerSeat,
        lastMoveAt: now,
      },
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
    // The bag order is the future — only the three offered balls are public.
    const { bag: _bag, ...visible } = state;
    return { ...visible, ballsLeft: state.bag.length };
  },
};

/** How close a card is to bingo: the best line's remaining squares. */
export function bingoBestLine(
  card: (number | null)[],
  marked: boolean[],
): { line: number[]; missing: number[] } {
  let best: { line: number[]; missing: number[] } = { line: [], missing: [] };
  let fewest = Number.POSITIVE_INFINITY;

  for (const line of LINES) {
    const missing = line.filter((cell) => !marked[cell]).map((cell) => card[cell] as number);
    if (missing.length < fewest) {
      fewest = missing.length;
      best = { line, missing };
    }
  }
  return best;
}

export const bingoLines = LINES;
