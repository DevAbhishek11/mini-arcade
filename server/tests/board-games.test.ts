import { describe, expect, it } from 'vitest';
import {
  CHECKERS_SIZE,
  HEX_SIZE,
  MANCALA_SEEDS,
  MANCALA_STORE,
  checkersEngine,
  checkersLegalMoves,
  hexEngine,
  hexLegalMoves,
  hexNeighbours,
  mancalaEngine,
  mancalaLegalMoves,
  ultimateTicTacToeEngine,
  utttLegalMoves,
  type CheckersState,
  type HexState,
  type MancalaState,
  type Seat,
} from '@mini-arcade/shared';

const now = () => Date.now();

/** Applies a sequence of actions, asserting each one is accepted. */
function play<S>(
  engine: {
    apply: (state: S, seat: Seat, action: never, now: number) => { ok: boolean; state: S; error?: string };
  },
  state: S,
  moves: [Seat, unknown][],
): S {
  let current = state;
  for (const [seat, action] of moves) {
    const result = engine.apply(current, seat, action as never, now());
    expect(result.ok, `${JSON.stringify(action)} → ${result.error ?? ''}`).toBe(true);
    current = result.state;
  }
  return current;
}

describe('ultimate tic tac toe', () => {
  it('starts with a free choice of all 81 cells', () => {
    const state = ultimateTicTacToeEngine.createState(now());
    expect(state.cells).toHaveLength(81);
    expect(state.activeBoard).toBeNull();
    expect(utttLegalMoves(state)).toHaveLength(81);
  });

  it('sends the opponent to the board matching the cell just played', () => {
    let state = ultimateTicTacToeEngine.createState(now());
    // Board 0, cell 4 → opponent must play in board 4.
    state = play(ultimateTicTacToeEngine, state, [[0, { type: 'place', index: 4 }]]);

    expect(state.activeBoard).toBe(4);
    expect(utttLegalMoves(state).every((index) => Math.floor(index / 9) === 4)).toBe(true);

    const wrongBoard = ultimateTicTacToeEngine.apply(state, 1, { type: 'place', index: 0 }, now());
    expect(wrongBoard.ok).toBe(false);
    expect(wrongBoard.error).toMatch(/highlighted board/);
  });

  it('marks a small board as won and frees the choice when sent to a decided board', () => {
    let state = ultimateTicTacToeEngine.createState(now());
    // Seat 0 takes board 0 cells 0,1,2 while seat 1 answers inside boards 0..2.
    state = play(ultimateTicTacToeEngine, state, [
      [0, { type: 'place', index: 0 }], // board 0 cell 0 → board 0
      [1, { type: 'place', index: 3 }], // board 0 cell 3 → board 3
      [0, { type: 'place', index: 27 }], // board 3 cell 0 → board 0
      [1, { type: 'place', index: 4 }], // board 0 cell 4 → board 4
      [0, { type: 'place', index: 36 }], // board 4 cell 0 → board 0
      [1, { type: 'place', index: 5 }], // board 0 cell 5 → board 5
      [0, { type: 'place', index: 45 }], // board 5 cell 0 → board 0, which is decided
    ]);

    // Seat 1 owns board 0 (cells 3, 4, 5) after its third move there.
    expect(state.boards[0]).toBe(1);

    // Being sent to a decided board frees the choice instead.
    expect(state.activeBoard).toBeNull();
    const anywhere = ultimateTicTacToeEngine.apply(state, 1, { type: 'place', index: 80 }, now());
    expect(anywhere.ok).toBe(true);

    // ...but the decided board itself is closed for good.
    expect(ultimateTicTacToeEngine.apply(state, 1, { type: 'place', index: 6 }, now()).ok).toBe(false);
  });

  it('never mutates the state it was given', () => {
    const state = ultimateTicTacToeEngine.createState(now());
    const snapshot = JSON.stringify(state);
    ultimateTicTacToeEngine.apply(state, 0, { type: 'place', index: 40 }, now());
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('rejects out of range and occupied cells', () => {
    const state = ultimateTicTacToeEngine.createState(now());
    expect(ultimateTicTacToeEngine.apply(state, 0, { type: 'place', index: 81 }, now()).ok).toBe(false);
    expect(ultimateTicTacToeEngine.apply(state, 0, { type: 'place', index: -1 }, now()).ok).toBe(false);
    expect(ultimateTicTacToeEngine.apply(state, 1, { type: 'place', index: 0 }, now()).ok).toBe(false);
  });
});

describe('checkers', () => {
  const pieceAt = (state: CheckersState, index: number) => state.board[index];

  it('sets up twelve pieces a side on the dark squares only', () => {
    const state = checkersEngine.createState(now());
    const seat0 = state.board.filter((piece) => piece?.seat === 0);
    const seat1 = state.board.filter((piece) => piece?.seat === 1);

    expect(seat0).toHaveLength(12);
    expect(seat1).toHaveLength(12);
    state.board.forEach((piece, index) => {
      const row = Math.floor(index / CHECKERS_SIZE);
      const col = index % CHECKERS_SIZE;
      if (piece) expect((row + col) % 2).toBe(1);
    });
  });

  it('only offers forward diagonal steps at the start', () => {
    const state = checkersEngine.createState(now());
    const moves = checkersLegalMoves(state);
    expect(moves).toHaveLength(7);
    expect(moves.every((move) => move.captured.length === 0)).toBe(true);
    expect(moves.every((move) => move.to < move.from)).toBe(true); // seat 0 moves up
  });

  it('forces a capture when one is available', () => {
    const state = checkersEngine.createState(now());
    const board = state.board.map(() => null) as CheckersState['board'];
    board[45] = { seat: 0, king: false }; // row 5
    board[36] = { seat: 1, king: false }; // row 4, diagonally ahead
    board[20] = { seat: 1, king: false }; // an unrelated enemy piece
    const forced: CheckersState = { ...state, board };

    const moves = checkersLegalMoves(forced);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ from: 45, to: 27, captured: [36] });

    // A quiet move is refused while the jump is on the table.
    const quiet = checkersEngine.apply(forced, 0, { type: 'move', from: 45, to: 38 }, now());
    expect(quiet.ok).toBe(false);
    expect(quiet.error).toMatch(/must take the capture/);
  });

  it('keeps the turn for a chained multi-jump', () => {
    const base = checkersEngine.createState(now());
    const board = base.board.map(() => null) as CheckersState['board'];
    board[45] = { seat: 0, king: false };
    board[36] = { seat: 1, king: false };
    board[20] = { seat: 1, king: false };
    const state: CheckersState = { ...base, board };

    const first = checkersEngine.apply(state, 0, { type: 'move', from: 45, to: 27 }, now());
    expect(first.ok).toBe(true);
    // Another jump is available from 27, so seat 0 must continue.
    expect(first.state.turn).toBe(0);
    expect(first.state.chainFrom).toBe(27);
    expect(checkersLegalMoves(first.state).every((move) => move.from === 27)).toBe(true);

    const second = checkersEngine.apply(first.state, 0, { type: 'move', from: 27, to: 13 }, now());
    expect(second.ok).toBe(true);
    expect(second.state.turn).toBe(1);
    expect(second.state.board.filter((piece) => piece?.seat === 1)).toHaveLength(0);
  });

  it('crowns a man that reaches the far rank, and ends the turn there', () => {
    const base = checkersEngine.createState(now());
    const board = base.board.map(() => null) as CheckersState['board'];
    board[9] = { seat: 0, king: false }; // row 1
    board[57] = { seat: 1, king: false };
    const state: CheckersState = { ...base, board };

    const result = checkersEngine.apply(state, 0, { type: 'move', from: 9, to: 2 }, now());
    expect(result.ok).toBe(true);
    expect(pieceAt(result.state, 2)).toEqual({ seat: 0, king: true });
    expect(result.state.turn).toBe(1);
  });

  it('wins by capturing everything', () => {
    const base = checkersEngine.createState(now());
    const board = base.board.map(() => null) as CheckersState['board'];
    board[45] = { seat: 0, king: false };
    board[36] = { seat: 1, king: false };
    const state: CheckersState = { ...base, board };

    const result = checkersEngine.apply(state, 0, { type: 'move', from: 45, to: 27 }, now());
    expect(checkersEngine.outcome(result.state)).toMatchObject({ finished: true, winnerSeat: 0 });
  });
});

