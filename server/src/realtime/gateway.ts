import cluster from 'node:cluster';
import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createAdapter as createClusterAdapter } from '@socket.io/cluster-adapter';
import { createAdapter as createRedisAdapter } from '@socket.io/redis-adapter';
import { Server as IOServer, type Socket } from 'socket.io';
import {
  GAME_CATALOG,
  SOCKET_PATH,
  isGameId,
  type ChatMessage,
  type ClientToServerEvents,
  type GameId,
  type MatchEndReason,
  type Seat,
  type ServerToClientEvents,
  type SocketData,
} from '@mini-arcade/shared';
import { config } from '../config/env.js';
import { authService } from '../domain/auth-service.js';
import { playerService } from '../domain/player-service.js';
import { createLogger } from '../infra/logger.js';
import { lifecycle } from '../infra/lifecycle.js';
import { socketEvents } from '../infra/metrics.js';
import { createRedisConnection } from '../infra/redis.js';
import { TokenBucketLimiter } from '../utils/token-bucket.js';
import { createSafeInterval } from '../utils/time.js';
import { bus } from './bus.js';
import type { Match } from './match.js';
import { matchRegistry } from './match-registry.js';
import { matchmaker } from './matchmaking.js';
import { presence } from './presence.js';

const log = createLogger('gateway');

type ArcadeSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type ArcadeServer = IOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const MATCH_COMMAND_TOPIC = 'match:command';
const playerRoom = (playerId: string) => `player:${playerId}`;
const matchRoom = (matchId: string) => `match:${matchId}`;

type MatchCommand =
  | { type: 'action'; matchId: string; playerId: string; action: unknown }
  | { type: 'forfeit'; matchId: string; playerId: string }
  | { type: 'presence'; matchId: string; playerId: string; connected: boolean; nodeId: string };

let io: ArcadeServer | null = null;

const actionLimiter = new TokenBucketLimiter({
  ratePerSecond: config.SOCKET_ACTION_RATE,
  burst: config.SOCKET_ACTION_BURST,
  maxKeys: 20_000,
});
const chatLimiter = new TokenBucketLimiter({ ratePerSecond: 1, burst: 5, maxKeys: 20_000 });
const queueLimiter = new TokenBucketLimiter({ ratePerSecond: 1, burst: 8, maxKeys: 20_000 });

export function getIo(): ArcadeServer {
  if (!io) throw new Error('Realtime gateway is not initialised');
  return io;
}

/** Broadcasts a snapshot to each seat (each player gets their own `seat` field). */
function emitMatchState(match: Match): void {
  if (!io) return;
  for (const participant of match.participants) {
    if (participant.isBot) continue;
    io.to(playerRoom(participant.playerId)).emit('match:state', match.snapshotFor(participant.playerId));
  }
}

function emitMatchFound(match: Match): void {
  if (!io) return;
  for (const participant of match.participants) {
    if (participant.isBot) continue;
    // Works across workers/containers via the socket.io adapter.
    void io.in(playerRoom(participant.playerId)).socketsJoin(matchRoom(match.id));
    io.to(playerRoom(participant.playerId)).emit('match:found', match.snapshotFor(participant.playerId));
  }
}

async function emitMatchOver(match: Match, reason: MatchEndReason, winnerSeat: Seat | null): Promise<void> {
  if (!io) return;
  const players = await Promise.all(
    match.participants
      .filter((p) => !p.isBot)
      .map(async (p) => (await playerService.getById(p.playerId)) ?? null),
  );

  const payload = {
    matchId: match.id,
    winnerSeat,
    reason,
    ratingDelta: match.endSummary?.ratingDelta ?? {},
    players: players.filter((p): p is NonNullable<typeof p> => p !== null),
    state: match.engine.toPublic(match.state),
  };

  io.to(matchRoom(match.id)).emit('match:over', payload);
  void io.in(matchRoom(match.id)).socketsLeave(matchRoom(match.id));
}

function emitPresence(match: Match): void {
  io?.to(matchRoom(match.id)).emit('match:presence', { matchId: match.id, players: match.slots() });
}

/** Routes a command to the worker hosting the match (or applies it locally). */
async function dispatch(command: MatchCommand): Promise<{ ok: boolean; code?: string }> {
  if (matchRegistry.hosts(command.matchId)) {
    return applyCommand(command);
  }
  await bus.publish(MATCH_COMMAND_TOPIC, command);
  return { ok: true };
}

