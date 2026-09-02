import type { ActionResult, GameEngine, GameOutcome, Seat } from './types.js';
import { UNFINISHED } from './types.js';

export const FIELD_WIDTH = 900;
export const FIELD_HEIGHT = 520;
export const PADDLE_HEIGHT = 96;
export const PADDLE_WIDTH = 14;
export const PADDLE_INSET = 32;
export const PADDLE_SPEED = 520; // px per second
export const BALL_RADIUS = 9;
export const BALL_START_SPEED = 420;
export const BALL_MAX_SPEED = 780;
export const BALL_SPEEDUP = 1.06;
export const WINNING_SCORE = 5;
export const SERVE_DELAY_MS = 900;

export type PaddleDirection = -1 | 0 | 1;

export interface PongState {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: [{ y: number; dir: PaddleDirection }, { y: number; dir: PaddleDirection }];
  score: [number, number];
  /** > 0 while the ball is parked before a serve. */
  serveCountdownMs: number;
  serveTo: Seat;
  rallyHits: number;
  winnerSeat: Seat | null;
  elapsedMs: number;
}

export type PongAction = { type: 'move'; dir: PaddleDirection } | { type: 'stop' };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Deterministic pseudo random serve angle derived from the rally counter. */
function serveVelocity(state: PongState): { vx: number; vy: number } {
  const towards = state.serveTo === 0 ? -1 : 1;
  const spread = ((state.score[0] * 37 + state.score[1] * 61 + state.rallyHits * 13) % 11) / 10 - 0.5;
  const angle = spread * 0.9; // roughly +/- 25 degrees
  return {
    vx: towards * BALL_START_SPEED * Math.cos(angle),
    vy: BALL_START_SPEED * Math.sin(angle),
  };
}

function resetBall(state: PongState, serveTo: Seat): PongState {
  const next: PongState = {
    ...state,
    serveTo,
    serveCountdownMs: SERVE_DELAY_MS,
    rallyHits: 0,
    ball: { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2, vx: 0, vy: 0 },
  };
  return next;
}

export const pongEngine: GameEngine<PongState, PongAction> = {
  id: 'pong',
  tickMs: 1000 / 30,

  createState() {
    const base: PongState = {
      ball: { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2, vx: 0, vy: 0 },
      paddles: [
        { y: FIELD_HEIGHT / 2, dir: 0 },
        { y: FIELD_HEIGHT / 2, dir: 0 },
      ],
      score: [0, 0],
      serveCountdownMs: SERVE_DELAY_MS,
      serveTo: 1,
      rallyHits: 0,
      winnerSeat: null,
      elapsedMs: 0,
    };
    return base;
  },

  apply(state, seat, action): ActionResult<PongState> {
    if (state.winnerSeat !== null) return { ok: false, state, error: 'MATCH_OVER' };
    const dir: PaddleDirection = action.type === 'stop' ? 0 : action.dir;
    if (dir !== -1 && dir !== 0 && dir !== 1) return { ok: false, state, error: 'BAD_INPUT' };

    const paddles = [...state.paddles] as PongState['paddles'];
    const current = paddles[seat];
    if (current.dir === dir) return { ok: true, state };
    paddles[seat] = { ...current, dir };
    return { ok: true, state: { ...state, paddles } };
  },

  tick(state, dtMs) {
    if (state.winnerSeat !== null) return state;
    const dt = dtMs / 1000;
    const halfPaddle = PADDLE_HEIGHT / 2;

    const paddles = state.paddles.map((paddle) => ({
      ...paddle,
      y: clamp(paddle.y + paddle.dir * PADDLE_SPEED * dt, halfPaddle, FIELD_HEIGHT - halfPaddle),
    })) as PongState['paddles'];

    let next: PongState = { ...state, paddles, elapsedMs: state.elapsedMs + dtMs };

    if (next.serveCountdownMs > 0) {
      const remaining = next.serveCountdownMs - dtMs;
      if (remaining > 0) return { ...next, serveCountdownMs: remaining };
      const { vx, vy } = serveVelocity(next);
      next = {
        ...next,
        serveCountdownMs: 0,
        ball: { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2, vx, vy },
      };
    }

    let { x, y, vx, vy } = next.ball;
    x += vx * dt;
    y += vy * dt;

    // Walls
    if (y - BALL_RADIUS < 0) {
      y = BALL_RADIUS;
      vy = Math.abs(vy);
    } else if (y + BALL_RADIUS > FIELD_HEIGHT) {
      y = FIELD_HEIGHT - BALL_RADIUS;
      vy = -Math.abs(vy);
    }

    let rallyHits = next.rallyHits;
    const leftFace = PADDLE_INSET + PADDLE_WIDTH;
    const rightFace = FIELD_WIDTH - PADDLE_INSET - PADDLE_WIDTH;

    const bounce = (seat: Seat) => {
      const paddle = next.paddles[seat];
      const offset = clamp((y - paddle.y) / halfPaddle, -1, 1);
      const speed = Math.min(Math.hypot(vx, vy) * BALL_SPEEDUP, BALL_MAX_SPEED);
      const angle = offset * (Math.PI / 3.6); // max 50 degrees
      const towards = seat === 0 ? 1 : -1;
      vx = towards * speed * Math.cos(angle);
      vy = speed * Math.sin(angle);
      rallyHits += 1;
    };

    if (vx < 0 && x - BALL_RADIUS <= leftFace && x - BALL_RADIUS >= PADDLE_INSET - 24) {
      if (Math.abs(y - next.paddles[0].y) <= halfPaddle + BALL_RADIUS) {
        x = leftFace + BALL_RADIUS;
        bounce(0);
      }
    } else if (vx > 0 && x + BALL_RADIUS >= rightFace && x + BALL_RADIUS <= FIELD_WIDTH - PADDLE_INSET + 24) {
      if (Math.abs(y - next.paddles[1].y) <= halfPaddle + BALL_RADIUS) {
        x = rightFace - BALL_RADIUS;
        bounce(1);
      }
    }

    next = { ...next, ball: { x, y, vx, vy }, rallyHits };

    // Goals
    if (x < -BALL_RADIUS * 4 || x > FIELD_WIDTH + BALL_RADIUS * 4) {
      const scorer: Seat = x < 0 ? 1 : 0;
      const score: [number, number] = [...next.score];
      score[scorer] += 1;
      const winnerSeat = score[scorer] >= WINNING_SCORE ? scorer : null;
      next = resetBall({ ...next, score, winnerSeat }, scorer === 0 ? 1 : 0);
      if (winnerSeat !== null) {
        next = { ...next, serveCountdownMs: 0, ball: { ...next.ball, vx: 0, vy: 0 } };
      }
    }

    return next;
  },

  outcome(state): GameOutcome {
    if (state.winnerSeat !== null) {
      return { finished: true, winnerSeat: state.winnerSeat, reason: 'victory' };
    }
    return UNFINISHED;
  },

  activeSeat() {
    return null;
  },

  toPublic(state) {
    return state;
  },
};
