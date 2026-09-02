import { describe, expect, it } from 'vitest';
import { DEFAULT_RATING, eloDelta, expectedScore, kFactor } from '@mini-arcade/shared';

describe('elo', () => {
  it('is symmetric for equal ratings', () => {
    expect(expectedScore(1200, 1200)).toBe(0.5);
  });

  it('rewards beating a stronger opponent more', () => {
    const upset = eloDelta({ rating: 1200, played: 50, score: 1 }, { rating: 1600 });
    const expected = eloDelta({ rating: 1600, played: 50, score: 1 }, { rating: 1200 });
    expect(upset).toBeGreaterThan(expected);
  });

  it('is zero-sum for equal opponents', () => {
    const winner = eloDelta({ rating: DEFAULT_RATING, played: 50, score: 1 }, { rating: DEFAULT_RATING });
    const loser = eloDelta({ rating: DEFAULT_RATING, played: 50, score: 0 }, { rating: DEFAULT_RATING });
    expect(winner + loser).toBe(0);
  });

  it('uses a larger K factor for new players and a smaller one at the top', () => {
    expect(kFactor(1200, 2)).toBe(40);
    expect(kFactor(1200, 50)).toBe(32);
    expect(kFactor(2200, 500)).toBe(16);
  });
});
