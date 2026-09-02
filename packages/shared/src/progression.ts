import type { GameId } from './domain.js';

/* ------------------------------- levels / xp ------------------------------ */

/** XP needed to go from `level` to `level + 1`. Gentle curve, no grind walls. */
export function xpForLevel(level: number): number {
  return 80 + Math.round(level * 45 + level ** 1.6 * 12);
}

export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i += 1) total += xpForLevel(i);
  return total;
}

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  progress: number;
  totalXp: number;
}

export function levelFromXp(totalXp: number): LevelProgress {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (remaining >= xpForLevel(level) && level < 200) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  const xpForNext = xpForLevel(level);
  return {
    level,
    xpIntoLevel: remaining,
    xpForNext,
    progress: Math.min(1, remaining / xpForNext),
    totalXp: Math.max(0, Math.floor(totalXp)),
  };
}

export const XP_RULES = {
  playMatch: 12,
  win: 30,
  draw: 16,
  perfectWin: 15,
  streakBonusPerDay: 5,
  streakBonusCap: 50,
  questBonus: 40,
  firstWinOfDay: 25,
} as const;

/** Deterministic XP award for one finished match. */
export function xpForMatch(input: {
  result: 'win' | 'loss' | 'draw';
  ratingDelta: number;
  dailyStreak: number;
  firstWinOfDay: boolean;
}): number {
  let xp = XP_RULES.playMatch;
  if (input.result === 'win') xp += XP_RULES.win;
  else if (input.result === 'draw') xp += XP_RULES.draw;
  if (input.ratingDelta > 20) xp += XP_RULES.perfectWin;
  if (input.firstWinOfDay && input.result === 'win') xp += XP_RULES.firstWinOfDay;
  xp += Math.min(XP_RULES.streakBonusCap, Math.max(0, input.dailyStreak - 1) * XP_RULES.streakBonusPerDay);
  return xp;
}

/* ------------------------------ achievements ------------------------------ */

export type AchievementId =
  | 'first-blood'
  | 'hat-trick'
  | 'centurion'
  | 'unstoppable'
  | 'giant-slayer'
  | 'polyglot'
  | 'night-owl'
  | 'comeback'
  | 'social'
  | 'week-warrior'
  | 'perfectionist'
  | 'marathon';

export interface AchievementDef {
  id: AchievementId;
  name: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold';
  xp: number;
}

export const ACHIEVEMENTS: Record<AchievementId, AchievementDef> = {
  'first-blood': {
    id: 'first-blood',
    name: 'First Blood',
    description: 'Win your very first match.',
    icon: '🩸',
    tier: 'bronze',
    xp: 50,
  },
  'hat-trick': {
    id: 'hat-trick',
    name: 'Hat Trick',
    description: 'Win three matches in a row.',
    icon: '🎩',
    tier: 'silver',
    xp: 120,
  },
  centurion: {
    id: 'centurion',
    name: 'Centurion',
    description: 'Play 100 matches.',
    icon: '🏛️',
    tier: 'gold',
    xp: 400,
  },
  unstoppable: {
    id: 'unstoppable',
    name: 'Unstoppable',
    description: 'Win five matches in a row.',
    icon: '🔥',
    tier: 'gold',
    xp: 260,
  },
  'giant-slayer': {
    id: 'giant-slayer',
    name: 'Giant Slayer',
    description: 'Beat someone rated 150+ above you.',
    icon: '🗡️',
    tier: 'silver',
    xp: 150,
  },
  polyglot: {
    id: 'polyglot',
    name: 'Polyglot',
    description: 'Win at least once in every game.',
    icon: '🎮',
    tier: 'gold',
    xp: 350,
  },
  'night-owl': {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Finish a match between 1am and 5am.',
    icon: '🦉',
    tier: 'bronze',
    xp: 60,
  },
  comeback: {
    id: 'comeback',
    name: 'Comeback Kid',
    description: 'Win after losing three in a row.',
    icon: '💫',
    tier: 'silver',
    xp: 130,
  },
  social: {
    id: 'social',
    name: 'Good Company',
    description: 'Play a match in a private room.',
    icon: '🤝',
    tier: 'bronze',
    xp: 70,
  },
  'week-warrior': {
    id: 'week-warrior',
    name: 'Week Warrior',
    description: 'Keep a 7 day streak.',
    icon: '📅',
    tier: 'gold',
    xp: 300,
  },
  perfectionist: {
    id: 'perfectionist',
    name: 'Perfectionist',
    description: 'Win Pong without conceding a point.',
    icon: '💎',
    tier: 'gold',
    xp: 220,
  },
  marathon: {
    id: 'marathon',
    name: 'Marathon',
    description: 'Play five matches in one day.',
    icon: '🏃',
    tier: 'silver',
    xp: 140,
  },
};

export const ACHIEVEMENT_LIST: AchievementDef[] = Object.values(ACHIEVEMENTS);

export interface UnlockedAchievement {
  id: AchievementId;
  unlockedAt: string;
}

/* --------------------------------- quests --------------------------------- */

export type QuestId = 'play-three' | 'win-two' | 'try-new-game' | 'win-realtime' | 'close-call';

export interface QuestDef {
  id: QuestId;
  name: string;
  description: string;
  target: number;
  xp: number;
  icon: string;
}

export const QUESTS: Record<QuestId, QuestDef> = {
  'play-three': {
    id: 'play-three',
    name: 'Warm Up',
    description: 'Play 3 matches today',
    target: 3,
    xp: 60,
    icon: '🎯',
  },
  'win-two': {
    id: 'win-two',
    name: 'Double Down',
    description: 'Win 2 matches today',
    target: 2,
    xp: 90,
    icon: '🏆',
  },
  'try-new-game': {
    id: 'try-new-game',
    name: 'Explorer',
    description: 'Play 2 different games today',
    target: 2,
    xp: 70,
    icon: '🧭',
  },
  'win-realtime': {
    id: 'win-realtime',
    name: 'Fast Hands',
    description: 'Win a realtime match today',
    target: 1,
    xp: 80,
    icon: '⚡',
  },
  'close-call': {
    id: 'close-call',
    name: 'Grinder',
    description: 'Finish 5 matches today',
    target: 5,
    xp: 110,
    icon: '⛏️',
  },
};

export const QUEST_LIST: QuestDef[] = Object.values(QUESTS);

export interface QuestProgress {
  id: QuestId;
  progress: number;
  target: number;
  completed: boolean;
  claimedAt: string | null;
}

/* -------------------------------- profile -------------------------------- */

export interface PlayerProgress {
  xp: number;
  level: LevelProgress;
  dailyStreak: number;
  longestStreak: number;
  lastPlayedDay: string | null;
  matchesToday: number;
  winStreak: number;
  bestWinStreak: number;
  achievements: UnlockedAchievement[];
  quests: QuestProgress[];
  gamesWon: GameId[];
}

export interface ProgressDelta {
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
  unlocked: AchievementDef[];
  questsCompleted: QuestDef[];
  dailyStreak: number;
  winStreak: number;
}
