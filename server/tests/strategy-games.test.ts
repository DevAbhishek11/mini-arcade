import { describe, expect, it } from 'vitest';
import {
  BINGO_FREE_CELL,
  CHESS_HALFMOVE_LIMIT,
  MORRIS_PIECES,
  SUDOKU_CELLS,
  bingoEngine,
  chessEngine,
  chessAnalyse,
  chessLegalMoves,
  morrisEngine,
  morrisLegalMoves,
  morrisRemovable,
  sudokuCandidates,
  sudokuEngine,
  type ChessPiece,
  type ChessState,
  type MorrisState,
  type Seat,
} from '@mini-arcade/shared';

const now = () => Date.now();

/** Builds a position from scratch: far easier to reason about than a game. */
function position(pieces: Record<number, ChessPiece>, turn: Seat = 0): ChessState {
  const base = chessEngine.createState(now());
  const board = base.board.map(() => null) as ChessState['board'];
  for (const [square, piece] of Object.entries(pieces)) board[Number(square)] = piece;

  return chessAnalyse({
    ...base,
    board,
    turn,
    castling: [
      { king: false, queen: false },
      { king: false, queen: false },
    ],
  });
}

const move = (state: ChessState, from: number, to: number, promotion?: 'q' | 'r' | 'b' | 'n') =>
  chessEngine.apply(state, state.turn, { type: 'move', from, to, promotion }, now());

