import type { ActionResult, GameEngine, GameOutcome, Seat } from './types.js';
import { UNFINISHED } from './types.js';

export const SNAKE_GRID = 21;
export const SNAKE_STEP_MS = 120;
export const SNAKE_START_LENGTH = 4;
export const SNAKE_ROUND_LIMIT_MS = 180_000;

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface SnakeBody {
  cells: number[];
  dir: Direction;
  /** Buffered input, applied on the next discrete step (no double turns per tick). */
  pending: Direction | null;
  alive: boolean;
  grow: number;
  score: number;
}

export interface SnakeState {
  snakes: [SnakeBody, SnakeBody];
  food: number[];
  accumulatorMs: number;
  elapsedMs: number;
  rng: number;
  winnerSeat: Seat | null;
  finished: boolean;
  steps: number;
}

export interface SnakeAction {
  type: 'turn';
  dir: Direction;
}

const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DELTA: Record<Direction, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

const toIndex = (x: number, y: number) => y * SNAKE_GRID + x;
export const toXY = (index: number): [number, number] => [index % SNAKE_GRID, Math.floor(index / SNAKE_GRID)];

/** Deterministic LCG so server and client always agree on food placement. */
function nextRandom(seed: number): [number, number] {
  const next = (seed * 1664525 + 1013904223) >>> 0;
  return [next, next / 0xffffffff];
}

function spawnFood(state: SnakeState, count: number): { food: number[]; rng: number } {
  const occupied = new Set<number>([...state.snakes[0].cells, ...state.snakes[1].cells, ...state.food]);
  const food = [...state.food];
  let rng = state.rng;
  let guard = 0;

  while (food.length < count && guard < 500) {
    guard += 1;
    const [seed, value] = nextRandom(rng);
    rng = seed;
    const cell = Math.floor(value * SNAKE_GRID * SNAKE_GRID) % (SNAKE_GRID * SNAKE_GRID);
    if (occupied.has(cell)) continue;
    occupied.add(cell);
    food.push(cell);
  }
  return { food, rng };
}

function createSnake(x: number, y: number, dir: Direction): SnakeBody {
  const [dx, dy] = DELTA[dir];
  const cells: number[] = [];
  for (let i = 0; i < SNAKE_START_LENGTH; i += 1) cells.push(toIndex(x - dx * i, y - dy * i));
  return { cells, dir, pending: null, alive: true, grow: 0, score: 0 };
}

/** Two snakes, one arena. Crash into a wall, yourself or your rival and it is over. */
export const snakeDuelEngine: GameEngine<SnakeState, SnakeAction> = {
  id: 'snake-duel',
  tickMs: SNAKE_STEP_MS,

  createState(now) {
    const mid = Math.floor(SNAKE_GRID / 2);
    const base: SnakeState = {
      snakes: [createSnake(4, mid, 'right'), createSnake(SNAKE_GRID - 5, mid, 'left')],
      food: [],
      accumulatorMs: 0,
      elapsedMs: 0,
      rng: (now % 100000) + 7,
      winnerSeat: null,
      finished: false,
      steps: 0,
    };
    const { food, rng } = spawnFood(base, 3);
    return { ...base, food, rng };
  },

  apply(state, seat, action): ActionResult<SnakeState> {
    if (state.finished) return { ok: false, state, error: 'MATCH_OVER' };
    if (action.type !== 'turn') return { ok: false, state, error: 'UNKNOWN_ACTION' };
    if (!(action.dir in DELTA)) return { ok: false, state, error: 'BAD_INPUT' };

    const snake = state.snakes[seat];
    if (!snake.alive) return { ok: false, state, error: 'DEAD' };
    if (OPPOSITE[snake.dir] === action.dir) return { ok: false, state, error: 'CANNOT_REVERSE' };
    if (snake.pending === action.dir || snake.dir === action.dir) return { ok: true, state };

    const snakes = [...state.snakes] as SnakeState['snakes'];
    snakes[seat] = { ...snake, pending: action.dir };
    return { ok: true, state: { ...state, snakes } };
  },

  tick(state, dtMs) {
    if (state.finished) return state;

    let next: SnakeState = {
      ...state,
      accumulatorMs: state.accumulatorMs + dtMs,
      elapsedMs: state.elapsedMs + dtMs,
    };

    // Fixed discrete steps, independent of the scheduler frequency.
    while (next.accumulatorMs >= SNAKE_STEP_MS) {
      next = step({ ...next, accumulatorMs: next.accumulatorMs - SNAKE_STEP_MS });
      if (next.finished) break;
    }

    if (!next.finished && next.elapsedMs >= SNAKE_ROUND_LIMIT_MS) {
      const [a, b] = next.snakes;
      const winnerSeat = a.score === b.score ? null : ((a.score > b.score ? 0 : 1) as Seat);
      next = { ...next, finished: true, winnerSeat };
    }

    return next;
  },

  outcome(state): GameOutcome {
    if (!state.finished) return UNFINISHED;
    return {
      finished: true,
      winnerSeat: state.winnerSeat,
      reason: state.winnerSeat === null ? 'draw' : 'victory',
    };
  },

  activeSeat() {
    return null;
  },

  toPublic(state) {
    return state;
  },
};

