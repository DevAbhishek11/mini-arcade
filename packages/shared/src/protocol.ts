import type {
  ArcadeStats,
  GameId,
  MatchEndReason,
  MatchStatus,
  PlayerPublic,
  PlayerSlot,
  Seat,
} from './index.js';
import type { PlayerProgress, ProgressDelta } from './progression.js';

export const SOCKET_PATH = '/realtime';

export interface MatchSnapshot {
  matchId: string;
  gameId: GameId;
  status: MatchStatus;
  seat: Seat;
  players: PlayerSlot[];
  state: unknown;
  activeSeat: Seat | null;
  /** Epoch ms at which the active seat forfeits their turn, when applicable. */
  turnDeadline: number | null;
  /** Server clock at emit time, used by the client to align timers. */
  serverTime: number;
  sequence: number;
}

export interface MatchOverPayload {
  matchId: string;
  winnerSeat: Seat | null;
  reason: MatchEndReason;
  ratingDelta: Record<string, number>;
  players: PlayerPublic[];
  state: unknown;
  /** Progression earned by the requesting player, when they were a participant. */
  progress?: ProgressDelta;
  rematchAvailable: boolean;
}

export type BotDifficultyId = 'chill' | 'sharp' | 'brutal';

/** Player-facing description of each bot difficulty. */
export const BOT_DIFFICULTY_LABELS: Record<BotDifficultyId, string> = {
  chill: 'Relaxed and a little sloppy — great for learning.',
  sharp: 'Solid tactics and no free wins.',
  brutal: 'Deep search, punishes every mistake.',
};

export interface RoomMember {
  playerId: string;
  nickname: string;
  avatar: string;
  rating: number;
  level: number;
  isHost: boolean;
  ready: boolean;
}

export interface RoomInfo {
  code: string;
  gameId: GameId;
  hostId: string;
  members: RoomMember[];
  spectators: number;
  status: 'lobby' | 'playing';
  createdAt: number;
}

export const EMOTES = ['👏', '😂', '😮', '🔥', '😭', '🤝', '🧠', '🍀'] as const;
export type Emote = (typeof EMOTES)[number];

export interface EmotePayload {
  matchId: string;
  playerId: string;
  seat: Seat;
  emote: Emote;
  at: number;
}

export interface QueueStatusPayload {
  gameId: GameId;
  position: number;
  size: number;
  estimatedWaitMs: number;
}

export interface ChatMessage {
  id: string;
  matchId: string;
  playerId: string;
  nickname: string;
  body: string;
  sentAt: number;
}

/** server -> client */
export interface ServerToClientEvents {
  'session:ready': (payload: { player: PlayerPublic; workerId: number }) => void;
  'queue:status': (payload: QueueStatusPayload) => void;
  'queue:left': (payload: { gameId: GameId }) => void;
  'match:found': (snapshot: MatchSnapshot) => void;
  'match:state': (snapshot: MatchSnapshot) => void;
  'match:patch': (payload: { matchId: string; sequence: number; state: unknown; serverTime: number }) => void;
  'match:presence': (payload: { matchId: string; players: PlayerSlot[] }) => void;
  'match:over': (payload: MatchOverPayload) => void;
  'match:chat': (message: ChatMessage) => void;
  'stats:update': (stats: ArcadeStats) => void;
  'room:update': (room: RoomInfo) => void;
  'room:closed': (payload: { code: string; reason: string }) => void;
  'match:emote': (payload: EmotePayload) => void;
  'match:rematch:offer': (payload: { matchId: string; fromNickname: string }) => void;
  'progress:update': (payload: { progress: PlayerProgress; delta?: ProgressDelta }) => void;
  'error:notice': (payload: { code: string; message: string }) => void;
  pong: (payload: { clientTime: number; serverTime: number }) => void;
}

/** client -> server */
export interface ClientToServerEvents {
  'queue:join': (payload: { gameId: GameId }, ack?: (res: AckResult) => void) => void;
  'queue:leave': (payload: { gameId: GameId }, ack?: (res: AckResult) => void) => void;
  'match:action': (
    payload: { matchId: string; action: unknown; clientSequence?: number },
    ack?: (res: AckResult) => void,
  ) => void;
  'match:resume': (payload: { matchId: string }, ack?: (res: AckResult) => void) => void;
  'match:forfeit': (payload: { matchId: string }, ack?: (res: AckResult) => void) => void;
  'match:chat': (payload: { matchId: string; body: string }, ack?: (res: AckResult) => void) => void;
  'match:emote': (payload: { matchId: string; emote: Emote }, ack?: (res: AckResult) => void) => void;
  'match:rematch': (payload: { matchId: string }, ack?: (res: AckResult) => void) => void;
  'practice:start': (
    payload: { gameId: GameId; difficulty: BotDifficultyId },
    ack?: (res: AckResult) => void,
  ) => void;
  'room:create': (payload: { gameId: GameId }, ack?: (res: AckResult & { code?: string }) => void) => void;
  'room:join': (payload: { code: string }, ack?: (res: AckResult) => void) => void;
  'room:leave': (payload: { code: string }, ack?: (res: AckResult) => void) => void;
  'room:ready': (payload: { code: string; ready: boolean }, ack?: (res: AckResult) => void) => void;
  'room:start': (payload: { code: string }, ack?: (res: AckResult) => void) => void;
  'progress:get': (payload: Record<string, never>, ack?: (res: AckResult) => void) => void;
  ping: (payload: { clientTime: number }) => void;
}

export interface AckResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export interface SocketData {
  playerId: string;
  nickname: string;
  matchId: string | null;
  roomCode: string | null;
}
