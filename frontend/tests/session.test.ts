import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiTypes from '@/lib/api';

const createGuest = vi.fn();
const me = vi.fn();
const login = vi.fn();
const register = vi.fn();
const upgradeAccount = vi.fn();

type ApiModule = typeof ApiTypes;

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<ApiModule>('@/lib/api');
  return {
    ...actual,
    api: { ...actual.api, createGuest, me, login, register, upgradeAccount },
  };
});

vi.mock('@/lib/socket', () => ({
  connectSocket: () => ({ on: vi.fn(), io: { on: vi.fn() }, connected: false, emit: vi.fn() }),
  disconnectSocket: vi.fn(),
  getSocket: () => ({ on: vi.fn(), connected: false, emit: vi.fn() }),
}));

const { ApiRequestError } = await import('@/lib/api');
const { useSession } = await import('@/store/session');

const player = (over: Partial<ApiTypes.AuthResponse['player']> = {}) => ({
  id: 'p1',
  nickname: 'Guest',
  avatar: 'aurora',
  rating: 1200,
  wins: 0,
  losses: 0,
  draws: 0,
  createdAt: new Date().toISOString(),
  isGuest: true,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  useSession.setState({ player: null, status: 'loading', mode: 'online', connection: 'idle', error: null });
  for (const spy of [createGuest, me, login, register, upgradeAccount]) spy.mockReset();
});

describe('session bootstrap', () => {
  it('stays anonymous when there is no stored token', async () => {
    await useSession.getState().bootstrap();

    const state = useSession.getState();
    expect(state.status).toBe('anonymous');
    expect(state.player).toBeNull();
    // Critically: it must NOT silently mint a guest behind the visitor's back.
    expect(createGuest).not.toHaveBeenCalled();
  });

  it('restores a stored session', async () => {
    localStorage.setItem('mini-arcade.token', 'jwt');
    me.mockResolvedValue({ player: player({ nickname: 'Returning', isGuest: false }) });

    await useSession.getState().bootstrap();

    expect(useSession.getState().status).toBe('ready');
    expect(useSession.getState().player?.nickname).toBe('Returning');
  });

  it('drops an expired token and returns to the welcome screen', async () => {
    localStorage.setItem('mini-arcade.token', 'stale');
    me.mockRejectedValue(new ApiRequestError(401, 'UNAUTHORIZED', 'nope'));

    await useSession.getState().bootstrap();

    expect(useSession.getState().status).toBe('anonymous');
    expect(localStorage.getItem('mini-arcade.token')).toBeNull();
  });

  it('still boots — in offline mode — when the API cannot be reached', async () => {
    localStorage.setItem('mini-arcade.token', 'jwt');
    me.mockRejectedValue(new ApiRequestError(0, 'NETWORK', 'Cannot reach the arcade server'));

    await useSession.getState().bootstrap();

    const state = useSession.getState();
    expect(state.status).toBe('ready');
    expect(state.mode).toBe('offline');
  });

  it('treats a timeout as offline rather than a hard error', async () => {
    localStorage.setItem('mini-arcade.token', 'jwt');
    me.mockRejectedValue(new ApiRequestError(408, 'TIMEOUT', 'too slow'));

    await useSession.getState().bootstrap();
    expect(useSession.getState().mode).toBe('offline');
  });

  it('surfaces a real server error as an error state', async () => {
    localStorage.setItem('mini-arcade.token', 'jwt');
    me.mockRejectedValue(new ApiRequestError(500, 'INTERNAL', 'boom'));

    await useSession.getState().bootstrap();
    expect(useSession.getState().status).toBe('error');
  });
});

describe('signing in', () => {
  it('registers an account and starts playing', async () => {
    register.mockResolvedValue({
      token: 'jwt-account',
      expiresIn: 3600,
      player: player({ nickname: 'neon_fox', isGuest: false }),
    });

    await useSession.getState().register({ nickname: 'neon_fox', email: 'a@b.co', password: 'hunter123' });

    const state = useSession.getState();
    expect(state.status).toBe('ready');
    expect(state.player?.isGuest).toBe(false);
    expect(localStorage.getItem('mini-arcade.token')).toBe('jwt-account');
  });

  it('logs in with either an email or a nickname', async () => {
    login.mockResolvedValue({ token: 'jwt-login', expiresIn: 3600, player: player({ isGuest: false }) });

    await useSession.getState().logIn('a@b.co', 'hunter123');

    expect(login).toHaveBeenCalledWith('a@b.co', 'hunter123');
    expect(useSession.getState().status).toBe('ready');
  });

  it('leaves the session untouched when the credentials are wrong', async () => {
    login.mockRejectedValue(new ApiRequestError(401, 'UNAUTHORIZED', 'Incorrect email/nickname or password'));

    await expect(useSession.getState().logIn('a@b.co', 'nope')).rejects.toThrow(/Incorrect/);
    expect(useSession.getState().player).toBeNull();
    expect(localStorage.getItem('mini-arcade.token')).toBeNull();
  });

  it('starts a guest session on demand', async () => {
    createGuest.mockResolvedValue({ token: 'jwt-guest', expiresIn: 3600, player: player() });

    await useSession.getState().playAsGuest();

    expect(useSession.getState().status).toBe('ready');
    expect(useSession.getState().player?.isGuest).toBe(true);
  });

  it('upgrades a guest in place, keeping the same player id', async () => {
    createGuest.mockResolvedValue({ token: 'jwt-guest', expiresIn: 3600, player: player({ id: 'keep-me' }) });
    await useSession.getState().playAsGuest();

    upgradeAccount.mockResolvedValue({
      token: 'jwt-upgraded',
      expiresIn: 3600,
      player: player({ id: 'keep-me', nickname: 'upgraded', isGuest: false }),
    });
    await useSession.getState().upgradeGuest({ nickname: 'upgraded', email: 'a@b.co', password: 'hunter123' });

    const state = useSession.getState();
    expect(state.player?.id).toBe('keep-me');
    expect(state.player?.isGuest).toBe(false);
    expect(localStorage.getItem('mini-arcade.token')).toBe('jwt-upgraded');
  });

  it('clears everything on sign out', async () => {
    createGuest.mockResolvedValue({ token: 'jwt-guest', expiresIn: 3600, player: player() });
    await useSession.getState().playAsGuest();

    useSession.getState().signOut();

    const state = useSession.getState();
    expect(state.status).toBe('anonymous');
    expect(state.player).toBeNull();
    expect(localStorage.getItem('mini-arcade.token')).toBeNull();
  });
});
