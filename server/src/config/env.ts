import { config as loadDotenv } from 'dotenv';
import { cpus } from 'node:os';
import { z } from 'zod';

loadDotenv({ path: process.env.ENV_FILE ?? '.env', quiet: true } as never);

const bool = (fallback: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .default(fallback)
    .transform((value) =>
      typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
    );

const int = (fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().default('mini-arcade-server'),
  VERSION: z.string().default('1.0.0'),

  HOST: z.string().default('0.0.0.0'),
  PORT: int(4000, 1, 65535),

  /** 0 = auto (one worker per core, capped). 1 = single process. */
  CLUSTER_WORKERS: int(0, 0, 64),
  CLUSTER_MAX_WORKERS: int(4, 1, 64),
  /** Restart a worker if it stops answering the primary's heartbeat. */
  WORKER_HEARTBEAT_MS: int(10_000, 1_000),
  WORKER_HEARTBEAT_TIMEOUT_MS: int(30_000, 2_000),
  /** Guardrail: recycle a worker whose RSS exceeds this (MB). 0 disables. */
  WORKER_MAX_RSS_MB: int(0, 0),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: bool(false),

  CORS_ORIGINS: z.string().default('*'),
  TRUST_PROXY: bool(true),
  BODY_LIMIT: z.string().default('64kb'),
  REQUEST_TIMEOUT_MS: int(15_000, 1_000),
  SHUTDOWN_TIMEOUT_MS: int(15_000, 1_000),
  KEEP_ALIVE_TIMEOUT_MS: int(65_000, 1_000),

  JWT_SECRET: z.string().min(16).default('dev-only-insecure-secret-change-me'),
  JWT_TTL_SECONDS: int(60 * 60 * 24 * 30, 60),

  DATABASE_URL: z.string().optional(),
  DB_POOL_MAX: int(10, 1, 200),
  DB_POOL_MIN: int(0, 0, 100),
  DB_IDLE_TIMEOUT_MS: int(30_000, 1_000),
  DB_CONNECTION_TIMEOUT_MS: int(5_000, 500),
  DB_STATEMENT_TIMEOUT_MS: int(10_000, 500),
  DB_RUN_MIGRATIONS: bool(true),

  REDIS_URL: z.string().optional(),
  REDIS_KEY_PREFIX: z.string().default('arcade:'),

  CACHE_L1_MAX_ITEMS: int(2_000, 16),
  CACHE_L1_TTL_MS: int(5_000, 100),
  CACHE_DEFAULT_TTL_MS: int(30_000, 100),
  CACHE_LEADERBOARD_TTL_MS: int(15_000, 100),

  RATE_LIMIT_WINDOW_MS: int(60_000, 1_000),
  RATE_LIMIT_MAX: int(240, 1),
  RATE_LIMIT_AUTH_MAX: int(20, 1),
  SOCKET_ACTION_RATE: int(30, 1),
  SOCKET_ACTION_BURST: int(60, 1),

  MATCH_IDLE_TIMEOUT_MS: int(120_000, 5_000),
  MATCH_RECONNECT_GRACE_MS: int(20_000, 1_000),
  MATCH_MAX_PER_WORKER: int(500, 1),
  METRICS_ENABLED: bool(true),
  BOT_FILL_MS: int(12_000, 0),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  return parsed.data;
}

const env = parseEnv();

export const config = {
  ...env,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  corsOrigins: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((o) => o.trim()),
  /**
   * Workers only share state through Postgres/Redis. Without them, a second
   * worker would see a different in-memory world, so we pin the process to one.
   */
  workerCount: (() => {
    const requested =
      env.CLUSTER_WORKERS > 0
        ? env.CLUSTER_WORKERS
        : Math.max(1, Math.min(env.CLUSTER_MAX_WORKERS, cpus().length));
    const shareable = Boolean(env.DATABASE_URL) && Boolean(env.REDIS_URL);
    return shareable ? requested : 1;
  })(),
  clusterRequested:
    env.CLUSTER_WORKERS > 0
      ? env.CLUSTER_WORKERS
      : Math.max(1, Math.min(env.CLUSTER_MAX_WORKERS, cpus().length)),
  hasDatabase: Boolean(env.DATABASE_URL),
  hasRedis: Boolean(env.REDIS_URL),
} as const;

export type AppConfig = typeof config;
