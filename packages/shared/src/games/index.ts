import type { GameId } from '../domain.js';
import type { GameEngine } from './types.js';
import { ticTacToeEngine } from './tic-tac-toe.js';
import { connectFourEngine } from './connect-four.js';
import { pongEngine } from './pong.js';

export * from './types.js';
export * from './tic-tac-toe.js';
export * from './connect-four.js';
export * from './pong.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const ENGINES: Record<GameId, GameEngine<any, any>> = {
  'tic-tac-toe': ticTacToeEngine,
  'connect-four': connectFourEngine,
  pong: pongEngine,
};

export function getEngine(gameId: GameId): GameEngine<any, any> {
  return ENGINES[gameId];
}
