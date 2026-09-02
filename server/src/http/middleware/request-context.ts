import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from '../../infra/logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      playerId?: string;
    }
  }
}

/** Assigns/propagates a request id and exposes it through AsyncLocalStorage. */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  req.id = incoming && incoming.length <= 64 ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);
  requestContext.run({ requestId: req.id }, () => next());
}
