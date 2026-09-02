import { LRUCache } from 'lru-cache';
import type { MatchEndReason, Seat } from '@mini-arcade/shared';
import { config } from '../config/env.js';
import { createLogger } from '../infra/logger.js';
import { lifecycle } from '../infra/lifecycle.js';
import { tickDuration } from '../infra/metrics.js';
import { decide } from './bot.js';
import type { Match } from './match.js';
import { presence } from './presence.js';

const log = createLogger('match-registry');

export interface RegistryHooks {
  onState(match: Match): void;
  onOver(match: Match, reason: MatchEndReason, winnerSeat: Seat | null): void;
  onPresence(match: Match): void;
  /** Fired once, right after a match is registered on this worker. */
  onCreated(match: Match): void;
}

const SCHEDULER_HZ = 30;
const SCHEDULER_INTERVAL_MS = 1000 / SCHEDULER_HZ;

/**
 * Owns every match hosted by this worker and drives them from a single timer.
 *
 * One shared loop (instead of a timer per match) keeps CPU predictable, makes
 * back-pressure observable through one histogram, and guarantees every match
 * is torn down on shutdown.
 */
class MatchRegistry {
  private readonly matches = new Map<string, Match>();
  private readonly botTimers = new Map<string, NodeJS.Timeout>();
  /** Recently finished matches, retained briefly so rematches can be offered. */
  private readonly recent = new LRUCache<string, Match>({ max: 300, ttl: 120_000 });
  private readonly lastTickAt = new Map<string, number>();
  private readonly lastBroadcastAt = new Map<string, number>();
  private hooks: RegistryHooks | null = null;
  private timer: NodeJS.Timeout | null = null;

  setHooks(hooks: RegistryHooks): void {
    this.hooks = hooks;
  }

  get size(): number {
    return this.matches.size;
  }

  atCapacity(): boolean {
    return this.matches.size >= config.MATCH_MAX_PER_WORKER;
  }

  add(match: Match): void {
    this.matches.set(match.id, match);
    this.lastTickAt.set(match.id, Date.now());
    void presence.matchStarted(match.id);
    this.start();
    this.hooks?.onCreated(match);
    // A bot on seat 0 has to open the game.
    this.scheduleBot(match);
  }

  get(matchId: string): Match | undefined {
    return this.matches.get(matchId);
  }

  /** A live match, or one that finished in the last couple of minutes. */
  getRecent(matchId: string): Match | undefined {
    return this.matches.get(matchId) ?? this.recent.get(matchId);
  }

  hosts(matchId: string): boolean {
    return this.matches.has(matchId);
  }

  findByPlayer(playerId: string): Match | undefined {
    for (const match of this.matches.values()) {
      if (match.participant(playerId)) return match;
    }
    return undefined;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.step(), SCHEDULER_INTERVAL_MS);
    this.timer.unref();
    lifecycle.register('match-registry', () => this.shutdown(), 30);
  }

  private async remove(match: Match, reason: MatchEndReason, winnerSeat: Seat | null): Promise<void> {
    this.matches.delete(match.id);
    this.lastTickAt.delete(match.id);
    this.lastBroadcastAt.delete(match.id);
    this.recent.set(match.id, match);
    const timer = this.botTimers.get(match.id);
    if (timer) {
      clearTimeout(timer);
      this.botTimers.delete(match.id);
    }
    await match.finish(reason, winnerSeat);
    await presence.matchEnded(match.id);
    this.hooks?.onOver(match, reason, winnerSeat);
  }

  async endMatch(matchId: string, reason: MatchEndReason, winnerSeat: Seat | null): Promise<void> {
    const match = this.matches.get(matchId);
    if (match) await this.remove(match, reason, winnerSeat);
  }

  /**
   * Called after an action is applied. Turn based games broadcast immediately;
   * realtime games rely on the fixed tick cadence so one busy player cannot
   * amplify traffic for everybody.
   */
  afterAction(match: Match): void {
    if (match.catalog.tickRate === 0) this.hooks?.onState(match);
    void this.evaluate(match);
  }

  /** Rate limited broadcast: at most one snapshot per simulation tick. */
  private broadcast(match: Match, nowMs: number): void {
    const interval = 1000 / Math.max(1, match.catalog.tickRate);
    const last = this.lastBroadcastAt.get(match.id) ?? 0;
    if (nowMs - last < interval - 2) return;
    this.lastBroadcastAt.set(match.id, nowMs);
    this.hooks?.onState(match);
  }

  private async evaluate(match: Match): Promise<void> {
    const outcome = match.outcome();
    if (outcome.finished) {
      await this.remove(match, outcome.reason ?? 'victory', outcome.winnerSeat);
      return;
    }
    this.scheduleBot(match);
  }

  private scheduleBot(match: Match): void {
    if (this.botTimers.has(match.id)) return;
    const bot = match.participants.find((p) => p.isBot);
    if (!bot) return;
    const decision = decide(match.gameId, match.state, bot.seat, bot.difficulty);
    if (!decision) return;

    const timer = setTimeout(() => {
      this.botTimers.delete(match.id);
      const live = this.matches.get(match.id);
      if (!live || live.status !== 'active') return;
      const applied = live.applyAction(bot.playerId, decision.action);
      if (applied.ok) this.afterAction(live);
    }, decision.delayMs);
    timer.unref();
    this.botTimers.set(match.id, timer);
  }

  private step(): void {
    if (this.matches.size === 0) return;
    const endTimer = tickDuration.startTimer();
    const nowMs = Date.now();

    for (const match of this.matches.values()) {
      if (match.status !== 'active') continue;

      // 1. realtime simulation
      if (match.catalog.tickRate > 0) {
        const last = this.lastTickAt.get(match.id) ?? nowMs;
        const dt = Math.min(nowMs - last, 250);
        this.lastTickAt.set(match.id, nowMs);
        if (dt > 0) {
          match.tick(dt);
          const outcome = match.outcome();
          if (outcome.finished) {
            void this.remove(match, outcome.reason ?? 'victory', outcome.winnerSeat);
            continue;
          }
          this.broadcast(match, nowMs);
          this.scheduleBot(match);
        }
      }

      // 2. bots keep thinking on turn based boards
      if (match.catalog.tickRate === 0) this.scheduleBot(match);

      // 3. turn clock
      if (match.turnDeadline && nowMs > match.turnDeadline) {
        const active = match.activeSeat();
        if (active !== null) {
          void this.remove(match, 'timeout', active === 0 ? 1 : 0);
          continue;
        }
      }

      // 4. presence / abandonment
      const forfeiter = match.forfeiter(nowMs);
      if (forfeiter) {
        const opponent = match.participants.find((p) => p.playerId !== forfeiter.playerId);
        void this.remove(
          match,
          match.isAbandoned(nowMs) ? 'aborted' : 'disconnect',
          opponent ? opponent.seat : null,
        );
        continue;
      }

      // 5. idle guard — nobody has done anything for a very long time
      if (nowMs - match.lastActivityAt > config.MATCH_IDLE_TIMEOUT_MS && match.catalog.tickRate === 0) {
        void this.remove(match, 'aborted', null);
      }
    }

    endTimer();
  }

  async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const timer of this.botTimers.values()) clearTimeout(timer);
    this.botTimers.clear();

    const open = [...this.matches.values()];
    log.info({ open: open.length }, 'aborting in-flight matches');
    await Promise.all(open.map((match) => this.remove(match, 'aborted', null)));
  }
}

export const matchRegistry = new MatchRegistry();
