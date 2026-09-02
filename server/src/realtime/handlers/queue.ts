import { isGameId } from '@mini-arcade/shared';
import { config } from '../../config/env.js';
import { playerService } from '../../domain/player-service.js';
import { progressionService } from '../../domain/progression-service.js';
import { socketEvents } from '../../infra/metrics.js';
import type { ArcadeSocket } from '../broadcast.js';
import { bus } from '../bus.js';
import { matchmaker } from '../matchmaking.js';
import { allow } from './limits.js';

/** Ranked matchmaking queue: join, leave, and live position updates. */
export function registerQueueHandlers(socket: ArcadeSocket): void {
  const { playerId } = socket.data;

  socket.on('queue:join', async ({ gameId }, ack) => {
    if (!isGameId(gameId)) return ack?.({ ok: false, code: 'BAD_GAME' });
    if (!allow('queue', playerId)) {
      socketEvents.inc({ event: 'queue:join', result: 'rate-limited' });
      return ack?.({ ok: false, code: 'RATE_LIMITED', message: 'Slow down a little' });
    }

    const [player, progress] = await Promise.all([
      playerService.getById(playerId),
      progressionService.get(playerId).catch(() => null),
    ]);
    if (!player) return ack?.({ ok: false, code: 'UNKNOWN_PLAYER' });

    const { position, size } = await matchmaker.join({
      playerId,
      nickname: player.nickname,
      avatar: player.avatar,
      rating: player.rating,
      played: player.wins + player.losses + player.draws,
      level: progress?.level.level ?? 1,
      gameId,
      nodeId: bus.nodeId,
      joinedAt: Date.now(),
    });

    socket.emit('queue:status', {
      gameId,
      position,
      size,
      estimatedWaitMs: Math.min(config.BOT_FILL_MS || 20_000, position * 4_000),
    });
    socketEvents.inc({ event: 'queue:join', result: 'ok' });
    ack?.({ ok: true });
  });

  socket.on('queue:leave', async ({ gameId }, ack) => {
    if (!isGameId(gameId)) return ack?.({ ok: false, code: 'BAD_GAME' });
    await matchmaker.leave(playerId, gameId);
    socket.emit('queue:left', { gameId });
    ack?.({ ok: true });
  });
}
