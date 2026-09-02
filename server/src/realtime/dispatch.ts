import type { Seat } from '@mini-arcade/shared';
import { createLogger } from '../infra/logger.js';
import { emitPresence } from './broadcast.js';
import { bus } from './bus.js';
import { matchRegistry } from './match-registry.js';

const log = createLogger('dispatch');

export const MATCH_COMMAND_TOPIC = 'match:command';

export type MatchCommand =
  | { type: 'action'; matchId: string; playerId: string; action: unknown }
  | { type: 'forfeit'; matchId: string; playerId: string }
  | { type: 'rematch'; matchId: string; playerId: string }
  | { type: 'presence'; matchId: string; playerId: string; connected: boolean; nodeId: string };

export interface CommandResult {
  ok: boolean;
  code?: string;
}

type RematchHandler = (matchId: string, playerId: string) => CommandResult;

let rematchHandler: RematchHandler = () => ({ ok: false, code: 'REMATCH_UNAVAILABLE' });

export function setRematchHandler(handler: RematchHandler): void {
  rematchHandler = handler;
}

/** Applies a command to a match hosted by this worker. */
export function applyCommand(command: MatchCommand): CommandResult {
  const match = matchRegistry.get(command.matchId);

  if (command.type === 'rematch') return rematchHandler(command.matchId, command.playerId);
  if (!match) return { ok: false, code: 'MATCH_NOT_FOUND' };

  switch (command.type) {
    case 'action': {
      const result = match.applyAction(command.playerId, command.action);
      if (!result.ok) return { ok: false, code: result.error };
      matchRegistry.afterAction(match);
      return { ok: true };
    }
    case 'forfeit': {
      if (!match.participant(command.playerId)) return { ok: false, code: 'NOT_A_PARTICIPANT' };
      const opponent = match.participants.find((p) => p.playerId !== command.playerId);
      void matchRegistry.endMatch(match.id, 'forfeit', (opponent?.seat ?? null) as Seat | null);
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

/**
 * Routes a command to whichever worker hosts the match. Local matches are
 * handled inline; remote ones travel over the bus (Redis pub/sub).
 */
export async function dispatch(command: MatchCommand): Promise<CommandResult> {
  // A rematch targets a *finished* match, so it is served by whichever worker
  // still holds it in the recently-finished cache.
  const servedHere =
    command.type === 'rematch'
      ? matchRegistry.getRecent(command.matchId) !== undefined
      : matchRegistry.hosts(command.matchId);

  if (servedHere) return applyCommand(command);

  await bus.publish(MATCH_COMMAND_TOPIC, command);
  return { ok: true, code: 'FORWARDED' };
}

export function subscribeToCommands(): () => void {
  return bus.on<MatchCommand>(MATCH_COMMAND_TOPIC, (command) => {
    if (command.type !== 'rematch' && !matchRegistry.hosts(command.matchId)) return;
    const result = applyCommand(command);
    if (!result.ok) log.debug({ command: command.type, code: result.code }, 'remote command rejected');
  });
}
