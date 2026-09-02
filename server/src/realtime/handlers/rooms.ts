import { isGameId, type GameId, type RoomMember, type Seat } from '@mini-arcade/shared';
import { playerService } from '../../domain/player-service.js';
import { progressionService } from '../../domain/progression-service.js';
import { getStorage } from '../../domain/storage/index.js';
import { createLogger } from '../../infra/logger.js';
import { emitRoom, emitRoomClosed, lobbyRoom, type ArcadeSocket } from '../broadcast.js';
import { botIdentity, BOT_DIFFICULTIES, type BotDifficulty } from '../bot.js';
import { bus } from '../bus.js';
import { Match, type MatchParticipant, type MatchSource } from '../match.js';
import { matchRegistry } from '../match-registry.js';
import { roomManager } from '../room-manager.js';
import { allow } from './limits.js';

const log = createLogger('handlers:rooms');

const DIFFICULTY_IDS = new Set(BOT_DIFFICULTIES.map((entry) => entry.id));

async function memberFor(playerId: string): Promise<Omit<RoomMember, 'isHost' | 'ready'> | null> {
  const [player, progress] = await Promise.all([
    playerService.getById(playerId),
    progressionService.get(playerId).catch(() => null),
  ]);
  if (!player) return null;
  return {
    playerId: player.id,
    nickname: player.nickname,
    avatar: player.avatar,
    rating: player.rating,
    level: progress?.level.level ?? 1,
  };
}

async function launch(
  gameId: GameId,
  participants: MatchParticipant[],
  source: MatchSource,
  roomCode: string | null,
): Promise<Match> {
  const match = new Match(gameId, participants, undefined, source, roomCode);
  matchRegistry.add(match);
  await getStorage()
    .createMatch({
      id: match.id,
      gameId,
      playerIds: participants.filter((p) => !p.isBot).map((p) => p.playerId),
    })
    .catch((error: Error) => log.error({ err: error.message }, 'failed to persist match'));
  return match;
}

