import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Match } from '../src/realtime/match.js';
import { matchRegistry } from '../src/realtime/match-registry.js';
import { initStorage } from '../src/domain/storage/index.js';
import { lifecycle } from '../src/infra/lifecycle.js';

const participant = (id: string, seat: 0 | 1, isBot = false) => ({
  playerId: id,
  nickname: id,
  avatar: 'aurora',
  rating: 1200,
  played: 10,
  seat,
  connected: true,
  isBot,
  nodeId: 'test',
  disconnectedAt: null,
});

beforeAll(async () => {
  await initStorage();
});

afterAll(async () => {
  await lifecycle.shutdown('tests', 2_000);
});

describe('match lifecycle', () => {
  it('validates participants and turn order', () => {
    const match = new Match('tic-tac-toe', [participant('a', 0), participant('b', 1)]);
    expect(match.applyAction('c', { type: 'place', index: 0 })).toEqual({
      ok: false,
      error: 'NOT_A_PARTICIPANT',
    });
    expect(match.applyAction('b', { type: 'place', index: 0 }).ok).toBe(false);
    expect(match.applyAction('a', { type: 'place', index: 0 }).ok).toBe(true);
  });

  it('produces symmetric rating deltas and a summary', async () => {
    const match = new Match('tic-tac-toe', [participant('a', 0), participant('b', 1)]);
    const summary = await match.finish('victory', 0);
    expect(summary.ratingDelta.a).toBeGreaterThan(0);
    expect(summary.ratingDelta.a + summary.ratingDelta.b).toBe(0);
    // finishing twice is a no-op
    expect(await match.finish('victory', 0)).toBe(summary);
  });

  it('does not award rating for aborted matches', async () => {
    const match = new Match('pong', [participant('a', 0), participant('bot:x', 1, true)]);
    const summary = await match.finish('aborted', null);
    expect(summary.ratingDelta.a).toBe(0);
  });

  it('registers and tears down matches', async () => {
    const match = new Match('connect-four', [participant('a', 0), participant('b', 1)]);
    matchRegistry.add(match);
    expect(matchRegistry.hosts(match.id)).toBe(true);
    expect(matchRegistry.findByPlayer('b')?.id).toBe(match.id);
    await matchRegistry.endMatch(match.id, 'forfeit', 1);
    expect(matchRegistry.hosts(match.id)).toBe(false);
  });
});
