import { describe, expect, it } from 'vitest';
import {
  connectFourEngine,
  pongEngine,
  ticTacToeEngine,
  WINNING_SCORE,
  type ConnectFourState,
  type PongState,
  type TicTacToeState,
} from '@mini-arcade/shared';

const now = () => 1_700_000_000_000;

describe('tic tac toe engine', () => {
  it('rejects moves out of turn, out of bounds and on taken cells', () => {
    let state = ticTacToeEngine.createState(now());
    expect(ticTacToeEngine.apply(state, 1, { type: 'place', index: 0 }, now()).error).toBe('NOT_YOUR_TURN');
    expect(ticTacToeEngine.apply(state, 0, { type: 'place', index: 42 }, now()).error).toBe('OUT_OF_BOUNDS');

    state = ticTacToeEngine.apply(state, 0, { type: 'place', index: 0 }, now()).state;
    expect(ticTacToeEngine.apply(state, 1, { type: 'place', index: 0 }, now()).error).toBe('CELL_TAKEN');
  });

  it('never mutates the input state', () => {
    const state = ticTacToeEngine.createState(now());
    const before = JSON.stringify(state);
    ticTacToeEngine.apply(state, 0, { type: 'place', index: 4 }, now());
    expect(JSON.stringify(state)).toBe(before);
  });

  it('detects a win and reports the winning line', () => {
    let state: TicTacToeState = ticTacToeEngine.createState(now());
    for (const [seat, index] of [
      [0, 0],
      [1, 3],
      [0, 1],
      [1, 4],
      [0, 2],
    ] as const) {
      state = ticTacToeEngine.apply(state, seat, { type: 'place', index }, now()).state;
    }
    const outcome = ticTacToeEngine.outcome(state);
    expect(outcome).toEqual({ finished: true, winnerSeat: 0, reason: 'victory' });
    expect(state.winningLine).toEqual([0, 1, 2]);
    expect(ticTacToeEngine.activeSeat(state)).toBeNull();
  });

  it('detects a draw on a full board', () => {
    let state: TicTacToeState = ticTacToeEngine.createState(now());
    const moves: [0 | 1, number][] = [
      [0, 0],
      [1, 1],
      [0, 2],
      [1, 4],
      [0, 3],
      [1, 5],
      [0, 7],
      [1, 6],
      [0, 8],
    ];
    for (const [seat, index] of moves) {
      state = ticTacToeEngine.apply(state, seat, { type: 'place', index }, now()).state;
    }
    expect(ticTacToeEngine.outcome(state)).toEqual({ finished: true, winnerSeat: null, reason: 'draw' });
  });
});

describe('connect four engine', () => {
  it('stacks discs with gravity', () => {
    let state: ConnectFourState = connectFourEngine.createState(now());
    state = connectFourEngine.apply(state, 0, { type: 'drop', column: 3 }, now()).state;
    expect(state.board[5 * 7 + 3]).toBe(0);
    state = connectFourEngine.apply(state, 1, { type: 'drop', column: 3 }, now()).state;
    expect(state.board[4 * 7 + 3]).toBe(1);
  });

  it('rejects a full column', () => {
    let state: ConnectFourState = connectFourEngine.createState(now());
    for (let i = 0; i < 6; i += 1) {
      state = connectFourEngine.apply(state, (i % 2) as 0 | 1, { type: 'drop', column: 0 }, now()).state;
    }
    expect(connectFourEngine.apply(state, 0, { type: 'drop', column: 0 }, now()).error).toBe('COLUMN_FULL');
  });

  it('detects a horizontal win', () => {
    let state: ConnectFourState = connectFourEngine.createState(now());
    for (const column of [0, 0, 1, 1, 2, 2, 3]) {
      state = connectFourEngine.apply(state, state.turn, { type: 'drop', column }, now()).state;
    }
    expect(connectFourEngine.outcome(state).winnerSeat).toBe(0);
    expect(state.winningLine).toHaveLength(4);
  });
});

describe('pong engine', () => {
  it('serves after the countdown and keeps the ball inside the field', () => {
    let state: PongState = pongEngine.createState(now());
    for (let i = 0; i < 200; i += 1) state = pongEngine.tick!(state, 1000 / 30, now());
    expect(state.ball.y).toBeGreaterThanOrEqual(0);
    expect(state.ball.y).toBeLessThanOrEqual(520);
  });

  it('clamps paddles and applies input direction', () => {
    let state: PongState = pongEngine.createState(now());
    state = pongEngine.apply(state, 0, { type: 'move', dir: -1 }, now()).state;
    for (let i = 0; i < 120; i += 1) state = pongEngine.tick!(state, 1000 / 30, now());
    expect(state.paddles[0].y).toBe(48);
  });

  it('awards a point when the ball leaves the field', () => {
    let state: PongState = pongEngine.createState(now());
    state = { ...state, serveCountdownMs: 0, ball: { x: 890, y: 260, vx: 900, vy: 0 } };
    state = pongEngine.tick!(state, 1000 / 30, now());
    state = pongEngine.tick!(state, 1000 / 30, now());
    expect(state.score[0]).toBe(1);
    expect(state.serveCountdownMs).toBeGreaterThan(0);
  });

  it('ends the match at the winning score', () => {
    let state: PongState = pongEngine.createState(now());
    state = {
      ...state,
      score: [WINNING_SCORE - 1, 0],
      serveCountdownMs: 0,
      ball: { x: 890, y: 260, vx: 900, vy: 0 },
    };
    state = pongEngine.tick!(state, 1000 / 30, now());
    state = pongEngine.tick!(state, 1000 / 30, now());
    expect(pongEngine.outcome(state)).toEqual({ finished: true, winnerSeat: 0, reason: 'victory' });
  });
});
