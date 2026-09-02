import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config/env.js';
import { authService } from '../../domain/auth-service.js';
import { playerService } from '../../domain/player-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';

export const authRouter: Router = Router();

const guestSchema = z.object({
  nickname: z.string().trim().min(3).max(18).optional(),
});

authRouter.post(
  '/guest',
  rateLimit({ name: 'auth', max: config.RATE_LIMIT_AUTH_MAX, keyFn: (req) => req.ip ?? 'anonymous' }),
  validate({ body: guestSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.createGuest(req.body.nickname);
    res.status(201).json(result);
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const player = await playerService.requireById(req.playerId as string);
    res.json({ player });
  }),
);

authRouter.post(
  '/refresh',
  requireAuth,
  asyncHandler(async (req, res) => {
    const player = await playerService.requireById(req.playerId as string);
    res.json({ token: authService.sign(player), expiresIn: config.JWT_TTL_SECONDS, player });
  }),
);
