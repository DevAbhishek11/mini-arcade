import {
  ACHIEVEMENTS,
  GAME_IDS,
  QUESTS,
  QUEST_LIST,
  levelFromXp,
  xpForMatch,
  type AchievementDef,
  type AchievementId,
  type GameId,
  type PlayerProgress,
  type ProgressDelta,
  type QuestDef,
  type QuestId,
  type QuestProgress,
} from '@mini-arcade/shared';
import { cache } from '../infra/cache/index.js';
import { createLogger } from '../infra/logger.js';
import { emptyProgress, getProgressStore, type ProgressRecord } from './progress-store.js';

const log = createLogger('progression');

const DAILY_QUEST_COUNT = 3;
const progressKey = (playerId: string) => `progress:${playerId}`;

export interface MatchProgressInput {
  playerId: string;
  gameId: GameId;
  result: 'win' | 'loss' | 'draw';
  ratingDelta: number;
  opponentRating: number;
  ownRating: number;
  source: 'ranked' | 'room' | 'practice';
  /** Pong specific: won without conceding. */
  flawless?: boolean;
  finishedAt?: Date;
}

const dayKey = (date = new Date()): string => date.toISOString().slice(0, 10);

/** Deterministic per-player, per-day quest rotation — no storage needed to pick them. */
export function questsForDay(playerId: string, day: string): QuestDef[] {
  let hash = 2166136261;
  const seed = `${playerId}:${day}`;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const pool = [...QUEST_LIST];
  const picked: QuestDef[] = [];
  for (let i = 0; i < DAILY_QUEST_COUNT && pool.length > 0; i += 1) {
    hash = Math.imul(hash ^ (i + 1), 16777619);
    const index = Math.abs(hash) % pool.length;
    picked.push(pool.splice(index, 1)[0] as QuestDef);
  }
  return picked;
}

function rollDay(record: ProgressRecord, today: string): ProgressRecord {
  if (record.lastPlayedDay === today) return record;

  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const continued = record.lastPlayedDay === yesterday;
  const dailyStreak = continued ? record.dailyStreak + 1 : 1;

  return {
    ...record,
    dailyStreak,
    longestStreak: Math.max(record.longestStreak, dailyStreak),
    lastPlayedDay: today,
    matchesToday: 0,
    winsToday: 0,
    gamesToday: [],
    quests: record.quests.filter((quest) => quest.day === today),
  };
}

function questState(record: ProgressRecord, today: string): QuestProgress[] {
  return questsForDay(record.playerId, today).map((def) => {
    const stored = record.quests.find((quest) => quest.day === today && quest.id === def.id);
    return {
      id: def.id,
      progress: Math.min(def.target, stored?.progress ?? 0),
      target: def.target,
      completed: stored?.completed ?? false,
      claimedAt: stored?.claimedAt ?? null,
    };
  });
}

function toPublic(record: ProgressRecord, today = dayKey()): PlayerProgress {
  return {
    xp: record.xp,
    level: levelFromXp(record.xp),
    dailyStreak: record.lastPlayedDay === today || record.lastPlayedDay === dayKey(new Date(Date.now() - 86_400_000))
      ? record.dailyStreak
      : 0,
    longestStreak: record.longestStreak,
    lastPlayedDay: record.lastPlayedDay,
    matchesToday: record.lastPlayedDay === today ? record.matchesToday : 0,
    winStreak: record.winStreak,
    bestWinStreak: record.bestWinStreak,
    achievements: record.achievements.map((entry) => ({
      id: entry.id as AchievementId,
      unlockedAt: entry.unlockedAt,
    })),
    quests: questState(record, today),
    gamesWon: record.gamesWon,
  };
}

/**
 * Owns XP, levels, daily streaks, achievements and quests.
 *
 * Everything is derived from one small document per player, written once per
 * finished match and cached in the layered cache for reads.
 */
