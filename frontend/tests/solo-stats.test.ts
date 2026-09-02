import { beforeEach, describe, expect, it } from 'vitest';
import { soloStats } from '@/lib/solo-stats';

describe('offline solo stats', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty for every game', () => {
    const stats = soloStats.read();
    expect(stats['tic-tac-toe']).toEqual({
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      bestStreak: 0,
      streak: 0,
      lastPlayedAt: null,
    });
    expect(soloStats.totals().played).toBe(0);
  });

  it('records wins, losses and draws independently per game', () => {
    soloStats.record('pong', 'win');
    soloStats.record('pong', 'loss');
    soloStats.record('gomoku', 'draw');

    const stats = soloStats.read();
    expect(stats.pong.played).toBe(2);
    expect(stats.pong.wins).toBe(1);
    expect(stats.pong.losses).toBe(1);
    expect(stats.gomoku.draws).toBe(1);
    expect(stats.reversi.played).toBe(0);
  });

  it('tracks the current streak and remembers the best one', () => {
    for (let i = 0; i < 4; i += 1) soloStats.record('reversi', 'win');
    expect(soloStats.read().reversi.streak).toBe(4);

    soloStats.record('reversi', 'loss');
    const after = soloStats.read().reversi;
    expect(after.streak).toBe(0);
    expect(after.bestStreak).toBe(4);
  });

  it('does not let a draw break a winning streak', () => {
    soloStats.record('snake-duel', 'win');
    soloStats.record('snake-duel', 'draw');
    expect(soloStats.read()['snake-duel'].streak).toBe(1);
  });

  it('survives a restart because it persists to localStorage', () => {
    soloStats.record('connect-four', 'win');
    // Simulate a fresh page load reading the same storage.
    expect(soloStats.read()['connect-four'].wins).toBe(1);
    expect(soloStats.read()['connect-four'].lastPlayedAt).toBeTypeOf('number');
  });

  it('recovers from corrupted storage instead of throwing', () => {
    localStorage.setItem('mini-arcade.solo-stats.v1', '{{{not json');
    expect(() => soloStats.read()).not.toThrow();
    expect(soloStats.totals().played).toBe(0);
  });

  it('ignores unknown games left over from an older payload', () => {
    localStorage.setItem(
      'mini-arcade.solo-stats.v1',
      JSON.stringify({ 'retired-game': { played: 9 }, pong: { played: 2, wins: 2 } }),
    );
    const stats = soloStats.read();
    expect(stats.pong.played).toBe(2);
    expect(Object.keys(stats)).not.toContain('retired-game');
  });

  it('aggregates totals across every cabinet', () => {
    soloStats.record('pong', 'win');
    soloStats.record('gomoku', 'win');
    soloStats.record('gomoku', 'win');
    soloStats.record('reversi', 'loss');

    const totals = soloStats.totals();
    expect(totals.played).toBe(4);
    expect(totals.wins).toBe(3);
    expect(totals.losses).toBe(1);
    expect(totals.bestStreak).toBe(2);
  });

  it('clears on request', () => {
    soloStats.record('pong', 'win');
    soloStats.clear();
    expect(soloStats.totals().played).toBe(0);
  });
});
