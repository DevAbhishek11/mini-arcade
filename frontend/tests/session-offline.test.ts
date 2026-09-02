import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiTypes from '@/lib/api';

const createGuest = vi.fn();
const me = vi.fn();

type ApiModule = typeof ApiTypes;

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<ApiModule>('@/lib/api');
  return {
    ...actual,
    api: { ...actual.api, createGuest, me },
  };
});

vi.mock('@/lib/socket', () => ({
  connectSocket: () => ({ on: vi.fn(), io: { on: vi.fn() }, connected: false, emit: vi.fn() }),
  disconnectSocket: vi.fn(),
  getSocket: () => ({ on: vi.fn(), connected: false, emit: vi.fn() }),
}));

const { ApiRequestError } = await import('@/lib/api');
const { useSession } = await import('@/store/session');

const reset = () => {
  localStorage.clear();
  useSession.setState({ player: null, status: 'loading', mode: 'online', connection: 'idle', error: null });
};

describe('session bootstrap', () => {
  beforeEach(() => {
    reset();
    createGuest.mockReset();
    me.mockReset();
  });

  it('creates a guest and comes up online', async () => {
    createGuest.mockResolvedValue({
      token: 'jwt',
      expiresIn: 3600,
      player: { id: 'p1', nickname: 'Guest', rating: 1200 },
    });

    await useSession.getState().bootstrap();

    const state = useSession.getState();
    expect(state.status).toBe('ready');
    expect(state.mode).toBe('online');
    expect(state.player?.nickname).toBe('Guest');
  });

  it('still boots — in offline mode — when the API cannot be reached', async () => {
    createGuest.mockRejectedValue(new ApiRequestError(0, 'NETWORK', 'Cannot reach the arcade server'));

    await useSession.getState().bootstrap();

    const state = useSession.getState();
    // Critical: the app must render so offline solo play stays reachable.
    expect(state.status).toBe('ready');
    expect(state.mode).toBe('offline');
    expect(state.player).toBeNull();
  });

  it('treats a timeout as offline rather than a hard error', async () => {
    createGuest.mockRejectedValue(new ApiRequestError(408, 'TIMEOUT', 'The server took too long to respond'));

    await useSession.getState().bootstrap();
    expect(useSession.getState().status).toBe('ready');
    expect(useSession.getState().mode).toBe('offline');
  });

  it('re-issues a guest token when the stored one is rejected', async () => {
    localStorage.setItem('mini-arcade.token', 'stale');
    me.mockRejectedValue(new ApiRequestError(401, 'UNAUTHORIZED', 'nope'));
    createGuest.mockResolvedValue({
      token: 'fresh',
      expiresIn: 3600,
      player: { id: 'p2', nickname: 'Rebooted', rating: 1200 },
    });

    await useSession.getState().bootstrap();

    expect(createGuest).toHaveBeenCalled();
    expect(useSession.getState().player?.nickname).toBe('Rebooted');
    expect(localStorage.getItem('mini-arcade.token')).toBe('fresh');
  });

  it('surfaces a real server error as an error state', async () => {
    createGuest.mockRejectedValue(new ApiRequestError(500, 'INTERNAL', 'boom'));

    await useSession.getState().bootstrap();
    expect(useSession.getState().status).toBe('error');
  });
});
