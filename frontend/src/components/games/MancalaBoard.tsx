import clsx from 'clsx';
import {
  MANCALA_STORE,
  mancalaLegalMoves,
  mancalaPitsOf,
  type MancalaState,
  type Seat,
} from '@mini-arcade/shared';

/** A pit rendered as a bowl of stones, with the count called out. */
function Pit({
  count,
  playable,
  highlight,
  onClick,
  label,
}: {
  count: number;
  playable: boolean;
  highlight: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={!playable}
      onClick={onClick}
      aria-label={label}
      className={clsx(
        'group relative grid aspect-square place-items-center rounded-full border transition-all duration-150',
        playable
          ? 'cursor-pointer border-neon-cyan/40 bg-neon-cyan/10 hover:scale-105 hover:bg-neon-cyan/20'
          : 'border-white/10 bg-void-900/70',
        highlight && 'animate-pop ring-2 ring-neon-amber',
      )}
    >
      <span className="font-mono text-lg font-bold tabular-nums">{count}</span>
      {count > 0 ? (
        <span className="pointer-events-none absolute inset-2 grid grid-cols-3 place-items-center gap-[2px] opacity-40">
          {Array.from({ length: Math.min(count, 9) }, (_, i) => (
            <span key={i} className="size-1.5 rounded-full bg-neon-amber" />
          ))}
        </span>
      ) : null}
    </button>
  );
}

/** One player's store, drawn as a tall well at the side of the board. */
function Store({ count, mine, label }: { count: number; mine: boolean; label: string }) {
  return (
    <div
      aria-label={label}
      className={clsx(
        'grid w-16 place-items-center rounded-2xl border px-2 py-4 sm:w-20',
        mine ? 'border-neon-cyan/40 bg-neon-cyan/10' : 'border-neon-pink/30 bg-neon-pink/10',
      )}
    >
      <span className="font-mono text-2xl font-bold tabular-nums">{count}</span>
      <span className="mt-1 text-[0.6rem] uppercase tracking-widest text-slate-500">
        {mine ? 'you' : 'them'}
      </span>
    </div>
  );
}

/**
 * The board is always drawn from the local player's point of view: your six
 * pits along the bottom, your store on the right.
 */
export function MancalaBoard({
  state,
  seat,
  yourTurn,
  onPlay,
}: {
  state: MancalaState;
  seat: Seat;
  yourTurn: boolean;
  onPlay: (pit: number) => void;
}) {
  const opponent: Seat = seat === 0 ? 1 : 0;
  const legal = new Set(yourTurn ? mancalaLegalMoves(state) : []);

  const mine = mancalaPitsOf(seat);
  // The opponent's row runs the other way, mirroring a real board.
  const theirs = mancalaPitsOf(opponent).slice().reverse();

  return (
    <div className="mx-auto w-full max-w-[36rem]">
      <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-void-900/60 p-3 sm:gap-4 sm:p-4">
        <Store count={state.pits[MANCALA_STORE[opponent]] ?? 0} mine={false} label="opponent store" />

        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-6 gap-2 sm:gap-3">
            {theirs.map((pit) => (
              <Pit
                key={pit}
                count={state.pits[pit] ?? 0}
                playable={false}
                highlight={state.lastCapture === pit}
                onClick={() => undefined}
                label={`opponent pit ${pit}`}
              />
            ))}
          </div>

          <div className="grid grid-cols-6 gap-2 sm:gap-3">
            {mine.map((pit) => (
              <Pit
                key={pit}
                count={state.pits[pit] ?? 0}
                playable={legal.has(pit)}
                highlight={state.lastPit === pit}
                onClick={() => onPlay(pit)}
                label={`your pit ${pit}`}
              />
            ))}
          </div>
        </div>

        <Store count={state.pits[MANCALA_STORE[seat]] ?? 0} mine label="your store" />
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">
        {state.extraTurn && state.turn === seat
          ? 'Landed in your store — go again!'
          : yourTurn
            ? 'Pick a pit to sow anticlockwise.'
            : 'Waiting for your opponent…'}
      </p>
    </div>
  );
}
