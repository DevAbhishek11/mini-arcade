import { GAME_IDS, type GameId } from '@mini-arcade/shared';

export interface SoloRecord {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  bestStreak: number;
  streak: number;
  lastPlayedAt: number | null;
}

export type SoloStats = Record<GameId, SoloRecord>;

const STORAGE_KEY = 'mini-arcade.solo-stats.v1';

const emptyRecord = (): SoloRecord => ({
  played: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  bestStreak: 0,
  streak: 0,
  lastPlayedAt: null,
});

function emptyStats(): SoloStats {
  return Object.fromEntries(GAME_IDS.map((id) => [id, emptyRecord()])) as SoloStats;
}

/**
 * Offline play has no server to talk to, so results are kept in localStorage.
 * Reads are defensive: a corrupted or older payload simply resets to zero
 * rather than breaking the page.
 */
export interface SoloTotals {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  bestStreak: number;
}

interface SoloStatsApi {
  read(): SoloStats;
  record(gameId: GameId, result: 'win' | 'loss' | 'draw'): SoloStats;
  totals(stats?: SoloStats): SoloTotals;
  clear(): SoloStats;
}

export const soloStats: SoloStatsApi = {
  read(): SoloStats {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStats();
      const parsed = JSON.parse(raw) as Partial<SoloStats>;
      const merged = emptyStats();
      for (const id of GAME_IDS) {
        const entry = parsed[id];
        if (entry && typeof entry.played === 'number') merged[id] = { ...emptyRecord(), ...entry };
      }
      return merged;
    } catch {
      return emptyStats();
    }
  },

  record(gameId: GameId, result: 'win' | 'loss' | 'draw'): SoloStats {
    const stats = soloStats.read();
    const entry = stats[gameId];

    entry.played += 1;
    entry.lastPlayedAt = Date.now();
    if (result === 'win') {
      entry.wins += 1;
      entry.streak += 1;
      entry.bestStreak = Math.max(entry.bestStreak, entry.streak);
    } else if (result === 'loss') {
      entry.losses += 1;
      entry.streak = 0;
    } else {
      entry.draws += 1;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch {
      // Private browsing / quota — stats are a bonus, never a hard failure.
    }
    return stats;
  },

  totals(stats: SoloStats = soloStats.read()): SoloTotals {
    return GAME_IDS.reduce(
      (accumulator, id) => {
        const entry = stats[id];
        accumulator.played += entry.played;
        accumulator.wins += entry.wins;
        accumulator.losses += entry.losses;
        accumulator.draws += entry.draws;
        accumulator.bestStreak = Math.max(accumulator.bestStreak, entry.bestStreak);
        return accumulator;
      },
      { played: 0, wins: 0, losses: 0, draws: 0, bestStreak: 0 },
    );
  },

  clear(): SoloStats {
    localStorage.removeItem(STORAGE_KEY);
    return emptyStats();
  },
};
