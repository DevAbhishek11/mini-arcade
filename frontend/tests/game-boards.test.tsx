import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  bingoEngine,
  checkersEngine,
  chessEngine,
  chessLegalMoves,
  hexEngine,
  mancalaEngine,
  morrisEngine,
  sudokuEngine,
  ultimateTicTacToeEngine,
  type GameId,
} from '@mini-arcade/shared';
import { GameBoard } from '@/components/games/GameBoard';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(gameId: GameId, state: unknown, onAction = vi.fn()) {
  act(() => {
    root.render(React.createElement(GameBoard, { gameId, state, seat: 0, yourTurn: true, onAction }));
  });
  return onAction;
}

/** Buttons the local player can actually press right now. */
const liveButtons = () => [...container.querySelectorAll('button')].filter((button) => !button.disabled);

describe('new game boards', () => {
  it('renders all 81 ultimate tic tac toe cells and plays one', () => {
    const state = ultimateTicTacToeEngine.createState(Date.now());
    const onAction = render('ultimate-tic-tac-toe', state);

    expect(container.querySelectorAll('button')).toHaveLength(81);
    expect(container.textContent).toContain('Free choice');

    act(() => liveButtons()[40]?.click());
    expect(onAction).toHaveBeenCalledWith({ type: 'place', index: 40 });
  });

  it('only lets you press the highlighted ultimate board', () => {
    const state = ultimateTicTacToeEngine.createState(Date.now());
    const sent = ultimateTicTacToeEngine.apply(state, 0, { type: 'place', index: 4 }, Date.now()).state;

    act(() => {
      root.render(
        React.createElement(GameBoard, {
          gameId: 'ultimate-tic-tac-toe',
          state: sent,
          seat: 1,
          yourTurn: true,
          onAction: vi.fn(),
        }),
      );
    });

    expect(liveButtons()).toHaveLength(9);
    expect(container.textContent).toContain('Play in board 5');
  });

  it('requires a checkers piece to be selected before a destination appears', () => {
    const state = checkersEngine.createState(Date.now());
    const onAction = render('checkers', state);

    // Four men can move on the opening turn; nothing else is clickable yet.
    expect(liveButtons()).toHaveLength(4);

    const before = liveButtons().length;
    act(() => liveButtons()[0]?.click());

    // Selecting a piece reveals its destinations on top of the four sources.
    expect(liveButtons().length).toBeGreaterThan(before);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('renders mancala from the local seat and sows a pit', () => {
    const state = mancalaEngine.createState(Date.now());
    const onAction = render('mancala', state);

    // Six playable pits for you; the opponent's six are inert.
    expect(liveButtons()).toHaveLength(6);
    expect(container.querySelector('[aria-label="your store"]')?.textContent).toContain('0');

    act(() => liveButtons()[2]?.click());
    expect(onAction).toHaveBeenCalledWith({ type: 'sow', pit: 2 });
  });

  it('draws a full hex board and reports which edges you own', () => {
    const state = hexEngine.createState(Date.now());
    const onAction = render('hex', state);

    // Two polygons per cell: the fill and the hover hit area.
    expect(container.querySelectorAll('polygon').length).toBeGreaterThanOrEqual(121);
    expect(container.textContent).toContain('connect top to bottom');

    act(() =>
      container.querySelectorAll('polygon')[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(onAction).toHaveBeenCalledWith({ type: 'place', index: 0 });
  });

  it('offers the hex swap to the second player only', () => {
    const opened = hexEngine.apply(
      hexEngine.createState(Date.now()),
      0,
      { type: 'place', index: 60 },
      Date.now(),
    ).state;
    const onAction = vi.fn();

    act(() => {
      root.render(
        React.createElement(GameBoard, {
          gameId: 'hex',
          state: opened,
          seat: 1,
          yourTurn: true,
          onAction,
        }),
      );
    });

    const swap = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Swap'));
    expect(swap).toBeTruthy();
    act(() => swap?.click());
    expect(onAction).toHaveBeenCalledWith({ type: 'swap' });
  });
});

describe('strategy and classic boards', () => {
  it('renders a full chess position and offers a piece its legal moves', () => {
    const state = chessEngine.createState(Date.now());
    const onAction = render('chess', state);

    expect(container.querySelectorAll('button')).toHaveLength(64);
    // Sixteen pieces a side, drawn as glyphs.
    expect([...container.querySelectorAll('button')].filter((b) => b.textContent?.match(/[♔-♟]/))).toHaveLength(
      32,
    );

    // Twenty opening moves come from ten distinct squares.
    expect(liveButtons()).toHaveLength(10);

    const knight = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'b1');
    act(() => knight?.click());
    const target = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'c3');
    act(() => target?.click());

    expect(onAction).toHaveBeenCalledWith({ type: 'move', from: 57, to: 42, promotion: undefined });
  });

  it('marks check on the board', () => {
    const base = chessEngine.createState(Date.now());
    const board = base.board.map(() => null) as typeof base.board;
    board[60] = { seat: 0, kind: 'k' }; // e1
    board[4] = { seat: 1, kind: 'k' }; // e8
    board[59] = { seat: 1, kind: 'r' }; // d1, giving check along the rank
    const state = { ...base, board, legal: chessLegalMoves({ ...base, board }, 0), check: 0 as const };

    render('chess', state);
    expect(container.textContent).toContain('You are in check');
  });

  it('needs a sudoku cell before the digit pad does anything', () => {
    const state = sudokuEngine.createState(Date.now());
    const onAction = render('sudoku', state);

    // 81 grid cells plus 9 digits plus the hint toggle.
    expect(container.querySelectorAll('button').length).toBe(81 + 9 + 1);

    const empty = state.board.findIndex((value) => value === null);
    const digits = [...container.querySelectorAll('button')].slice(81, 90);
    expect(digits.every((digit) => (digit as HTMLButtonElement).disabled)).toBe(true);

    const cell = container.querySelector(
      `[aria-label="row ${Math.floor(empty / 9) + 1} column ${(empty % 9) + 1}"]`,
    );
    act(() => (cell as HTMLButtonElement).click());

    const enabled = [...container.querySelectorAll('button')].slice(81, 90) as HTMLButtonElement[];
    expect(enabled.every((digit) => !digit.disabled)).toBe(true);

    act(() => enabled[4]?.click());
    expect(onAction).toHaveBeenCalledWith({ type: 'fill', cell: empty, value: 5 });
  });

  it('shows both bingo cards and calls one of the three balls', () => {
    const state = bingoEngine.createState(Date.now());
    const onAction = render('bingo', state);

    // Only the three offered balls are pressable.
    expect(liveButtons()).toHaveLength(3);
    expect(container.textContent).toContain('Your card');
    expect(container.textContent).toContain('Their card');

    act(() => liveButtons()[0]?.click());
    expect(onAction).toHaveBeenCalledWith({ type: 'call', number: state.choices[0] });
  });

  it('places a morris piece and asks for a removal after a mill', () => {
    const state = morrisEngine.createState(Date.now());
    const onAction = render('nine-mens-morris', state);

    expect(container.textContent).toContain('Place a piece');
    expect(container.textContent).toContain('9 in hand');

    // Points are SVG groups, not buttons.
    const points = container.querySelectorAll('svg g[transform]');
    expect(points.length).toBeGreaterThanOrEqual(24);
    act(() => points[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onAction).toHaveBeenCalledWith({ type: 'place', to: 0 });
  });

  it('prompts for a capture while a morris mill is pending', () => {
    const base = morrisEngine.createState(Date.now());
    const board = base.board.slice();
    board[0] = 0;
    board[1] = 0;
    board[2] = 0;
    board[8] = 1;
    const state = {
      ...base,
      board,
      mustRemove: true,
      lastMill: [0, 1, 2],
      onBoard: [3, 1] as [number, number],
    };

    const onAction = render('nine-mens-morris', state);
    expect(container.textContent).toContain('Mill! Take an enemy piece');

    const points = container.querySelectorAll('svg g[transform]');
    act(() => points[8]?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onAction).toHaveBeenCalledWith({ type: 'remove', point: 8 });
  });
});
