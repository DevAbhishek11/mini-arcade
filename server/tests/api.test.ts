import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GAME_IDS } from '@mini-arcade/shared';
import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
  const { initStorage } = await import('../src/domain/storage/index.js');
  await initStorage();
  const { createApp } = await import('../src/http/app.js');
  app = createApp();
});

afterAll(async () => {
  const { lifecycle } = await import('../src/infra/lifecycle.js');
  await lifecycle.shutdown('tests', 2_000);
});

describe('system routes', () => {
  it('reports liveness and health', async () => {
    await request(app).get('/api/system/live').expect(200);
    const health = await request(app).get('/api/system').expect(200);
    expect(health.body.status).toBe('ok');
    expect(health.body.checks.storage.status).toBe('up');
  });

  it('exposes prometheus metrics', async () => {
    const response = await request(app).get('/metrics').expect(200);
    expect(response.text).toContain('arcade_http_requests_total');
  });

  it('returns a request id on every response', async () => {
    const response = await request(app).get('/api/games').expect(200);
    expect(response.headers['x-request-id']).toBeTruthy();
  });
});

describe('game catalog', () => {
  it('lists every cabinet', async () => {
    const response = await request(app).get('/api/games').expect(200);
    expect(response.body.items.map((g: { id: string }) => g.id)).toEqual([...GAME_IDS]);
  });

  it('serves the catalog from a strong etag, answering repeat visits with 304', async () => {
    const first = await request(app).get('/api/games').expect(200);
    const etag = first.headers.etag;

    expect(etag).toMatch(/^"/);
    expect(first.headers['cache-control']).toContain('max-age=300');

    const revalidated = await request(app).get('/api/games').set('if-none-match', etag).expect(304);
    expect(revalidated.text).toBe('');

    // A weak tag from an intermediary proxy still counts as a match.
    await request(app).get('/api/games').set('if-none-match', `W/${etag}`).expect(304);
    await request(app).get('/api/games').set('if-none-match', '"stale"').expect(200);
  });

  it('describes how to play every cabinet', async () => {
    const response = await request(app).get('/api/games').expect(200);
    for (const game of response.body.items as { howTo: string[]; averageMinutes: number }[]) {
      expect(game.howTo.length).toBeGreaterThan(1);
      expect(game.averageMinutes).toBeGreaterThan(0);
    }
  });
});

describe('progression api', () => {
  it('serves the achievement and quest catalog without auth', async () => {
    const response = await request(app).get('/api/progress/catalog').expect(200);
    expect(response.body.achievements.length).toBe(12);
    expect(response.body.quests.length).toBeGreaterThan(2);
  });

  it('returns a fresh progress profile for a new guest', async () => {
    const created = await request(app).post('/api/auth/guest').send({}).expect(201);
    const response = await request(app)
      .get('/api/progress/me')
      .set('authorization', `Bearer ${created.body.token}`)
      .expect(200);

    expect(response.body.progress.xp).toBe(0);
    expect(response.body.progress.level.level).toBe(1);
    expect(response.body.progress.quests).toHaveLength(3);
  });

  it('rejects an unauthenticated progress lookup', async () => {
    await request(app).get('/api/progress/me').expect(401);
  });
});

describe('auth + players', () => {
  it('creates a guest and resolves the session', async () => {
    const created = await request(app).post('/api/auth/guest').send({}).expect(201);
    expect(created.body.token).toBeTruthy();
    expect(created.body.player.rating).toBe(1200);

    const me = await request(app)
      .get('/api/auth/me')
      .set('authorization', `Bearer ${created.body.token}`)
      .expect(200);
    expect(me.body.player.id).toBe(created.body.player.id);
  });

  it('rejects an invalid nickname and a duplicate nickname', async () => {
    await request(app).post('/api/auth/guest').send({ nickname: 'a' }).expect(400);
    await request(app).post('/api/auth/guest').send({ nickname: 'Duplicate1' }).expect(201);
    const conflict = await request(app).post('/api/auth/guest').send({ nickname: 'Duplicate1' }).expect(409);
    expect(conflict.body.error.code).toBe('NICKNAME_TAKEN');
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/auth/me').expect(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('renames a player', async () => {
    const created = await request(app).post('/api/auth/guest').send({}).expect(201);
    const renamed = await request(app)
      .patch('/api/players/me')
      .set('authorization', `Bearer ${created.body.token}`)
      .send({ nickname: 'Renamed_42' })
      .expect(200);
    expect(renamed.body.player.nickname).toBe('Renamed_42');
  });
});

describe('leaderboard', () => {
  it('validates query parameters', async () => {
    const response = await request(app).get('/api/leaderboard?game=chess').expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    await request(app).get('/api/leaderboard?limit=9999').expect(400);
  });

  it('paginates', async () => {
    const response = await request(app).get('/api/leaderboard?game=all&limit=5&offset=0').expect(200);
    expect(response.body).toMatchObject({ limit: 5, offset: 0 });
    expect(Array.isArray(response.body.items)).toBe(true);
  });
});

describe('errors', () => {
  it('returns a structured 404', async () => {
    const response = await request(app).get('/api/nope').expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.requestId).toBeTruthy();
  });
});
