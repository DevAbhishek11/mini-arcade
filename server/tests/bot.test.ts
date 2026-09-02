import { describe, expect, it } from 'vitest';
import {
  BOT_DIFFICULTIES,
  ENGINES,
  GAME_IDS,
  PONG_ROUND_LIMIT_MS,
  botIdentity,
  decide,
  ticTacToeEngine,
  type BotDifficulty,
  type GameId,
  type PongState,
  type Seat,
  type TicTacToeState,
} from '@mini-arcade/shared';

const DIFFICULTIES = BOT_DIFFICULTIES.map((entry) => entry.id);
const now = () => Date.now();

/** Plays a whole match bot-vs-bot and returns how it ended. */
function playOut(gameId: GameId, difficulty: BotDifficulty, maxPlies = 600) {
  const engine = ENGINES[gameId];
  let state = engine.createState(now());
  let plies = 0;

  while (plies < maxPlies) {
    const outcome = engine.outcome(state);
    if (outcome.finished) return { state, outcome, plies };

    if (engine.tickMs > 0) {
      for (const seat of [0, 1] as Seat[]) {
        const decision = decide(gameId, state, seat, difficulty);
        if (decision) {
          const applied = engine.apply(state, seat, decision.action, now());
          if (applied.ok) state = applied.state;
        }
      }
      state = engine.tick?.(state, engine.tickMs, now()) ?? state;
    } else {
      const seat = engine.activeSeat(state);
      if (seat === null) break;
      const decision = decide(gameId, state, seat, difficulty);
      expect(decision, `${gameId} bot had no move`).toBeTruthy();
      const applied = engine.apply(state, seat, decision!.action, now());
      expect(applied.ok, `${gameId} bot played an illegal move: ${JSON.stringify(decision!.action)}`).toBe(
        true,
      );
      state = applied.state;
    }
    plies += 1;
  }

  return { state, outcome: engine.outcome(state), plies };
}

describe('shared bot', () => {
  it('exposes three difficulties with an identity for each', () => {
    expect(DIFFICULTIES).toEqual(['chill', 'sharp', 'brutal']);
    for (const difficulty of DIFFICULTIES) {
      const identity = botIdentity(difficulty);
      expect(identity.playerId).toContain('bot');
      expect(identity.nickname.length).toBeGreaterThan(2);
    }
  });

  it('only ever proposes legal moves, in every game and difficulty', () => {
    for (const gameId of GAME_IDS) {
      for (const difficulty of DIFFICULTIES) {
        const engine = ENGINES[gameId];
        let state = engine.createState(now());

        for (let ply = 0; ply < 12; ply += 1) {
          if (engine.outcome(state).finished) break;
          const seat = engine.activeSeat(state) ?? 0;
          const decision = decide(gameId, state, seat, difficulty);
          if (!decision) break;

          expect(decision.delayMs).toBeGreaterThanOrEqual(0);
          const applied = engine.apply(state, seat, decision.action, now());
          expect(applied.ok, `${gameId}/${difficulty} illegal: ${JSON.stringify(decision.action)}`).toBe(true);
          state = applied.state;
        }
      }
    }
  });

  it('finishes a full bot-vs-bot match in every game', () => {
    for (const gameId of GAME_IDS) {
      // Realtime games simulate many more frames per "ply" than a board move.
      const realtime = gameId === 'snake-duel' || gameId === 'pong';
      const { outcome, plies } = playOut(gameId, realtime ? 'chill' : 'sharp', realtime ? 20_000 : 600);
      expect(outcome.finished, `${gameId} never finished (${plies} plies)`).toBe(true);
    }
  });

  it('ends a pong stalemate on the round clock instead of rallying forever', () => {
    const engine = ENGINES.pong;
    let state = engine.createState(now()) as PongState;
    let elapsed = 0;

    // Two flawless paddles never miss, so only the clock can end this.
    while (!engine.outcome(state).finished && elapsed < PONG_ROUND_LIMIT_MS + 10_000) {
      for (const seat of [0, 1] as Seat[]) {
        const decision = decide('pong', state, seat, 'brutal');
        if (decision) state = engine.apply(state, seat, decision.action, now()).state as PongState;
      }
      state = engine.tick?.(state, engine.tickMs, now()) as PongState;
      elapsed += engine.tickMs;
    }

    expect(engine.outcome(state).finished).toBe(true);
    expect(elapsed).toBeLessThanOrEqual(PONG_ROUND_LIMIT_MS + 10_000);
  });

  it('never lets a brutal bot lose at tic tac toe against a random opponent', () => {
    for (let round = 0; round < 25; round += 1) {
      let state: TicTacToeState = ticTacToeEngine.createState(now());
      const botSeat: Seat = round % 2 === 0 ? 0 : 1;

      while (!ticTacToeEngine.outcome(state).finished) {
        const seat = ticTacToeEngine.activeSeat(state);
        if (seat === null) break;

        if (seat === botSeat) {
          const decision = decide('tic-tac-toe', state, seat, 'brutal');
          state = ticTacToeEngine.apply(state, seat, decision!.action as never, now()).state;
        } else {
          const free = state.board.flatMap((cell, index) => (cell === null ? [index] : []));
          const pick = free[Math.floor(Math.random() * free.length)] as number;
          state = ticTacToeEngine.apply(state, seat, { type: 'place', index: pick }, now()).state;
        }
      }

      const outcome = ticTacToeEngine.outcome(state);
      expect(outcome.winnerSeat === botSeat || outcome.winnerSeat === null).toBe(true);
    }
  });

  it('blocks an immediate connect-four threat', () => {
    const engine = ENGINES['connect-four'];
    let state = engine.createState(now());
    // Seat 0 builds three in a row along the bottom; seat 1 must block column 3.
    for (const [seat, column] of [
      [0, 0],
      [1, 6],
      [0, 1],
      [1, 5],
      [0, 2],
    ] as const) {
      state = engine.apply(state, seat, { type: 'drop', column }, now()).state;
    }

    expect((decide('connect-four', state, 1, 'brutal')?.action as { column: number }).column).toBe(3);

    // `sharp` blunders ~8% of the time by design, so assert on the trend.
    const blocks = Array.from({ length: 40 }, () => decide('connect-four', state, 1, 'sharp')).filter(
      (decision) => (decision?.action as { column: number }).column === 3,
    ).length;
    expect(blocks).toBeGreaterThan(30);
  });

  it('takes an immediate tic-tac-toe win when one is available', () => {
    let state: TicTacToeState = ticTacToeEngine.createState(now());
    for (const [seat, index] of [
      [0, 0],
      [1, 3],
      [0, 1],
      [1, 4],
    ] as const) {
      state = ticTacToeEngine.apply(state, seat, { type: 'place', index }, now()).state;
    }
    // Seat 0 to move with 0,1 owned — 2 completes the row.
    expect((decide('tic-tac-toe', state, 0, 'brutal')?.action as { index: number }).index).toBe(2);

    // `sharp` blunders on purpose ~8% of the time, so assert on the trend.
    const takes = Array.from({ length: 40 }, () => decide('tic-tac-toe', state, 0, 'sharp')).filter(
      (decision) => (decision?.action as { index: number }).index === 2,
    ).length;
    expect(takes).toBeGreaterThan(30);
  });

  it('returns null once a match is already decided', () => {
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
    expect(ticTacToeEngine.outcome(state).finished).toBe(true);
    expect(decide('tic-tac-toe', state, 1, 'sharp')).toBeNull();
  });
});
