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

const credentialsSchema = z.object({
  nickname: z.string().trim().min(3).max(18),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(200),
});

/** Registration and login are the two endpoints worth brute forcing. */
const authLimiter = rateLimit({
  name: 'auth',
  max: config.RATE_LIMIT_AUTH_MAX,
  keyFn: (req) => req.ip ?? 'anonymous',
});

authRouter.post(
  '/guest',
  authLimiter,
  validate({ body: guestSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.createGuest(req.body.nickname);
    res.status(201).json(result);
  }),
);

authRouter.post(
  '/register',
  authLimiter,
  validate({ body: credentialsSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.json(result);
  }),
);

/** Turns the current guest into a real account without losing any progress. */
authRouter.post(
  '/upgrade',
  requireAuth,
  authLimiter,
  validate({ body: credentialsSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.upgradeGuest(req.playerId as string, req.body);
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
