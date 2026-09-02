import {
  ENGINES,
  decide,
  type BotDifficulty,
  type GameId,
  type GameOutcome,
  type Seat,
} from '@mini-arcade/shared';

export type LocalOpponent = 'bot' | 'human';

export interface LocalMatchOptions {
  gameId: GameId;
  opponent: LocalOpponent;
  difficulty: BotDifficulty;
  /** Which seat the human (or player one in pass-and-play) occupies. */
  playerSeat?: Seat;
  onState: (snapshot: LocalSnapshot) => void;
  onOver: (result: LocalResult) => void;
}

export interface LocalSnapshot {
  gameId: GameId;
  state: unknown;
  seat: Seat;
  activeSeat: Seat | null;
  /** Pass-and-play hands the controls to whichever seat is to move. */
  controlledSeat: Seat | null;
  moves: number;
  thinking: boolean;
}

export interface LocalResult {
  outcome: GameOutcome;
  gameId: GameId;
  seat: Seat;
  moves: number;
  durationMs: number;
  state: unknown;
}

/**
 * A complete match played entirely in the browser.
 *
 * It reuses the shared engines and the shared bot, so an offline game behaves
 * exactly like an online one — same rules, same opponent, same outcomes. There
 * is no network, no server and no rating, which is what makes it work with the
 * service worker while the user is offline.
 */
export class LocalMatch {
  private readonly engine;
  private readonly seat: Seat;
  private state: unknown;
  private moves = 0;
  private finished = false;
  private thinking = false;
  private readonly startedAt = Date.now();

  private botTimer: number | null = null;
  private rafHandle: number | null = null;
  private lastFrame = 0;
  private accumulator = 0;

  constructor(private readonly options: LocalMatchOptions) {
    this.engine = ENGINES[options.gameId];
    this.seat = options.playerSeat ?? 0;
    this.state = this.engine.createState(Date.now());
  }

  start(): void {
    this.emit();
    if (this.engine.tickMs > 0) this.startLoop();
    this.scheduleBot();
  }

  /** Human input. In pass-and-play the active seat is whoever is to move. */
  play(action: unknown, seat?: Seat): boolean {
    if (this.finished) return false;

    const acting = seat ?? this.controlledSeat();
    if (acting === null) return false;

    const result = this.engine.apply(this.state, acting, action, Date.now());
    if (!result.ok) return false;

    this.state = result.state;
    this.moves += 1;
    this.emit();

    if (this.checkOutcome()) return true;
    this.scheduleBot();
    return true;
  }

  /** Which seat the local player currently drives. */
  controlledSeat(): Seat | null {
    const active = this.engine.activeSeat(this.state);
    if (this.options.opponent === 'human') return active;
    if (this.engine.tickMs > 0) return this.seat;
    return active === this.seat ? this.seat : null;
  }

  /** Realtime games take continuous input (Pong paddles, Snake steering). */
  input(action: unknown, seat?: Seat): void {
    if (this.finished) return;
    const result = this.engine.apply(this.state, seat ?? this.seat, action, Date.now());
    if (result.ok) this.state = result.state;
  }

  destroy(): void {
    this.finished = true;
    if (this.botTimer !== null) window.clearTimeout(this.botTimer);
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.botTimer = null;
    this.rafHandle = null;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /* ------------------------------- internals ------------------------------ */

  private emit(): void {
    this.options.onState({
      gameId: this.options.gameId,
      state: this.engine.toPublic(this.state),
      seat: this.seat,
      activeSeat: this.engine.activeSeat(this.state),
      controlledSeat: this.controlledSeat(),
      moves: this.moves,
      thinking: this.thinking,
    });
  }

  private checkOutcome(): boolean {
    const outcome = this.engine.outcome(this.state);
    if (!outcome.finished) return false;

    this.finished = true;
    this.destroy();
    this.options.onOver({
      outcome,
      gameId: this.options.gameId,
      seat: this.seat,
      moves: this.moves,
      durationMs: Date.now() - this.startedAt,
      state: this.engine.toPublic(this.state),
    });
    return true;
  }

  /** Turn based bot: think for a beat, then move. */
  private scheduleBot(): void {
    if (this.options.opponent !== 'bot' || this.finished || this.engine.tickMs > 0) return;

    const active = this.engine.activeSeat(this.state);
    if (active === null || active === this.seat) return;

    const decision = decide(this.options.gameId, this.state, active, this.options.difficulty);
    if (!decision) return;

    this.thinking = true;
    this.emit();

    this.botTimer = window.setTimeout(() => {
      this.botTimer = null;
      if (this.finished) return;

      const result = this.engine.apply(this.state, active, decision.action, Date.now());
      this.thinking = false;
      if (result.ok) {
        this.state = result.state;
        this.moves += 1;
      }
      this.emit();
      if (!this.checkOutcome()) this.scheduleBot();
    }, decision.delayMs);
  }

  /** Realtime games: a single rAF loop drives fixed-step simulation + bot input. */
  private startLoop(): void {
    const botIntervalMs = 90;
    let sinceBotThought = 0;
    this.lastFrame = performance.now();

    const frame = (now: number) => {
      if (this.finished) return;

      const delta = Math.min(120, now - this.lastFrame);
      this.lastFrame = now;
      this.accumulator += delta;
      sinceBotThought += delta;

      if (this.options.opponent === 'bot' && sinceBotThought >= botIntervalMs) {
        sinceBotThought = 0;
        const botSeat = (this.seat === 0 ? 1 : 0) as Seat;
        const decision = decide(this.options.gameId, this.state, botSeat, this.options.difficulty);
        if (decision) {
          const applied = this.engine.apply(this.state, botSeat, decision.action, Date.now());
          if (applied.ok) this.state = applied.state;
        }
      }

      // Fixed timestep so the simulation matches the server exactly.
      const step = this.engine.tickMs;
      let steps = 0;
      while (this.accumulator >= step && steps < 5) {
        this.state = this.engine.tick?.(this.state, step, Date.now()) ?? this.state;
        this.accumulator -= step;
        steps += 1;
      }

      this.emit();
      if (this.checkOutcome()) return;

      this.rafHandle = requestAnimationFrame(frame);
    };

    this.rafHandle = requestAnimationFrame(frame);
  }
}