export const progressionService = {
  async get(playerId: string): Promise<PlayerProgress> {
    const cached = await cache.wrap(progressKey(playerId), { ttlMs: 20_000 }, async () =>
      getProgressStore().load(playerId),
    );
    return toPublic(cached as ProgressRecord);
  },

  async raw(playerId: string): Promise<ProgressRecord> {
    return getProgressStore().load(playerId);
  },

  /** Applies one finished match and returns what the player just earned. */
  async recordMatch(input: MatchProgressInput): Promise<ProgressDelta> {
    const store = getProgressStore();
    const today = dayKey(input.finishedAt);
    const record = rollDay(await store.load(input.playerId).catch(() => emptyProgress(input.playerId)), today);

    const levelBefore = levelFromXp(record.xp).level;
    const firstWinOfDay = input.result === 'win' && record.winsToday === 0;

    const lossStreakBefore = record.lossStreak;
    record.matchesToday += 1;
    record.totalMatches += 1;
    if (input.result === 'win') {
      record.totalWins += 1;
      record.winsToday += 1;
      record.winStreak += 1;
      record.lossStreak = 0;
      record.bestWinStreak = Math.max(record.bestWinStreak, record.winStreak);
      if (!record.gamesWon.includes(input.gameId)) record.gamesWon = [...record.gamesWon, input.gameId];
    } else if (input.result === 'loss') {
      record.winStreak = 0;
      record.lossStreak += 1;
    } else {
      record.winStreak = 0;
    }
    if (!record.gamesToday.includes(input.gameId)) record.gamesToday = [...record.gamesToday, input.gameId];

    // Practice matches earn a reduced, non-ranked share of XP.
    const baseXp = xpForMatch({
      result: input.result,
      ratingDelta: input.ratingDelta,
      dailyStreak: record.dailyStreak,
      firstWinOfDay,
    });
    let xpGained = input.source === 'practice' ? Math.round(baseXp * 0.4) : baseXp;

    const questsCompleted = this.advanceQuests(record, today, input);
    for (const quest of questsCompleted) xpGained += quest.xp;

    const unlocked = this.evaluateAchievements(record, input, lossStreakBefore);
    for (const achievement of unlocked) xpGained += achievement.xp;

    record.xp += xpGained;
    const levelAfter = levelFromXp(record.xp).level;

    try {
      await store.save(record);
      await cache.invalidate(progressKey(input.playerId));
    } catch (error) {
      log.error({ err: (error as Error).message }, 'failed to persist progression');
    }

    return {
      xpGained,
      levelBefore,
      levelAfter,
      leveledUp: levelAfter > levelBefore,
      unlocked,
      questsCompleted,
      dailyStreak: record.dailyStreak,
      winStreak: record.winStreak,
    };
  },

  advanceQuests(record: ProgressRecord, today: string, input: MatchProgressInput): QuestDef[] {
    const active = questsForDay(record.playerId, today);
    const completed: QuestDef[] = [];

    for (const def of active) {
      const existing = record.quests.find((quest) => quest.day === today && quest.id === def.id) ?? {
        day: today,
        id: def.id,
        progress: 0,
        completed: false,
        claimedAt: null,
      };
      if (existing.completed) continue;

      let increment = 0;
      switch (def.id as QuestId) {
        case 'play-three':
        case 'close-call':
          increment = 1;
          break;
        case 'win-two':
          increment = input.result === 'win' ? 1 : 0;
          break;
        case 'try-new-game':
          increment = record.gamesToday.length > existing.progress ? 1 : 0;
          break;
        case 'win-realtime':
          increment = input.result === 'win' && (input.gameId === 'pong' || input.gameId === 'snake-duel') ? 1 : 0;
          break;
        default:
          increment = 0;
      }
      if (increment === 0 && existing.progress === 0) {
        record.quests = [...record.quests.filter((q) => !(q.day === today && q.id === def.id)), existing];
        continue;
      }

      const progress = Math.min(def.target, existing.progress + increment);
      const isComplete = progress >= def.target;
      if (isComplete && !existing.completed) completed.push(QUESTS[def.id as QuestId]);

      record.quests = [
        ...record.quests.filter((q) => !(q.day === today && q.id === def.id)),
        { ...existing, progress, completed: isComplete, claimedAt: isComplete ? new Date().toISOString() : null },
      ];
    }

    return completed;
  },

  evaluateAchievements(
    record: ProgressRecord,
    input: MatchProgressInput,
    lossStreakBefore: number,
  ): AchievementDef[] {
    const owned = new Set(record.achievements.map((entry) => entry.id));
    const unlocked: AchievementDef[] = [];
    const won = input.result === 'win';
    const hour = (input.finishedAt ?? new Date()).getHours();

    const grant = (id: AchievementId, when: boolean) => {
      if (!when || owned.has(id)) return;
      owned.add(id);
      unlocked.push(ACHIEVEMENTS[id]);
      record.achievements = [...record.achievements, { id, unlockedAt: new Date().toISOString() }];
    };

    grant('first-blood', won && record.totalWins === 1);
    grant('hat-trick', record.winStreak >= 3);
    grant('unstoppable', record.winStreak >= 5);
    grant('comeback', won && lossStreakBefore >= 3);
    grant('giant-slayer', won && input.opponentRating - input.ownRating >= 150);
    grant('polyglot', record.gamesWon.length >= GAME_IDS.length);
    grant('centurion', record.totalMatches >= 100);
    grant('marathon', record.matchesToday >= 5);
    grant('week-warrior', record.dailyStreak >= 7);
    grant('night-owl', hour >= 1 && hour < 5);
    grant('social', input.source === 'room');
    grant('perfectionist', won && input.flawless === true);

    return unlocked;
  },
};
