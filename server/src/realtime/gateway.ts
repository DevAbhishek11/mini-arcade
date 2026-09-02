import cluster from 'node:cluster';
import type { Server as HttpServer } from 'node:http';
import { createAdapter as createClusterAdapter } from '@socket.io/cluster-adapter';
import { createAdapter as createRedisAdapter } from '@socket.io/redis-adapter';
import { Server as IOServer } from 'socket.io';
import { SOCKET_PATH, type SocketData } from '@mini-arcade/shared';
import { config } from '../config/env.js';
import { authService } from '../domain/auth-service.js';
import { playerService } from '../domain/player-service.js';
import { progressionService } from '../domain/progression-service.js';
import { createLogger } from '../infra/logger.js';
import { lifecycle } from '../infra/lifecycle.js';
import { socketEvents } from '../infra/metrics.js';
import { createRedisConnection } from '../infra/redis.js';
import { createSafeInterval } from '../utils/time.js';
import {
  emitMatchFound,
  emitMatchOver,
  emitMatchState,
  emitPresence,
  getIo,
  matchRoom,
  playerRoom,
  setIo,
  type ArcadeServer,
  type ArcadeSocket,
} from './broadcast.js';
import { bus } from './bus.js';
import { dispatch, subscribeToCommands } from './dispatch.js';
import { registerMatchHandlers } from './handlers/match.js';
import { registerQueueHandlers } from './handlers/queue.js';
import { registerRoomHandlers, releaseRoom } from './handlers/rooms.js';
import type { Match } from './match.js';
import { matchRegistry } from './match-registry.js';
import { matchmaker } from './matchmaking.js';
import { presence } from './presence.js';

const log = createLogger('gateway');

const HEARTBEAT_MS = 15_000;
const STATS_BROADCAST_MS = 5_000;

function buildServer(httpServer: HttpServer): ArcadeServer {
  return new IOServer(httpServer, {
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
    perMessageDeflate: { threshold: 1_024 },
    transports: ['websocket', 'polling'],
  }) as ArcadeServer;
}

function attachAdapter(io: ArcadeServer): void {
  const pubClient = createRedisConnection('io-pub');
  const subClient = createRedisConnection('io-sub');
  if (pubClient && subClient) {
    io.adapter(createRedisAdapter(pubClient, subClient, { key: `${config.REDIS_KEY_PREFIX}io` }));
    log.info('socket.io using redis adapter');
    return;
  }
  if (cluster.isWorker) {
    io.adapter(createClusterAdapter());
    log.info('socket.io using node cluster adapter');
  }
}

async function onConnection(socket: ArcadeSocket): Promise<void> {
  const { playerId } = socket.data;
  socket.data.roomCode = null;

  await socket.join(playerRoom(playerId));
  await presence.playerOnline(playerId);
  void playerService.touch(playerId);
  socketEvents.inc({ event: 'connection', result: 'ok' });

  const [player, progress] = await Promise.all([
    playerService.getById(playerId),
    progressionService.get(playerId).catch(() => null),
  ]);
  if (player) socket.emit('session:ready', { player, workerId: cluster.worker?.id ?? 0 });
  if (progress) socket.emit('progress:update', { progress });

  // Rejoin an in-flight match hosted by this worker (a reconnect or a new tab).
  const hosted = matchRegistry.findByPlayer(playerId);
  if (hosted && hosted.status === 'active') {
    hosted.setConnected(playerId, true, bus.nodeId);
    await socket.join(matchRoom(hosted.id));
    socket.emit('match:found', hosted.snapshotFor(playerId));
  }

  registerQueueHandlers(socket);
  registerMatchHandlers(socket);
  registerRoomHandlers(socket);

  socket.on('progress:get', async (_payload, ack) => {
    const snapshot = await progressionService.get(playerId).catch(() => null);
    if (snapshot) socket.emit('progress:update', { progress: snapshot });
    ack?.({ ok: Boolean(snapshot) });
  });

  socket.on('ping', ({ clientTime }) => socket.emit('pong', { clientTime, serverTime: Date.now() }));

  socket.on('disconnect', async (reason) => {
    socketEvents.inc({ event: 'disconnect', result: reason });
    await matchmaker.leaveAll(playerId).catch(() => undefined);
    await releaseRoom(playerId, socket.data.roomCode).catch(() => undefined);

    // Another tab may still be open for this player — only then are they away.
    const sockets = await getIo().in(playerRoom(playerId)).fetchSockets();
    if (sockets.length > 0) return;

    await presence.playerOffline(playerId);
    const match = matchRegistry.findByPlayer(playerId);
    const matchId = match?.id ?? socket.data.matchId;
    if (matchId) {
      await dispatch({ type: 'presence', matchId, playerId, connected: false, nodeId: bus.nodeId });
    }
  });
}

export async function createGateway(httpServer: HttpServer): Promise<ArcadeServer> {
  const io = buildServer(httpServer);
  setIo(io);
  attachAdapter(io);

  io.use(async (socket, next) => {
    try {
      const header = socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
      const token = (socket.handshake.auth?.token as string | undefined) ?? header;
      if (!token) return next(new Error('UNAUTHORIZED'));
      const player = await authService.resolve(token);
      socket.data.playerId = player.id;
      socket.data.nickname = player.nickname;
      socket.data.matchId = null;
      socket.data.roomCode = null;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    void onConnection(socket as ArcadeSocket).catch((error: Error) =>
      log.error({ err: error.message }, 'connection setup failed'),
    );
  });

  matchRegistry.setHooks({
    onState: emitMatchState,
    onOver: (match, reason, winnerSeat) => void emitMatchOver(match, reason, winnerSeat),
    onPresence: emitPresence,
    onCreated: emitMatchFound,
  });

  const unsubscribe = subscribeToCommands();
  matchmaker.start();

  const heartbeat = createSafeInterval(async () => {
    const sockets = await io.fetchSockets().catch(() => []);
    await presence.heartbeat(new Set(sockets.map((entry) => (entry.data as SocketData).playerId)));
  }, HEARTBEAT_MS);

  const statsLoop = createSafeInterval(async () => {
    const stats = await presence.snapshot(await matchmaker.sizes());
    io.emit('stats:update', stats);
  }, STATS_BROADCAST_MS);

  lifecycle.register(
    'realtime:gateway',
    async () => {
      heartbeat.stop();
      statsLoop.stop();
      matchmaker.stop();
      unsubscribe();
      io.emit('error:notice', { code: 'SERVER_RESTARTING', message: 'Server is restarting, reconnecting…' });
      await presence.clearLocal();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      setIo(null);
    },
    20,
  );

  log.info({ path: SOCKET_PATH, distributedBus: bus.distributed }, 'realtime gateway ready');
  return io;
}

export { getIo };
export type { Match };