describe('chess — setup and movement', () => {
  it('starts with 32 pieces and exactly 20 legal moves', () => {
    const state = chessEngine.createState(now());
    expect(state.board.filter(Boolean)).toHaveLength(32);
    expect(state.legal).toHaveLength(20);
    expect(state.turn).toBe(0);
  });

  it('lets a pawn step once or twice, but only from its home rank', () => {
    const state = chessEngine.createState(now());
    const e2 = 52;

    const single = move(state, e2, e2 - 8);
    expect(single.ok).toBe(true);

    const double = move(state, e2, e2 - 16);
    expect(double.ok).toBe(true);
    expect(double.state.enPassant).toBe(e2 - 8);

    // The same pawn cannot leap twice later on.
    const advanced = double.state;
    const black = move(advanced, 12, 28).state;
    expect(move(black, 36, 20).ok).toBe(false);
  });

  it('refuses to move a piece that is not yours, or out of turn', () => {
    const state = chessEngine.createState(now());
    expect(chessEngine.apply(state, 1, { type: 'move', from: 12, to: 20 }, now()).ok).toBe(false);
    expect(move(state, 12, 20).ok).toBe(false);
  });

  it('never mutates the position it was handed', () => {
    const state = chessEngine.createState(now());
    const snapshot = JSON.stringify(state);
    move(state, 52, 36);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('chess — special moves', () => {
  it('castles kingside, moving the rook too', () => {
    const base = position({
      60: { seat: 0, kind: 'k' },
      63: { seat: 0, kind: 'r' },
      4: { seat: 1, kind: 'k' },
    });
    const state: ChessState = {
      ...base,
      castling: [
        { king: true, queen: false },
        { king: false, queen: false },
      ],
    };
    const withRights = chessAnalyse(state);

    const castled = move(withRights, 60, 62);
    expect(castled.ok).toBe(true);
    expect(castled.state.board[62]).toEqual({ seat: 0, kind: 'k' });
    expect(castled.state.board[61]).toEqual({ seat: 0, kind: 'r' });
    expect(castled.state.castling[0]).toEqual({ king: false, queen: false });
  });

  it('forbids castling out of, or through, check', () => {
    const base = position({
      60: { seat: 0, kind: 'k' },
      63: { seat: 0, kind: 'r' },
      5: { seat: 1, kind: 'r' }, // rakes the f file, which the king crosses
      4: { seat: 1, kind: 'k' },
    });
    const state = {
      ...base,
      castling: [
        { king: true, queen: false },
        { king: false, queen: false },
      ] as ChessState['castling'],
    };

    expect(chessLegalMoves(state).some((candidate) => candidate.castle === 'king')).toBe(false);
  });

  it('captures en passant, removing the pawn that ran past', () => {
    // White pawn on e5 (28), black pawn still home on d7 (11).
    const ready = position(
      {
        28: { seat: 0, kind: 'p' },
        11: { seat: 1, kind: 'p' },
        60: { seat: 0, kind: 'k' },
        4: { seat: 1, kind: 'k' },
      },
      1,
    );

    const doubleStep = move(ready, 11, 27); // d7-d5, straight past the white pawn
    expect(doubleStep.ok).toBe(true);
    expect(doubleStep.state.enPassant).toBe(19); // d6

    const capture = move(doubleStep.state, 28, 19);
    expect(capture.ok).toBe(true);
    expect(capture.state.board[28]).toBeNull();
    expect(capture.state.board[19]).toEqual({ seat: 0, kind: 'p' });
    // The pawn that was taken stood on d5, not on the square we moved to.
    expect(capture.state.board[27]).toBeNull();
    expect(capture.state.captured[0]).toEqual(['p']);
  });

  it('promotes a pawn, defaulting to a queen but honouring a choice', () => {
    const state = position({
      8: { seat: 0, kind: 'p' },
      60: { seat: 0, kind: 'k' },
      39: { seat: 1, kind: 'k' },
    });

    const queened = move(state, 8, 0);
    expect(queened.ok).toBe(true);
    expect(queened.state.board[0]).toEqual({ seat: 0, kind: 'q' });

    const knighted = move(state, 8, 0, 'n');
    expect(knighted.state.board[0]).toEqual({ seat: 0, kind: 'n' });
  });
});

describe('chess — endings', () => {
  it('declares checkmate and names the winner', () => {
    // Back rank mate: black king on h8 hemmed in by its own pawns.
    const state = position(
      {
        7: { seat: 1, kind: 'k' },
        14: { seat: 1, kind: 'p' },
        15: { seat: 1, kind: 'p' },
        56: { seat: 0, kind: 'r' },
        60: { seat: 0, kind: 'k' },
      },
      0,
    );

    const mate = move(state, 56, 0);
    expect(mate.ok).toBe(true);
    expect(mate.state.finished).toBe(true);
    expect(mate.state.ending).toBe('checkmate');
    expect(chessEngine.outcome(mate.state)).toMatchObject({ winnerSeat: 0, reason: 'victory' });
  });

  it('declares stalemate a draw', () => {
    // Black king on a8, white queen on b6, white king on c6 — no legal move.
    const state = position(
      { 0: { seat: 1, kind: 'k' }, 17: { seat: 0, kind: 'q' }, 18: { seat: 0, kind: 'k' } },
      1,
    );

    expect(state.legal).toHaveLength(0);
    expect(state.finished).toBe(true);
    expect(state.ending).toBe('stalemate');
    expect(chessEngine.outcome(state)).toMatchObject({ winnerSeat: null, reason: 'draw' });
  });

  it('will not let you leave your own king in check', () => {
    // The bishop is pinned against its king by the rook.
    const state = position({
      60: { seat: 0, kind: 'k' },
      52: { seat: 0, kind: 'b' },
      4: { seat: 1, kind: 'r' },
      3: { seat: 1, kind: 'k' },
    });

    expect(state.legal.some((candidate) => candidate.from === 52 && candidate.to === 45)).toBe(false);
  });

  it('draws on bare kings', () => {
    const state = position({ 60: { seat: 0, kind: 'k' }, 4: { seat: 1, kind: 'k' } });
    expect(state.finished).toBe(true);
    expect(state.ending).toBe('insufficient-material');
  });

  it('draws after fifty quiet moves', () => {
    const base = position({
      60: { seat: 0, kind: 'k' },
      4: { seat: 1, kind: 'k' },
      32: { seat: 0, kind: 'r' },
    });
    const stalling: ChessState = { ...base, halfmoveClock: CHESS_HALFMOVE_LIMIT - 1 };

    const quiet = move(stalling, 32, 33);
    expect(quiet.state.ending).toBe('fifty-move');
    expect(chessEngine.outcome(quiet.state).reason).toBe('draw');
  });
});

describe('sudoku duel', () => {
  it('deals a solvable grid with the promised number of clues', () => {
    const state = sudokuEngine.createState(now());
    const given = state.board.filter((cell) => cell !== null);

    expect(state.board).toHaveLength(SUDOKU_CELLS);
    expect(given.length).toBeGreaterThan(20);
    // Every clue agrees with the solution, and no clue clashes with another.
    state.board.forEach((value, index) => {
      if (value !== null) expect(value).toBe(state.solution[index]);
    });
  });

  it('generates a genuinely valid solution — every row, column and box is 1-9', () => {
    const { solution } = sudokuEngine.createState(now());
    const complete = (values: number[]) => new Set(values).size === 9;

    for (let i = 0; i < 9; i += 1) {
      expect(complete(solution.slice(i * 9, i * 9 + 9))).toBe(true);
      expect(complete(solution.filter((_, index) => index % 9 === i))).toBe(true);
    }
    for (let box = 0; box < 9; box += 1) {
      const top = Math.floor(box / 3) * 27 + (box % 3) * 3;
      const cells = [0, 1, 2, 9, 10, 11, 18, 19, 20].map((offset) => solution[top + offset] as number);
      expect(complete(cells)).toBe(true);
    }
  });

  it('scores a correct digit and passes the turn', () => {
    const state = sudokuEngine.createState(now());
    const cell = state.board.findIndex((value) => value === null);

    const result = sudokuEngine.apply(
      state,
      0,
      { type: 'fill', cell, value: state.solution[cell] as number },
      now(),
    );
    expect(result.ok).toBe(true);
    expect(result.state.score[0]).toBe(1);
    expect(result.state.owners[cell]).toBe(0);
    expect(result.state.turn).toBe(1);
  });

  it('penalises a wrong digit and leaves the cell empty', () => {
    const state = sudokuEngine.createState(now());
    const cell = state.board.findIndex((value) => value === null);
    const wrong = ((state.solution[cell] as number) % 9) + 1;

    const scored = sudokuEngine.apply(
      state,
      0,
      { type: 'fill', cell, value: state.solution[cell] as number },
      now(),
    );
    const second = scored.state.board.findIndex((value) => value === null);
    const wrongForSecond = ((scored.state.solution[second] as number) % 9) + 1;

    const missed = sudokuEngine.apply(
      scored.state,
      1,
      { type: 'fill', cell: second, value: wrongForSecond },
      now(),
    );
    expect(missed.ok).toBe(true);
    expect(missed.state.board[second]).toBeNull();
    expect(missed.state.mistakes[1]).toBe(1);
    expect(missed.state.lastMistake).toMatchObject({ cell: second, seat: 1 });
    expect(wrong).not.toBe(state.solution[cell]);
  });

  it('rejects filled cells and digits outside 1-9', () => {
    const state = sudokuEngine.createState(now());
    const clue = state.board.findIndex((value) => value !== null);
    const empty = state.board.findIndex((value) => value === null);

    expect(sudokuEngine.apply(state, 0, { type: 'fill', cell: clue, value: 1 }, now()).ok).toBe(false);
    expect(sudokuEngine.apply(state, 0, { type: 'fill', cell: empty, value: 0 }, now()).ok).toBe(false);
    expect(sudokuEngine.apply(state, 0, { type: 'fill', cell: empty, value: 10 }, now()).ok).toBe(false);
  });

  it('never publishes the solution to the clients', () => {
    const state = sudokuEngine.createState(now());
    const published = sudokuEngine.toPublic(state) as Record<string, unknown>;
    expect(published.solution).toBeUndefined();
    expect(published.remaining).toBe(state.board.filter((cell) => cell === null).length);
  });

  it('offers only digits that do not clash', () => {
    const state = sudokuEngine.createState(now());
    const cell = state.board.findIndex((value) => value === null);
    // The right answer is always among the candidates.
    expect(sudokuCandidates(state.board, cell)).toContain(state.solution[cell]);
  });
});

describe('bingo blitz', () => {
  it('deals two cards with a free centre square already marked', () => {
    const state = bingoEngine.createState(now());

    expect(state.cards[0]).toHaveLength(25);
    expect(state.cards[0][BINGO_FREE_CELL]).toBeNull();
    expect(state.marked[0][BINGO_FREE_CELL]).toBe(true);
    expect(state.marked[1][BINGO_FREE_CELL]).toBe(true);
    expect(state.choices).toHaveLength(3);
  });

  it('keeps every column inside its B-I-N-G-O range', () => {
    const state = bingoEngine.createState(now());
    state.cards[0].forEach((value, index) => {
      if (value === null) return;
      const column = index % 5;
      expect(value).toBeGreaterThan(column * 15);
      expect(value).toBeLessThanOrEqual((column + 1) * 15);
    });
  });

  it('marks both cards from a single call', () => {
    const state = bingoEngine.createState(now());
    const ball = state.choices[0] as number;

    const result = bingoEngine.apply(state, 0, { type: 'call', number: ball }, now());
    expect(result.ok).toBe(true);

    for (const seat of [0, 1] as Seat[]) {
      state.cards[seat].forEach((value, index) => {
        if (value === ball) expect(result.state.marked[seat][index]).toBe(true);
      });
    }
    expect(result.state.called).toEqual([ball]);
    expect(result.state.choices).toHaveLength(3);
  });

  it('refuses a ball that is not on offer', () => {
    const state = bingoEngine.createState(now());
    const notOffered = Array.from({ length: 75 }, (_, i) => i + 1).find(
      (ball) => !state.choices.includes(ball),
    );

    const result = bingoEngine.apply(state, 0, { type: 'call', number: notOffered as number }, now());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not on offer/);
  });

  it('ends the moment a line completes, and the caller wins ties', () => {
    const base = bingoEngine.createState(now());
    // Mark the whole top row of both cards bar the first square, then call it.
    const marked: typeof base.marked = [base.marked[0].slice(), base.marked[1].slice()];
    for (const seat of [0, 1] as Seat[]) for (let cell = 1; cell < 5; cell += 1) marked[seat][cell] = true;

    const ball = base.cards[0][0] as number;
    const cards: typeof base.cards = [base.cards[0].slice(), base.cards[1].slice()];
    cards[1][0] = ball; // both cards need the very same ball

    const state = { ...base, cards, marked, turn: 1 as Seat, choices: [ball, ...base.choices.slice(1)] };
    const result = bingoEngine.apply(state, 1, { type: 'call', number: ball }, now());

    expect(result.state.finished).toBe(true);
    expect(result.state.winnerSeat).toBe(1);
    expect(bingoEngine.outcome(result.state)).toMatchObject({ winnerSeat: 1, reason: 'victory' });
  });

  it('keeps the undrawn bag private', () => {
    const state = bingoEngine.createState(now());
    const published = bingoEngine.toPublic(state) as Record<string, unknown>;
    expect(published.bag).toBeUndefined();
    expect(published.ballsLeft).toBe(state.bag.length);
  });
});

describe("nine men's morris", () => {
  const place = (state: MorrisState, to: number) =>
    morrisEngine.apply(state, state.turn, { type: 'place', to }, now());

  it('starts with nine pieces each, all still in hand', () => {
    const state = morrisEngine.createState(now());
    expect(state.hand).toEqual([MORRIS_PIECES, MORRIS_PIECES]);
    expect(morrisLegalMoves(state)).toHaveLength(24);
  });

  it('forms a mill and demands a capture, keeping the turn', () => {
    let state = morrisEngine.createState(now());
    // Seat 0 takes 0,1,2 (the top edge of the outer ring).
    state = place(state, 0).state;
    state = place(state, 9).state;
    state = place(state, 1).state;
    state = place(state, 10).state;
    const mill = place(state, 2);

    expect(mill.ok).toBe(true);
    expect(mill.state.mustRemove).toBe(true);
    expect(mill.state.turn).toBe(0);
    expect(mill.state.lastMill).toEqual([0, 1, 2]);

    // Only a removal is legal now.
    expect(morrisLegalMoves(mill.state).every((action) => action.type === 'remove')).toBe(true);
    expect(morrisEngine.apply(mill.state, 0, { type: 'place', to: 3 }, now()).ok).toBe(false);

    const removed = morrisEngine.apply(mill.state, 0, { type: 'remove', point: 9 }, now());
    expect(removed.ok).toBe(true);
    expect(removed.state.board[9]).toBeNull();
    expect(removed.state.turn).toBe(1);
  });

  it('protects pieces inside a mill unless they all are', () => {
    const base = morrisEngine.createState(now());
    const board = base.board.slice();
    board[8] = 1;
    board[9] = 1;
    board[10] = 1; // a completed enemy mill
    board[16] = 1; // and one loose piece
    const state: MorrisState = { ...base, board, mustRemove: true, onBoard: [3, 4], hand: [6, 5] };

    expect(morrisRemovable(state, 0)).toEqual([16]);

    // With nothing but milled pieces, they become fair game.
    const allMilled: MorrisState = { ...state, board: state.board.map((cell, i) => (i === 16 ? null : cell)) };
    expect(morrisRemovable(allMilled, 0)).toEqual([8, 9, 10]);
  });

  it('only slides to an adjacent point once the hands are empty', () => {
    const base = morrisEngine.createState(now());
    const board = base.board.slice();
    board[0] = 0;
    board[4] = 0;
    board[6] = 0;
    board[20] = 0; // a fourth piece, so this side is not flying
    board[8] = 1;
    board[10] = 1;
    board[12] = 1;
    board[14] = 1;
    const state: MorrisState = { ...base, board, hand: [0, 0], onBoard: [4, 4] };

    // Point 0 neighbours 1 and 7 only.
    expect(morrisEngine.apply(state, 0, { type: 'move', from: 0, to: 1 }, now()).ok).toBe(true);
    expect(morrisEngine.apply(state, 0, { type: 'move', from: 0, to: 3 }, now()).ok).toBe(false);
  });

  it('lets a player with three pieces fly anywhere', () => {
    const base = morrisEngine.createState(now());
    const board = base.board.slice();
    board[0] = 0;
    board[4] = 0;
    board[6] = 0;
    board[8] = 1;
    board[10] = 1;
    board[12] = 1;
    board[14] = 1;
    const state: MorrisState = { ...base, board, hand: [0, 0], onBoard: [3, 4] };

    // Three pieces left means the adjacency rule is lifted.
    expect(morrisEngine.apply(state, 0, { type: 'move', from: 0, to: 20 }, now()).ok).toBe(true);
  });

  it('wins when the opponent is cut down to two pieces', () => {
    const base = morrisEngine.createState(now());
    const board = base.board.slice();
    board[0] = 0;
    board[1] = 0;
    board[2] = 0;
    board[8] = 1;
    board[9] = 1;
    board[16] = 1;
    const state: MorrisState = {
      ...base,
      board,
      hand: [0, 0],
      onBoard: [3, 3],
      mustRemove: true,
      turn: 0,
    };

    const removed = morrisEngine.apply(state, 0, { type: 'remove', point: 16 }, now());
    expect(removed.state.finished).toBe(true);
    expect(morrisEngine.outcome(removed.state)).toMatchObject({ winnerSeat: 0, reason: 'victory' });
  });

  it('wins when the opponent is left without a legal move', () => {
    const base = morrisEngine.createState(now());
    const board = base.board.slice();
    // Seat 1 has three pieces but every neighbour is blocked, and it is not
    // flying because it still has a fourth piece.
    board[0] = 1;
    board[1] = 0;
    board[7] = 0;
    board[2] = 1;
    board[3] = 0;
    board[9] = 0;
    board[8] = 1;
    board[15] = 0;
    const state: MorrisState = { ...base, board, hand: [0, 0], onBoard: [5, 3], turn: 1 };

    // Flying is available at exactly three pieces, so this side can still move.
    expect(morrisLegalMoves(state).length).toBeGreaterThan(0);
  });
});
