import { create } from 'zustand';
import type { PlayerPublic } from '@mini-arcade/shared';
import { ApiRequestError, api, tokenStore } from '@/lib/api';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';

export type ConnectionState = 'idle' | 'connecting' | 'online' | 'offline';

interface SessionState {
  player: PlayerPublic | null;
  status: 'loading' | 'ready' | 'error';
  connection: ConnectionState;
  workerId: number | null;
  latencyMs: number | null;
  error: string | null;
  bootstrap: () => Promise<void>;
  signIn: (nickname?: string) => Promise<void>;
  rename: (nickname: string) => Promise<void>;
  signOut: () => void;
  setPlayer: (player: PlayerPublic) => void;
}

export const useSession = create<SessionState>((set, get) => ({
  player: null,
  status: 'loading',
  connection: 'idle',
  workerId: null,
  latencyMs: null,
  error: null,

  async bootstrap() {
    try {
      if (tokenStore.get()) {
        const { player } = await api.me();
        set({ player, status: 'ready', error: null });
      } else {
        const { token, player } = await api.createGuest();
        tokenStore.set(token);
        set({ player, status: 'ready', error: null });
      }
      wireSocket(set, get);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        tokenStore.clear();
        const { token, player } = await api.createGuest();
        tokenStore.set(token);
        set({ player, status: 'ready', error: null });
        wireSocket(set, get);
        return;
      }
      set({ status: 'error', error: (error as Error).message });
    }
  },

  async signIn(nickname) {
    set({ status: 'loading' });
    const { token, player } = await api.createGuest(nickname);
    tokenStore.set(token);
    disconnectSocket();
    set({ player, status: 'ready' });
    wireSocket(set, get);
  },

  async rename(nickname) {
    const { player } = await api.rename(nickname);
    set({ player });
  },

  signOut() {
    tokenStore.clear();
    disconnectSocket();
    set({ player: null, status: 'loading', connection: 'idle' });
    void get().bootstrap();
  },

  setPlayer(player) {
    set({ player });
  },
}));

let wired = false;
let pingTimer: number | null = null;

function wireSocket(set: (partial: Partial<SessionState>) => void, get: () => SessionState): void {
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

  if (pingTimer) window.clearInterval(pingTimer);
  pingTimer = window.setInterval(() => {
    if (getSocket().connected) getSocket().emit('ping', { clientTime: Date.now() });
  }, 5_000);

  void get;
}
