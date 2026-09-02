import { Router } from 'express';
import { z } from 'zod';
import { ACHIEVEMENT_LIST, QUEST_LIST } from '@mini-arcade/shared';
import { progressionService, questsForDay } from '../../domain/progression-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const progressRouter: Router = Router();

progressRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const progress = await progressionService.get(req.playerId as string);
    res.json({ progress });
  }),
);

progressRouter.get(
  '/catalog',
  asyncHandler(async (_req, res) => {
    res.setHeader('cache-control', 'public, max-age=3600');
    res.json({ achievements: ACHIEVEMENT_LIST, quests: QUEST_LIST });
  }),
);

progressRouter.get(
  '/quests/today',
  requireAuth,
  asyncHandler(async (req, res) => {
    const day = new Date().toISOString().slice(0, 10);
    const progress = await progressionService.get(req.playerId as string);
    res.json({ day, definitions: questsForDay(req.playerId as string, day), progress: progress.quests });
  }),
);

progressRouter.get(
  '/:id',
  validate({ params: z.object({ id: z.string().min(1).max(64) }) }),
  asyncHandler(async (req, res) => {
    const progress = await progressionService.get(req.params.id as string);
    res.setHeader('cache-control', 'public, max-age=15');
    res.json({ progress });
  }),
);
