import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from '../config/env.js';
import { logger } from '../infra/logger.js';
import { lifecycle } from '../infra/lifecycle.js';
import { AppError } from '../utils/errors.js';
import { errorHandler } from './middleware/error-handler.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { notFoundHandler } from './middleware/not-found.js';
import { rateLimit } from './middleware/rate-limit.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { requestTimeout } from './middleware/timeout.js';
import { authRouter } from './routes/auth.js';
import { gamesRouter } from './routes/games.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { playersRouter } from './routes/players.js';
import { progressRouter } from './routes/progress.js';
import { metricsRouter, systemRouter } from './routes/system.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  if (config.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(requestContextMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: false, // the SPA is served by nginx/vite, not this API
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors({ origin: config.corsOrigins, credentials: true, maxAge: 86_400 }));
  app.use(compression());
  app.use(express.json({ limit: config.BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: config.BODY_LIMIT }));
  app.use(requestTimeout(config.REQUEST_TIMEOUT_MS));
  app.use(metricsMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { id?: string }).id ?? '',
      autoLogging: {
        ignore: (req) => req.url?.startsWith('/api/system/live') === true || req.url === '/metrics',
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'debug',
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // Reject new work while draining so rolling deploys finish cleanly.
  app.use((req, res, next) => {
    if (lifecycle.isShuttingDown && !req.path.startsWith('/api/system')) {
      res.setHeader('connection', 'close');
      next(AppError.unavailable('Server is shutting down'));
      return;
    }
    next();
  });

  app.use('/api', rateLimit({ name: 'global' }));

  app.use('/api/system', systemRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/games', gamesRouter);
  app.use('/api/players', playersRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/progress', progressRouter);
  app.use('/metrics', metricsRouter);

  app.get('/', (_req, res) => {
    res.json({
      name: 'Mini Arcade API',
      version: config.VERSION,
      docs: '/api/system',
      endpoints: [
        '/api/games',
        '/api/leaderboard',
        '/api/progress/catalog',
        '/api/auth/guest',
        '/api/system',
        '/metrics',
      ],
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
