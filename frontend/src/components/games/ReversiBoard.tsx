import clsx from 'clsx';
import { REVERSI_SIZE, type ReversiState, type Seat } from '@mini-arcade/shared';
import { Button } from '@/components/ui/Button';

/** Reversi / Othello — 8x8 with legal-move hints supplied by the engine. */
export function ReversiBoard({
  state,
  seat,
  yourTurn,
  onPlay,
  onPass,
}: {
  state: ReversiState;
  seat: Seat;
  yourTurn: boolean;
  onPlay: (index: number) => void;
  onPass: () => void;
}) {
  const legal = new Set(yourTurn ? state.legal : []);
  const flipped = new Set(state.flipped);
  const mustPass = yourTurn && state.legal.length === 0 && !state.finished;

  return (
    <div className="mx-auto w-full max-w-[30rem]">
      <div className="mb-4 flex items-center justify-center gap-6 font-mono text-sm">
        <Score label={seat === 0 ? 'you' : 'them'} value={state.score[0]} tone="light" />
        <span className="text-xs uppercase tracking-[0.2em] text-slate-600">discs</span>
        <Score label={seat === 1 ? 'you' : 'them'} value={state.score[1]} tone="dark" />
      </div>

      <div
        className="grid gap-[3px] rounded-xl bg-emerald-950/70 p-2 ring-1 ring-emerald-400/15"
        style={{ gridTemplateColumns: `repeat(${REVERSI_SIZE}, minmax(0, 1fr))` }}
      >
        {state.board.map((cell, index) => {
          const playable = legal.has(index);
          return (
            <button
              key={index}
              type="button"
              disabled={!playable}
              onClick={() => onPlay(index)}
              aria-label={`square ${index}`}
              className={clsx(
                'group relative grid aspect-square place-items-center rounded-[4px] bg-emerald-900/70 transition-colors duration-150',
                playable && 'cursor-pointer hover:bg-emerald-700/70',
                index === state.lastIndex && 'ring-1 ring-neon-amber/70',
              )}
            >
              {cell !== null && (
                <span
                  className={clsx(
                    'block size-[80%] rounded-full shadow-lg transition-transform duration-300',
                    cell === 0
                      ? 'bg-gradient-to-br from-slate-50 to-slate-400'
                      : 'bg-gradient-to-br from-void-700 to-black ring-1 ring-white/15',
                    flipped.has(index) && 'animate-[pop_0.3s_cubic-bezier(0.34,1.56,0.64,1)_both]',
                  )}
                />
              )}
              {cell === null && playable && (
                <span className="block size-[34%] rounded-full bg-neon-lime/40 transition-transform duration-150 group-hover:scale-150" />
              )}
            </button>
          );
        })}
      </div>

      {mustPass && (
        <div className="mt-4 text-center">
          <p className="text-sm text-neon-amber">No legal moves available.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={onPass}>
            Pass turn
          </Button>
        </div>
      )}
    </div>
  );
}

function Score({ label, value, tone }: { label: string; value: number; tone: 'light' | 'dark' }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={clsx(
          'size-5 rounded-full',
          tone === 'light'
            ? 'bg-gradient-to-br from-slate-50 to-slate-400'
            : 'bg-gradient-to-br from-void-700 to-black ring-1 ring-white/15',
        )}
      />
      <span className="font-display text-xl font-bold tabular-nums text-white">{value}</span>
      <span className="text-[0.65rem] uppercase tracking-wider text-slate-500">{label}</span>
    </div>
  );
}
