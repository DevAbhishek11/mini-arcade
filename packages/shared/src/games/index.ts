import type { GameId } from '../domain.js';
import type { GameEngine } from './types.js';
import { ticTacToeEngine } from './tic-tac-toe.js';
import { connectFourEngine } from './connect-four.js';
import { pongEngine } from './pong.js';
import { gomokuEngine } from './gomoku.js';
import { reversiEngine } from './reversi.js';
import { dotsAndBoxesEngine } from './dots-and-boxes.js';
import { snakeDuelEngine } from './snake-duel.js';
import { ultimateTicTacToeEngine } from './ultimate-tic-tac-toe.js';
import { checkersEngine } from './checkers.js';
import { mancalaEngine } from './mancala.js';
import { hexEngine } from './hex.js';

export * from './types.js';
export * from './tic-tac-toe.js';
export * from './connect-four.js';
export * from './pong.js';
export * from './gomoku.js';
export * from './reversi.js';
export * from './dots-and-boxes.js';
export * from './snake-duel.js';
export * from './ultimate-tic-tac-toe.js';
export * from './checkers.js';
export * from './mancala.js';
export * from './hex.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const ENGINES: Record<GameId, GameEngine<any, any>> = {
  'tic-tac-toe': ticTacToeEngine,
  'connect-four': connectFourEngine,
  pong: pongEngine,
  gomoku: gomokuEngine,
  reversi: reversiEngine,
  'dots-and-boxes': dotsAndBoxesEngine,
  'snake-duel': snakeDuelEngine,
  'ultimate-tic-tac-toe': ultimateTicTacToeEngine,
  checkers: checkersEngine,
  mancala: mancalaEngine,
  hex: hexEngine,
};

export function getEngine(gameId: GameId): GameEngine<any, any> {
  return ENGINES[gameId];
}
