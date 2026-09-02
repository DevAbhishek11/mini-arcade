import { Router } from 'express';
import { GAME_LIST } from '@mini-arcade/shared';

export const gamesRouter: Router = Router();

gamesRouter.get('/', (_req, res) => {
  res.setHeader('cache-control', 'public, max-age=300');
  res.json({ items: GAME_LIST, total: GAME_LIST.length });
});
