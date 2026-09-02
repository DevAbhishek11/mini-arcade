import type { GameId, MatchEndReason } from '../domain.js';

export type Seat = 0 | 1;

export const otherSeat = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

export interface GameOutcome {
  finished: boolean;
  winnerSeat: Seat | null;
  reason: MatchEndReason | null;
}

export const UNFINISHED: GameOutcome = { finished: false, winnerSeat: null, reason: null };

export interface ActionResult<TState> {
  ok: boolean;
  state: TState;
  error?: string;
}

/**
 * A pure, deterministic game engine.
 *
 * The exact same module runs on the server (authoritative) and in the browser
 * (optimistic prediction), which removes an entire class of desync bugs.
 */
export interface GameEngine<TState, TAction> {
  readonly id: GameId;
  /** Fixed simulation step in ms, or 0 for event driven games. */
  readonly tickMs: number;
  createState(now: number): TState;
  /** Returns a new state; never mutates the input. */
  apply(state: TState, seat: Seat, action: TAction, now: number): ActionResult<TState>;
  /** Advance the simulation by `dtMs`. Only used when `tickMs > 0`. */
  tick?(state: TState, dtMs: number, now: number): TState;
  outcome(state: TState): GameOutcome;
  /** Whose turn is it, for turn based games. `null` for realtime games. */
  activeSeat(state: TState): Seat | null;
  /** State as broadcast to clients (strips server-only fields). */
  toPublic(state: TState): unknown;
}
