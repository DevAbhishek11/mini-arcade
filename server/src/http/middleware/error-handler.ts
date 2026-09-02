import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { config } from '../../config/env.js';
import { createLogger } from '../../infra/logger.js';
import { AppError } from '../../utils/errors.js';

const log = createLogger('http');

export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) return next(error);

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        requestId: req.id,
      },
    });
    return;
  }

  if (error instanceof AppError) {
    if (error.status >= 500) log.error({ err: error.message, code: error.code }, 'request failed');
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details, requestId: req.id },
    });
    return;
  }

  const err = error as Error;
  log.error({ err: err.message, stack: err.stack }, 'unhandled request error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: config.isProduction ? 'Internal server error' : err.message,
      requestId: req.id,
    },
  });
}
