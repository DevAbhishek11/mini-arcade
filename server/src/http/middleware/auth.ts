import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { authService } from '../../domain/auth-service.js';
import { requestContext } from '../../infra/logger.js';
import { AppError } from '../../utils/errors.js';

function extractToken(req: Request): string | null {
  const header = req.header('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const query = req.query.token;
  return typeof query === 'string' ? query : null;
}

/** Requires a valid session token and attaches `req.playerId`. */
export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) return next(AppError.unauthorized());
  try {
    const payload = authService.verify(token);
    req.playerId = payload.sub;
    const store = requestContext.getStore();
    if (store) store.playerId = payload.sub;
    next();
  } catch (error) {
    next(error);
  }
};

/** Attaches `req.playerId` when a token is present, but never rejects. */
export const optionalAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.playerId = authService.verify(token).sub;
  } catch {
    /* ignore invalid tokens on public endpoints */
  }
  next();
};
