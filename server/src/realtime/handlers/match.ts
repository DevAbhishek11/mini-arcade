import { randomUUID } from 'node:crypto';
import { EMOTES, type ChatMessage, type Emote, type Seat } from '@mini-arcade/shared';
import { getStorage } from '../../domain/storage/index.js';
import { createLogger } from '../../infra/logger.js';
import { socketEvents } from '../../infra/metrics.js';
import { emitEmote, getIo, matchRoom, playerRoom, type ArcadeSocket } from '../broadcast.js';
import { bus } from '../bus.js';
import { dispatch, setRematchHandler, type CommandResult } from '../dispatch.js';
import { Match } from '../match.js';
import { matchRegistry } from '../match-registry.js';
import { allow } from './limits.js';

const log = createLogger('handlers:match');

/** matchId -> playerIds who asked for a rematch. Cleared when the rematch starts. */
const rematchVotes = new Map<string, Set<string>>();

function startRematch(previous: Match): Match {
  // Swap seats so nobody keeps the first-move advantage.
  const participants = previous.participants.map((participant) => ({
    ...participant,
    seat: (participant.seat === 0 ? 1 : 0) as Seat,
    connected: true,
    disconnectedAt: null,
  }));

  const match = new Match(previous.gameId, participants, undefined, previous.source, previous.roomCode);
  matchRegistry.add(match);

  void getStorage()
    .createMatch({
      id: match.id,
      gameId: match.gameId,
      playerIds: participants.filter((p) => !p.isBot).map((p) => p.playerId),
    })
    .catch((error: Error) => log.error({ err: error.message }, 'failed to persist rematch'));

  return match;
}

function handleRematchVote(matchId: string, playerId: string): CommandResult {
  const previous = matchRegistry.getRecent(matchId);
  if (!previous) return { ok: false, code: 'MATCH_EXPIRED' };
  if (!previous.participant(playerId)) return { ok: false, code: 'NOT_A_PARTICIPANT' };

  const votes = rematchVotes.get(matchId) ?? new Set<string>();
  votes.add(playerId);
  rematchVotes.set(matchId, votes);

  const humans = previous.participants.filter((participant) => !participant.isBot);
  const everyoneAgreed = humans.every((participant) => votes.has(participant.playerId));

  if (!everyoneAgreed) {
    const waitingOn = humans.find((participant) => !votes.has(participant.playerId));
    const requester = previous.participant(playerId);
    if (waitingOn && requester) {
      getIo()
        .to(playerRoom(waitingOn.playerId))
        .emit('match:rematch:offer', { matchId, fromNickname: requester.nickname });
    }
    return { ok: true, code: 'WAITING_FOR_OPPONENT' };
  }

  rematchVotes.delete(matchId);
  startRematch(previous);
  return { ok: true };
}

setRematchHandler(handleRematchVote);

/** In-match events: moves, resume, forfeit, chat, emotes and rematches. */
export function registerMatchHandlers(socket: ArcadeSocket): void {
  const { playerId } = socket.data;

  socket.on('match:action', async ({ matchId, action }, ack) => {
    if (typeof matchId !== 'string' || !action || typeof action !== 'object') {
      return ack?.({ ok: false, code: 'BAD_PAYLOAD' });
    }
    if (!allow('action', playerId)) {
      socketEvents.inc({ event: 'match:action', result: 'rate-limited' });
      return ack?.({ ok: false, code: 'RATE_LIMITED' });
    }

    const result = await dispatch({ type: 'action', matchId, playerId, action });
    socketEvents.inc({ event: 'match:action', result: result.ok ? 'ok' : 'rejected' });
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

  socket.on('match:rematch', async ({ matchId }, ack) => {
    if (!allow('queue', playerId)) return ack?.({ ok: false, code: 'RATE_LIMITED' });
    const result = await dispatch({ type: 'rematch', matchId, playerId });
    ack?.(result.ok ? { ok: true, code: result.code } : { ok: false, code: result.code });
  });

  socket.on('match:chat', ({ matchId, body }, ack) => {
    const text = String(body ?? '')
      .trim()
      .slice(0, 200);
    if (!text) return ack?.({ ok: false, code: 'EMPTY' });
    if (!allow('chat', playerId)) return ack?.({ ok: false, code: 'RATE_LIMITED' });

    const message: ChatMessage = {
      id: randomUUID(),
      matchId,
      playerId,
      nickname: socket.data.nickname,
      body: text,
      sentAt: Date.now(),
    };
    getIo().to(matchRoom(matchId)).emit('match:chat', message);
    ack?.({ ok: true });
  });

  socket.on('match:emote', ({ matchId, emote }, ack) => {
    if (!EMOTES.includes(emote as Emote)) return ack?.({ ok: false, code: 'BAD_EMOTE' });
    if (!allow('emote', playerId)) return ack?.({ ok: false, code: 'RATE_LIMITED' });
    const match = matchRegistry.getRecent(matchId);
    const seat = match?.participant(playerId)?.seat ?? 0;
    emitEmote({ matchId, playerId, seat, emote: emote as Emote, at: Date.now() });
    ack?.({ ok: true });
  });
}

export const matchHandlerInternals = { rematchVotes, startRematch };