function step(state: SnakeState): SnakeState {
  const snakes = state.snakes.map((snake) => ({
    ...snake,
    cells: snake.cells.slice(),
  })) as SnakeState['snakes'];
  let food = [...state.food];
  let rng = state.rng;

  const heads: (number | null)[] = [null, null];

  for (const seat of [0, 1] as const) {
    const snake = snakes[seat];
    if (!snake.alive) continue;

    if (snake.pending) {
      snake.dir = snake.pending;
      snake.pending = null;
    }

    const head = snake.cells[0] as number;
    const [x, y] = toXY(head);
    const [dx, dy] = DELTA[snake.dir];
    const nx = x + dx;
    const ny = y + dy;

    if (nx < 0 || ny < 0 || nx >= SNAKE_GRID || ny >= SNAKE_GRID) {
      snake.alive = false;
      continue;
    }
    heads[seat] = toIndex(nx, ny);
  }

  // Head-on collision: both snakes die.
  if (heads[0] !== null && heads[0] === heads[1]) {
    snakes[0].alive = false;
    snakes[1].alive = false;
  }

  for (const seat of [0, 1] as const) {
    const snake = snakes[seat];
    const head = heads[seat];
    if (!snake.alive || head === null || head === undefined) continue;

    const other = snakes[seat === 0 ? 1 : 0];
    const ownTail = snake.cells[snake.cells.length - 1];
    const hitsSelf = snake.cells.some(
      (cell, i) => cell === head && !(i === snake.cells.length - 1 && cell === ownTail),
    );
    const hitsOther = other.cells.includes(head);
    if (hitsSelf || hitsOther) {
      snake.alive = false;
      continue;
    }

    snake.cells.unshift(head);
    const foodIndex = food.indexOf(head);
    if (foodIndex >= 0) {
      food.splice(foodIndex, 1);
      snake.grow += 2;
      snake.score += 1;
    }
    if (snake.grow > 0) snake.grow -= 1;
    else snake.cells.pop();
  }

  const spawned = spawnFood({ ...state, snakes, food, rng }, 3);
  food = spawned.food;
  rng = spawned.rng;

  const [a, b] = snakes;
  let finished = false;
  let winnerSeat: Seat | null = null;
  if (!a.alive || !b.alive) {
    finished = true;
    if (a.alive) winnerSeat = 0;
    else if (b.alive) winnerSeat = 1;
    else winnerSeat = a.score === b.score ? null : ((a.score > b.score ? 0 : 1) as Seat);
  }

  return { ...state, snakes, food, rng, steps: state.steps + 1, finished, winnerSeat };
}