/** Private rooms (shareable code) and instant practice matches against a bot. */
export function registerRoomHandlers(socket: ArcadeSocket): void {
  const { playerId } = socket.data;

  socket.on('practice:start', async ({ gameId, difficulty }, ack) => {
    if (!isGameId(gameId)) return ack?.({ ok: false, code: 'BAD_GAME' });
    if (!DIFFICULTY_IDS.has(difficulty as BotDifficulty)) return ack?.({ ok: false, code: 'BAD_DIFFICULTY' });
    if (!allow('practice', playerId)) return ack?.({ ok: false, code: 'RATE_LIMITED' });
    if (matchRegistry.atCapacity()) return ack?.({ ok: false, code: 'SERVER_BUSY' });

    const player = await playerService.getById(playerId);
    if (!player) return ack?.({ ok: false, code: 'UNKNOWN_PLAYER' });

    const existing = matchRegistry.findByPlayer(playerId);
    if (existing) return ack?.({ ok: false, code: 'ALREADY_IN_MATCH' });

    const bot = botIdentity(difficulty as BotDifficulty);
    const humanSeat: Seat = Math.random() < 0.5 ? 0 : 1;
    const participants: MatchParticipant[] = [
      {
        playerId: player.id,
        nickname: player.nickname,
        avatar: player.avatar,
        rating: player.rating,
        played: player.wins + player.losses + player.draws,
        seat: humanSeat,
        connected: true,
        isBot: false,
        nodeId: bus.nodeId,
        disconnectedAt: null,
      },
      {
        ...bot,
        avatar: 'nebula',
        rating: difficulty === 'brutal' ? 1500 : difficulty === 'sharp' ? 1250 : 1050,
        played: 100,
        seat: (humanSeat === 0 ? 1 : 0) as Seat,
        connected: true,
        isBot: true,
        difficulty: difficulty as BotDifficulty,
        nodeId: bus.nodeId,
        disconnectedAt: null,
      },
    ];

    await launch(gameId, participants, 'practice', null);
    ack?.({ ok: true });
  });

  socket.on('room:create', async ({ gameId }, ack) => {
    if (!isGameId(gameId)) return ack?.({ ok: false, code: 'BAD_GAME' });
    if (!allow('room', playerId)) return ack?.({ ok: false, code: 'RATE_LIMITED' });

    const member = await memberFor(playerId);
    if (!member) return ack?.({ ok: false, code: 'UNKNOWN_PLAYER' });

    try {
      const room = await roomManager.create(gameId, member);
      socket.data.roomCode = room.code;
      await socket.join(lobbyRoom(room.code));
      emitRoom(room);
      ack?.({ ok: true, code: room.code });
    } catch (error) {
      ack?.({ ok: false, code: (error as Error).message });
    }
  });

  socket.on('room:join', async ({ code }, ack) => {
    const normalized = String(code ?? '')
      .trim()
      .toUpperCase();
    if (normalized.length !== 5) return ack?.({ ok: false, code: 'BAD_CODE' });
    if (!allow('room', playerId)) return ack?.({ ok: false, code: 'RATE_LIMITED' });

    const member = await memberFor(playerId);
    if (!member) return ack?.({ ok: false, code: 'UNKNOWN_PLAYER' });

    try {
      const room = await roomManager.join(normalized, member);
      socket.data.roomCode = room.code;
      await socket.join(lobbyRoom(room.code));
      emitRoom(room);
      ack?.({ ok: true });
    } catch (error) {
      ack?.({ ok: false, code: (error as Error).message });
    }
  });

  socket.on('room:ready', async ({ code, ready }, ack) => {
    try {
      const room = await roomManager.setReady(String(code).toUpperCase(), playerId, Boolean(ready));
      emitRoom(room);
      ack?.({ ok: true });
    } catch (error) {
      ack?.({ ok: false, code: (error as Error).message });
    }
  });

  socket.on('room:leave', async ({ code }, ack) => {
    const normalized = String(code ?? '').toUpperCase();
    const room = await roomManager.leave(normalized, playerId);
    await socket.leave(lobbyRoom(normalized));
    socket.data.roomCode = null;
    if (room) emitRoom(room);
    else emitRoomClosed(normalized, 'EMPTY');
    ack?.({ ok: true });
  });

  socket.on('room:start', async ({ code }, ack) => {
    const normalized = String(code ?? '').toUpperCase();
    const room = await roomManager.get(normalized);
    if (!room) return ack?.({ ok: false, code: 'ROOM_NOT_FOUND' });
    if (room.hostId !== playerId) return ack?.({ ok: false, code: 'NOT_HOST' });
    if (room.members.length < 2) return ack?.({ ok: false, code: 'NEED_TWO_PLAYERS' });
    if (!room.members.every((member) => member.ready)) return ack?.({ ok: false, code: 'NOT_READY' });
    if (matchRegistry.atCapacity()) return ack?.({ ok: false, code: 'SERVER_BUSY' });

    const participants: MatchParticipant[] = room.members.slice(0, 2).map((member, index) => ({
      playerId: member.playerId,
      nickname: member.nickname,
      avatar: member.avatar,
      rating: member.rating,
      played: 0,
      seat: index as Seat,
      connected: true,
      isBot: false,
      nodeId: bus.nodeId,
      disconnectedAt: null,
    }));

    await launch(room.gameId, participants, 'room', room.code);
    const updated = await roomManager.markPlaying(room.code, true);
    if (updated) emitRoom(updated);
    ack?.({ ok: true });
  });
}

/** Called on disconnect so an abandoned room does not linger. */
export async function releaseRoom(playerId: string, code: string | null): Promise<void> {
  if (!code) return;
  const room = await roomManager.leave(code, playerId);
  if (room) emitRoom(room);
  else emitRoomClosed(code, 'HOST_LEFT');
}
