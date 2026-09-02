import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GAME_LIST,
  sudokuCandidates,
  sudokuOpenCells,
  ticTacToeEngine,
  type SnakeState,
  type SudokuState,
  type TicTacToeState,
} from '@mini-arcade/shared';
import { LocalMatch, type LocalResult, type LocalSnapshot } from '@/lib/local-match';

/** Drains the bot's think-timeouts until the match reports a result. */
async function runTurnBased(
  match: LocalMatch,
  driveHuman: (snapshot: LocalSnapshot) => unknown | null,
  latest: () => LocalSnapshot | null,
) {
  for (let guard = 0; guard < 200; guard += 1) {
    if (match.isFinished) return;
    const snapshot = latest();
    if (snapshot && snapshot.controlledSeat === snapshot.seat) {
      const action = driveHuman(snapshot);
      if (action) match.play(action);
    }
    await vi.advanceTimersByTimeAsync(1500);
  }
}

describe('LocalMatch — turn based', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('emits an initial snapshot as soon as it starts', () => {
    const states: LocalSnapshot[] = [];
    const match = new LocalMatch({
      gameId: 'tic-tac-toe',
      opponent: 'bot',
      difficulty: 'sharp',
      onState: (snapshot) => states.push(snapshot),
      onOver: () => undefined,
    });
    match.start();

    expect(states.length).toBeGreaterThan(0);
    expect(states[0]?.seat).toBe(0);
    expect((states[0]?.state as TicTacToeState).board).toHaveLength(9);
    match.destroy();
  });

  it('rejects an illegal move and keeps the board untouched', () => {
    let latest: LocalSnapshot | null = null;
    const match = new LocalMatch({
      gameId: 'tic-tac-toe',
      opponent: 'bot',
      difficulty: 'chill',
      onState: (snapshot) => (latest = snapshot),
      onOver: () => undefined,
    });
    match.start();

    expect(match.play({ type: 'place', index: 99 })).toBe(false);
    expect(match.play({ type: 'nonsense' })).toBe(false);
    expect(((latest as unknown as LocalSnapshot).state as TicTacToeState).moves).toBe(0);
    match.destroy();
  });

  it('plays a complete match against the bot and reports a result', async () => {
    let latest: LocalSnapshot | null = null;
    let result: LocalResult | null = null;

    const match = new LocalMatch({
      gameId: 'tic-tac-toe',
      opponent: 'bot',
      difficulty: 'chill',
      onState: (snapshot) => (latest = snapshot),
      onOver: (outcome) => (result = outcome),
    });
    match.start();

    await runTurnBased(
      match,
      (snapshot) => {
        const board = (snapshot.state as TicTacToeState).board;
        const free = board.findIndex((cell) => cell === null);
        return free < 0 ? null : { type: 'place', index: free };
      },
      () => latest,
    );

    expect(result).not.toBeNull();
    expect((result as unknown as LocalResult).outcome.finished).toBe(true);
    expect((result as unknown as LocalResult).moves).toBeGreaterThan(2);
  });

  it('never lets a brutal bot lose — the human just draws at best', async () => {
    let latest: LocalSnapshot | null = null;
    let result: LocalResult | null = null;

    const match = new LocalMatch({
      gameId: 'tic-tac-toe',
      opponent: 'bot',
      difficulty: 'brutal',
      onState: (snapshot) => (latest = snapshot),
      onOver: (outcome) => (result = outcome),
    });
    match.start();

    await runTurnBased(
      match,
      (snapshot) => {
        const board = (snapshot.state as TicTacToeState).board;
        const free = board.findIndex((cell) => cell === null);
        return free < 0 ? null : { type: 'place', index: free };
      },
      () => latest,
    );

    const outcome = (result as unknown as LocalResult).outcome;
    expect(outcome.finished).toBe(true);
    expect(outcome.winnerSeat).not.toBe(0);
  });

  it('hands control to whoever is to move in pass-and-play', () => {
    let latest: LocalSnapshot | null = null;
    const match = new LocalMatch({
      gameId: 'tic-tac-toe',
      opponent: 'human',
      difficulty: 'sharp',
      onState: (snapshot) => (latest = snapshot),
      onOver: () => undefined,
    });
    match.start();

    expect((latest as unknown as LocalSnapshot).controlledSeat).toBe(0);
    expect(match.play({ type: 'place', index: 0 })).toBe(true);
    expect((latest as unknown as LocalSnapshot).controlledSeat).toBe(1);

    // No bot should ever move for the second player here.
    vi.advanceTimersByTime(5_000);
    expect(((latest as unknown as LocalSnapshot).state as TicTacToeState).moves).toBe(1);
    match.destroy();
  });

  it('stops scheduling work once destroyed', () => {
    let states = 0;
    const match = new LocalMatch({
      gameId: 'connect-four',
      opponent: 'bot',
      difficulty: 'sharp',
      onState: () => (states += 1),
      onOver: () => undefined,
    });
    match.start();
    match.play({ type: 'drop', column: 0 });

    const seen = states;
    match.destroy();
    vi.advanceTimersByTime(10_000);
    expect(states).toBe(seen);
  });

  it('reports the winning line through to the caller', async () => {
    let latest: LocalSnapshot | null = null;
    let result: LocalResult | null = null;

    const match = new LocalMatch({
      gameId: 'tic-tac-toe',
      opponent: 'human',
      difficulty: 'sharp',
      onState: (snapshot) => (latest = snapshot),
      onOver: (outcome) => (result = outcome),
    });
    match.start();

    // 0 -> 3 -> 1 -> 4 -> 2 wins the top row for seat 0.
    for (const index of [0, 3, 1, 4, 2]) match.play({ type: 'place', index });

    expect((result as unknown as LocalResult).outcome.winnerSeat).toBe(0);
    expect(((latest as unknown as LocalSnapshot).state as TicTacToeState).winningLine).toEqual([0, 1, 2]);
  });
});

