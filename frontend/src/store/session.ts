import { create } from 'zustand';
import type { PlayerPublic } from '@mini-arcade/shared';
import { ApiRequestError, api, tokenStore } from '@/lib/api';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';

export type ConnectionState = 'idle' | 'connecting' | 'online' | 'offline';

export interface Credentials {
  nickname: string;
  email: string;
  password: string;
}

interface SessionState {
  player: PlayerPublic | null;
  /**
   * `anonymous` is a fully booted app with nobody signed in — the visitor sees
   * the welcome screen and can log in, register or play as a guest.
   */
  status: 'loading' | 'anonymous' | 'ready' | 'error';
  /** `offline` means the API was unreachable — solo play still works. */
  mode: 'online' | 'offline';
  connection: ConnectionState;
  workerId: number | null;
  latencyMs: number | null;
  error: string | null;
  bootstrap: () => Promise<void>;
  /** Creates a throwaway identity that can play immediately. */
  playAsGuest: (nickname?: string) => Promise<void>;
  logIn: (identifier: string, password: string) => Promise<void>;
  register: (input: Credentials) => Promise<void>;
  /** Registers while keeping the current guest's rating, history and XP. */
  upgradeGuest: (input: Credentials) => Promise<void>;
  rename: (nickname: string) => Promise<void>;
  signOut: () => void;
  setPlayer: (player: PlayerPublic) => void;
}

const isNetworkFailure = (error: unknown): boolean =>
  error instanceof ApiRequestError &&
  (error.status === 0 || error.code === 'NETWORK' || error.code === 'TIMEOUT');

/** True once somebody — guest or registered — can actually play. */
export const isSignedIn = (state: { status: SessionState['status'] }): boolean => state.status === 'ready';

export const useSession = create<SessionState>((set, get) => ({
  player: null,
  status: 'loading',
  mode: 'online',
  connection: 'idle',
  workerId: null,
  latencyMs: null,
  error: null,

  async bootstrap() {
    // No stored token: stay anonymous and let the visitor choose. We no longer
    // mint a guest automatically, so accounts are a real first-class choice.
    if (!tokenStore.get()) {
      set({ player: null, status: 'anonymous', mode: 'online', error: null });
      return;
    }

    try {
      const { player } = await api.me();
      set({ player, status: 'ready', mode: 'online', error: null });
      wireSocket(set, get);
    } catch (error) {
      // Expired or revoked session — back to the welcome screen.
      if (error instanceof ApiRequestError && error.status === 401) {
        tokenStore.clear();
        set({ player: null, status: 'anonymous', error: null });
        return;
      }

      // No server reachable: boot anyway in offline mode so the installed app
      // still opens straight into solo play, and retry when the network is back.
      if (isNetworkFailure(error) || !navigator.onLine) {
        set({ status: 'ready', mode: 'offline', connection: 'offline', error: (error as Error).message });
        window.addEventListener('online', () => void get().bootstrap(), { once: true });
        return;
      }

      set({ status: 'error', error: (error as Error).message });
    }
  },

  async playAsGuest(nickname) {
    const { token, player } = await api.createGuest(nickname);
    adoptSession(set, get, token, player);
  },

  async logIn(identifier, password) {
    const { token, player } = await api.login(identifier, password);
    adoptSession(set, get, token, player);
  },

  async register(input) {
    const { token, player } = await api.register(input);
    adoptSession(set, get, token, player);
  },

  async upgradeGuest(input) {
    const { token, player } = await api.upgradeAccount(input);
    tokenStore.set(token);
    set({ player, status: 'ready', mode: 'online', error: null });
  },

  async rename(nickname) {
    const { player } = await api.rename(nickname);
    set({ player });
  },

  signOut() {
    tokenStore.clear();
    disconnectSocket();
    resetSocketWiring();
    set({ player: null, status: 'anonymous', connection: 'idle', workerId: null, latencyMs: null });
  },

  setPlayer(player) {
    set({ player });
  },
}));

type SetState = (partial: Partial<SessionState>) => void;
type GetState = () => SessionState;

/** Shared tail of every sign-in path: store the token, connect, go. */
function adoptSession(set: SetState, get: GetState, token: string, player: PlayerPublic): void {
  tokenStore.set(token);
  disconnectSocket();
  resetSocketWiring();
  set({ player, status: 'ready', mode: 'online', error: null });
  wireSocket(set, get);
}

let wired = false;
let pingTimer: number | null = null;

function resetSocketWiring(): void {
  wired = false;
  if (pingTimer) {
    window.clearInterval(pingTimer);
    pingTimer = null;
  }
}

function wireSocket(set: SetState, get: GetState): void {
  const socket = connectSocket();
  if (wired) return;
  wired = true;

  set({ connection: 'connecting' });

  socket.on('connect', () => set({ connection: 'online' }));
  socket.on('disconnect', () => set({ connection: 'offline' }));
  socket.io.on('reconnect_attempt', () => set({ connection: 'connecting' }));
  socket.on('connect_error', () => set({ connection: 'offline' }));

  socket.on('session:ready', ({ player, workerId }) => {
    set({ player, workerId, connection: 'online' });
  });

  socket.on('pong', ({ clientTime }) => set({ latencyMs: Date.now() - clientTime }));

  pingTimer = window.setInterval(() => {
    if (getSocket().connected) getSocket().emit('ping', { clientTime: Date.now() });
  }, 5_000);

  void get;
}
