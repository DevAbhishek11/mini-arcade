import { randomUUID } from 'node:crypto';
import type { GameId, MatchEndReason, MatchSnapshot, PlayerSlot, Seat } from '@mini-arcade/shared';
import { GAME_CATALOG, eloDelta, getEngine } from '@mini-arcade/shared';
import type { GameEngine } from '@mini-arcade/shared';
import { config } from '../config/env.js';
import { leaderboardService } from '../domain/leaderboard-service.js';
import { playerService } from '../domain/player-service.js';
import type { MatchPlayerResult } from '../domain/storage.js';
import { getStorage } from '../domain/storage/index.js';
import { createLogger } from '../infra/logger.js';
import { matchesActive, matchesTotal } from '../infra/metrics.js';

const log = createLogger('match');

export interface MatchParticipant {
  playerId: string;
  nickname: string;
  avatar: string;
  rating: number;
  played: number;
  seat: Seat;
  connected: boolean;
  isBot: boolean;
  /** Bus node that owns this player's socket. */
  nodeId: string;
  disconnectedAt: number | null;
}

export interface MatchEndSummary {
  matchId: string;
  gameId: GameId;
  winnerSeat: Seat | null;
  reason: MatchEndReason;
  ratingDelta: Record<string, number>;
}

/**
 * One authoritative match instance, owned by exactly one worker (the "host").
 * All state transitions go through here: the engine is pure, this class owns
 * the clocks, presence, persistence and rating side effects.
 */
export class Match {
  readonly id: string;
  readonly gameId: GameId;
  readonly engine: GameEngine<unknown, unknown>;
  readonly participants: MatchParticipant[];
  readonly createdAt = Date.now();

  status: 'active' | 'finished' = 'active';
  state: unknown;
  sequence = 0;
  turnDeadline: number | null = null;
  lastActivityAt = Date.now();
  endSummary: MatchEndSummary | null = null;

  constructor(gameId: GameId, participants: MatchParticipant[], id = randomUUID()) {
    this.id = id;
    this.gameId = gameId;
    this.engine = getEngine(gameId);
    this.participants = participants;
    this.state = this.engine.createState(Date.now());
    this.resetTurnDeadline();
    matchesActive.inc({ game: gameId });
  }

  get catalog() {
    return GAME_CATALOG[this.gameId];
  }

  participant(playerId: string): MatchParticipant | undefined {
    return this.participants.find((p) => p.playerId === playerId);
  }

  bySeat(seat: Seat): MatchParticipant {
    return this.participants.find((p) => p.seat === seat) as MatchParticipant;
  }

  slots(): PlayerSlot[] {
    return this.participants.map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      avatar: p.avatar,
      rating: p.rating,
      seat: p.seat,
      connected: p.connected,
    }));
  }

  snapshotFor(playerId: string): MatchSnapshot {
    const seat = this.participant(playerId)?.seat ?? 0;
    return {
      matchId: this.id,
      gameId: this.gameId,
      status: this.status === 'finished' ? 'finished' : 'active',
      seat,
      players: this.slots(),
      state: this.engine.toPublic(this.state),
      activeSeat: this.engine.activeSeat(this.state),
      turnDeadline: this.turnDeadline,
      serverTime: Date.now(),
      sequence: this.sequence,
    };
  }

  private resetTurnDeadline(): void {
    const timeout = this.catalog.turnTimeoutMs;
    this.turnDeadline = timeout > 0 && this.status === 'active' ? Date.now() + timeout : null;
  }

  applyAction(playerId: string, action: unknown): { ok: boolean; error?: string } {
    if (this.status !== 'active') return { ok: false, error: 'MATCH_OVER' };
    const participant = this.participant(playerId);
    if (!participant) return { ok: false, error: 'NOT_A_PARTICIPANT' };

    const result = this.engine.apply(this.state, participant.seat, action, Date.now());
    if (!result.ok) return { ok: false, error: result.error ?? 'INVALID_ACTION' };

    this.state = result.state;
    this.sequence += 1;
    this.lastActivityAt = Date.now();
    this.resetTurnDeadline();
    return { ok: true };
  }

  tick(dtMs: number): boolean {
    if (this.status !== 'active' || !this.engine.tick) return false;
    this.state = this.engine.tick(this.state, dtMs, Date.now());
    this.sequence += 1;
    return true;
  }

  outcome() {
    return this.engine.outcome(this.state);
  }

  activeSeat(): Seat | null {
    return this.engine.activeSeat(this.state);
  }

  setConnected(playerId: string, connected: boolean, nodeId?: string): void {
    const participant = this.participant(playerId);
    if (!participant) return;
    participant.connected = connected;
    participant.disconnectedAt = connected ? null : Date.now();
    if (nodeId) participant.nodeId = nodeId;
    if (connected) this.lastActivityAt = Date.now();
  }

  /** Persists results, updates ratings and returns the summary to broadcast. */
  async finish(reason: MatchEndReason, winnerSeat: Seat | null): Promise<MatchEndSummary> {
    if (this.endSummary) return this.endSummary;
    this.status = 'finished';
    this.turnDeadline = null;
    matchesActive.dec({ game: this.gameId });
    matchesTotal.inc({ game: this.gameId, reason });

    const ratingDelta: Record<string, number> = {};
    const results: MatchPlayerResult[] = [];

    for (const participant of this.participants) {
      const opponent = this.participants.find((p) => p.playerId !== participant.playerId);
      const score = winnerSeat === null ? 0.5 : winnerSeat === participant.seat ? 1 : 0;
      const delta =
        reason === 'aborted'
          ? 0
          : eloDelta(
              { rating: participant.rating, played: participant.played, score },
              { rating: opponent?.rating ?? participant.rating },
            );
      ratingDelta[participant.playerId] = delta;
      if (!participant.isBot) {
        results.push({
          playerId: participant.playerId,
          seat: participant.seat,
          result: winnerSeat === null ? 'draw' : winnerSeat === participant.seat ? 'win' : 'loss',
          ratingBefore: participant.rating,
          ratingAfter: participant.rating + delta,
        });
      }
    }

    const winner = winnerSeat === null ? null : this.bySeat(winnerSeat);
    const summary: MatchEndSummary = {
      matchId: this.id,
      gameId: this.gameId,
      winnerSeat,
      reason,
      ratingDelta,
    };
    this.endSummary = summary;

    try {
      await getStorage().finishMatch({
        matchId: this.id,
        gameId: this.gameId,
        winnerId: winner && !winner.isBot ? winner.playerId : null,
        reason,
        results,
        aborted: reason === 'aborted',
      });
      await playerService.invalidate(...results.map((r) => r.playerId));
      await leaderboardService.invalidate();
    } catch (error) {
      log.error({ matchId: this.id, err: (error as Error).message }, 'failed to persist match result');
    }

    log.info({ matchId: this.id, game: this.gameId, reason, winnerSeat }, 'match finished');
    return summary;
  }

  /** True when everyone has been gone longer than the reconnect grace period. */
  isAbandoned(nowMs: number): boolean {
    return this.participants
      .filter((p) => !p.isBot)
      .every((p) => !p.connected && (p.disconnectedAt ?? 0) + config.MATCH_RECONNECT_GRACE_MS < nowMs);
  }

  /** A human who has been disconnected past the grace period forfeits. */
  forfeiter(nowMs: number): MatchParticipant | null {
    return (
      this.participants.find(
        (p) => !p.isBot && !p.connected && (p.disconnectedAt ?? 0) + config.MATCH_RECONNECT_GRACE_MS < nowMs,
      ) ?? null
    );
  }
}