function applyCommand(command: MatchCommand): { ok: boolean; code?: string } {
  const match = matchRegistry.get(command.matchId);
  if (!match) return { ok: false, code: 'MATCH_NOT_FOUND' };

  switch (command.type) {
    case 'action': {
      const result = match.applyAction(command.playerId, command.action);
      if (!result.ok) return { ok: false, code: result.error };
      matchRegistry.afterAction(match);
      return { ok: true };
    }
    case 'forfeit': {
      const participant = match.participant(command.playerId);
      if (!participant) return { ok: false, code: 'NOT_A_PARTICIPANT' };
      const opponent = match.participants.find((p) => p.playerId !== command.playerId);
      void matchRegistry.endMatch(match.id, 'forfeit', opponent?.seat ?? null);
      return { ok: true };
    }
    case 'presence': {
      match.setConnected(command.playerId, command.connected, command.nodeId);
      emitPresence(match);
      return { ok: true };
    }
    default:
      return { ok: false, code: 'UNKNOWN_COMMAND' };
  }
}

export async function createGateway(httpServer: HttpServer): Promise<ArcadeServer> {
  io = new IOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    path: SOCKET_PATH,
    cors: { origin: config.corsOrigins, credentials: true },
    serveClient: false,
    pingInterval: 20_000,
    pingTimeout: 25_000,
    connectionStateRecovery: {
      maxDisconnectionDuration: config.MATCH_RECONNECT_GRACE_MS,
      skipMiddlewares: false,
    },
    maxHttpBufferSize: 8_000,
    transports: ['websocket', 'polling'],
  });

  // Horizontal scaling: Redis across containers, the cluster adapter across workers.
  const pubClient = createRedisConnection('io-pub');
  const subClient = createRedisConnection('io-sub');
  if (pubClient && subClient) {
    io.adapter(createRedisAdapter(pubClient, subClient, { key: `${config.REDIS_KEY_PREFIX}io` }));
    log.info('socket.io using redis adapter');
  } else if (cluster.isWorker) {
    io.adapter(createClusterAdapter());
    log.info('socket.io using node cluster adapter');
  }

  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') as string | undefined);
      if (!token) return next(new Error('UNAUTHORIZED'));
      const player = await authService.resolve(token);
      socket.data.playerId = player.id;
      socket.data.nickname = player.nickname;
      socket.data.matchId = null;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket: ArcadeSocket) => {
    const { playerId } = socket.data;
    void socket.join(playerRoom(playerId));
    void presence.playerOnline(playerId);
    void playerService.touch(playerId);
    socketEvents.inc({ event: 'connection', result: 'ok' });

    void playerService.getById(playerId).then((player) => {
      if (player) socket.emit('session:ready', { player, workerId: cluster.worker?.id ?? 0 });
    });

    // Reconnect straight back into an in-flight match hosted anywhere in the fleet.
    const hosted = matchRegistry.findByPlayer(playerId);
    if (hosted && hosted.status === 'active') {
      hosted.setConnected(playerId, true, bus.nodeId);
      void socket.join(matchRoom(hosted.id));
      socket.emit('match:found', hosted.snapshotFor(playerId));
    }

    socket.on('queue:join', async ({ gameId }, ack) => {
      if (!isGameId(gameId)) return ack?.({ ok: false, code: 'BAD_GAME' });
      if (queueLimiter.take(playerId) === null) {
        socketEvents.inc({ event: 'queue:join', result: 'rate-limited' });
        return ack?.({ ok: false, code: 'RATE_LIMITED', message: 'Slow down a little' });
      }
      const player = await playerService.getById(playerId);
      if (!player) return ack?.({ ok: false, code: 'UNKNOWN_PLAYER' });

      const { position, size } = await matchmaker.join({
        playerId,
        nickname: player.nickname,
        avatar: player.avatar,
        rating: player.rating,
        played: player.wins + player.losses + player.draws,
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

    socket.on('match:action', async ({ matchId, action }, ack) => {
      if (typeof matchId !== 'string' || !action || typeof action !== 'object') {
        return ack?.({ ok: false, code: 'BAD_PAYLOAD' });
      }
      if (actionLimiter.take(playerId) === null) {
        socketEvents.inc({ event: 'match:action', result: 'rate-limited' });
        return ack?.({ ok: false, code: 'RATE_LIMITED' });
      }
      const result = await dispatch({ type: 'action', matchId, playerId, action });
      socketEvents.inc({ event: 'match:action', result: result.ok ? 'ok' : 'rejected' });
      if (!result.ok && result.code)
        socket.emit('error:notice', { code: result.code, message: 'Move rejected' });
      ack?.(result.ok ? { ok: true } : { ok: false, code: result.code });
    });

    socket.on('match:resume', ({ matchId }, ack) => {
      const match = matchRegistry.get(matchId);
      if (!match) return ack?.({ ok: false, code: 'MATCH_NOT_FOUND' });
      if (!match.participant(playerId)) return ack?.({ ok: false, code: 'NOT_A_PARTICIPANT' });
      match.setConnected(playerId, true, bus.nodeId);
      void socket.join(matchRoom(matchId));
      socket.emit('match:state', match.snapshotFor(playerId));
      ack?.({ ok: true });
    });

    socket.on('match:forfeit', async ({ matchId }, ack) => {
      const result = await dispatch({ type: 'forfeit', matchId, playerId });
      ack?.(result.ok ? { ok: true } : { ok: false, code: result.code });
    });

    socket.on('match:chat', ({ matchId, body }, ack) => {
      const text = String(body ?? '')
        .trim()
        .slice(0, 200);
      if (!text) return ack?.({ ok: false, code: 'EMPTY' });
      if (chatLimiter.take(playerId) === null) return ack?.({ ok: false, code: 'RATE_LIMITED' });
      const message: ChatMessage = {
        id: randomUUID(),
        matchId,
        playerId,
        nickname: socket.data.nickname,
        body: text,
        sentAt: Date.now(),
      };
      io?.to(matchRoom(matchId)).emit('match:chat', message);
      ack?.({ ok: true });
    });

    socket.on('ping', ({ clientTime }) => {
      socket.emit('pong', { clientTime, serverTime: Date.now() });
    });

    socket.on('disconnect', async (reason) => {
      socketEvents.inc({ event: 'disconnect', result: reason });
      await matchmaker.leaveAll(playerId).catch(() => undefined);

      // Any other tab still open for this player? Then they are still "here".
      const sockets = await io?.in(playerRoom(playerId)).fetchSockets();
      if (!sockets || sockets.length === 0) {
        await presence.playerOffline(playerId);
        const match = matchRegistry.findByPlayer(playerId) ?? null;
        const matchId = match?.id ?? socket.data.matchId;
        if (matchId) {
          await dispatch({ type: 'presence', matchId, playerId, connected: false, nodeId: bus.nodeId });
        }
      }
    });
  });

  matchRegistry.setHooks({
    onState: emitMatchState,
    onOver: (match, reason, winnerSeat) => {
      void emitMatchOver(match, reason, winnerSeat);
    },
    onPresence: emitPresence,
  });

  // Commands addressed to matches hosted by this worker.
  bus.on<MatchCommand>(MATCH_COMMAND_TOPIC, (command) => {
    if (!matchRegistry.hosts(command.matchId)) return;
    applyCommand(command);
  });

  // Every worker watches its own registry for freshly created matches.
  const originalAdd = matchRegistry.add.bind(matchRegistry);
  matchRegistry.add = (match: Match) => {
    originalAdd(match);
    emitMatchFound(match);
  };

  matchmaker.start();

  const heartbeat = createSafeInterval(async () => {
    const sockets = await io?.fetchSockets().catch(() => []);
    const ids = new Set((sockets ?? []).map((s) => (s.data as SocketData).playerId));
    await presence.heartbeat(ids);
  }, 15_000);

  const statsLoop = createSafeInterval(async () => {
    if (!io) return;
    const sizes = await matchmaker.sizes();
    const stats = await presence.snapshot(sizes);
    io.emit('stats:update', stats);
  }, 5_000);

  lifecycle.register(
    'realtime:gateway',
    async () => {
      heartbeat.stop();
      statsLoop.stop();
      matchmaker.stop();
      io?.emit('error:notice', { code: 'SERVER_RESTARTING', message: 'Server is restarting, reconnecting…' });
      await presence.clearLocal();
      await new Promise<void>((resolve) => io?.close(() => resolve()) ?? resolve());
      io = null;
    },
    20,
  );

  log.info({ path: SOCKET_PATH, distributedBus: bus.distributed }, 'realtime gateway ready');
  return io;
}

export const gatewayInternals = { GAME_CATALOG, matchRoom, playerRoom, applyCommand };
export type { GameId };
