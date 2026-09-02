import type { GameId } from '@mini-arcade/shared';
import { config } from '../config/env.js';
import { getPool, query } from '../infra/db/pool.js';
import { createLogger } from '../infra/logger.js';

const log = createLogger('progress-store');

/** Persisted progression document. Kept intentionally small and JSON friendly. */
export interface ProgressRecord {
  playerId: string;
  xp: number;
  dailyStreak: number;
  longestStreak: number;
  winStreak: number;
  bestWinStreak: number;
  lossStreak: number;
  totalMatches: number;
  totalWins: number;
  lastPlayedDay: string | null;
  matchesToday: number;
  winsToday: number;
  gamesToday: GameId[];
  gamesWon: GameId[];
  achievements: { id: string; unlockedAt: string }[];
  quests: { day: string; id: string; progress: number; completed: boolean; claimedAt: string | null }[];
}

export function emptyProgress(playerId: string): ProgressRecord {
  return {
    playerId,
    xp: 0,
    dailyStreak: 0,
    longestStreak: 0,
    winStreak: 0,
    bestWinStreak: 0,
    lossStreak: 0,
    totalMatches: 0,
    totalWins: 0,
    lastPlayedDay: null,
    matchesToday: 0,
    winsToday: 0,
    gamesToday: [],
    gamesWon: [],
    achievements: [],
    quests: [],
  };
}

export interface ProgressStore {
  load(playerId: string): Promise<ProgressRecord>;
  save(record: ProgressRecord): Promise<void>;
  topByXp(limit: number): Promise<{ playerId: string; xp: number }[]>;
}

class MemoryProgressStore implements ProgressStore {
  private readonly records = new Map<string, ProgressRecord>();

  async load(playerId: string): Promise<ProgressRecord> {
    return structuredClone(this.records.get(playerId) ?? emptyProgress(playerId));
  }

  async save(record: ProgressRecord): Promise<void> {
    this.records.set(record.playerId, structuredClone(record));
  }

  async topByXp(limit: number): Promise<{ playerId: string; xp: number }[]> {
    return [...this.records.values()]
      .sort((a, b) => b.xp - a.xp)
      .slice(0, limit)
      .map((record) => ({ playerId: record.playerId, xp: record.xp }));
  }
}

class PostgresProgressStore implements ProgressStore {
  async load(playerId: string): Promise<ProgressRecord> {
    const { rows } = await query<{ xp: number; data: Partial<ProgressRecord> }>(
      'progress.load',
      'SELECT xp, data FROM player_progress WHERE player_id = $1',
      [playerId],
    );
    const row = rows[0];
    if (!row) return emptyProgress(playerId);
    return { ...emptyProgress(playerId), ...row.data, playerId, xp: Number(row.xp) };
  }

  async save(record: ProgressRecord): Promise<void> {
    const { playerId, xp, ...data } = record;
    await query(
      'progress.save',
      `INSERT INTO player_progress (player_id, xp, level, data, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (player_id) DO UPDATE
         SET xp = EXCLUDED.xp, level = EXCLUDED.level, data = EXCLUDED.data, updated_at = now()`,
      [playerId, xp, levelOf(xp), JSON.stringify(data)],
    );
  }

  async topByXp(limit: number): Promise<{ playerId: string; xp: number }[]> {
    const { rows } = await query<{ player_id: string; xp: number }>(
      'progress.top',
      'SELECT player_id, xp FROM player_progress ORDER BY xp DESC LIMIT $1',
      [limit],
    );
    return rows.map((row) => ({ playerId: row.player_id, xp: Number(row.xp) }));
  }
}

function levelOf(xp: number): number {
  let level = 1;
  let remaining = xp;
  while (level < 200) {
    const need = 80 + Math.round(level * 45 + level ** 1.6 * 12);
    if (remaining < need) break;
    remaining -= need;
    level += 1;
  }
  return level;
}

let store: ProgressStore | null = null;

export function getProgressStore(): ProgressStore {
  if (store) return store;
  if (config.hasDatabase && getPool()) {
    store = new PostgresProgressStore();
    log.info('progress store: postgres');
  } else {
    store = new MemoryProgressStore();
    log.info('progress store: memory');
  }
  return store;
}
