import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../../utils/errors.js';

/** Fails a request that outlives its budget so sockets are never held forever. */
export function requestTimeout(ms: number): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) next(new AppError(503, 'REQUEST_TIMEOUT', 'Request timed out'));
    }, ms);
    timer.unref();
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
  };
}
