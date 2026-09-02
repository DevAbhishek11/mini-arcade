import type {
  ArcadeStats,
  GameId,
  MatchEndReason,
  MatchStatus,
  PlayerPublic,
  PlayerSlot,
  Seat,
} from './index.js';

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
}
