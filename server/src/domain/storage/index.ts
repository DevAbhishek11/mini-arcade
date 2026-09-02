import { config } from '../../config/env.js';
import { createLogger } from '../../infra/logger.js';
import type { Storage } from '../storage.js';
import { MemoryStorage } from './memory-storage.js';
import { PostgresStorage } from './postgres-storage.js';

const log = createLogger('storage');

let instance: Storage | null = null;

/**
 * Picks the Postgres driver when DATABASE_URL is set, and falls back to the
 * in-memory driver if the database cannot be reached at boot, so a broken
 * database never turns into a crash loop.
 */
export async function initStorage(): Promise<Storage> {
  if (instance) return instance;

  if (config.hasDatabase) {
    const postgres = new PostgresStorage();
    try {
      await postgres.init();
      instance = postgres;
      return instance;
    } catch (error) {
      log.error({ err: (error as Error).message }, 'postgres unavailable, falling back to memory storage');
    }
  }

  const memory = new MemoryStorage();
  await memory.init();
  instance = memory;
  return instance;
}

export function getStorage(): Storage {
  if (!instance) throw new Error('Storage not initialised — call initStorage() first');
  return instance;
}

export { MemoryStorage, PostgresStorage };
