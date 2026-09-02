import { create } from 'zustand';
import {
  ACHIEVEMENTS,
  type ArcadeStats,
  type BotDifficultyId,
  type ChatMessage,
  type Emote,
  type EmotePayload,
  type GameId,
  type MatchOverPayload,
  type MatchSnapshot,
  type PlayerProgress,
  type QueueStatusPayload,
  type RoomInfo,
} from '@mini-arcade/shared';
import { emitWithAck, getSocket } from '@/lib/socket';
import { sound } from '@/lib/sound';
import { toast } from '@/store/toast';

export type ArcadePhase = 'idle' | 'queued' | 'room' | 'playing' | 'over';

export interface FloatingEmote extends EmotePayload {
  key: string;
}

interface ArcadeState {
  phase: ArcadePhase;
  gameId: GameId | null;
  queue: QueueStatusPayload | null;
  queuedSince: number | null;
  snapshot: MatchSnapshot | null;
  result: MatchOverPayload | null;
  chat: ChatMessage[];
  emotes: FloatingEmote[];
  room: RoomInfo | null;
  stats: ArcadeStats | null;
  progress: PlayerProgress | null;
  rematchOffer: { matchId: string; fromNickname: string } | null;
  rematchRequested: boolean;
  listening: boolean;

  listen: () => void;
  joinQueue: (gameId: GameId) => Promise<void>;
  leaveQueue: () => Promise<void>;
  startPractice: (gameId: GameId, difficulty: BotDifficultyId) => Promise<boolean>;
  createRoom: (gameId: GameId) => Promise<string | null>;
  joinRoom: (code: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  startRoomMatch: () => Promise<void>;
  sendAction: (action: unknown) => Promise<void>;
  sendEmote: (emote: Emote) => Promise<void>;
  forfeit: () => Promise<void>;
  requestRematch: () => Promise<void>;
  sendChat: (body: string) => Promise<void>;
  dismissResult: () => void;
  reset: () => void;
}

const ROOM_ERRORS: Record<string, string> = {
  ROOM_NOT_FOUND: 'No room with that code',
  ROOM_FULL: 'That room is already full',
  ROOM_IN_PROGRESS: 'That match has already started',
  NOT_HOST: 'Only the host can start the match',
  NEED_TWO_PLAYERS: 'Waiting for a second player',
  NOT_READY: 'Everyone needs to be ready first',
  SERVER_BUSY: 'The arcade is at capacity, try again shortly',
  ALREADY_IN_MATCH: 'Finish your current match first',
  RATE_LIMITED: 'Slow down a moment',
};

const describe = (code?: string) =>
  code ? (ROOM_ERRORS[code] ?? code.replaceAll('_', ' ').toLowerCase()) : 'Something went wrong';

export const useArcade = create<ArcadeState>((set, get) => ({
  phase: 'idle',
  gameId: null,
  queue: null,
  queuedSince: null,
  snapshot: null,
  result: null,
  chat: [],
  emotes: [],
  room: null,
  stats: null,
  progress: null,
  rematchOffer: null,
  rematchRequested: false,
  listening: false,

  listen() {
    if (get().listening) return;
    const socket = getSocket();
    set({ listening: true });

    socket.on('queue:status', (queue) => set({ phase: 'queued', queue, gameId: queue.gameId }));
    socket.on('queue:left', () => set({ phase: 'idle', queue: null, queuedSince: null }));

    socket.on('match:found', (snapshot) => {
      sound.play('notify');
      set({
        phase: 'playing',
        snapshot,
        gameId: snapshot.gameId,
        queue: null,
        result: null,
        chat: [],
        emotes: [],
        rematchOffer: null,
        rematchRequested: false,
      });
    });

    socket.on('match:state', (snapshot) => {
      const current = get().snapshot;
      // Drop out of order packets from the realtime stream.
      if (current && current.matchId === snapshot.matchId && snapshot.sequence < current.sequence) return;
      if (current && current.activeSeat !== snapshot.activeSeat && snapshot.activeSeat === snapshot.seat) {
        sound.play('move');
      }
      set({ snapshot, phase: 'playing' });
    });

    socket.on('match:presence', ({ matchId, players }) => {
      const snapshot = get().snapshot;
      if (!snapshot || snapshot.matchId !== matchId) return;
      set({ snapshot: { ...snapshot, players } });
    });

    socket.on('match:over', (result) => {
      const seat = get().snapshot?.seat ?? 0;
      if (result.reason === 'aborted') sound.play('error');
      else if (result.winnerSeat === null) sound.play('draw');
      else sound.play(result.winnerSeat === seat ? 'win' : 'lose');

      if (result.progress) {
        const { xpGained, unlocked, questsCompleted, leveledUp, levelAfter } = result.progress;
        if (leveledUp) {
          sound.play('levelup');
          toast.reward(`Level ${levelAfter}!`, 'Your arcade rank just went up.', '🎉');
        }
        for (const achievement of unlocked) {
          toast.reward(
            `Achievement: ${ACHIEVEMENTS[achievement.id]?.name ?? achievement.name}`,
            achievement.description,
            achievement.icon,
          );
        }
        for (const quest of questsCompleted) {
          toast.reward(`Quest complete: ${quest.name}`, `+${quest.xp} XP`, quest.icon);
        }
        if (xpGained > 0 && !leveledUp && unlocked.length === 0 && questsCompleted.length === 0) {
          toast.success(`+${xpGained} XP`, 'Keep the streak going.');
        }
      }

      set({ phase: 'over', result, rematchRequested: false });
    });

    socket.on('match:chat', (message) => set({ chat: [...get().chat.slice(-40), message] }));

    socket.on('match:emote', (payload) => {
      sound.play('emote');
      const entry: FloatingEmote = {
        ...payload,
        key: `${payload.at}-${Math.random().toString(36).slice(2, 6)}`,
      };
      set({ emotes: [...get().emotes.slice(-8), entry] });
      window.setTimeout(() => set({ emotes: get().emotes.filter((item) => item.key !== entry.key) }), 2600);
    });

    socket.on('match:rematch:offer', (offer) => {
      sound.play('notify');
      toast.info(`${offer.fromNickname} wants a rematch`, 'Accept from the result screen.');
      set({ rematchOffer: offer });
    });

    socket.on('room:update', (room) => {
      set({ room, gameId: room.gameId, phase: room.status === 'playing' ? get().phase : 'room' });
    });

    socket.on('room:closed', ({ reason }) => {
      if (get().room) toast.warning('Room closed', describe(reason));
      set({ room: null, phase: get().phase === 'room' ? 'idle' : get().phase });
    });

    socket.on('progress:update', ({ progress }) => set({ progress }));
    socket.on('stats:update', (stats) => set({ stats }));
    socket.on('error:notice', (notice) => {
      if (notice.code === 'SERVER_RESTARTING')
        toast.warning('Server restarting', 'Reconnecting automatically…');
    });
  },

  async joinQueue(gameId) {
    sound.play('queue');
    set({ phase: 'queued', gameId, queuedSince: Date.now(), result: null });
    const ack = await emitWithAck('queue:join', { gameId });
    if (!ack.ok) {
      set({ phase: 'idle' });
      toast.error('Could not join the queue', describe(ack.code));
    }
  },

  async leaveQueue() {
    const gameId = get().gameId;
    if (!gameId) return;
    await emitWithAck('queue:leave', { gameId });
    set({ phase: 'idle', queue: null, queuedSince: null });
  },

  async startPractice(gameId, difficulty) {
    sound.play('click');
    const ack = await emitWithAck('practice:start', { gameId, difficulty });
    if (!ack.ok) {
      toast.error('Could not start practice', describe(ack.code));
      return false;
    }
    return true;
  },

  async createRoom(gameId) {
    const ack = (await emitWithAck('room:create', { gameId })) as { ok: boolean; code?: string };
    if (!ack.ok) {
      toast.error('Could not create a room', describe(ack.code));
      return null;
    }
    set({ phase: 'room', gameId });
    return ack.code ?? null;
  },

  async joinRoom(code) {
    const ack = await emitWithAck('room:join', { code: code.trim().toUpperCase() });
    if (!ack.ok) {
      toast.error('Could not join', describe(ack.code));
      return false;
    }
    sound.play('notify');
    set({ phase: 'room' });
    return true;
  },

  async leaveRoom() {
    const room = get().room;
    if (!room) return;
    await emitWithAck('room:leave', { code: room.code });
    set({ room: null, phase: 'idle' });
  },

  async setReady(ready) {
    const room = get().room;
    if (!room) return;
    await emitWithAck('room:ready', { code: room.code, ready });
  },

  async startRoomMatch() {
    const room = get().room;
    if (!room) return;
    const ack = await emitWithAck('room:start', { code: room.code });
    if (!ack.ok) toast.warning('Not yet', describe(ack.code));
  },

  async sendAction(action) {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    const ack = await emitWithAck('match:action', { matchId: snapshot.matchId, action });
    if (ack.ok) {
      sound.play('place');
      return;
    }
    if (ack.code && !['NOT_YOUR_TURN', 'RATE_LIMITED'].includes(ack.code)) {
      sound.play('error');
    }
  },

  async sendEmote(emote) {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    await emitWithAck('match:emote', { matchId: snapshot.matchId, emote });
  },

  async forfeit() {
    const snapshot = get().snapshot;
    if (!snapshot) return;
    await emitWithAck('match:forfeit', { matchId: snapshot.matchId });
  },

  async requestRematch() {
    const matchId = get().result?.matchId ?? get().snapshot?.matchId;
    if (!matchId) return;
    set({ rematchRequested: true });
    const ack = await emitWithAck('match:rematch', { matchId });
    if (!ack.ok) {
      set({ rematchRequested: false });
      toast.warning('Rematch unavailable', describe(ack.code));
      return;
    }
    if (ack.code === 'WAITING_FOR_OPPONENT') toast.info('Rematch requested', 'Waiting for your opponent…');
  },

  async sendChat(body) {
    const snapshot = get().snapshot;
    if (!snapshot || !body.trim()) return;
    await emitWithAck('match:chat', { matchId: snapshot.matchId, body });
  },

  dismissResult() {
    set({ phase: get().room ? 'room' : 'idle', result: null, snapshot: null, chat: [], emotes: [] });
  },

  reset() {
    set({ phase: 'idle', snapshot: null, result: null, queue: null, chat: [], emotes: [] });
  },
}));
