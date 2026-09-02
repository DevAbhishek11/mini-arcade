import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  checkersEngine,
  hexEngine,
  mancalaEngine,
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
