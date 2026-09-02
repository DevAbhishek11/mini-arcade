import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import type * as ApiTypes from '@/lib/api';

type ApiModule = typeof ApiTypes;

const guestPlayer = {
  id: 'p1',
  nickname: 'test_player',
  avatar: 'aurora',
  rating: 1200,
  wins: 0,
  losses: 0,
  draws: 0,
  createdAt: new Date().toISOString(),
  isGuest: true,
};

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<ApiModule>('@/lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      me: vi.fn().mockResolvedValue({ player: guestPlayer }),
      createGuest: vi.fn().mockResolvedValue({ token: 't', expiresIn: 60, player: guestPlayer }),
      stats: vi.fn().mockResolvedValue({ playersOnline: 12, matchesToday: 40, matchesLive: 3, players: 99 }),
      games: vi.fn().mockResolvedValue({ items: [] }),
      progress: vi.fn().mockRejectedValue(new Error('offline')),
      progressCatalog: vi.fn().mockResolvedValue({ achievements: [], quests: [] }),
      leaderboard: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 }),
    },
  };
});

vi.mock('@/lib/socket', () => ({
  connectSocket: () => ({ on: vi.fn(), io: { on: vi.fn() }, connected: false, emit: vi.fn() }),
  disconnectSocket: vi.fn(),
  getSocket: () => ({ on: vi.fn(), connected: false, emit: vi.fn() }),
}));

const { useSession } = await import('@/store/session');
const { default: App } = await import('@/App');

let container: HTMLDivElement;
let root: Root;

/** Mounts the real app at a route and lets effects settle. */
async function mountAt(path: string) {
  await act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(App)));
  });
  await act(async () => {
    await Promise.resolve();
  });
  return container.textContent ?? '';
}

beforeEach(() => {
  localStorage.clear();
  useSession.setState({ player: null, status: 'loading', mode: 'online', connection: 'idle', error: null });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('app shell renders real content', () => {
  it('shows the welcome page to a signed out visitor', async () => {
    const text = await mountAt('/');

    // The regression this guards: a blank page instead of the landing content.
    expect(container.innerHTML.length).toBeGreaterThan(1000);
    expect(text).toContain('Create free account');
    expect(text).toContain('Play as guest');
  });

  it('renders the login form', async () => {
    const text = await mountAt('/login');
    expect(text).toContain('Welcome back');
    expect(container.querySelector('#password')).not.toBeNull();
    expect(container.querySelector('#identifier')).not.toBeNull();
  });

  it('renders the signup form with nickname and email fields', async () => {
    const text = await mountAt('/signup');
    expect(text).toContain('Create your account');
    expect(container.querySelector('#nickname')).not.toBeNull();
    expect(container.querySelector('#email')).not.toBeNull();
  });

  it('sends an anonymous visitor from a protected page to the login screen', async () => {
    const text = await mountAt('/play/tic-tac-toe');
    expect(text).toContain('Welcome back');
  });

  it('lets anyone play solo without an account', async () => {
    await mountAt('/solo/tic-tac-toe');
    expect(container.innerHTML.length).toBeGreaterThan(500);
  });

  it('drops a signed-in player straight into the arcade', async () => {
    localStorage.setItem('mini-arcade.token', 'jwt');
    const text = await mountAt('/');

    expect(useSession.getState().status).toBe('ready');
    expect(text).not.toContain('Create free account');
  });

  it('keeps a signed-in player away from the auth pages', async () => {
    localStorage.setItem('mini-arcade.token', 'jwt');
    const text = await mountAt('/login');
    expect(text).not.toContain('Welcome back');
  });
});
