import type { GameId } from '@mini-arcade/shared';

/**
 * Cabinet artwork lives at `public/art/<game-id>.webp`, so a new game needs no
 * registry entry here — dropping the file in is enough.
 */
export const gameArt = (gameId: GameId): string => `/art/${gameId}.webp`;
