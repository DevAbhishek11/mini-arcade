import { Router } from 'express';
import { z } from 'zod';
import { playerService } from '../../domain/player-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const playersRouter: Router = Router();

playersRouter.patch(
  '/me',
  requireAuth,
  validate({ body: z.object({ nickname: z.string().trim().min(3).max(18) }) }),
  asyncHandler(async (req, res) => {
    const player = await playerService.rename(req.playerId as string, req.body.nickname);
    res.json({ player });
  }),
);

playersRouter.get(
  '/:id',
  validate({ params: z.object({ id: z.string().min(1).max(64) }) }),
  asyncHandler(async (req, res) => {
    const player = await playerService.requireById(req.params.id as string);
    res.setHeader('cache-control', 'public, max-age=10');
    res.json({ player });
  }),
);

playersRouter.get(
  '/:id/matches',
  validate({
    params: z.object({ id: z.string().min(1).max(64) }),
    query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }),
  }),
  asyncHandler(async (req, res) => {
    const limit = (req.query as unknown as { limit: number }).limit;
    const items = await playerService.history(req.params.id as string, limit);
    res.json({ items, total: items.length, limit, offset: 0 });
  }),
);
