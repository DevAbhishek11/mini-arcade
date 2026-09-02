import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../logger.js';
import { getPool } from './pool.js';

const log = createLogger('migrate');
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
/** Any 64 bit constant; guarantees a single migrator across workers and containers. */
const ADVISORY_LOCK_ID = 90210_2024;

/**
 * Idempotent, cluster safe migrations: a Postgres advisory lock means only one
 * worker in the fleet applies them, everyone else waits and moves on.
 */
export async function runMigrations(): Promise<{ applied: string[]; skipped: number }> {
  const pool = getPool();
  if (!pool) return { applied: [], skipped: 0 };

  const client = await pool.connect();
  const applied: string[] = [];
  let skipped = 0;

  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (done.has(file)) {
        skipped += 1;
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      log.info({ migration: file }, 'applying migration');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
    log.info({ applied: applied.length, skipped }, 'migrations up to date');
    return { applied, skipped };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}
