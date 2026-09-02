import clsx from 'clsx';
import { BINGO_FREE_CELL, bingoLines, type BingoState, type Seat } from '@mini-arcade/shared';

const HEADINGS = ['B', 'I', 'N', 'G', 'O'];

function Card({
  card,
  marked,
  lines,
  mine,
  lastCalled,
}: {
  card: (number | null)[];
  marked: boolean[];
  lines: number[];
  mine: boolean;
  lastCalled: number | null;
}) {
  const winning = new Set(lines.flatMap((index) => bingoLines[index] ?? []));

  return (
    <div
      className={clsx(
        'rounded-2xl border p-2.5 transition-colors',
        mine ? 'border-neon-cyan/40 bg-neon-cyan/[0.06]' : 'border-white/10 bg-void-900/60',
      )}
    >
      <div className="mb-1.5 grid grid-cols-5 text-center font-display text-xs font-bold tracking-widest text-slate-500">
        {HEADINGS.map((letter) => (
          <span key={letter}>{letter}</span>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-1">
        {card.map((value, index) => {
          const isFree = index === BINGO_FREE_CELL;
          const hit = marked[index] ?? false;
          const justCalled = value !== null && value === lastCalled;

          return (
            <div
              key={index}
              className={clsx(
                'relative grid aspect-square place-items-center rounded-md font-mono text-xs font-semibold tabular-nums transition-all duration-200 sm:text-sm',
                hit
                  ? mine
                    ? 'bg-neon-cyan/30 text-white'
                    : 'bg-neon-pink/25 text-white'
                  : 'bg-void-950/70 text-slate-400',
                winning.has(index) && 'animate-win-flash ring-2 ring-neon-lime',
                justCalled && 'animate-pop ring-2 ring-neon-amber',
              )}
            >
              {isFree ? <span className="text-[0.55rem] uppercase text-neon-lime">free</span> : value}
              {hit && !isFree ? (
                <span className="pointer-events-none absolute inset-0 grid place-items-center">
                  <span className="size-[85%] rounded-full border-2 border-current opacity-40" />
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Both cards side by side, with the three callable balls between them — the
 * whole decision is visible at a glance.
 */
export function BingoBoard({
  state,
  seat,
  yourTurn,
  onPlay,
}: {
  state: BingoState;
  seat: Seat;
  yourTurn: boolean;
  onPlay: (ball: number) => void;
}) {
  const rival: Seat = seat === 0 ? 1 : 0;

  return (
    <div className="mx-auto w-full max-w-[36rem]">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[0.65rem] uppercase tracking-widest text-neon-cyan">Your card</p>
          <Card
            card={state.cards[seat]}
            marked={state.marked[seat]}
            lines={state.lines[seat]}
            mine
            lastCalled={state.lastCalled}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[0.65rem] uppercase tracking-widest text-neon-pink">Their card</p>
          <Card
            card={state.cards[rival]}
            marked={state.marked[rival]}
            lines={state.lines[rival]}
            mine={false}
            lastCalled={state.lastCalled}
          />
        </div>
      </div>

      {/* The three balls on offer. */}
      <div className="mt-5 flex flex-col items-center gap-3">
        <p className="text-xs text-slate-500">
          {yourTurn ? 'Call a ball — it marks both cards.' : 'Your opponent is choosing…'}
        </p>

        <div className="flex items-center justify-center gap-4">
          {state.choices.map((ball) => {
            const helpsMe = state.cards[seat].includes(ball);
            const helpsThem = state.cards[rival].includes(ball);

            return (
              <button
                key={ball}
                type="button"
                disabled={!yourTurn}
                onClick={() => onPlay(ball)}
                className={clsx(
                  'group relative grid size-16 place-items-center rounded-full border-2 font-mono text-xl font-bold tabular-nums transition-all duration-200',
                  yourTurn
                    ? 'cursor-pointer border-white/20 bg-gradient-to-br from-void-700 to-void-900 hover:scale-110 hover:border-neon-amber hover:shadow-[0_0_25px_-4px] hover:shadow-neon-amber/70'
                    : 'border-white/10 bg-void-900/60 opacity-60',
                  helpsMe && 'border-neon-cyan/60',
                  helpsThem && !helpsMe && 'border-neon-pink/50',
                )}
              >
                <span className="animate-ball-roll">{ball}</span>
                {/* Tell the player what the ball does before they commit. */}
                {(helpsMe || helpsThem) && (
                  <span
                    className={clsx(
                      'absolute -bottom-5 whitespace-nowrap text-[0.6rem] uppercase tracking-wide',
                      helpsMe ? 'text-neon-cyan' : 'text-neon-pink',
                    )}
                  >
                    {helpsMe && helpsThem ? 'both cards' : helpsMe ? 'yours' : 'theirs'}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-[0.65rem] uppercase tracking-widest text-slate-600">
          {state.called.length} called ·{' '}
          {state.lastCalled !== null ? `last ${state.lastCalled}` : 'no balls yet'}
        </p>
      </div>
    </div>
  );
}
