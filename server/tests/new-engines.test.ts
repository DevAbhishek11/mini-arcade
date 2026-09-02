import { describe, expect, it } from 'vitest';
import {
  BOXES,
  ENGINES,
  GAME_IDS,
  GOMOKU_SIZE,
  H_EDGES,
  REVERSI_SIZE,
  SNAKE_STEP_MS,
  dotsAndBoxesEngine,
  gomokuEngine,
  reversiEngine,
  snakeDuelEngine,
  type DotsState,
  type GomokuState,
  type ReversiState,
  type SnakeState,
} from '@mini-arcade/shared';

const now = () => 1_700_000_000_000;

describe('engine registry', () => {
  it('exposes an engine for every catalog id', () => {
    for (const id of GAME_IDS) {
      const engine = ENGINES[id];
      expect(engine, id).toBeTruthy();
      expect(engine.id).toBe(id);
    }
  });

  it('produces a serialisable public state for every engine', () => {
    for (const id of GAME_IDS) {
      const engine = ENGINES[id];
      const state = engine.createState(now());
      expect(() => JSON.stringify(engine.toPublic(state))).not.toThrow();
      expect(engine.outcome(state).finished).toBe(false);
    }
  });
});

describe('gomoku engine', () => {
  it('wins on five in a row and reports the line', () => {
    let state: GomokuState = gomokuEngine.createState(now());
    // Seat 0 builds a horizontal run on row 0, seat 1 answers far away on row 5.
    for (let i = 0; i < 5; i += 1) {
      state = gomokuEngine.apply(state, 0, { type: 'place', index: i }, now()).state;
      if (i < 4) state = gomokuEngine.apply(state, 1, { type: 'place', index: 5 * GOMOKU_SIZE + i }, now()).state;
    }
    const outcome = gomokuEngine.outcome(state);
    expect(outcome.finished).toBe(true);
    expect(outcome.winnerSeat).toBe(0);
    expect(state.winningLine).toHaveLength(5);
  });

  it('rejects occupied intersections and out of turn moves', () => {
    const state = gomokuEngine.createState(now());
    expect(gomokuEngine.apply(state, 1, { type: 'place', index: 0 }, now()).error).toBe('NOT_YOUR_TURN');
    const played = gomokuEngine.apply(state, 0, { type: 'place', index: 0 }, now()).state;
    expect(gomokuEngine.apply(played, 1, { type: 'place', index: 0 }, now()).error).toBeTruthy();
  });
});

describe('reversi engine', () => {
  it('starts with four discs and four legal moves', () => {
    const state: ReversiState = reversiEngine.createState(now());
    expect(state.score).toEqual([2, 2]);
    expect(state.legal).toHaveLength(4);
    expect(state.board.filter((cell) => cell !== null)).toHaveLength(4);
  });

  it('flips the sandwiched discs', () => {
    const state = reversiEngine.createState(now());
    const target = state.legal[0] as number;
    const result = reversiEngine.apply(state, 0, { type: 'place', index: target }, now());
    expect(result.ok).toBe(true);
    expect(result.state.score[0]).toBe(4);
    expect(result.state.flipped.length).toBeGreaterThan(0);
    expect(result.state.board[target]).toBe(0);
  });

  it('refuses illegal placements', () => {
    const state = reversiEngine.createState(now());
    const illegal = state.board.findIndex((cell, index) => cell === null && !state.legal.includes(index));
    expect(reversiEngine.apply(state, 0, { type: 'place', index: illegal }, now()).ok).toBe(false);
    expect(reversiEngine.apply(state, 0, { type: 'pass' }, now()).ok).toBe(false);
  });

  it('keeps the board within bounds', () => {
    const state = reversiEngine.createState(now());
    expect(state.board).toHaveLength(REVERSI_SIZE * REVERSI_SIZE);
  });
});

describe('dots and boxes engine', () => {
  it('keeps the turn when a box is closed', () => {
    let state: DotsState = dotsAndBoxesEngine.createState(now());
    // Close the top-left box: top, bottom, left, right of box 0.
    const edges = [0, BOXES, H_EDGES, H_EDGES + 1];
    const filler = [1, 2, 3];

    state = dotsAndBoxesEngine.apply(state, 0, { type: 'draw', edge: edges[0] as number }, now()).state;
    state = dotsAndBoxesEngine.apply(state, 1, { type: 'draw', edge: filler[0] as number }, now()).state;
    state = dotsAndBoxesEngine.apply(state, 0, { type: 'draw', edge: edges[1] as number }, now()).state;
    state = dotsAndBoxesEngine.apply(state, 1, { type: 'draw', edge: filler[1] as number }, now()).state;
    state = dotsAndBoxesEngine.apply(state, 0, { type: 'draw', edge: edges[2] as number }, now()).state;
    state = dotsAndBoxesEngine.apply(state, 1, { type: 'draw', edge: filler[2] as number }, now()).state;

    const closing = dotsAndBoxesEngine.apply(state, 0, { type: 'draw', edge: edges[3] as number }, now());
    expect(closing.ok).toBe(true);
    expect(closing.state.score[0]).toBe(1);
    expect(closing.state.boxes[0]).toBe(0);
    // Closing a box grants another move.
    expect(dotsAndBoxesEngine.activeSeat(closing.state)).toBe(0);
  });

  it('rejects drawing the same edge twice', () => {
    const state = dotsAndBoxesEngine.createState(now());
    const drawn = dotsAndBoxesEngine.apply(state, 0, { type: 'draw', edge: 0 }, now()).state;
    expect(dotsAndBoxesEngine.apply(drawn, 1, { type: 'draw', edge: 0 }, now()).ok).toBe(false);
  });
});

describe('snake duel engine', () => {
  it('buffers a turn and applies it on the next discrete step', () => {
    const state: SnakeState = snakeDuelEngine.createState(now());
    const turned = snakeDuelEngine.apply(state, 0, { type: 'turn', dir: 'up' }, now());
    expect(turned.ok).toBe(true);
    expect(turned.state.snakes[0].pending).toBe('up');

    const stepped = snakeDuelEngine.tick?.(turned.state, SNAKE_STEP_MS, now()) as SnakeState;
    expect(stepped.snakes[0].dir).toBe('up');
    expect(stepped.snakes[0].pending).toBeNull();
  });

  it('never lets a snake reverse into itself', () => {
    const state = snakeDuelEngine.createState(now());
    expect(snakeDuelEngine.apply(state, 0, { type: 'turn', dir: 'left' }, now()).error).toBe('CANNOT_REVERSE');
  });

  it('kills a snake that drives into the wall', () => {
    let state = snakeDuelEngine.createState(now());
    state = snakeDuelEngine.apply(state, 0, { type: 'turn', dir: 'up' }, now()).state;
    for (let i = 0; i < 40 && !state.finished; i += 1) {
      state = snakeDuelEngine.tick?.(state, SNAKE_STEP_MS, now()) as SnakeState;
    }
    expect(state.finished).toBe(true);
    expect(state.snakes[0].alive).toBe(false);
    expect(snakeDuelEngine.outcome(state).winnerSeat).toBe(1);
  });

  it('is deterministic for identical seeds', () => {
    const a = snakeDuelEngine.createState(now());
    const b = snakeDuelEngine.createState(now());
    expect(a.food).toEqual(b.food);
  });
});
