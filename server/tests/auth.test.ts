import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { describePasswordProblem, hashPassword, verifyPassword } from '../src/utils/password.js';

let app: Express;

// This suite hammers the auth endpoints far harder than a real client would,
// and the shared limiter counts every call from the same address.
process.env.RATE_LIMIT_AUTH_MAX = '500';

beforeAll(async () => {
  const { initStorage } = await import('../src/domain/storage/index.js');
  await initStorage();
  const { createApp } = await import('../src/http/app.js');
  app = createApp();
});

/** Unique per run so repeated local runs never collide in a shared store. */
const unique = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`;

describe('password hashing', () => {
  it('produces a self describing, salted hash', async () => {
    const hash = await hashPassword('correct horse battery');
    const [format, N, r, p, salt, digest] = hash.split('$');

    expect(format).toBe('scrypt');
    expect(Number(N)).toBeGreaterThanOrEqual(16_384);
    expect([r, p]).toEqual(['8', '1']);
    expect(Buffer.from(salt as string, 'base64')).toHaveLength(16);
    expect(Buffer.from(digest as string, 'base64')).toHaveLength(64);
  });

  it('salts every hash, so identical passwords differ on disk', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password1'), hashPassword('same-password1')]);
    expect(a).not.toBe(b);
    await expect(verifyPassword('same-password1', a)).resolves.toBe(true);
    await expect(verifyPassword('same-password1', b)).resolves.toBe(true);
  });

  it('rejects the wrong password and never throws on junk input', async () => {
    const hash = await hashPassword('right-password1');
    await expect(verifyPassword('wrong-password1', hash)).resolves.toBe(false);
    await expect(verifyPassword('anything', null)).resolves.toBe(false);
    await expect(verifyPassword('anything', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'scrypt$x$y$z$aa$bb')).resolves.toBe(false);
  });

  it('states why a weak password was refused', () => {
    expect(describePasswordProblem('short1')).toMatch(/8 characters/);
    expect(describePasswordProblem('alllettersonly')).toMatch(/number/);
    expect(describePasswordProblem('12345678')).toMatch(/letter/);
    expect(describePasswordProblem('goodpass1')).toBeNull();
  });
});

describe('POST /api/auth/register', () => {
  it('creates an account and returns a usable token', async () => {
    const nickname = unique('player_');
    const response = await request(app)
      .post('/api/auth/register')
      .send({ nickname, email: `${nickname}@example.com`, password: 'arcade2026' })
      .expect(201);

    expect(response.body.player).toMatchObject({ nickname, isGuest: false, rating: 1200 });
    expect(response.body.token).toBeTypeOf('string');

    const me = await request(app)
      .get('/api/auth/me')
      .set('authorization', `Bearer ${response.body.token}`)
      .expect(200);
    expect(me.body.player.id).toBe(response.body.player.id);
  });

  it('never reveals the password hash', async () => {
    const nickname = unique('opaque_');
    const response = await request(app)
      .post('/api/auth/register')
      .send({ nickname, email: `${nickname}@example.com`, password: 'arcade2026' })
      .expect(201);

    expect(JSON.stringify(response.body)).not.toMatch(/scrypt|password/i);
  });

  it('rejects a duplicate nickname and a duplicate email', async () => {
    const nickname = unique('dupe_');
    const email = `${nickname}@example.com`;
    await request(app).post('/api/auth/register').send({ nickname, email, password: 'arcade2026' }).expect(201);

    const sameNickname = await request(app)
      .post('/api/auth/register')
      .send({ nickname, email: `other-${email}`, password: 'arcade2026' })
      .expect(409);
    expect(sameNickname.body.error.code).toBe('NICKNAME_TAKEN');

    const sameEmail = await request(app)
      .post('/api/auth/register')
      .send({ nickname: unique('other_'), email, password: 'arcade2026' })
      .expect(409);
    expect(sameEmail.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates the payload', async () => {
    await request(app).post('/api/auth/register').send({}).expect(400);
    await request(app)
      .post('/api/auth/register')
      .send({ nickname: 'ok_name', email: 'not-an-email', password: 'arcade2026' })
      .expect(400);
    await request(app)
      .post('/api/auth/register')
      .send({ nickname: 'ok_name', email: 'a@b.co', password: 'short' })
      .expect(400);
  });
});

describe('POST /api/auth/login', () => {
  it('accepts either the email or the nickname', async () => {
    const nickname = unique('login_');
    const email = `${nickname}@example.com`;
    await request(app).post('/api/auth/register').send({ nickname, email, password: 'arcade2026' }).expect(201);

    const byEmail = await request(app)
      .post('/api/auth/login')
      .send({ identifier: email, password: 'arcade2026' })
      .expect(200);
    const byNickname = await request(app)
      .post('/api/auth/login')
      .send({ identifier: nickname, password: 'arcade2026' })
      .expect(200);

    expect(byEmail.body.player.id).toBe(byNickname.body.player.id);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const nickname = unique('secure_');
    await request(app)
      .post('/api/auth/register')
      .send({ nickname, email: `${nickname}@example.com`, password: 'arcade2026' })
      .expect(201);

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ identifier: nickname, password: 'not-the-password' })
      .expect(401);
    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ identifier: unique('ghost_'), password: 'arcade2026' })
      .expect(401);

    // Identical responses: the endpoint cannot be used to enumerate accounts.
    expect(wrongPassword.body.error.message).toBe(unknownUser.body.error.message);
  });

  it('refuses to log in a guest, which has no password at all', async () => {
    const guest = await request(app).post('/api/auth/guest').send({}).expect(201);
    await request(app)
      .post('/api/auth/login')
      .send({ identifier: guest.body.player.nickname, password: 'anything1' })
      .expect(401);
  });
});

describe('POST /api/auth/upgrade', () => {
  it('turns a guest into an account without losing its identity', async () => {
    const guest = await request(app).post('/api/auth/guest').send({}).expect(201);
    const nickname = unique('kept_');

    const upgraded = await request(app)
      .post('/api/auth/upgrade')
      .set('authorization', `Bearer ${guest.body.token}`)
      .send({ nickname, email: `${nickname}@example.com`, password: 'arcade2026' })
      .expect(201);

    // Same row: rating, history and progression all carry over.
    expect(upgraded.body.player.id).toBe(guest.body.player.id);
    expect(upgraded.body.player.isGuest).toBe(false);

    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: `${nickname}@example.com`, password: 'arcade2026' })
      .expect(200);
    expect(relogin.body.player.id).toBe(guest.body.player.id);
  });

  it('refuses to upgrade twice', async () => {
    const guest = await request(app).post('/api/auth/guest').send({}).expect(201);
    const nickname = unique('once_');

    await request(app)
      .post('/api/auth/upgrade')
      .set('authorization', `Bearer ${guest.body.token}`)
      .send({ nickname, email: `${nickname}@example.com`, password: 'arcade2026' })
      .expect(201);

    const second = await request(app)
      .post('/api/auth/upgrade')
      .set('authorization', `Bearer ${guest.body.token}`)
      .send({ nickname: unique('again_'), email: `${unique('again_')}@example.com`, password: 'arcade2026' })
      .expect(409);
    expect(second.body.error.code).toBe('ALREADY_REGISTERED');
  });

  it('requires a session', async () => {
    await request(app)
      .post('/api/auth/upgrade')
      .send({ nickname: unique('anon_'), email: 'a@b.co', password: 'arcade2026' })
      .expect(401);
  });
});

describe('guests', () => {
  it('are flagged as guests and can still play', async () => {
    const response = await request(app).post('/api/auth/guest').send({}).expect(201);
    expect(response.body.player.isGuest).toBe(true);
  });
});
