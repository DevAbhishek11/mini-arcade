import type { Server as IOServer, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  EmotePayload,
  MatchEndReason,
  RoomInfo,
  Seat,
  ServerToClientEvents,
  SocketData,
} from '@mini-arcade/shared';
import { playerService } from '../domain/player-service.js';
import { progressionService } from '../domain/progression-service.js';
import type { Match } from './match.js';

export type ArcadeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
export type ArcadeServer = IOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export const playerRoom = (playerId: string) => `player:${playerId}`;
export const matchRoom = (matchId: string) => `match:${matchId}`;
export const lobbyRoom = (code: string) => `room:${code}`;

let io: ArcadeServer | null = null;

export function setIo(instance: ArcadeServer | null): void {
  io = instance;
}

export function getIo(): ArcadeServer {
  if (!io) throw new Error('Realtime gateway is not initialised');
  return io;
}

export function maybeIo(): ArcadeServer | null {
  return io;
}

/** Each seat receives its own snapshot (the `seat` field differs per player). */
export function emitMatchState(match: Match): void {
  if (!io) return;
  for (const participant of match.participants) {
    if (participant.isBot) continue;
    io.to(playerRoom(participant.playerId)).emit('match:state', match.snapshotFor(participant.playerId));
  }
}

export function emitMatchFound(match: Match): void {
  if (!io) return;
  for (const participant of match.participants) {
    if (participant.isBot) continue;
    // socketsJoin crosses workers/containers through the socket.io adapter.
    void io.in(playerRoom(participant.playerId)).socketsJoin(matchRoom(match.id));
    io.to(playerRoom(participant.playerId)).emit('match:found', match.snapshotFor(participant.playerId));
  }
}

export async function emitMatchOver(
  match: Match,
  reason: MatchEndReason,
  winnerSeat: Seat | null,
): Promise<void> {
  if (!io) return;

  const humans = match.participants.filter((participant) => !participant.isBot);
  const players = (
    await Promise.all(humans.map((participant) => playerService.getById(participant.playerId)))
  ).filter((player): player is NonNullable<typeof player> => player !== null);

  const base = {
    matchId: match.id,
    winnerSeat,
    reason,
    ratingDelta: match.endSummary?.ratingDelta ?? {},
    players,
    state: match.engine.toPublic(match.state),
    rematchAvailable: reason !== 'aborted',
  };

  for (const participant of humans) {
    const progress = match.endSummary?.progress[participant.playerId];
    io.to(playerRoom(participant.playerId)).emit('match:over', progress ? { ...base, progress } : base);
    void progressionService
      .get(participant.playerId)
      .then((snapshot) =>
        io?.to(playerRoom(participant.playerId)).emit('progress:update', {
          progress: snapshot,
          ...(progress ? { delta: progress } : {}),
        }),
      )
      .catch(() => undefined);
  }

  void io.in(matchRoom(match.id)).socketsLeave(matchRoom(match.id));
}

export function emitPresence(match: Match): void {
  io?.to(matchRoom(match.id)).emit('match:presence', { matchId: match.id, players: match.slots() });
}

export function emitEmote(payload: EmotePayload): void {
  io?.to(matchRoom(payload.matchId)).emit('match:emote', payload);
}

export function emitRoom(room: RoomInfo): void {
  if (!io) return;
  io.to(lobbyRoom(room.code)).emit('room:update', room);
  for (const member of room.members) {
    io.to(playerRoom(member.playerId)).emit('room:update', room);
  }
}

export function emitRoomClosed(code: string, reason: string): void {
  io?.to(lobbyRoom(code)).emit('room:closed', { code, reason });
}

export function notify(playerId: string, code: string, message: string): void {
  io?.to(playerRoom(playerId)).emit('error:notice', { code, message });
}
