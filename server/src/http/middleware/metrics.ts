import type { NextFunction, Request, Response } from 'express';
import { httpRequestDuration, httpRequestsTotal } from '../../infra/metrics.js';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = (req.route?.path as string | undefined) ?? req.baseUrl ?? 'unknown';
    const labels = {
      method: req.method,
      route: `${req.baseUrl ?? ''}${route === '/' ? '' : route}` || 'unknown',
      status: String(res.statusCode),
    };
    end(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
}