describe('LocalMatch — realtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    let handle = 0;
    // happy-dom has no rAF loop; drive it from timers so the sim can advance.
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      handle += 1;
      setTimeout(() => callback(performance.now()), 16);
      return handle;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('advances the simulation on its own and accepts steering input', async () => {
    let latest: LocalSnapshot | null = null;
    const match = new LocalMatch({
      gameId: 'snake-duel',
      opponent: 'bot',
      difficulty: 'chill',
      onState: (snapshot) => (latest = snapshot),
      onOver: () => undefined,
    });
    match.start();

    const before = ((latest as unknown as LocalSnapshot).state as SnakeState).steps;
    match.input({ type: 'turn', dir: 'up' });
    await vi.advanceTimersByTimeAsync(1_000);

    const after = ((latest as unknown as LocalSnapshot).state as SnakeState).steps;
    expect(after).toBeGreaterThan(before);
    match.destroy();
  });

  it('gives the local player continuous control in realtime games', () => {
    let latest: LocalSnapshot | null = null;
    const match = new LocalMatch({
      gameId: 'pong',
      opponent: 'bot',
      difficulty: 'sharp',
      onState: (snapshot) => (latest = snapshot),
      onOver: () => undefined,
    });
    match.start();
    expect((latest as unknown as LocalSnapshot).controlledSeat).toBe(0);
    match.destroy();
  });
});

describe('shared engine parity', () => {
  it('uses the very same engine the server validates with', () => {
    let latest: LocalSnapshot | null = null;
    const match = new LocalMatch({
      gameId: 'tic-tac-toe',
      opponent: 'human',
      difficulty: 'sharp',
      onState: (snapshot) => (latest = snapshot),
      onOver: () => undefined,
    });
    match.start();
    match.play({ type: 'place', index: 4 });

    const expected = ticTacToeEngine.apply(
      ticTacToeEngine.createState(Date.now()),
      0,
      { type: 'place', index: 4 },
      Date.now(),
    ).state;

    expect(((latest as unknown as LocalSnapshot).state as TicTacToeState).board).toEqual(expected.board);
    match.destroy();
  });
});

describe('LocalMatch — every cabinet plays offline', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // Realtime games are driven by an animation loop and covered separately.
  const turnBased = GAME_LIST.filter((game) => game.tickRate === 0).map((game) => game.id);

  it.each(turnBased)(
    'bot vs bot reaches a result in %s',
    async (gameId) => {
      let result: LocalResult | null = null;
      let latest: LocalSnapshot | null = null;

      const match = new LocalMatch({
        gameId,
        opponent: 'bot',
        difficulty: 'chill',
        onState: (snapshot) => {
          latest = snapshot;
        },
        onOver: (over) => {
          result = over;
        },
      });
      match.start();

      // Play the human seat with the engine's own legal moves, whatever they are.
      await runTurnBased(
        match,
        (snapshot) => {
          const state = snapshot.state as {
            legal?: unknown[];
            board?: (number | null)[];
            edges?: boolean[];
            choices?: number[];
          };

          // Games with richer actions describe them fully in `legal`.
          if (gameId === 'chess') {
            const move = state.legal?.[0] as { from: number; to: number; promotion?: string } | undefined;
            return move ? { type: 'move', from: move.from, to: move.to, promotion: move.promotion } : null;
          }
          if (gameId === 'nine-mens-morris') return state.legal?.[0] ?? null;
          if (gameId === 'bingo') {
            const ball = state.choices?.[0];
            return ball === undefined ? null : { type: 'call', number: ball };
          }
          if (gameId === 'sudoku') {
            const sudoku = snapshot.state as SudokuState;
            const cell = sudokuOpenCells(sudoku)[0];
            if (cell === undefined) return null;
            const candidates = sudokuCandidates(sudoku.board, cell);
            return { type: 'fill', cell, value: candidates[0] ?? 1 };
          }

          // Newer engines publish their legal moves; older ones are simple
          // enough to read straight off the board.
          const legal =
            state.legal ??
            (gameId === 'dots-and-boxes'
              ? (state.edges ?? []).flatMap((drawn, index) => (drawn ? [] : [index]))
              : gameId === 'connect-four'
                ? (state.board ?? []).flatMap((_, index) =>
                    index < 7 && state.board?.[index] === null ? [index] : [],
                  )
                : (state.board ?? []).flatMap((cell, index) => (cell === null ? [index] : [])));

          if (legal.length === 0) return null;
          const choice = legal[0];

          switch (gameId) {
            case 'checkers': {
              const move = choice as { from: number; to: number };
              return { type: 'move', from: move.from, to: move.to };
            }
            case 'mancala':
              return { type: 'sow', pit: choice as number };
            case 'connect-four':
              return { type: 'drop', column: choice as number };
            case 'dots-and-boxes':
              return { type: 'draw', edge: choice as number };
            default:
              return { type: 'place', index: choice as number };
          }
        },
        () => latest,
      );

      expect(match.isFinished, `${gameId} never finished`).toBe(true);
      expect(result).not.toBeNull();
      match.destroy();
    },
    20_000,
  );
});
