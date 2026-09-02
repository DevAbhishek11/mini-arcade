import { AsyncLocalStorage } from 'node:async_hooks';
import cluster from 'node:cluster';
import pino, { type Logger } from 'pino';
import { config } from '../config/env.js';

export interface RequestContext {
  requestId: string;
  playerId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

const role = cluster.isPrimary ? 'primary' : 'worker';
const workerId = cluster.worker?.id ?? 0;

export const logger: Logger = pino({
  level: config.LOG_LEVEL,
  base: { service: config.SERVICE_NAME, role, workerId, pid: process.pid },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token', 'JWT_SECRET'],
    censor: '[redacted]',
  },
  mixin() {
    const ctx = requestContext.getStore();
    return ctx ? { requestId: ctx.requestId, playerId: ctx.playerId } : {};
  },
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(config.LOG_PRETTY
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,service,role' },
        },
      }
    : {}),
});

export const createLogger = (module: string): Logger => logger.child({ module });
