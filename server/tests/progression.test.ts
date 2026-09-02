import { beforeAll, describe, expect, it } from 'vitest';
import { QUESTS, levelFromXp, totalXpForLevel, xpForLevel, xpForMatch } from '@mini-arcade/shared';

import type {
  progressionService as ProgressionService,
  questsForDay as QuestsForDay,
} from '../src/domain/progression-service.js';

// Imported lazily so storage is initialised first.
let progressionService: typeof ProgressionService;
let questsForDay: typeof QuestsForDay;

beforeAll(async () => {
  const { initStorage } = await import('../src/domain/storage/index.js');
  await initStorage();
  const module = await import('../src/domain/progression-service.js');
  progressionService = module.progressionService;
  questsForDay = module.questsForDay;
});

describe('xp curve', () => {
  it('is strictly increasing and never free', () => {
    let previous = 0;
    for (let level = 1; level <= 30; level += 1) {
      const cost = xpForLevel(level);
      expect(cost).toBeGreaterThan(previous);
      previous = cost;
    }
  });

  it('round trips a level boundary exactly', () => {
    for (const level of [1, 2, 5, 12, 25]) {
      const at = levelFromXp(totalXpForLevel(level));
      expect(at.level).toBe(level);
      expect(at.xpIntoLevel).toBe(0);
      expect(at.progress).toBe(0);
    }
  });

  it('reports partial progress inside a level', () => {
    const half = Math.floor(xpForLevel(1) / 2);
    const at = levelFromXp(half);
    expect(at.level).toBe(1);
    expect(at.progress).toBeGreaterThan(0.4);
    expect(at.progress).toBeLessThan(0.6);
  });

  it('rewards a win more than a loss and caps the streak bonus', () => {
    const base = { ratingDelta: 0, dailyStreak: 1, firstWinOfDay: false } as const;
    expect(xpForMatch({ ...base, result: 'win' })).toBeGreaterThan(xpForMatch({ ...base, result: 'draw' }));
    expect(xpForMatch({ ...base, result: 'draw' })).toBeGreaterThan(xpForMatch({ ...base, result: 'loss' }));

    const huge = xpForMatch({ ...base, result: 'loss', dailyStreak: 500 });
    const capped = xpForMatch({ ...base, result: 'loss', dailyStreak: 11 });
    expect(huge).toBe(capped);
  });
});

describe('daily quests', () => {
  it('picks three stable quests per player and day', () => {
    const a = questsForDay('player-1', '2026-09-02');
    const b = questsForDay('player-1', '2026-09-02');
    expect(a).toHaveLength(3);
    expect(a.map((quest) => quest.id)).toEqual(b.map((quest) => quest.id));
    for (const quest of a) expect(QUESTS[quest.id]).toBeTruthy();
  });

  it('rerolls the set on a different day', () => {
    const ids = new Set<string>();
    for (const day of ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']) {
      for (const quest of questsForDay('player-1', day)) ids.add(quest.id);
    }
    expect(ids.size).toBeGreaterThan(3);
  });

  it('never repeats a quest inside one day', () => {
    const ids = questsForDay('player-2', '2026-09-02').map((quest) => quest.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('progression service', () => {
  it('starts every player at level 1 with three quests', async () => {
    const progress = await progressionService.get('fresh-player');
    expect(progress.xp).toBe(0);
    expect(progress.level.level).toBe(1);
    expect(progress.quests).toHaveLength(3);
    expect(progress.achievements).toHaveLength(0);
  });

  it('awards xp, starts a streak and unlocks first blood on a first win', async () => {
    const delta = await progressionService.recordMatch({
      playerId: 'winner-1',
      gameId: 'tic-tac-toe',
      result: 'win',
      ratingDelta: 12,
      opponentRating: 1200,
      ownRating: 1200,
      source: 'ranked',
    });

    expect(delta.xpGained).toBeGreaterThan(0);
    expect(delta.dailyStreak).toBe(1);
    expect(delta.winStreak).toBe(1);
    expect(delta.unlocked.map((entry) => entry.id)).toContain('first-blood');

    const progress = await progressionService.get('winner-1');
    expect(progress.xp).toBeGreaterThan(0);
    expect(progress.gamesWon).toContain('tic-tac-toe');
  });

  it('pays practice matches less than ranked matches', async () => {
    const ranked = await progressionService.recordMatch({
      playerId: 'pay-ranked',
      gameId: 'gomoku',
      result: 'win',
      ratingDelta: 10,
      opponentRating: 1200,
      ownRating: 1200,
      source: 'ranked',
    });
    const practice = await progressionService.recordMatch({
      playerId: 'pay-practice',
      gameId: 'gomoku',
      result: 'win',
      ratingDelta: 0,
      opponentRating: 1200,
      ownRating: 1200,
      source: 'practice',
    });

    expect(practice.xpGained).toBeLessThan(ranked.xpGained);
  });

  it('tracks a win streak and unlocks the hat trick', async () => {
    let delta = { unlocked: [] as { id: string }[] };
    for (let i = 0; i < 3; i += 1) {
      delta = (await progressionService.recordMatch({
        playerId: 'streaker',
        gameId: 'reversi',
        result: 'win',
        ratingDelta: 8,
        opponentRating: 1200,
        ownRating: 1200,
        source: 'ranked',
      })) as unknown as { unlocked: { id: string }[] };
    }
    expect(delta.unlocked.map((entry) => entry.id)).toContain('hat-trick');

    const progress = await progressionService.get('streaker');
    expect(progress.winStreak).toBe(3);
    expect(progress.bestWinStreak).toBeGreaterThanOrEqual(3);
  });

  it('resets the win streak after a loss', async () => {
    await progressionService.recordMatch({
      playerId: 'loser',
      gameId: 'pong',
      result: 'win',
      ratingDelta: 8,
      opponentRating: 1200,
      ownRating: 1200,
      source: 'ranked',
    });
    const delta = await progressionService.recordMatch({
      playerId: 'loser',
      gameId: 'pong',
      result: 'loss',
      ratingDelta: -8,
      opponentRating: 1200,
      ownRating: 1200,
      source: 'ranked',
    });
    expect(delta.winStreak).toBe(0);
  });

  it('completes the "play three" quest after three matches when it is rolled', async () => {
    const player = 'quester';
    const day = new Date().toISOString().slice(0, 10);
    const rolled = questsForDay(player, day).map((quest) => quest.id);

    for (let i = 0; i < 5; i += 1) {
      await progressionService.recordMatch({
        playerId: player,
        gameId: 'connect-four',
        result: i % 2 === 0 ? 'win' : 'loss',
        ratingDelta: 4,
        opponentRating: 1200,
        ownRating: 1200,
        source: 'ranked',
      });
    }

    const progress = await progressionService.get(player);
    expect(progress.matchesToday).toBe(5);
    for (const quest of progress.quests) {
      expect(rolled).toContain(quest.id);
      if (quest.id === 'play-three' || quest.id === 'close-call') expect(quest.completed).toBe(true);
    }
  });
});
