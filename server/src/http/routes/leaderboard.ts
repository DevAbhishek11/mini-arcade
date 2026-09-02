import { Router } from 'express';
import { z } from 'zod';
import { GAME_IDS } from '@mini-arcade/shared';
import { leaderboardService } from '../../domain/leaderboard-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';

export const leaderboardRouter: Router = Router();

const querySchema = z.object({
  game: z.enum(['all', ...GAME_IDS]).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

leaderboardRouter.get(
  '/',
  validate({ query: querySchema }),
  asyncHandler(async (req, res) => {
    const { game, limit, offset } = req.query as unknown as z.infer<typeof querySchema>;
    const page = await leaderboardService.top(game, limit, offset);
    res.setHeader('cache-control', 'public, max-age=10');
    res.json(page);
  }),
);
