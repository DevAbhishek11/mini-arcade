import pg from 'pg';
import { config } from '../../config/env.js';
import { lifecycle } from '../lifecycle.js';
import { createLogger } from '../logger.js';
import { dbPoolGauge, dbQueryDuration } from '../metrics.js';

const log = createLogger('db');

let pool: pg.Pool | null = null;
let poolGaugeTimer: NodeJS.Timeout | null = null;

export function getPool(): pg.Pool | null {
  if (!config.hasDatabase) return null;
  if (pool) return pool;

  pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    min: config.DB_POOL_MIN,
    idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
    statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,
    query_timeout: config.DB_STATEMENT_TIMEOUT_MS,
    application_name: `${config.SERVICE_NAME}:${process.pid}`,
    allowExitOnIdle: false,
  });

  pool.on('error', (error) => log.error({ err: error.message }, 'idle client error'));

  poolGaugeTimer = setInterval(() => {
    if (!pool) return;
    dbPoolGauge.set({ state: 'total' }, pool.totalCount);
    dbPoolGauge.set({ state: 'idle' }, pool.idleCount);
    dbPoolGauge.set({ state: 'waiting' }, pool.waitingCount);
  }, 5_000);
  poolGaugeTimer.unref();

  lifecycle.register(
    'postgres:pool',
    async () => {
      if (poolGaugeTimer) clearInterval(poolGaugeTimer);
      await pool?.end();
      pool = null;
    },
    70,
  );

  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  operation: string,
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const active = getPool();
  if (!active) throw new Error('DATABASE_URL is not configured');
  const end = dbQueryDuration.startTimer({ operation });
  try {
    const result = await active.query<T>(text, params as never[]);
    end({ status: 'ok' });
    return result;
  } catch (error) {
    end({ status: 'error' });
    log.error({ operation, err: (error as Error).message }, 'query failed');
    throw error;
  }
}

/** Runs `fn` inside a transaction, always releasing the client. */
export async function transaction<T>(operation: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const active = getPool();
  if (!active) throw new Error('DATABASE_URL is not configured');
  const client = await active.connect();
  const end = dbQueryDuration.startTimer({ operation });
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    end({ status: 'ok' });
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    end({ status: 'error' });
    throw error;
  } finally {
    client.release();
  }
}

export async function pingDatabase(): Promise<{ ok: boolean; latencyMs?: number; detail?: string }> {
  if (!config.hasDatabase) return { ok: false, detail: 'not configured' };
  const startedAt = Date.now();
  try {
    await query('health', 'SELECT 1');
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, detail: (error as Error).message };
  }
}