describe('mancala', () => {
  it('starts with four stones in each of the twelve pits', () => {
    const state = mancalaEngine.createState(now());
    expect(state.pits).toHaveLength(14);
    expect(state.pits[MANCALA_STORE[0]]).toBe(0);
    expect(state.pits[MANCALA_STORE[1]]).toBe(0);
    expect(state.pits.filter((count) => count === MANCALA_SEEDS)).toHaveLength(12);
    expect(mancalaLegalMoves(state)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('sows anticlockwise, one stone per pit', () => {
    const state = mancalaEngine.createState(now());
    const result = mancalaEngine.apply(state, 0, { type: 'sow', pit: 0 }, now());

    expect(result.ok).toBe(true);
    expect(result.state.pits[0]).toBe(0);
    expect(result.state.pits.slice(1, 5)).toEqual([5, 5, 5, 5]);
    expect(result.state.pits[5]).toBe(4);
  });

  it('grants another turn when the last stone lands in your own store', () => {
    const state = mancalaEngine.createState(now());
    // Pit 2 holds 4 stones → 3,4,5,store.
    const result = mancalaEngine.apply(state, 0, { type: 'sow', pit: 2 }, now());

    expect(result.state.pits[MANCALA_STORE[0]]).toBe(1);
    expect(result.state.extraTurn).toBe(true);
    expect(result.state.turn).toBe(0);
  });

  it('never drops a stone into the opponent store', () => {
    const base = mancalaEngine.createState(now());
    const pits = base.pits.slice();
    pits[5] = 10; // enough to wrap past seat 1's store
    const state: MancalaState = { ...base, pits };

    const result = mancalaEngine.apply(state, 0, { type: 'sow', pit: 5 }, now());
    expect(result.ok).toBe(true);
    expect(result.state.pits[MANCALA_STORE[1]]).toBe(0);
  });

  it('captures the opposite pit when landing in an empty pit on your side', () => {
    const base = mancalaEngine.createState(now());
    const pits = base.pits.slice();
    pits[0] = 1;
    pits[1] = 0; // landing here should capture
    pits[11] = 6; // the pit opposite pit 1
    const state: MancalaState = { ...base, pits };

    const result = mancalaEngine.apply(state, 0, { type: 'sow', pit: 0 }, now());
    expect(result.ok).toBe(true);
    expect(result.state.pits[1]).toBe(0);
    expect(result.state.pits[11]).toBe(0);
    expect(result.state.pits[MANCALA_STORE[0]]).toBe(7);
    expect(result.state.lastCapture).toBe(11);
  });

  it('sweeps the board and declares a winner when one side empties', () => {
    const base = mancalaEngine.createState(now());
    const pits = new Array(14).fill(0);
    pits[5] = 1; // seat 0's last stone, lands in its store
    pits[7] = 3;
    pits[MANCALA_STORE[0]] = 20;
    pits[MANCALA_STORE[1]] = 10;
    const state: MancalaState = { ...base, pits };

    const result = mancalaEngine.apply(state, 0, { type: 'sow', pit: 5 }, now());
    expect(result.ok).toBe(true);

    // Seat 0 is now empty, so seat 1's remaining stones go to its store.
    expect(result.state.pits[MANCALA_STORE[0]]).toBe(21);
    expect(result.state.pits[MANCALA_STORE[1]]).toBe(13);
    expect(mancalaEngine.outcome(result.state)).toMatchObject({ finished: true, winnerSeat: 0 });
  });

  it('rejects sowing an empty pit or the opponent side', () => {
    const state = mancalaEngine.createState(now());
    expect(mancalaEngine.apply(state, 0, { type: 'sow', pit: 7 }, now()).ok).toBe(false);
    expect(mancalaEngine.apply(state, 0, { type: 'sow', pit: 6 }, now()).ok).toBe(false);
    expect(mancalaEngine.apply(state, 1, { type: 'sow', pit: 0 }, now()).ok).toBe(false);
  });
});

describe('hex', () => {
  it('has an 11x11 board where interior cells have six neighbours', () => {
    const state = hexEngine.createState(now());
    expect(state.board).toHaveLength(HEX_SIZE * HEX_SIZE);
    expect(hexLegalMoves(state)).toHaveLength(HEX_SIZE * HEX_SIZE);

    const middle = Math.floor(state.board.length / 2);
    expect(hexNeighbours(middle)).toHaveLength(6);
    // The two acute corners of a rhombus touch only two cells.
    expect(hexNeighbours(0)).toHaveLength(2);
    expect(hexNeighbours(HEX_SIZE - 1)).toHaveLength(3); // an obtuse corner
  });

  it('wins when seat 0 joins the top edge to the bottom edge', () => {
    let state = hexEngine.createState(now()) as HexState;
    const moves: [Seat, unknown][] = [];

    // Seat 0 builds a straight column down column 0; seat 1 fills column 5.
    for (let row = 0; row < HEX_SIZE; row += 1) {
      moves.push([0, { type: 'place', index: row * HEX_SIZE }]);
      if (row < HEX_SIZE - 1) moves.push([1, { type: 'place', index: row * HEX_SIZE + 5 }]);
    }
    state = play(hexEngine, state, moves);

    const outcome = hexEngine.outcome(state);
    expect(outcome).toMatchObject({ finished: true, winnerSeat: 0 });
    expect(state.winningPath).toHaveLength(HEX_SIZE);
  });

  it('wins when seat 1 joins the left edge to the right edge', () => {
    let state = hexEngine.createState(now()) as HexState;
    const moves: [Seat, unknown][] = [];

    // Seat 1 builds along row 1; seat 0 plays harmlessly on row 9.
    for (let col = 0; col < HEX_SIZE; col += 1) {
      moves.push([0, { type: 'place', index: 9 * HEX_SIZE + col }]);
      moves.push([1, { type: 'place', index: 1 * HEX_SIZE + col }]);
    }
    state = play(hexEngine, state, moves);

    expect(hexEngine.outcome(state)).toMatchObject({ finished: true, winnerSeat: 1 });
  });

  it('offers the swap exactly once, to seat 1', () => {
    let state = hexEngine.createState(now()) as HexState;
    expect(state.swapAvailable).toBe(false);

    state = play(hexEngine, state, [[0, { type: 'place', index: 60 }]]);
    expect(state.swapAvailable).toBe(true);

    const swapped = hexEngine.apply(state, 1, { type: 'swap' }, now());
    expect(swapped.ok).toBe(true);
    expect(swapped.state.board[60]).toBe(1);
    expect(swapped.state.turn).toBe(0);
    expect(swapped.state.swapAvailable).toBe(false);

    // No second bite.
    expect(hexEngine.apply(swapped.state, 1, { type: 'swap' }, now()).ok).toBe(false);
  });

  it('refuses an occupied cell and never mutates the input state', () => {
    const state = hexEngine.createState(now());
    const first = hexEngine.apply(state, 0, { type: 'place', index: 5 }, now());
    const snapshot = JSON.stringify(first.state);

    expect(hexEngine.apply(first.state, 1, { type: 'place', index: 5 }, now()).ok).toBe(false);
    expect(JSON.stringify(first.state)).toBe(snapshot);
  });
});
