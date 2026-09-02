import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Wraps an async handler so rejections reach the error middleware. */
export const asyncHandler =
  <T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(fn: T): RequestHandler =>
  (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
