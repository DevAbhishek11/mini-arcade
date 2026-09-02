import { create } from 'zustand';
import type {
  ArcadeStats,
  ChatMessage,
  GameId,
  MatchOverPayload,
  MatchSnapshot,
  QueueStatusPayload,
} from '@mini-arcade/shared';
import { emitWithAck, getSocket } from '@/lib/socket';

export type ArcadePhase = 'idle' | 'queued' | 'playing' | 'over';

interface ArcadeState {
  phase: ArcadePhase;
  gameId: GameId | null;
  queue: QueueStatusPayload | null;
  queuedSince: number | null;
  snapshot: MatchSnapshot | null;
  result: MatchOverPayload | null;
  chat: ChatMessage[];
  stats: ArcadeStats | null;
  notice: { code: string; message: string } | null;
  listening: boolean;

  listen: () => void;
  joinQueue: (gameId: GameId) => Promise<void>;
  leaveQueue: () => Promise<void>;
  sendAction: (action: unknown) => Promise<void>;
  forfeit: () => Promise<void>;
  sendChat: (body: string) => Promise<void>;
  dismissResult: () => void;
  clearNotice: () => void;
  /** Optimistic local state update, reconciled by the next server snapshot. */
  predict: (state: unknown) => void;
}

export const useArcade = create<ArcadeState>((set, get) => ({
  phase: 'idle',
  gameId: null,
  queue: null,
  queuedSince: null,
  snapshot: null,
  result: null,
  chat: [],
  stats: null,
  notice: null,
  listening: false,

  listen() {
    if (get().listening) return;
    const socket = getSocket();
    set({ listening: true });

    socket.on('queue:status', (queue) => set({ phase: 'queued', queue, gameId: queue.gameId }));
    socket.on('queue:left', () => set({ phase: 'idle', queue: null, queuedSince: null }));

    socket.on('match:found', (snapshot) =>
      set({ phase: 'playing', snapshot, gameId: snapshot.gameId, queue: null, result: null, chat: [] }),
    );

    socket.on('match:state', (snapshot) => {
      const current = get().snapshot;
      // Ignore out of order packets from the realtime stream.
      if (current && current.matchId === snapshot.matchId && snapshot.sequence < current.sequence) return;
      set({ snapshot, phase: 'playing' });
    });

    socket.on('match:presence', ({ matchId, players }) => {
      const snapshot = get().snapshot;
      if (!snapshot || snapshot.matchId !== matchId) return;
      set({ snapshot: { ...snapshot, players } });
    });

    socket.on('match:over', (result) => set({ phase: 'over', result }));
    socket.on('match:chat', (message) => set({ chat: [...get().chat.slice(-40), message] }));
    socket.on('stats:update', (stats) => set({ stats }));
    socket.on('error:notice', (notice) => set({ notice }));
  },

  async joinQueue(gameId) {
    set({ phase: 'queued', gameId, queuedSince: Date.now(), result: null, notice: null });
    const ack = await emitWithAck('queue:join', { gameId });
    if (!ack.ok) {
      set({
        phase: 'idle',
        notice: { code: ack.code ?? 'ERROR', message: ack.message ?? 'Could not join the queue' },
      });
    }
  },

  async leaveQueue() {
    const gameId = get().gameId;
    if (!gameId) return;
    await emitWithAck('queue:leave', { gameId });
    set({ phase: 'idle', queue: null, queuedSince: null });
  },

  async sendAction(action) {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const ack = await emitWithAck('match:action', { matchId: snapshot.matchId, action });
    if (!ack.ok && ack.code && ack.code !== 'NOT_YOUR_TURN') {
      set({ notice: { code: ack.code, message: 'That move was rejected' } });
    }
  },

  async forfeit() {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    await emitWithAck('match:forfeit', { matchId: snapshot.matchId });
  },

  async sendChat(body) {
    const snapshot = get().snapshot;
    if (!snapshot || !body.trim()) return;
    await emitWithAck('match:chat', { matchId: snapshot.matchId, body });
  },

  dismissResult() {
    set({ phase: 'idle', result: null, snapshot: null, queue: null, chat: [] });
  },

  clearNotice() {
    set({ notice: null });
  },

  predict(state) {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    set({ snapshot: { ...snapshot, state, sequence: snapshot.sequence + 0.5 } });
  },
}));
