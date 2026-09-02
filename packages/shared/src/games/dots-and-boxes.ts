import type { ActionResult, GameEngine, GameOutcome, Seat } from './types.js';
import { UNFINISHED, otherSeat } from './types.js';

/** 5x5 boxes => 6x6 dots. */
export const BOXES = 5;
export const DOTS = BOXES + 1;
export const H_EDGES = DOTS * BOXES; // horizontal edges
export const V_EDGES = BOXES * DOTS; // vertical edges
export const TOTAL_EDGES = H_EDGES + V_EDGES;

export interface DotsState {
  /** `true` when the edge has been drawn. Horizontal edges first, then vertical. */
  edges: boolean[];
  /** Owner of each box, or null. */
  boxes: (Seat | null)[];
  turn: Seat;
  score: [number, number];
  lastEdge: number | null;
  claimed: number[];
  lastMoveAt: number;
}

export interface DotsAction {
  type: 'draw';
  edge: number;
}

const hEdge = (row: number, column: number) => row * BOXES + column;
const vEdge = (row: number, column: number) => H_EDGES + row * DOTS + column;

function boxEdges(box: number): [number, number, number, number] {
  const row = Math.floor(box / BOXES);
  const column = box % BOXES;
  return [hEdge(row, column), hEdge(row + 1, column), vEdge(row, column), vEdge(row, column + 1)];
}

/** Dots and Boxes: close a square to score and immediately play again. */
export const dotsAndBoxesEngine: GameEngine<DotsState, DotsAction> = {
  id: 'dots-and-boxes',
  tickMs: 0,

  createState(now) {
    return {
      edges: Array.from({ length: TOTAL_EDGES }, () => false),
      boxes: Array.from({ length: BOXES * BOXES }, () => null),
      turn: 0,
      score: [0, 0],
      lastEdge: null,
      claimed: [],
      lastMoveAt: now,
    };
  },

  apply(state, seat, action, now): ActionResult<DotsState> {
    if (this.outcome(state).finished) return { ok: false, state, error: 'MATCH_OVER' };
    if (seat !== state.turn) return { ok: false, state, error: 'NOT_YOUR_TURN' };
    if (action.type !== 'draw') return { ok: false, state, error: 'UNKNOWN_ACTION' };
    if (!Number.isInteger(action.edge) || action.edge < 0 || action.edge >= TOTAL_EDGES) {
      return { ok: false, state, error: 'OUT_OF_BOUNDS' };
    }
    if (state.edges[action.edge]) return { ok: false, state, error: 'EDGE_TAKEN' };

    const edges = state.edges.slice();
    edges[action.edge] = true;

    const boxes = state.boxes.slice();
    const score: [number, number] = [...state.score];
    const claimed: number[] = [];

    for (let box = 0; box < boxes.length; box += 1) {
      if (boxes[box] !== null) continue;
      if (boxEdges(box).every((edge) => edges[edge])) {
        boxes[box] = seat;
        score[seat] += 1;
        claimed.push(box);
      }
    }

    return {
      ok: true,
      state: {
        edges,
        boxes,
        // Closing a box grants another turn — the core tactic of the game.
        turn: claimed.length > 0 ? seat : otherSeat(seat),
        score,
        lastEdge: action.edge,
        claimed,
        lastMoveAt: now,
      },
    };
  },

  outcome(state): GameOutcome {
    const total = state.score[0] + state.score[1];
    if (total < BOXES * BOXES) return UNFINISHED;
    if (state.score[0] === state.score[1]) return { finished: true, winnerSeat: null, reason: 'draw' };
    return { finished: true, winnerSeat: state.score[0] > state.score[1] ? 0 : 1, reason: 'victory' };
  },

  activeSeat(state) {
    return this.outcome(state).finished ? null : state.turn;
  },

  toPublic(state) {
    return state;
  },
};
